import type { CanvasElement } from "@/types";
import { useAIStore } from "@/stores/aiStore";

/** AI 生成结果：展示文本 + 写入 store 的字段补丁 */
export interface GenerationResult {
  /** 用于 toast 等提示的展示文本 */
  text: string;
  /** 写入对应 store 的字段补丁 */
  patch: Record<string, unknown>;
}

/** 是否已配置真实 AI（有 key 即视为已配置） */
export function isAIConfigured(): boolean {
  return Boolean(useAIStore.getState().getActiveConfig());
}

/** 根据元素类型返回系统提示词（每种类型附带专业游戏设计理论支撑） */
function getSystemPrompt(element: CanvasElement): string {
  switch (element.type) {
    case "core-loop":
      // core-loop 的 steps 是 LoopStep[]（完整对象），AI 无法可靠生成完整步骤对象，
      // 因此只让 AI 生成 name/description/loopType，steps 由专门的 loop-step 节点管理
      return `你是拥有15年经验的资深游戏玩法设计师，专精核心循环设计。

## 设计理论
核心循环是游戏的灵魂——"玩家反复做什么"。一个好的核心循环应满足：
- **简洁性**：3-5个玩步形成闭环，不要过度复杂
- **节奏感**：行动-反馈-奖励-成长的节奏要清晰
- **内驱力**：每个玩步的结束应该自然驱动下一个玩步
- **心流通道**：挑战与能力匹配，避免焦虑或无聊
- 次级循环嵌套在核心循环内，元循环跨越更长周期

## 生成要求
根据用户描述生成核心循环的顶层设计：
- name：有游戏感的命名（如"探索-战斗-收集-成长"）
- description：说明循环如何驱动玩家持续投入
- loopType：core（主循环）/secondary（次级循环）/meta（元循环）
- 不要生成 steps（步骤由 loop-step 节点单独生成）

返回 JSON：{name, description, loopType}`;
    case "loop-step":
      return `你是拥有15年经验的资深游戏玩法设计师，专精玩步设计。

## 设计理论
玩步是核心循环的执行单元——每个玩步回答"玩家此刻在做什么"：
- **玩家行动**：具体、可操作、有游戏感的动词（如"挥剑斩击"、"潜行避开巡逻"）
- **情绪标签**：玩家在此刻的主导情绪（兴奋/紧张/放松/满足/好奇/恐惧等）
- **行动可感知**：玩家必须能明确感知到自己在做什么、做成功了什么
- **反馈即时**：行动后应有即时视觉/听觉反馈

## 生成要求
根据用户描述生成一个玩步：
- label：简短标签（2-4字，如"探索"、"战斗"、"收集"）
- playerAction：具体玩家行动描述（20-40字）
- emotion：主导情绪关键词

返回 JSON：{playerAction, emotion, label}`;
    case "moment":
      return `你是拥有15年经验的资深游戏玩法设计师，专精情绪体验设计。

## 设计理论
高光时刻是玩家情绪达到峰值的节点，设计要点：
- **情绪强度**：1-10分，10分是史诗级时刻（如击败Boss），5分是中等愉悦
- **情绪类型**：胜利/震撼/感动/惊喜/紧张/恐惧/成就等
- **节奏分布**：前期建立期待，中期制造紧张，后期释放高潮
- **可重复性**：高光时刻不能太频繁，否则会失去张力

## 生成要求
- title：时刻标题（有画面感）
- description：描述这一刻玩家在做什么、看到什么、感受什么
- emotion：1-10的强度数值
- emotionLabel：情绪标签（如"史诗"、"震撼"、"感动"）

返回 JSON：{title, description, emotion(1-10), emotionLabel}`;
    case "node":
      return `你是拥有15年经验的资深游戏机制设计师，精通MDA框架。

## 设计理论
机制节点是循环的"系统实现"——每个玩步背后都有机制支撑：
- **40种节点类型**：event/action/state/condition/resource/pool/converter/timer/rng/trigger_zone/spawner/savepoint/difficulty/attribute/modifier/level/reward/penalty/feedback/ai_behavior/social/region/landmark/path/weather/biome/character/item/skill/quest/dialogue/enemy/shop/music/sfx/fx/animation/camera/ui
- **机制要具体**：不是"伤害系统"，而是"物理伤害计算：基础攻击力 × 武器修正 - 目标防御力"
- **数据驱动**：description 要写到实现层面，能指导程序员落地

## 生成要求
- label：节点名称（有游戏感）
- description：机制说明（写到实现层面，40-80字）

返回 JSON：{label, description}
description 放入 data.description 字段。`;
    case "rule":
      return `你是拥有15年经验的资深游戏规则设计师。

## 设计理论
规则是机制的"可读说明书"——把 condition 节点的逻辑变成玩家可理解的语言：
- **IF-THEN 结构**：条件必须明确可判断，动作必须具体可执行
- **条件具体**：不是"玩家受伤"，而是"玩家HP低于30%"
- **动作可执行**：不是"触发效果"，而是"进入狂暴状态，攻击力+50%，移速-20%"
- **分类清晰**：combat/movement/economy/social/progression/custom

## 生成要求
- condition：IF 条件（具体、可判断）
- action：THEN 动作（具体、可执行）

返回 JSON：{condition, action}`;
    case "level-node":
      return `你是拥有15年经验的资深关卡设计师。

## 设计理论
关卡是循环的"容器"——每个关卡承载一段核心循环体验：
- **难度曲线**：前期平缓建立信心，中期稳步提升，Boss战陡峭
- **时长控制**：tutorial 5-10分钟，普通关卡 15-30分钟，Boss战 10-20分钟
- **节奏变化**：紧张-放松-紧张交替，避免持续高压
- **关卡类型**：level/boss/cutscene/hub/secret/tutorial/ending

## 生成要求
- label：关卡名称
- description：关卡设计说明（主题、挑战、节奏）
- difficulty：1-10难度
- duration：预估时长（分钟）

返回 JSON：{label, description, difficulty(1-10), duration(分钟)}`;
    case "attribute":
      return `你是拥有15年经验的资深数值设计师，精通RPG经济建模。

## 设计理论
数值是所有设计的"量化落地"：
- **属性分类**：number（数值）/string（文本）/bool（开关）
- **数值平衡**：基础值要考虑成长曲线，避免前期膨胀或后期溢出
- **公式设计**：用 @属性名 引用其他属性，支持四则运算 + pow/log/sqrt/min/max/abs
- **避免循环引用**：A依赖B，B不能又依赖A

## 生成要求
- name：属性名（英文或拼音，如 hp、attack、crit_rate）
- value：初始值
- description：属性用途说明

返回 JSON：{name, value, description}`;
  }
}

/** 构建用户消息内容 */
function buildUserMessage(element: CanvasElement, prompt: string): string {
  const p = prompt.trim();
  const ctx = getElementContext(element);
  return `${ctx}\n\n用户需求：${p || "请生成默认内容"}`;
}

/** 提取元素上下文信息，帮助 AI 理解当前节点在设计中的位置 */
function getElementContext(element: CanvasElement): string {
  switch (element.type) {
    case "core-loop": {
      const steps = element.data.steps ?? [];
      const stepLabels = steps.map((s) => s.label).filter(Boolean).join(" → ");
      return [
        `当前核心循环：${element.data.name}（类型：${element.data.loopType}）`,
        `当前步骤数：${steps.length}`,
        stepLabels ? `已有步骤：${stepLabels}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "loop-step":
      return [
        `当前玩步：${element.data.label}`,
        `所属循环：${element.loopName}`,
        element.data.playerAction ? `玩家行动：${element.data.playerAction}` : "",
        element.data.emotion ? `当前情绪：${element.data.emotion}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "moment":
      return [
        `当前时刻：${element.data.title}（类型：${element.data.type}）`,
        `情绪强度：${element.data.emotion}/10`,
        `时机位置：${element.data.timing}%`,
      ]
        .filter(Boolean)
        .join("\n");
    case "node": {
      const desc = element.data.data?.description;
      return [
        `当前机制节点：${element.data.label}（类型：${element.data.type}）`,
        `所属图：${element.graphName}`,
        typeof desc === "string" && desc ? `当前描述：${desc}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    }
    case "rule":
      return [
        `当前规则：${element.data.title}（分类：${element.data.category}）`,
        element.data.condition ? `当前 IF：${element.data.condition}` : "",
        element.data.action ? `当前 THEN：${element.data.action}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "level-node":
      return [
        `当前关卡：${element.data.label}（类型：${element.data.type}）`,
        `所属流程：${element.flowName}`,
        `难度：${element.data.difficulty}/10`,
        `时长：${element.data.duration}分钟`,
      ]
        .filter(Boolean)
        .join("\n");
    case "attribute": {
      const lines = [
        `当前属性：${element.data.name}（类型：${element.data.type}）`,
        `当前值：${element.data.value}`,
      ];
      if (element.formula?.expression) {
        lines.push(`公式：${element.formula.expression}`);
      }
      return lines.join("\n");
    }
  }
}

/** 从 AI 返回的文本中解析 JSON（容错：提取首个 { 到末尾 }） */
function parseAIResponse(content: string): Record<string, unknown> | null {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** 把 AI 返回的 JSON 转成 patch */
function patchFromAI(element: CanvasElement, json: Record<string, unknown>): GenerationResult {
  switch (element.type) {
    case "core-loop": {
      const name = typeof json.name === "string" ? json.name : element.data.name;
      const description = typeof json.description === "string" ? json.description : "";
      // 校验 loopType，非法值回退到原值
      const loopTypeRaw = json.loopType;
      const loopType =
        loopTypeRaw === "core" || loopTypeRaw === "secondary" || loopTypeRaw === "meta"
          ? loopTypeRaw
          : element.data.loopType;
      // 不返回 steps：steps 是 LoopStep[]（需要完整对象），由专门的 loop-step 节点管理
      return { text: name, patch: { name, description, loopType } };
    }
    case "loop-step": {
      const playerAction = typeof json.playerAction === "string" ? json.playerAction : "";
      const emotion = typeof json.emotion === "string" ? json.emotion : "";
      const label = typeof json.label === "string" ? json.label : element.data.label;
      return { text: label, patch: { playerAction, emotion, label } };
    }
    case "moment": {
      const title = typeof json.title === "string" ? json.title : element.data.title;
      const description = typeof json.description === "string" ? json.description : "";
      const emotion = typeof json.emotion === "number" ? json.emotion : 8;
      const emotionLabel = typeof json.emotionLabel === "string" ? json.emotionLabel : "";
      return { text: title, patch: { title, description, emotion, emotionLabel } };
    }
    case "node": {
      const label = typeof json.label === "string" ? json.label : element.data.label;
      const description = typeof json.description === "string" ? json.description : "";
      return { text: label, patch: { label, data: { ...element.data.data, description } } };
    }
    case "rule": {
      const condition = typeof json.condition === "string" ? json.condition : "";
      const action = typeof json.action === "string" ? json.action : "";
      return { text: `IF ${condition} THEN ${action}`, patch: { condition, action } };
    }
    case "level-node": {
      const description = typeof json.description === "string" ? json.description : "";
      const difficulty = typeof json.difficulty === "number" ? json.difficulty : 5;
      const duration = typeof json.duration === "number" ? json.duration : 15;
      return { text: description, patch: { description, difficulty, duration } };
    }
    case "attribute": {
      const value = typeof json.value === "string" ? json.value : "100";
      const description = typeof json.description === "string" ? json.description : "";
      return { text: value, patch: { value, description } };
    }
  }
}

/** 模拟生成：未配置 API key 时的 fallback。根据 prompt 动态生成有游戏感的内容 */
function produceTemplate(element: CanvasElement, prompt: string): GenerationResult {
  const p = prompt.trim();
  switch (element.type) {
    case "core-loop":
      return {
        text: p ? `${p} - 核心循环已生成` : "探索 → 战斗 → 收集 → 成长",
        patch: {
          name: p ? `${p}核心循环` : "探索-战斗-收集-成长",
          description: p
            ? `基于「${p}」设计的核心玩法循环：玩家在探索中发现目标，通过战斗克服挑战，收集战利品强化角色，驱动下一轮探索。`
            : "玩家在开放世界中探索未知区域，遭遇敌人进入战斗，收集战利品和资源，通过升级和装备强化角色，驱动探索更广阔的世界。",
          // 不返回 steps：steps 是 LoopStep[]（完整对象），由专门的 loop-step 节点管理
          loopType: "core",
        },
      };
    case "loop-step":
      return {
        text: p ? `${p} - 玩步已生成` : "探索未知区域",
        patch: {
          label: p ? p.slice(0, 4) : "探索",
          playerAction: p
            ? `${p}：玩家主动寻找目标，通过移动和观察发现感兴趣的内容`
            : "玩家在地图上自由移动，通过观察环境线索发现隐藏的洞穴、宝箱或NPC",
          emotion: "好奇",
        },
      };
    case "moment":
      return {
        text: p ? `${p} - 高光时刻已生成` : "击败Boss的史诗时刻",
        patch: {
          title: p ? `${p}·高光时刻` : "首次击败Boss",
          description: p
            ? `基于「${p}」设计的情绪高峰：玩家在关键挑战中取得胜利，积累的紧张感在成功瞬间释放，产生强烈的成就感和满足感。`
            : "玩家在经历多次失败后，终于击败强大的Boss。战斗结束的瞬间，慢镜头回放、胜利音乐响起、战利品掉落，情绪达到顶峰。",
          emotion: 9,
          emotionLabel: "史诗",
        },
      };
    case "node":
      return {
        text: p ? `${p} - 机制已生成` : "伤害计算机制",
        patch: {
          label: p ? p : "物理伤害计算",
          data: {
            description: p
              ? `基于「${p}」的机制：处理玩家与系统的核心交互，定义输入条件和输出结果。`
              : "物理伤害 = (基础攻击力 × 武器修正 - 目标防御力) × 暴击系数。考虑护甲穿透、元素抗性、状态加成。",
          },
        },
      };
    case "rule":
      return {
        text: p ? `${p} - 规则已生成` : "狂暴模式触发规则",
        patch: {
          condition: p ? `玩家${p}` : "玩家HP低于30%",
          action: p ? `触发${p}效果` : "进入狂暴状态，攻击力+50%，移速-20%，持续5秒",
        },
      };
    case "level-node":
      return {
        text: p ? `${p} - 关卡已生成` : "标准战斗关卡",
        patch: {
          label: p ? p : "遗忘之谷",
          description: p
            ? `基于「${p}」的关卡：包含探索、解谜、战斗多阶段，最终Boss战收尾。`
            : "中等规模关卡，包含3个区域：入口探索区、中段解谜区、Boss战场。玩家需利用环境优势克服挑战。",
          difficulty: 5,
          duration: 15,
        },
      };
    case "attribute":
      return {
        text: p ? `${p} - 属性已生成` : "基础生命值",
        patch: {
          name: p ? p.toLowerCase().replace(/\s/g, "_") : "hp",
          value: "100",
          description: p
            ? `基于「${p}」的属性：影响角色生存能力，归零时角色死亡。`
            : "角色基础生命值，归零时角色死亡。受体质、装备、Buff影响。",
        },
      };
  }
}

/** 调用 OpenAI 兼容的 chat completions 接口 */
async function callOpenAI(element: CanvasElement, prompt: string): Promise<GenerationResult> {
  const systemPrompt = getSystemPrompt(element);
  const userMessage = buildUserMessage(element, prompt);

  const config = useAIStore.getState().getActiveConfig();
  if (!config) {
    throw new Error("AI 未配置，请在设置中填写 API Key");
  }
  const baseUrl = config.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.8,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`AI 接口错误 ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";

  const json = parseAIResponse(content);
  if (json) {
    return patchFromAI(element, json);
  }
  // 解析失败，回退到展示原文
  return { text: content.slice(0, 200), patch: {} };
}

/**
 * 生成内容：已配置 API key 走真实调用，否则走模拟生成。
 */
export async function generateContent(element: CanvasElement, prompt: string): Promise<GenerationResult> {
  if (isAIConfigured()) {
    return callOpenAI(element, prompt);
  }
  // 模拟延迟
  await new Promise((r) => setTimeout(r, 1200));
  return produceTemplate(element, prompt);
}

// ===== 玩步变体方案生成（宫格语义）=====

/** 变体方案：玩步的一种实现方式 */
export interface VariantResult {
  /** 变体名称，如"地图探索" */
  title: string;
  /** 玩家行动描述 */
  playerAction: string;
  /** 情绪标签，如"好奇" */
  emotion: string;
}

/** 校验对象是否符合 VariantResult 形状 */
function isVariantShape(v: unknown): v is VariantResult {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.title === "string" &&
    typeof o.playerAction === "string" &&
    typeof o.emotion === "string"
  );
}

/** 从 AI 返回的文本中解析 JSON 数组（容错：提取首个 [ 到末尾 ]） */
function parseAIArrayResponse(content: string): VariantResult[] {
  const tryParse = (text: string): VariantResult[] => {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed.filter(isVariantShape);
      }
    } catch {
      // ignore
    }
    return [];
  };

  // 先尝试整段解析
  const direct = tryParse(content);
  if (direct.length > 0) return direct;

  // 再尝试截取 [ ... ]
  const start = content.indexOf("[");
  const end = content.lastIndexOf("]");
  if (start >= 0 && end > start) {
    return tryParse(content.slice(start, end + 1));
  }
  return [];
}

/** 模拟生成变体：未配置 API key 时的 fallback */
function produceVariantTemplates(
  element: CanvasElement,
  count: number,
  basePrompt: string
): VariantResult[] {
  const label = element.type === "loop-step" ? element.data.label : "玩步";
  const p = basePrompt.trim();
  // 预设变体池：覆盖常见玩法维度，确保 25 宫格也有足够候选
  const pool: VariantResult[] = [
    { title: "地图探索", playerAction: p ? `${p}：在地图上移动发现新区域` : "在地图上移动，发现隐藏地点和宝藏", emotion: "好奇" },
    { title: "随机事件", playerAction: p ? `${p}：触发随机事件并做出选择` : "遭遇随机事件，做出抉择影响后续", emotion: "惊喜" },
    { title: "解谜探索", playerAction: p ? `${p}：解开环境谜题打开通路` : "观察环境线索，解开谜题前进", emotion: "专注" },
    { title: "剧情探索", playerAction: p ? `${p}：跟随剧情线索推进故事` : "与 NPC 对话，收集剧情线索推进故事", emotion: "沉浸" },
    { title: "战斗遭遇", playerAction: p ? `${p}：与敌人战斗获取奖励` : "遭遇敌人，战斗获取经验和战利品", emotion: "紧张" },
    { title: "潜行渗透", playerAction: p ? `${p}：避开敌人潜行通过` : "利用掩体避开视线，潜行前进", emotion: "刺激" },
    { title: "资源采集", playerAction: p ? `${p}：采集资源用于升级` : "采集地图上的材料，用于装备升级", emotion: "满足" },
    { title: "挑战试炼", playerAction: p ? `${p}：完成挑战试炼获取奖励` : "进入挑战区域，完成试炼获得稀有奖励", emotion: "兴奋" },
    { title: "合作探索", playerAction: p ? `${p}：与其他玩家合作探索` : "组队探索，分工合作解决难题", emotion: "协作" },
    { title: "竞速挑战", playerAction: p ? `${p}：在限时内完成探索目标` : "限时挑战，快速穿越区域达成目标", emotion: "急迫" },
    { title: "隐藏发现", playerAction: p ? `${p}：寻找隐藏的秘境和彩蛋` : "搜索角落，发现隐藏秘境和彩蛋", emotion: "惊喜" },
    { title: "环境互动", playerAction: p ? `${p}：利用环境元素解开封锁` : "利用环境元素（如火、水、机关）解开封锁", emotion: "好奇" },
    { title: "追踪猎物", playerAction: p ? `${p}：追踪目标并最终捕获` : "根据足迹和线索追踪目标，最终捕获", emotion: "专注" },
    { title: "生存探索", playerAction: p ? `${p}：在恶劣环境下维持生存` : "管理资源维持生存，探索危险区域", emotion: "紧张" },
    { title: "守护护送", playerAction: p ? `${p}：护送 NPC 穿越危险区域` : "保护 NPC 穿越危险区域抵达目的地", emotion: "责任" },
    { title: "多结局选择", playerAction: p ? `${p}：在关键节点做出道德抉择` : "在关键节点做出道德抉择，影响结局", emotion: "纠结" },
    { title: "收集图鉴", playerAction: p ? `${p}：收集图鉴完成度` : "收集各地物种和物品，填充图鉴", emotion: "满足" },
    { title: "空中机动", playerAction: p ? `${p}：利用飞行能力探索高空` : "利用飞行能力探索高空区域", emotion: "自由" },
    { title: "水下探险", playerAction: p ? `${p}：潜入水下探索沉船` : "潜入水下，探索沉船和海底洞穴", emotion: "神秘" },
    { title: "时间挑战", playerAction: p ? `${p}：在时间循环中找到破局点` : "在时间循环中试错，找到破局点", emotion: "困惑" },
    { title: "势力争夺", playerAction: p ? `${p}：为势力争夺区域控制权` : "为势力争夺区域控制权，影响世界", emotion: "热血" },
    { title: "谜题拼图", playerAction: p ? `${p}：收集碎片拼合完整图案` : "收集散落的碎片，拼合完整图案", emotion: "专注" },
    { title: "音律共鸣", playerAction: p ? `${p}：通过音律共鸣打开通路` : "按节拍触发音符，共鸣打开通路", emotion: "愉悦" },
    { title: "光影解谜", playerAction: p ? `${p}：调整光源角度解开机关` : "调整镜面和光源角度，解开光机关", emotion: "好奇" },
    { title: "信仰抉择", playerAction: p ? `${p}：在不同信仰间做出抉择` : "在不同信仰阵营间抉择，影响剧情", emotion: "沉重" },
  ];
  // 基于玩步 label 轻微个性化，避免完全雷同
  const result: VariantResult[] = [];
  for (let i = 0; i < count; i++) {
    const v = pool[i % pool.length];
    result.push({
      title: v.title,
      playerAction: v.playerAction,
      emotion: v.emotion,
    });
  }
  // 标记 label 便于调试（不修改 title，保持简洁）
  void label;
  return result;
}

/**
 * 为玩步生成多个变体方案（宫格语义）。
 *
 * - 已配置 API key：调用 OpenAI，返回 JSON 数组
 * - 未配置：走模拟生成，从预设池中取 count 个
 */
export async function generateVariants(
  element: CanvasElement,
  count: number,
  basePrompt: string
): Promise<VariantResult[]> {
  if (!isAIConfigured()) {
    // 模拟延迟
    await new Promise((r) => setTimeout(r, 1200));
    return produceVariantTemplates(element, count, basePrompt);
  }

  const label = element.type === "loop-step" ? element.data.label : "玩步";
  const elementContext = getElementContext(element);
  const systemPrompt = `你是拥有15年经验的资深游戏玩法设计师，专精为玩步生成多个变体方案。

## 设计要求
为玩步「${label}」生成 ${count} 个不同的变体方案。每个变体是同一玩步的不同实现方式：
- 每个变体要有独特的玩家行动（不是换皮）
- 情绪体验要差异化（兴奋 vs 紧张 vs 放松 vs 好奇）
- 考虑不同的游戏风格（激进/谨慎/创造/社交）

## 当前玩步上下文
${elementContext}

返回 JSON 数组：
[{title, playerAction, emotion}, ...]

注意：数组长度必须等于 ${count}，每个元素都要有独特的内容。`;
  const userMessage = basePrompt.trim()
    ? `玩步：${label}\n附加要求：${basePrompt.trim()}\n请生成 ${count} 个变体方案。`
    : `玩步：${label}\n请生成 ${count} 个变体方案。`;

  const config = useAIStore.getState().getActiveConfig();
  if (!config) {
    return produceVariantTemplates(element, count, basePrompt);
  }
  const baseUrl = config.baseUrl?.replace(/\/$/, "") || "https://api.openai.com/v1";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: 0.9,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => res.statusText);
    throw new Error(`AI 接口错误 ${res.status}: ${errText}`);
  }

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content ?? "";
  const variants = parseAIArrayResponse(content);
  if (variants.length > 0) {
    return variants.slice(0, count);
  }
  // 解析失败，回退到模拟生成
  return produceVariantTemplates(element, count, basePrompt);
}
