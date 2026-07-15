import { useState, useRef, useEffect } from "react";
import { useAIStore } from "@/stores/aiStore";
import { useProjectStore } from "@/stores/projectStore";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useUIStore } from "@/stores/uiStore";
import { useChatStore } from "@/stores/chatStore";
import { callAIStream, trimMessages } from "@/lib/aiClient";
import {
  buildMechanismGenPrompt,
  buildMechanismReviewPrompt,
  buildMechanismEditPrompt,
  buildNumericGenPrompt,
  buildBalanceAnalysisPrompt,
  buildGDDGenPrompt,
  buildReferencePrompt,
  buildChatPrompt,
  buildLoopGenPrompt,
  buildMomentGenPrompt,
  buildRuleGenPrompt,
  buildLevelGenPrompt,
} from "@/lib/aiPrompts";
import { cn } from "@/lib/utils";
import {
  Sparkles,
  Send,
  Loader2,
  Calculator,
  AlertCircle,
  Trash2,
  Wand2,
  ClipboardCheck,
  Scale,
  FilePlus,
  BookMarked,
  Square,
  Wand,
  Check,
  MessageSquare,
  Undo2,
  Plus,
  History,
  RefreshCw,
  Flame,
  ScrollText,
  GitBranch,
} from "lucide-react";
import MarkdownRenderer from "./MarkdownRenderer";
import ModelSwitcher from "./ModelSwitcher";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  DESIGN_TOOLS_OPENAI,
  getToolsForAction,
  getForceToolName,
  anyActionFromToolCall,
  applyDesignAction,
  undoDesignAction,
  applyDimensionAction,
  undoDimensionAction,
  getActionModule,
  type UndoRecord,
  type DimensionUndoRecord,
} from "@/lib/aiActions";
import { db } from "@/db";
import type {
  GraphNode,
  GraphEdge,
  Attribute,
  Formula,
  DocSection,
  Project,
  CoreLoop,
  GameMoment,
  GameRule,
  LevelFlow,
} from "@/types";
import { useNavigate, useLocation } from "react-router-dom";

interface AIAction {
  id: string;
  label: string;
  icon: typeof Wand2;
  module: "mechanism" | "numeric" | "document" | "all";
  needsInput?: boolean;
  inputPlaceholder?: string;
}

const AI_ACTIONS: AIAction[] = [
  {
    id: "mechanism-gen",
    label: "机制生成",
    icon: Wand2,
    module: "mechanism",
    needsInput: true,
    inputPlaceholder: "描述你想要的玩法机制，如：基于元素反应的战斗系统",
  },
  {
    id: "mechanism-edit",
    label: "机制修改",
    icon: Wand,
    module: "mechanism",
    needsInput: true,
    inputPlaceholder: "描述要做的修改，如：把「击杀敌人」改为「击败敌人」，并新增「掉落宝箱」节点",
  },
  {
    id: "mechanism-review",
    label: "机制评审",
    icon: ClipboardCheck,
    module: "mechanism",
  },
  {
    id: "numeric-gen",
    label: "数值生成",
    icon: Calculator,
    module: "numeric",
    needsInput: true,
    inputPlaceholder: "描述数值需求，如：RPG 角色成长曲线，偏线性",
  },
  {
    id: "balance-analysis",
    label: "平衡分析",
    icon: Scale,
    module: "numeric",
  },
  {
    id: "gdd-gen",
    label: "GDD 生成",
    icon: FilePlus,
    module: "document",
  },
  {
    id: "reference",
    label: "设计参考",
    icon: BookMarked,
    module: "all",
    needsInput: true,
    inputPlaceholder: "关注主题，如：roguelike 随机生成、经济系统",
  },
  {
    id: "loop-gen",
    label: "循环生成",
    icon: RefreshCw,
    module: "all",
    needsInput: true,
    inputPlaceholder: "描述你想要的核心循环，如：RPG 战斗循环，遭遇→战斗→掉宝→升级",
  },
  {
    id: "moment-gen",
    label: "时刻生成",
    icon: Flame,
    module: "all",
    needsInput: true,
    inputPlaceholder: "描述你想要的高光时刻，如：Boss 战高潮、剧情转折、隐藏发现",
  },
  {
    id: "rule-gen",
    label: "规则生成",
    icon: ScrollText,
    module: "all",
    needsInput: true,
    inputPlaceholder: "描述你想要的规则，如：战斗暴击规则、经济转换规则",
  },
  {
    id: "level-gen",
    label: "关卡生成",
    icon: GitBranch,
    module: "all",
    needsInput: true,
    inputPlaceholder: "描述你想要的关卡流程，如：线性动作关卡，10 关，3 个 Boss",
  },
];

interface ChatItem {
  id: string;
  role: "user" | "assistant";
  content: string;
  action?: string;
  applied?: boolean;
  // DeepSeek 思考模式的思维链（不持久化，仅当前会话显示）
  reasoning?: string;
  // 自动应用的 tool call 记录（每个可单独撤销）
  appliedRecords?: AppliedRecord[];
}

/** 单次 tool call 的自动应用记录，可单独撤销 */
interface AppliedRecord {
  toolCallId: string;
  summary: string;
  // 设计动作（机制/数值/文档）的撤销记录
  undo?: UndoRecord;
  // 维度动作（循环/时刻/规则/关卡）的撤销记录
  dimUndo?: DimensionUndoRecord;
  undone?: boolean;
}

/**
 * 根据 tool call 的名称和参数生成预览摘要（用于 appliedRecords 展示）。
 */
function buildToolCallSummary(
  toolName: string,
  args: Record<string, unknown>
): string {
  const len = (v: unknown): number => (Array.isArray(v) ? v.length : 0);
  switch (toolName) {
    case "apply_mechanism":
      return `新增 ${len(args.nodes)} 个节点、${len(args.edges)} 条连接`;
    case "apply_numeric":
      return `新增 ${len(args.attributes)} 个属性、${len(args.formulas)} 条公式`;
    case "apply_gdd":
      return `追加 ${len(args.sections)} 个文档段落`;
    case "update_node":
      return `修改节点「${(args.nodeLabel as string) ?? ""}」`;
    case "remove_node":
      return `删除节点「${(args.nodeLabel as string) ?? ""}」`;
    case "add_node_to_existing":
      return `增量添加 ${len(args.nodes)} 个节点、${len(args.edges)} 条连接`;
    case "patch_formula": {
      const attr = (args.attributeName as string) ?? "";
      const expr = (args.expression as string) ?? "";
      return expr ? `修改公式 ${attr} = ${expr}` : `修改公式「${attr}」`;
    }
    case "apply_loops":
      return `生成 ${len(args.loops)} 个核心循环`;
    case "apply_moments":
      return `生成 ${len(args.moments)} 个高光时刻`;
    case "apply_rules":
      return `生成 ${len(args.rules)} 条规则`;
    case "apply_level_flow":
      return `生成关卡流程「${(args.name as string) ?? ""}」：${len(args.nodes)} 个关卡、${len(args.edges)} 条连线`;
    default:
      return `调用工具 ${toolName}`;
  }
}

export default function AIPanel() {
  const { getActiveConfig, isGenerating, setIsGenerating, lastError, setLastError, setAbortController, abortByKey } =
    useAIStore();
  const { currentProject } = useProjectStore();
  const { nodes, edges } = useMechanismStore();
  const { attributes, formulas } = useNumericStore();
  const { sections } = useDocumentStore();
  const addToast = useUIStore((s) => s.addToast);
  const requestFitView = useUIStore((s) => s.requestFitView);
  const navigate = useNavigate();

  const config = getActiveConfig();
  const module = useCurrentModuleFromURL();
  const [chat, setChat] = useState<ChatItem[]>([]);
  const [input, setInput] = useState("");
  const [activeAction, setActiveAction] = useState<AIAction | null>(null);
  const [actionInput, setActionInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  // 追踪最后应用的模块（用于应用后跳转）；收集阶段不写入，仅在用户确认应用时更新
  const lastAppliedModuleRef = useRef<"mechanism" | "numeric" | "document" | null>(null);
  // 追踪本次生成是否触达机制画布（apply_mechanism / add_node_to_existing / update_node / remove_node），
  // 用于 AI 完成后触发 fitView 适应新节点
  const mechanismTouchedRef = useRef<boolean>(false);

  // ===== AI 对话持久化 =====
  const {
    conversations,
    currentConversationId,
    loadConversations,
    createConversation,
    deleteConversation: deleteConv,
    selectConversation,
    addMessage: persistMessage,
    updateMessage: updatePersistedMessage,
    clearMessages: clearPersistedMessages,
  } = useChatStore();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteConvConfirmOpen, setDeleteConvConfirmOpen] = useState(false);
  const [pendingDeleteConvId, setPendingDeleteConvId] = useState<string | null>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat]);

  // 切换项目时加载对话列表
  useEffect(() => {
    if (currentProject) {
      loadConversations(currentProject.id);
    }
  }, [currentProject, loadConversations]);

  // 确保Conversation存在，无则自动创建
  const ensureConversation = async (): Promise<string> => {
    if (currentConversationId) return currentConversationId;
    if (!currentProject) throw new Error("无当前项目");
    const conv = await createConversation(currentProject.id, "新对话");
    return conv.id;
  };

  // 切换对话：从 DB 加载消息并同步到本地 chat
  const handleSelectConversation = async (id: string) => {
    await selectConversation(id);
    const msgs = useChatStore.getState().messages;
    const items: ChatItem[] = msgs.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      action: m.action,
      applied: m.applied,
    }));
    setChat(items);
    setHistoryOpen(false);
  };

  const handleNewConversation = async () => {
    if (!currentProject) return;
    await createConversation(currentProject.id, "新对话");
    setChat([]);
    setHistoryOpen(false);
  };

  const handleDeleteConversation = (id: string) => {
    setPendingDeleteConvId(id);
    setDeleteConvConfirmOpen(true);
  };

  const confirmDeleteConversation = async () => {
    if (!pendingDeleteConvId) return;
    const id = pendingDeleteConvId;
    setDeleteConvConfirmOpen(false);
    setPendingDeleteConvId(null);
    await deleteConv(id);
    setChat([]);
  };

  if (!config) {
    return (
      <div className="text-center py-8">
        <Sparkles className="w-8 h-8 text-ink-muted mx-auto mb-2" />
        <p className="text-xs text-ink-secondary mb-1">AI 未启用</p>
        <p className="text-2xs text-ink-muted">请在设置中配置 API Key</p>
      </div>
    );
  }

  // 停止生成
  const handleStop = () => {
    abortByKey("panel");
    setIsGenerating(false);
  };

  // 追加最新 AI 消息内容（用于流式更新）
  const appendAIChunk = (aiItemId: string, chunk: string) => {
    setChat((c) =>
      c.map((item) =>
        item.id === aiItemId
          ? { ...item, content: item.content + chunk }
          : item
      )
    );
  };

  const appendReasoning = (aiItemId: string, chunk: string) => {
    setChat((c) =>
      c.map((item) =>
        item.id === aiItemId
          ? { ...item, reasoning: (item.reasoning ?? "") + chunk }
          : item
      )
    );
  };

  const handleRunAction = async (action: AIAction) => {
    if (!currentProject || !config) return;

    if (action.needsInput && !actionInput.trim()) {
      setActiveAction(action);
      return;
    }

    const controller = new AbortController();
    setAbortController("panel", controller);
    setIsGenerating(true);
    setLastError(null);

    try {
      // 收集上下文数据
      let allNodes = nodes;
      let allEdges = edges;
      if (module === "mechanism") {
        // 已有当前图的 nodes/edges
      } else {
        // 跨模块时按 projectId 过滤加载节点和边
        const graphs = await db.mechanismGraphs
          .where("projectId")
          .equals(currentProject.id)
          .toArray();
        const graphIds = graphs.map((g) => g.id);
        allNodes = graphIds.length > 0
          ? await db.graphNodes.where("graphId").anyOf(graphIds).toArray()
          : [];
        allEdges = graphIds.length > 0
          ? await db.graphEdges.where("graphId").anyOf(graphIds).toArray()
          : [];
      }

      let allAttrs = attributes;
      let allFormulas = formulas;
      if (module !== "numeric") {
        const sheets = await db.numericSheets
          .where("projectId")
          .equals(currentProject.id)
          .toArray();
        if (sheets.length > 0) {
          allAttrs = await db.attributes.where("sheetId").equals(sheets[0].id).toArray();
          allFormulas = await db.formulas.where("sheetId").equals(sheets[0].id).toArray();
        }
      }

      let allSections: DocSection[] = sections;
      if (module !== "document") {
        const docs = await db.gddDocuments
          .where("projectId")
          .equals(currentProject.id)
          .toArray();
        if (docs.length > 0) {
          allSections = await db.docSections.where("docId").equals(docs[0].id).toArray();
        }
      }

      // 加载 6 维度素材（核心循环 / 高光时刻 / 规则 / 关卡流程）
      const [allLoops, allMoments, allRules, allLevelFlows] =
        await Promise.all([
          db.coreLoops.where("projectId").equals(currentProject.id).toArray(),
          db.gameMoments.where("projectId").equals(currentProject.id).toArray(),
          db.gameRules.where("projectId").equals(currentProject.id).toArray(),
          db.levelFlows.where("projectId").equals(currentProject.id).toArray(),
        ]);

      const messages = buildMessages(
        action,
        currentProject,
        allNodes,
        allEdges,
        allAttrs,
        allFormulas,
        allSections,
        actionInput,
        allLoops,
        allMoments,
        allRules,
        allLevelFlows
      );

      // 判断是否需要工具（统一传 OpenAI 格式，Claude 客户端会自动转换）
      // 关键修复：每个 action 只暴露对应的单一工具（或少量工具），
      // 避免模型面对 11 个工具选择困难而放弃 tool_calls
      const toolKey = getToolsForAction(action.id);
      // actionId → 精确的工具名映射（每个 action 只暴露它需要的工具）
      const actionToolMap: Record<string, string[]> = {
        "mechanism-gen": ["apply_mechanism"],
        "numeric-gen": ["apply_numeric"],
        "gdd-gen": ["apply_gdd"],
        "mechanism-edit": [
          "update_node",
          "remove_node",
          "add_node_to_existing",
          "patch_formula",
        ],
        "loop-gen": ["apply_loops"],
        "moment-gen": ["apply_moments"],
        "rule-gen": ["apply_rules"],
        "level-gen": ["apply_level_flow"],
      };
      const allowedToolNames = actionToolMap[action.id];
      const tools =
        toolKey === null || !allowedToolNames
          ? undefined
          : DESIGN_TOOLS_OPENAI.filter((t) =>
              allowedToolNames.includes(t.function.name)
            );
      const forceToolName = getForceToolName(action.id);

      // 确保对话存在并持久化用户/AI 占位消息
      await ensureConversation();
      const userContent = action.needsInput
        ? `${action.label}：${actionInput}`
        : action.label;
      const userMsg = await persistMessage({
        role: "user",
        content: userContent,
        action: action.id,
      });
      const aiMsg = await persistMessage({
        role: "assistant",
        content: "",
        action: action.id,
      });
      const aiItemId = aiMsg.id;
      // 收集阶段重置模块追踪；实际跳转推迟到用户在预览面板确认应用后
      lastAppliedModuleRef.current = null;
      mechanismTouchedRef.current = false;

      setChat((c) => [
        ...c,
        { id: userMsg.id, role: "user" as const, content: userContent, action: action.id },
        { id: aiItemId, role: "assistant" as const, content: "", action: action.id },
      ]);

      const result = await callAIStream(
        {
          config,
          messages,
          signal: controller.signal,
          tools,
          forceToolName: forceToolName ?? undefined,
        },
        {
          onChunk: (chunk) => appendAIChunk(aiItemId, chunk),
          onReasoning: (chunk) => appendReasoning(aiItemId, chunk),
          // agentic 循环：tool_call 到达后**立即自动应用**到画布（无需用户确认），
          // 把应用结果摘要回传给 AI 让其继续推理。每条 tool_call 单独记录到
          // appliedRecords，用户可在 AI 完成后逐条撤销。
          onToolApply: async (tc) => {
            const summary = buildToolCallSummary(tc.name, tc.arguments);
            // 标记是否触达机制画布（用于完成后 fitView）
            if (
              tc.name === "apply_mechanism" ||
              tc.name === "add_node_to_existing" ||
              tc.name === "update_node" ||
              tc.name === "remove_node"
            ) {
              mechanismTouchedRef.current = true;
            }
            try {
              const ok = await applyAndRecord(aiItemId, tc.name, tc.arguments);
              if (ok) {
                return `${summary}（已自动应用到画布）`;
              }
              return `${summary}（应用失败，请重试或调整参数）`;
            } catch (e) {
              const errMsg = e instanceof Error ? e.message : String(e);
              return `应用失败: ${errMsg}。请重试或调整参数。`;
            }
          },
          onFinish: (reason) => {
            if (reason === "length") {
              appendAIChunk(
                aiItemId,
                "\n\n> ⚠️ 回复因达到最大长度限制被截断。请继续提问以获取完整内容。"
              );
              addToast({
                title: "回复被截断",
                description: "达到 max_tokens 上限，请缩短问题或继续追问",
                variant: "warning",
              });
            }
          },
        }
      );

      // 持久化最终 AI 回复（appliedRecords 不持久化，仅限当前会话）
      await updatePersistedMessage(aiItemId, {
        content: result.content,
      });

      // AI 完成后：若有 tool_call 被自动应用，跳转到对应模块并触发 fitView 适应新内容
      if (result.toolCalls.length > 0) {
        addToast({
          title: `${action.label}完成`,
          description: `已自动应用 ${result.toolCalls.length} 项变更`,
          variant: "success",
        });
        if (lastAppliedModuleRef.current && currentProject) {
          navigate(`/project/${currentProject.id}/${lastAppliedModuleRef.current}`);
        }
        // 机制画布有新增/修改节点时，触发画布适应视图
        if (mechanismTouchedRef.current) {
          requestFitView();
        }
      } else {
        addToast({ title: `${action.label}完成`, variant: "success" });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      if (e instanceof DOMException && e.name === "AbortError") {
        addToast({ title: "已停止生成", variant: "warning" });
      } else {
        setLastError(msg);
        addToast({ title: `${action.label}失败`, description: msg, variant: "error" });
      }
    } finally {
      setAbortController("panel", null);
      setIsGenerating(false);
      setActiveAction(null);
      setActionInput("");
    }
  };

  // 撤销单次 tool call 的应用（支持 DesignAction 和 DimensionAction）
  const handleUndo = async (aiItemId: string, toolCallId: string) => {
    const item = chat.find((c) => c.id === aiItemId);
    const record = item?.appliedRecords?.find((r) => r.toolCallId === toolCallId);
    if (!record || record.undone) return;

    try {
      if (record.undo) {
        await undoDesignAction(record.undo);
      } else if (record.dimUndo) {
        await undoDimensionAction(record.dimUndo);
      }
      setChat((c) =>
        c.map((it) =>
          it.id === aiItemId
            ? {
                ...it,
                appliedRecords: it.appliedRecords?.map((r) =>
                  r.toolCallId === toolCallId ? { ...r, undone: true } : r
                ),
              }
            : it
        )
      );
      addToast({ title: "已撤销", description: record.summary, variant: "default" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      addToast({ title: "撤销失败", description: msg, variant: "error" });
    }
  };

  // 应用单个 tool call 并记录到 appliedRecords（供"应用"按钮调用）。
  // 返回是否应用成功：成功时已写入 store 并追加到 appliedRecords，失败时仅弹 toast。
  const applyAndRecord = async (
    aiItemId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<boolean> => {
    const parsed = anyActionFromToolCall(toolName, args);
    if (!parsed) {
      console.warn("[AI] 工具未识别", { toolName });
      addToast({
        title: "应用失败",
        description: `工具 ${toolName} 未识别`,
        variant: "error",
      });
      return false;
    }
    const toolCallId = `tc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      if (parsed.type === "design") {
        const { summary, undo } = await applyDesignAction(parsed.action);
        lastAppliedModuleRef.current = getActionModule(parsed.action);
        const record: AppliedRecord = { toolCallId, summary, undo };
        setChat((c) =>
          c.map((item) =>
            item.id === aiItemId
              ? {
                  ...item,
                  appliedRecords: [...(item.appliedRecords ?? []), record],
                  applied: true,
                }
              : item
          )
        );
      } else {
        // 维度动作（循环/时刻/规则/关卡）
        if (!currentProject) {
          addToast({
            title: "应用失败",
            description: "无当前项目，无法应用维度动作",
            variant: "error",
          });
          return false;
        }
        const { summary, undo } = await applyDimensionAction(
          parsed.action,
          currentProject.id
        );
        const record: AppliedRecord = { toolCallId, summary, dimUndo: undo };
        setChat((c) =>
          c.map((item) =>
            item.id === aiItemId
              ? {
                  ...item,
                  appliedRecords: [...(item.appliedRecords ?? []), record],
                  applied: true,
                }
              : item
          )
        );
      }
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      addToast({ title: "应用失败", description: msg, variant: "error" });
      return false;
    }
  };

  const handleChat = async () => {
    if (!input.trim() || !currentProject || !config) return;

    const question = input.trim();
    // 确保对话存在并持久化用户/AI 占位消息
    await ensureConversation();
    const userMsg = await persistMessage({ role: "user", content: question });
    const aiMsg = await persistMessage({ role: "assistant", content: "" });
    const aiItemId = aiMsg.id;
    setChat((c) => [
      ...c,
      { id: userMsg.id, role: "user" as const, content: question },
      { id: aiItemId, role: "assistant" as const, content: "" },
    ]);
    setInput("");

    const controller = new AbortController();
    setAbortController("panel", controller);
    setIsGenerating(true);
    setLastError(null);

    try {
      // 收集历史对话（不含刚刚插入的空 AI 回复）
      const history: Array<{ role: "user" | "assistant"; content: string }> = chat
        .filter((c) => c.content.trim() !== "")
        .map((c) => ({
          role: (c.role === "user" ? "user" : "assistant") as "user" | "assistant",
          content: c.content,
        }));

      // 加载 6 维度设计上下文（机制 / 数值 / 文档 / 循环 / 时刻 / 规则 / 关卡）
      // graphNodes/graphEdges 无 projectId 索引，先通过 mechanismGraphs 查当前项目的 graphIds
      const chatGraphs = await db.mechanismGraphs
        .where("projectId")
        .equals(currentProject.id)
        .toArray();
      const chatGraphIds = chatGraphs.map((g) => g.id);
      const [chatNodes, chatEdges, chatLoops, chatMoments, chatRules, chatFlows] =
        await Promise.all([
          chatGraphIds.length > 0
            ? db.graphNodes.where("graphId").anyOf(chatGraphIds).toArray()
            : Promise.resolve([] as GraphNode[]),
          chatGraphIds.length > 0
            ? db.graphEdges.where("graphId").anyOf(chatGraphIds).toArray()
            : Promise.resolve([] as GraphEdge[]),
          db.coreLoops.where("projectId").equals(currentProject.id).toArray(),
          db.gameMoments.where("projectId").equals(currentProject.id).toArray(),
          db.gameRules.where("projectId").equals(currentProject.id).toArray(),
          db.levelFlows.where("projectId").equals(currentProject.id).toArray(),
        ]);
      // 数值表
      let chatAttrs: Attribute[] = attributes;
      let chatFormulas: Formula[] = formulas;
      const chatSheets = await db.numericSheets
        .where("projectId")
        .equals(currentProject.id)
        .toArray();
      if (chatSheets.length > 0) {
        chatAttrs = await db.attributes.where("sheetId").equals(chatSheets[0].id).toArray();
        chatFormulas = await db.formulas.where("sheetId").equals(chatSheets[0].id).toArray();
      }
      // GDD 文档
      let chatSections: DocSection[] = sections;
      const chatDocs = await db.gddDocuments
        .where("projectId")
        .equals(currentProject.id)
        .toArray();
      if (chatDocs.length > 0) {
        chatSections = await db.docSections.where("docId").equals(chatDocs[0].id).toArray();
      }

      const messages = buildChatPrompt(currentProject, question, undefined, history, {
        nodes: chatNodes,
        edges: chatEdges,
        attributes: chatAttrs,
        formulas: chatFormulas,
        sections: chatSections,
        loops: chatLoops,
        moments: chatMoments,
        rules: chatRules,
        levelFlows: chatFlows,
      });
      const trimmedMessages = trimMessages(messages);
      const result = await callAIStream(
        { config, messages: trimmedMessages, signal: controller.signal },
        {
          onChunk: (chunk) => appendAIChunk(aiItemId, chunk),
          onReasoning: (chunk) => appendReasoning(aiItemId, chunk),
          onFinish: (reason) => {
            if (reason === "length") {
              appendAIChunk(
                aiItemId,
                "\n\n> ⚠️ 回复因达到最大长度限制被截断。请继续提问以获取完整内容。"
              );
              addToast({
                title: "回复被截断",
                description: "达到 max_tokens 上限，请缩短问题或继续追问",
                variant: "warning",
              });
            }
          },
        }
      );
      // 持久化最终 AI 回复
      await updatePersistedMessage(aiItemId, { content: result.content });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      if (e instanceof DOMException && e.name === "AbortError") {
        addToast({ title: "已停止生成", variant: "warning" });
      } else {
        setLastError(msg);
        addToast({ title: "AI 回复失败", description: msg, variant: "error" });
      }
    } finally {
      setAbortController("panel", null);
      setIsGenerating(false);
    }
  };

  const visibleActions = AI_ACTIONS.filter(
    (a) => a.module === module || a.module === "all"
  );

  return (
    <div className="flex flex-col h-full -m-3">
      {/* 头部 */}
      <div className="px-3 py-2 border-b border-line-subtle flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-accent" />
          <span className="text-xs font-medium text-ink-primary">AI 助手</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className={cn(
              "btn-ghost h-7 px-1.5",
              historyOpen && "text-accent bg-accent-glow"
            )}
            title="对话历史"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => void handleNewConversation()}
            className="btn-ghost h-7 px-1.5"
            title="新对话"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <ModelSwitcher />
        </div>
      </div>

      {/* 对话历史列表 */}
      {historyOpen && (
        <div className="px-2 py-2 border-b border-line-subtle flex-shrink-0 max-h-48 overflow-y-auto bg-canvas-sunken/50">
          {conversations.length === 0 ? (
            <p className="text-2xs text-ink-muted text-center py-3">暂无历史对话</p>
          ) : (
            <div className="space-y-0.5">
              {conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => void handleSelectConversation(conv.id)}
                  className={cn(
                    "group flex items-center gap-1.5 px-2 py-1.5 rounded text-2xs cursor-pointer transition-colors",
                    currentConversationId === conv.id
                      ? "bg-accent-glow text-ink-primary"
                      : "text-ink-secondary hover:text-ink-primary hover:bg-canvas-elevated"
                  )}
                >
                  <MessageSquare
                    className={cn(
                      "w-3 h-3 flex-shrink-0",
                      currentConversationId === conv.id ? "text-accent" : "text-ink-muted"
                    )}
                  />
                  <span className="flex-1 truncate">{conv.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void handleDeleteConversation(conv.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-ink-muted hover:text-danger transition-all flex-shrink-0"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 动作按钮 */}
      <div className="px-3 py-2 border-b border-line-subtle flex-shrink-0">
        <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          快捷能力
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {visibleActions.map((action) => {
            const Icon = action.icon;
            const isActive = activeAction?.id === action.id;
            return (
              <button
                key={action.id}
                onClick={() => {
                  if (action.needsInput) {
                    setActiveAction(isActive ? null : action);
                  } else {
                    handleRunAction(action);
                  }
                }}
                disabled={isGenerating}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 rounded text-2xs font-medium transition-colors border",
                  isActive
                    ? "border-accent text-accent bg-accent-glow"
                    : "border-line text-ink-secondary hover:border-accent hover:text-accent hover:bg-accent-glow",
                  isGenerating && "opacity-50 cursor-not-allowed"
                )}
              >
                <Icon className="w-3 h-3" />
                {action.label}
              </button>
            );
          })}
        </div>

        {/* 动作输入框 */}
        {activeAction && (
          <div className="mt-2 p-2 rounded bg-canvas-sunken border border-line space-y-2">
            <div className="flex items-center gap-1">
              <activeAction.icon className="w-3 h-3 text-accent" />
              <span className="text-2xs font-medium text-ink-primary">
                {activeAction.label}
              </span>
            </div>
            <textarea
              value={actionInput}
              onChange={(e) => setActionInput(e.target.value)}
              placeholder={activeAction.inputPlaceholder}
              rows={2}
              className="input-field text-xs resize-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleRunAction(activeAction);
                }
              }}
            />
            <div className="flex gap-1">
              <button
                onClick={() => handleRunAction(activeAction)}
                disabled={isGenerating || !actionInput.trim()}
                className="flex-1 text-2xs px-2 py-1 rounded bg-accent text-canvas-sunken font-medium hover:bg-accent-hover disabled:opacity-50"
              >
                {isGenerating ? (
                  <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                ) : (
                  "执行"
                )}
              </button>
              <button
                onClick={() => {
                  setActiveAction(null);
                  setActionInput("");
                }}
                className="text-2xs px-2 py-1 rounded border border-line text-ink-secondary hover:bg-canvas-elevated"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 对话区 */}
      <div className="flex-1 overflow-auto px-3 py-2 space-y-3 min-h-0">
        {chat.length === 0 ? (
          <div className="text-center py-6">
            <Sparkles className="w-6 h-6 text-ink-muted mx-auto mb-1.5" />
            <p className="text-xs text-ink-secondary mb-0.5">开始与 AI 对话</p>
            <p className="text-2xs text-ink-muted">
              使用上方快捷能力或直接提问
            </p>
          </div>
        ) : (
          chat.map((item, idx) => {
            const isLastAssistant =
              item.role === "assistant" && idx === chat.length - 1;
            return (
              <ChatBubble
                key={item.id}
                item={item}
                streaming={isLastAssistant && isGenerating}
                onUndo={(toolCallId) => handleUndo(item.id, toolCallId)}
              />
            );
          })
        )}
        {lastError && (
          <div className="p-2 rounded border border-danger/40 bg-danger/5 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 text-danger flex-shrink-0 mt-0.5" />
            <div className="text-2xs text-danger">{lastError}</div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* 输入栏 */}
      <div className="px-3 py-2 border-t border-line-subtle flex-shrink-0">
        <div className="flex gap-1 items-end">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="向 AI 提问..."
            rows={1}
            className="input-field text-xs resize-none flex-1 min-h-[32px] max-h-24"
            disabled={isGenerating}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleChat();
              }
            }}
          />
          {isGenerating ? (
            <button
              onClick={handleStop}
              className="h-8 w-8 p-0 flex-shrink-0 rounded-md border border-danger/50 text-danger hover:bg-danger/10 flex items-center justify-center transition-colors"
              title="停止生成"
            >
              <Square className="w-3 h-3 fill-current" />
            </button>
          ) : (
            <button
              onClick={handleChat}
              disabled={!input.trim()}
              className="btn-primary h-8 w-8 p-0 flex-shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        {chat.length > 0 && (
          <button
            onClick={async () => {
              setChat([]);
              setLastError(null);
              await clearPersistedMessages();
            }}
            className="mt-1 text-2xs text-ink-muted hover:text-danger flex items-center gap-1"
          >
            <Trash2 className="w-3 h-3" />
            清空对话
          </button>
        )}
      </div>

      <ConfirmDialog
        open={deleteConvConfirmOpen}
        title="删除对话"
        description="确定删除此对话？"
        variant="danger"
        onConfirm={() => void confirmDeleteConversation()}
        onCancel={() => {
          setDeleteConvConfirmOpen(false);
          setPendingDeleteConvId(null);
        }}
      />
    </div>
  );
}

function ChatBubble({
  item,
  streaming,
  onUndo,
}: {
  item: ChatItem;
  streaming?: boolean;
  onUndo?: (toolCallId: string) => void;
}) {
  const isUser = item.role === "user";
  const hasContent = item.content.trim().length > 0;
  const hasReasoning = (item.reasoning ?? "").trim().length > 0;
  const hasAppliedRecords = (item.appliedRecords?.length ?? 0) > 0;
  return (
    <div
      className={cn(
        "flex flex-col gap-1",
        isUser ? "items-end" : "items-start"
      )}
    >
      <div
        className={cn(
          "max-w-[95%] rounded-lg px-2.5 py-1.5 text-xs",
          isUser
            ? "bg-accent text-canvas-sunken font-medium"
            : "bg-canvas-sunken border border-line text-ink-primary"
        )}
      >
        {isUser ? (
          item.content
        ) : !hasContent && streaming && !hasAppliedRecords && !hasReasoning ? (
          <span className="inline-flex items-center gap-1 text-ink-muted">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse [animation-delay:0.4s]" />
          </span>
        ) : (
          <div className="relative flex flex-col gap-1.5">
            {hasReasoning && (
              <details className="group">
                <summary className="cursor-pointer select-none text-2xs text-ink-muted hover:text-ink-secondary transition-colors flex items-center gap-1">
                  <span className="inline-block transition-transform group-open:rotate-90">▶</span>
                  思维链
                </summary>
                <div className="mt-1 pl-3 border-l-2 border-line-subtle text-2xs text-ink-muted whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {item.reasoning}
                </div>
              </details>
            )}
            {hasContent && <MarkdownRenderer content={item.content} />}
            {streaming && (
              <span className="inline-block w-1.5 h-3 bg-accent ml-0.5 align-middle animate-pulse" />
            )}
          </div>
        )}
      </div>

      {/* 已自动应用的 tool call 记录（每个可单独撤销，生成过程中实时显示） */}
      {!isUser && hasAppliedRecords && (
        <div className="flex flex-col gap-1 max-w-[95%]">
          {item.appliedRecords!.map((rec) => (
            <div
              key={rec.toolCallId}
              className={cn(
                "flex items-center justify-between gap-2 px-2 py-1 rounded-md text-2xs border",
                rec.undone
                  ? "border-line-subtle bg-canvas-base/50 text-ink-muted"
                  : "border-accent/40 bg-accent-glow text-accent"
              )}
            >
              <span className="flex items-center gap-1.5">
                {rec.undone ? (
                  <Undo2 className="w-3 h-3 opacity-50" />
                ) : (
                  <Check className="w-3 h-3" />
                )}
                <span>{rec.undone ? `已撤销：${rec.summary}` : rec.summary}</span>
              </span>
              {!rec.undone && onUndo && (
                <button
                  onClick={() => onUndo(rec.toolCallId)}
                  className="flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs hover:bg-accent/20 transition-colors"
                  title="撤销此操作"
                >
                  <Undo2 className="w-3 h-3" />
                  撤销
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useCurrentModuleFromURL(): "mechanism" | "numeric" | "document" {
  const loc = useLocation();
  const match = loc.pathname.match(/\/project\/[^/]+\/([^/]+)/);
  const m = match?.[1];
  if (m === "numeric") return "numeric";
  if (m === "document") return "document";
  return "mechanism";
}

function buildMessages(
  action: AIAction,
  project: Project | null,
  nodes: GraphNode[],
  edges: GraphEdge[],
  attributes: Attribute[],
  formulas: Formula[],
  sections: DocSection[],
  input: string,
  // 6 维度素材
  loops?: CoreLoop[],
  moments?: GameMoment[],
  rules?: GameRule[],
  levelFlows?: LevelFlow[]
) {
  if (!project) return [];
  switch (action.id) {
    case "mechanism-gen":
      return buildMechanismGenPrompt(project, input || "请生成核心玩法机制");
    case "mechanism-edit":
      return buildMechanismEditPrompt(
        project,
        nodes,
        edges,
        input || "请优化当前机制图",
        attributes
      );
    case "mechanism-review":
      return buildMechanismReviewPrompt(project, nodes, edges);
    case "numeric-gen":
      return buildNumericGenPrompt(project, input || "请生成数值方案", attributes);
    case "balance-analysis":
      return buildBalanceAnalysisPrompt(project, attributes, formulas);
    case "gdd-gen":
      return buildGDDGenPrompt(
        project,
        nodes,
        edges,
        attributes,
        formulas,
        sections,
        loops,
        moments,
        rules,
        levelFlows
      );
    case "reference":
      return buildReferencePrompt(project, input || "通用玩法设计");
    case "loop-gen":
      return buildLoopGenPrompt(project, input || "请生成核心循环", loops);
    case "moment-gen":
      return buildMomentGenPrompt(project, input || "请生成高光时刻", moments);
    case "rule-gen":
      return buildRuleGenPrompt(project, input || "请生成规则卡牌", rules);
    case "level-gen":
      return buildLevelGenPrompt(project, input || "请生成关卡流程", levelFlows);
    default:
      return buildChatPrompt(project, input);
  }
}
