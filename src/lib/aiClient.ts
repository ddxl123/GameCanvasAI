import type { AIConfig, AIProvider } from "@/types";

/**
 * 智能体 AI 客户端
 *
 * 架构：
 *   callAIStream (智能体循环)
 *     ├─ streamOpenAIRound (单轮流式调用)
 *     │    ├─ buildOpenAIBody (构建请求体，DeepSeek 不传 tool_choice)
 *     │    └─ parseSSEStream (解析 SSE delta，累积 tool_calls)
 *     ├─ 应用工具 (onToolApply 回调)
 *     ├─ 回传工具结果 (role: tool 消息)
 *     └─ 降级重试 (空回复/400 错误 → 关闭思考模式)
 */

// ===== 常量 =====

/** 智能体循环最大轮次，防止死循环 */
const MAX_AGENT_ROUNDS = 8;
/** 空回复/400 错误时的最大降级重试次数 */
const MAX_FALLBACK_RETRY = 1;
/** 请求超时（ms） */
const TIMEOUT_NON_STREAM = 120_000;
/** 流式请求超时（思考模式可能需要很长时间，设为 5 分钟） */
const TIMEOUT_STREAM = 300_000;
/** 请求体大小上限（200KB） */
const MAX_BODY_SIZE = 200_000;

// ===== 类型定义 =====

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** role: tool 时必填，对应 assistant 的 tool_call_id */
  tool_call_id?: string;
  /** role: assistant 携带工具调用时使用 */
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  /** role: tool 时的工具名称 */
  name?: string;
  /**
   * DeepSeek 思考模式的思维链内容。
   * 官方文档要求：思考模式 + tool calls 时，assistant 的 reasoning_content
   * 必须在后续轮次中回传给 API，否则返回 400 错误。
   */
  reasoning_content?: string;
}

export interface ToolCallResult {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** 参数解析失败时的错误信息（智能体循环会回传给 AI 让其重试） */
  parseError?: string;
}

export interface AICallOptions {
  config: AIConfig;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  /** OpenAI 兼容格式的工具定义 */
  tools?: typeof import("./aiActions").DESIGN_TOOLS_OPENAI;
  /** 强制调用的工具名（仅对支持 tool_choice 的 provider 生效，DeepSeek 忽略） */
  forceToolName?: string;
  /** 禁用思考模式（降级重试时使用） */
  disableThinking?: boolean;
}

export interface StreamResult {
  content: string;
  toolCalls: ToolCallResult[];
  /** DeepSeek 思考模式思维链（agentic 循环需回传给 API） */
  reasoningContent?: string;
  /** 本轮结束原因（stop/length/tool_calls/aborted） */
  finishReason?: string | null;
}

export interface StreamCallbacks {
  onChunk?: (chunk: string) => void;
  /** 思维链回调（与正式回答分离） */
  onReasoning?: (chunk: string) => void;
  onToolCall?: (toolCall: ToolCallResult) => void;
  /**
   * 应用 tool call 并返回结果字符串（启用智能体多轮循环）。
   * 每轮 tool_calls 完成后：
   * 1. 调用此回调应用工具
   * 2. 把返回结果作为 role:"tool" 消息追加
   * 3. 继续下一轮，直到 AI 不再返回 tool_calls 或达到最大轮次
   */
  onToolApply?: (toolCall: ToolCallResult) => Promise<string>;
  onFinish?: (reason: string | null) => void;
}

// ===== Provider 能力检测 =====

/**
 * 是否支持 Tool Calls。
 * DeepSeek / OpenAI / Claude / 通义千问 全系列支持。
 * 参考：https://api-docs.deepseek.com/guides/tool_calls
 */
export function supportsFunctionCalling(
  provider: AIProvider,
  model: string
): boolean {
  void model;
  void provider;
  return true;
}

/**
 * 是否可能处于思考模式。
 * DeepSeek 默认思考模式（thinking toggle 默认 enabled）。
 * 参考：https://api-docs.deepseek.com/guides/thinking_mode
 */
export function isThinkingModel(
  provider: AIProvider,
  model: string
): boolean {
  void model;
  return provider === "deepseek";
}

// ===== 工具函数 =====

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

function validateBaseUrl(baseUrl: string): void {
  if (
    !/^https:\/\//i.test(baseUrl) &&
    !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(baseUrl)
  ) {
    throw new Error("baseUrl 必须使用 https 协议（本地开发可用 http://localhost）");
  }
}

function checkBodySize(bodyStr: string): void {
  if (bodyStr.length > MAX_BODY_SIZE) {
    throw new Error("请求内容过大（超过 200KB），请精简项目数据后重试");
  }
}

// ===== 请求体构建 =====

/**
 * 构建 OpenAI 兼容的请求体。
 *
 * DeepSeek 关键规则（官方文档 + 样例）：
 * 1. 永远不传 tool_choice（官方 tool_calls 样例从不传，传了会 400）
 * 2. 思考模式默认 enabled，关闭必须显式传 thinking: { type: "disabled" }
 * 3. 思考模式不支持 temperature
 * 4. 思考模式 + tool calls 时，reasoning_content 必须回传
 *
 * 参考：
 *   - https://api-docs.deepseek.com/guides/tool_calls
 *   - https://api-docs.deepseek.com/guides/thinking_mode
 */
function buildOpenAIBody(
  options: AICallOptions,
  stream: boolean
): Record<string, unknown> {
  const {
    config,
    messages,
    temperature = 0.7,
    maxTokens,
    tools,
    forceToolName,
    disableThinking,
  } = options;

  const thinking = isThinkingModel(config.key, config.model) && !disableThinking;
  const effectiveMaxTokens = maxTokens ?? (thinking ? 65536 : 16384);

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    max_tokens: effectiveMaxTokens,
  };

  if (stream) {
    body.stream = true;
  }

  // 思考模式不支持 temperature
  if (!thinking) {
    body.temperature = temperature;
  }

  // DeepSeek 思考模式控制
  if (config.key === "deepseek") {
    if (thinking) {
      body.reasoning_effort = "high";
      body.thinking = { type: "enabled" };
    } else {
      // 必须显式关闭（DeepSeek 默认是思考模式）
      body.thinking = { type: "disabled" };
    }
  }

  // 工具定义
  const canUseTools =
    !!tools && tools.length > 0 && supportsFunctionCalling(config.key, config.model);
  if (canUseTools) {
    body.tools = tools;
    // tool_choice 策略：
    // - DeepSeek：永远不传（官方样例从不传，传了会 400）
    // - 其他 provider：支持 forceToolName 或 auto
    if (config.key !== "deepseek") {
      if (forceToolName) {
        body.tool_choice = { type: "function", function: { name: forceToolName } };
      } else {
        body.tool_choice = "auto";
      }
    }
  }

  return body;
}

// ===== SSE 流解析 =====

interface SSEAccumulator {
  content: string;
  reasoningContent: string;
  toolCalls: Map<number, { id: string; name: string; argsBuffer: string }>;
  finishReason: string | null;
}

/**
 * 解析 OpenAI 兼容的 SSE 流。
 * 处理 delta.content、delta.reasoning_content、delta.tool_calls。
 */
async function parseSSEStream(
  response: Response,
  callbacks: StreamCallbacks,
  acc: SSEAccumulator
): Promise<void> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) continue;

        const data = trimmed.slice(5).trim();
        if (data === "[DONE]") return;

        try {
          const json = JSON.parse(data);
          const choice = json?.choices?.[0];
          if (!choice) continue;

          if (choice.finish_reason) {
            acc.finishReason = choice.finish_reason;
          }

          const delta = choice.delta;
          if (!delta) continue;

          // 正式回答
          if (delta.content) {
            acc.content += delta.content;
            callbacks.onChunk?.(delta.content);
          }

          // 思维链（DeepSeek 思考模式）
          if (delta.reasoning_content) {
            acc.reasoningContent += delta.reasoning_content;
            callbacks.onReasoning?.(delta.reasoning_content);
          }

          // 工具调用 delta（按 index 累积）
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx: number = tc.index ?? 0;
              const existing = acc.toolCalls.get(idx);
              if (!existing) {
                acc.toolCalls.set(idx, {
                  id: tc.id ?? "",
                  name: tc.function?.name ?? "",
                  argsBuffer: tc.function?.arguments ?? "",
                });
              } else {
                if (tc.id) existing.id = tc.id;
                if (tc.function?.name) existing.name = tc.function.name;
                if (tc.function?.arguments) {
                  existing.argsBuffer += tc.function.arguments;
                }
              }
            }
          }
        } catch {
          // 跳过无法解析的 chunk
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * 把累积的 tool calls 转为最终结果，触发 onToolCall 回调。
 */
function finalizeToolCalls(
  acc: SSEAccumulator,
  callbacks: StreamCallbacks
): ToolCallResult[] {
  const toolCalls: ToolCallResult[] = [];
  for (const [, val] of acc.toolCalls) {
    let args: Record<string, unknown> = {};
    let parseError: string | undefined;
    if (val.argsBuffer) {
      try {
        args = JSON.parse(val.argsBuffer);
      } catch (e) {
        const tail = val.argsBuffer.slice(-80);
        console.warn("[AI] 工具调用参数解析失败:", {
          length: val.argsBuffer.length,
          head: val.argsBuffer.slice(0, 80),
          tail,
          error: e instanceof Error ? e.message : String(e),
        });
        parseError = `参数 JSON 解析失败（长度 ${val.argsBuffer.length}）: ${e instanceof Error ? e.message : String(e)}`;
      }
    }
    const tc: ToolCallResult = {
      id: val.id || `call-${crypto.randomUUID()}`,
      name: val.name,
      arguments: args,
      parseError,
    };
    toolCalls.push(tc);
    callbacks.onToolCall?.(tc);
  }
  return toolCalls;
}

// ===== 单轮流式调用 =====

/**
 * 单轮 OpenAI 兼容流式调用。
 * 不含智能体循环逻辑，纯粹发起请求并解析响应。
 */
async function streamOpenAIRound(
  options: AICallOptions,
  callbacks: StreamCallbacks
): Promise<StreamResult> {
  const { config, signal } = options;

  const baseUrl = config.baseUrl?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
  validateBaseUrl(baseUrl);
  const url = `${baseUrl}/chat/completions`;

  const body = buildOpenAIBody(options, true);
  const bodyStr = JSON.stringify(body);
  checkBodySize(bodyStr);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: bodyStr,
    signal: withTimeout(signal, TIMEOUT_STREAM),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const err = new Error(
      `AI 请求失败 (${response.status}): ${errorText.slice(0, 200) || response.statusText}`
    );
    // 附加状态码，供降级逻辑判断
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }

  if (!response.body) {
    throw new Error("响应体为空，不支持流式输出");
  }

  const acc: SSEAccumulator = {
    content: "",
    reasoningContent: "",
    toolCalls: new Map(),
    finishReason: null,
  };

  try {
    await parseSSEStream(response, callbacks, acc);
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || (e instanceof DOMException && e.name === "AbortError"))) {
      callbacks.onFinish?.("aborted");
      return {
        content: acc.content,
        toolCalls: [],
        reasoningContent: acc.reasoningContent || undefined,
        finishReason: "aborted",
      };
    }
    throw e;
  }

  const toolCalls = finalizeToolCalls(acc, callbacks);
  callbacks.onFinish?.(acc.finishReason);

  return {
    content: acc.content,
    toolCalls,
    reasoningContent: acc.reasoningContent || undefined,
    finishReason: acc.finishReason,
  };
}

// ===== 智能体循环 =====

/**
 * 流式调用 + 智能体多轮循环。
 *
 * 循环流程：
 *   1. 调用 AI（第一轮，思考模式开启）
 *   2. 若返回 tool_calls → 应用工具 → 回传结果 → 继续下一轮
 *   3. 若空回复（无 content 无 tool_calls）→ 降级关闭思考模式 → 重试一次
 *   4. 若 400 错误 → 降级关闭思考模式 → 重试一次
 *   5. AI 自然结束（无 tool_calls）或达到最大轮次 → 结束
 */
export async function callAIStream(
  options: AICallOptions,
  callbacks: StreamCallbacks | ((chunk: string) => void)
): Promise<StreamResult> {
  const { config } = options;

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请在设置中填写");
  }

  const cbs: StreamCallbacks =
    typeof callbacks === "function" ? { onChunk: callbacks } : callbacks;

  // Claude 走独立适配器
  if (config.key === "claude") {
    return callClaudeStream(options, cbs);
  }

  // 未提供 onToolApply → 单次调用（不启用智能体循环）
  if (!cbs.onToolApply) {
    return streamOpenAIRound(options, cbs);
  }

  // ===== 智能体多轮循环 =====
  let messages = [...options.messages];
  let allContent = "";
  const allToolCalls: ToolCallResult[] = [];
  let round = 0;
  let stoppedByMaxRounds = false;
  let stoppedByLength = false;
  let fallbackRetryCount = 0;
  let disableThinking = false;

  // 循环内不触发 onFinish（避免重复），循环外统一调用
  const innerCbs: StreamCallbacks = { ...cbs, onFinish: undefined };

  while (round < MAX_AGENT_ROUNDS) {
    round++;
    const roundOpts: AICallOptions = { ...options, messages, disableThinking };
    // 后续轮次不强制工具（让 AI 自行决定）
    if (round > 1) {
      delete roundOpts.forceToolName;
    }

    let roundResult: StreamResult;
    try {
      roundResult = await streamOpenAIRound(roundOpts, innerCbs);
    } catch (e) {
      // 400 错误降级：关闭思考模式重试
      const status = (e as Error & { status?: number }).status;
      const is400 = status === 400;
      if (is400 && fallbackRetryCount < MAX_FALLBACK_RETRY) {
        fallbackRetryCount++;
        console.warn("[AI] 400 错误，降级到非思考模式重试", {
          round,
          error: (e as Error).message.slice(0, 100),
        });
        disableThinking = true;
        continue;
      }
      throw e;
    }

    allContent += roundResult.content;

    console.log("[AI] 轮次完成", {
      round,
      finishReason: roundResult.finishReason,
      contentLength: roundResult.content.length,
      toolCallsCount: roundResult.toolCalls.length,
      toolCallNames: roundResult.toolCalls.map((tc) => tc.name),
      reasoningLength: roundResult.reasoningContent?.length ?? 0,
    });

    if (roundResult.finishReason === "length") {
      stoppedByLength = true;
    }

    // 无 tool_calls：AI 自然结束或空回复
    if (roundResult.toolCalls.length === 0) {
      // 空回复降级：关闭思考模式重试
      if (!roundResult.content && fallbackRetryCount < MAX_FALLBACK_RETRY) {
        fallbackRetryCount++;
        console.warn("[AI] 空回复，降级到非思考模式重试", {
          round,
          finishReason: roundResult.finishReason,
          reasoningLength: roundResult.reasoningContent?.length ?? 0,
        });
        // 追加引导消息（不追加空 assistant 消息，避免 API 困惑）
        messages = [
          ...messages,
          {
            role: "user" as const,
            content:
              "你刚才没有通过 tool_calls 调用工具，也没有输出文字。" +
              "请立即通过 API 的 tool_calls 字段调用工具提交结构化设计。" +
              "不要输出 <tool_call> 标签或 apply_xxx(...) 等文本格式，这些不会被识别。" +
              "工具调用由系统自动捕获，你只需简短说明思路，然后通过 tool_calls 提交结构化数据。",
          },
        ];
        disableThinking = true;
        continue;
      }

      // 重试后仍为空，显示提示
      if (!roundResult.content) {
        const emptyMsg = stoppedByLength
          ? "\n\n> ⚠️ 思维链消耗了全部 token 配额，正式回答被截断。请重试，或在设置中切换非思考模式。"
          : "\n\n> ⚠️ AI 未能生成有效回复，请重试或换一种描述。";
        allContent += emptyMsg;
        cbs.onChunk?.(emptyMsg);
      }
      break;
    }

    // 有 tool_calls：应用工具并回传结果
    allToolCalls.push(...roundResult.toolCalls);

    // 构建 assistant 消息（携带 tool_calls + reasoning_content）
    const assistantToolCalls = roundResult.toolCalls.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }));
    messages = [
      ...messages,
      {
        role: "assistant" as const,
        content: roundResult.content,
        tool_calls: assistantToolCalls,
        // DeepSeek 思考模式 + tool calls 时，reasoning_content 必须回传
        reasoning_content: roundResult.reasoningContent,
      },
    ];

    // 依次应用每个 tool call，把结果作为 tool 消息追加
    for (const tc of roundResult.toolCalls) {
      // 参数解析失败：不应用工具，回传错误让 AI 重试
      if (tc.parseError) {
        console.warn("[AI] 参数解析失败，跳过应用并回传错误", {
          name: tc.name,
          parseError: tc.parseError,
        });
        messages = [
          ...messages,
          {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: `错误: ${tc.parseError}。请重新调用工具，确保 arguments 是完整有效的 JSON。`,
            name: tc.name,
          },
        ];
        continue;
      }

      try {
        const result = await cbs.onToolApply!(tc);
        messages = [
          ...messages,
          {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: result,
            name: tc.name,
          },
        ];
      } catch (e) {
        const errMsg = e instanceof Error ? e.message : String(e);
        messages = [
          ...messages,
          {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: `应用失败: ${errMsg}`,
            name: tc.name,
          },
        ];
      }
    }

    if (round >= MAX_AGENT_ROUNDS) {
      stoppedByMaxRounds = true;
    }
  }

  // 达到最大轮次警告
  if (stoppedByMaxRounds) {
    const stopMsg = "\n\n> ⚠️ 已达到最大工具调用轮次（8），自动停止。";
    allContent += stopMsg;
    cbs.onChunk?.(stopMsg);
  }

  const finalReason = stoppedByLength ? "length" : "stop";
  cbs.onFinish?.(finalReason);
  return { content: allContent, toolCalls: allToolCalls, finishReason: finalReason };
}

// ===== 非流式调用 =====

export async function callAI(options: AICallOptions): Promise<StreamResult> {
  const { config } = options;

  if (!config.apiKey) {
    throw new Error("未配置 API Key，请在设置中填写");
  }

  if (config.key === "claude") {
    return callClaude(options);
  }

  return callOpenAI(options);
}

/**
 * OpenAI 兼容非流式调用。
 */
async function callOpenAI(options: AICallOptions): Promise<StreamResult> {
  const { config, signal } = options;

  const baseUrl = config.baseUrl?.replace(/\/$/, "") ?? "https://api.openai.com/v1";
  validateBaseUrl(baseUrl);
  const url = `${baseUrl}/chat/completions`;

  const body = buildOpenAIBody(options, false);
  const bodyStr = JSON.stringify(body);
  checkBodySize(bodyStr);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: bodyStr,
    signal: withTimeout(signal, TIMEOUT_NON_STREAM),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `AI 请求失败 (${response.status}): ${errorText.slice(0, 200) || response.statusText}`
    );
  }

  const data = await response.json();
  const choice = data?.choices?.[0];
  const message = choice?.message;
  const content = (message?.content ?? "") as string;
  const toolCalls = parseOpenAIToolCalls(message?.tool_calls);
  const reasoningContent = (message?.reasoning_content ?? "") as string;
  const finishReason = (choice?.finish_reason ?? null) as string | null;

  return {
    content,
    toolCalls,
    reasoningContent: reasoningContent || undefined,
    finishReason,
  };
}

function parseOpenAIToolCalls(raw: unknown): ToolCallResult[] {
  if (!Array.isArray(raw)) return [];
  const result: ToolCallResult[] = [];
  for (const tc of raw) {
    const id = tc?.id ?? "";
    const name = tc?.function?.name ?? "";
    const argsStr = tc?.function?.arguments ?? "{}";
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(argsStr);
    } catch {
      console.warn("[AI] 工具调用参数解析失败:", argsStr);
    }
    result.push({ id, name, arguments: args });
  }
  return result;
}

// ===== Claude 适配 =====

type ClaudeTool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
};

function convertOpenAIToolsToClaude(
  tools?: AICallOptions["tools"]
): ClaudeTool[] | null {
  if (!tools || tools.length === 0) return null;
  return tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));
}

async function callClaude(options: AICallOptions): Promise<StreamResult> {
  const {
    config,
    messages,
    temperature = 0.7,
    maxTokens = 8192,
    signal,
    tools,
    forceToolName,
  } = options;

  const baseUrl = config.baseUrl?.replace(/\/$/, "") ?? "https://api.anthropic.com/v1";
  validateBaseUrl(baseUrl);
  const url = `${baseUrl}/messages`;

  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const dialogMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model: config.model,
    system: systemMsg,
    messages: dialogMessages,
    temperature,
    max_tokens: maxTokens,
  };
  const claudeToolList = convertOpenAIToolsToClaude(tools);
  if (claudeToolList && claudeToolList.length > 0) {
    body.tools = claudeToolList;
    if (forceToolName) {
      body.tool_choice = { type: "tool", name: forceToolName };
    }
  }

  const bodyStr = JSON.stringify(body);
  checkBodySize(bodyStr);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: bodyStr,
    signal: withTimeout(signal, TIMEOUT_NON_STREAM),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Claude 请求失败 (${response.status}): ${errorText.slice(0, 200) || response.statusText}`
    );
  }

  const data = await response.json();
  const contentBlocks = Array.isArray(data?.content) ? data.content : [];
  let content = "";
  const toolCalls: ToolCallResult[] = [];

  for (const block of contentBlocks) {
    if (block.type === "text") {
      content += block.text ?? "";
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id ?? "",
        name: block.name ?? "",
        arguments: (block.input ?? {}) as Record<string, unknown>,
      });
    }
  }

  return { content, toolCalls, reasoningContent: undefined };
}

async function callClaudeStream(
  options: AICallOptions,
  callbacks: StreamCallbacks
): Promise<StreamResult> {
  const {
    config,
    messages,
    temperature = 0.7,
    maxTokens = 8192,
    signal,
    tools,
    forceToolName,
  } = options;

  const baseUrl = config.baseUrl?.replace(/\/$/, "") ?? "https://api.anthropic.com/v1";
  validateBaseUrl(baseUrl);
  const url = `${baseUrl}/messages`;

  const systemMsg = messages.find((m) => m.role === "system")?.content ?? "";
  const dialogMessages = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));

  const body: Record<string, unknown> = {
    model: config.model,
    system: systemMsg,
    messages: dialogMessages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };
  const claudeToolList = convertOpenAIToolsToClaude(tools);
  if (claudeToolList && claudeToolList.length > 0) {
    body.tools = claudeToolList;
    if (forceToolName) {
      body.tool_choice = { type: "tool", name: forceToolName };
    }
  }

  const bodyStr = JSON.stringify(body);
  checkBodySize(bodyStr);

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: bodyStr,
    signal: withTimeout(signal, TIMEOUT_STREAM),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Claude 请求失败 (${response.status}): ${errorText.slice(0, 200) || response.statusText}`
    );
  }

  if (!response.body) {
    throw new Error("响应体为空，不支持流式输出");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let fullContent = "";

  const blockMap = new Map<
    number,
    { type: string; id: string; name: string; argsBuffer: string }
  >();
  const toolCalls: ToolCallResult[] = [];

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const data = trimmed.slice(5).trim();
        if (!data) continue;

        try {
          const json = JSON.parse(data);

          if (json.type === "content_block_start" && json.content_block) {
            const cb = json.content_block;
            blockMap.set(json.index ?? 0, {
              type: cb.type ?? "text",
              id: cb.id ?? "",
              name: cb.name ?? "",
              argsBuffer: "",
            });
          } else if (json.type === "content_block_delta" && json.delta) {
            const block = blockMap.get(json.index ?? 0);
            if (!block) continue;

            if (json.delta.type === "text_delta" && json.delta.text) {
              fullContent += json.delta.text;
              callbacks.onChunk?.(json.delta.text);
            } else if (json.delta.type === "input_json_delta" && json.delta.partial_json) {
              block.argsBuffer += json.delta.partial_json;
            }
          } else if (json.type === "content_block_stop") {
            const block = blockMap.get(json.index ?? 0);
            if (block && block.type === "tool_use") {
              let args: Record<string, unknown> = {};
              if (block.argsBuffer) {
                try {
                  args = JSON.parse(block.argsBuffer);
                } catch {
                  console.warn("[AI] Claude 工具调用参数解析失败:", block.argsBuffer);
                }
              }
              const tc: ToolCallResult = {
                id: block.id,
                name: block.name,
                arguments: args,
              };
              toolCalls.push(tc);
              callbacks.onToolCall?.(tc);
            }
          } else if (json.type === "message_stop") {
            callbacks.onFinish?.("stop");
            return { content: fullContent, toolCalls, reasoningContent: undefined };
          }
        } catch {
          // 跳过无法解析的 chunk
        }
      }
    }
  } catch (e) {
    if (e instanceof Error && (e.name === "AbortError" || (e instanceof DOMException && e.name === "AbortError"))) {
      callbacks.onFinish?.("aborted");
      return { content: fullContent, toolCalls, reasoningContent: undefined };
    }
    throw e;
  } finally {
    reader.releaseLock();
  }

  callbacks.onFinish?.("stop");
  return { content: fullContent, toolCalls, reasoningContent: undefined };
}
