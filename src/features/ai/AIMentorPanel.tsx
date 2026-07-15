import { useState, useMemo, useRef, useEffect } from "react";
import Modal from "@/components/ui/Modal";
import { useProjectStore } from "@/stores/projectStore";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useGameplayStore } from "@/stores/gameplayStore";
import { useRuleStore } from "@/stores/ruleStore";
import { useLevelStore } from "@/stores/levelStore";
import { useAIStore } from "@/stores/aiStore";
import { useUIStore } from "@/stores/uiStore";
import { callAIStream } from "@/lib/aiClient";
import { buildMentorPrompt } from "@/lib/aiPrompts";
import {
  analyzeFormulaErrors,
  analyzeGraphIssues,
  explainAIError,
  type FriendlyError,
} from "@/lib/friendlyErrors";
import { ANTI_PATTERNS, type AntiPattern } from "@/data/antiPatterns";
import { NODE_TYPE_META } from "@/features/mechanism/nodeTypes";
import { cn } from "@/lib/utils";
import MarkdownRenderer from "./MarkdownRenderer";
import type {
  GraphNode,
  GraphEdge,
  Attribute,
  Formula,
  DocSection,
} from "@/types";
import {
  GraduationCap,
  ChevronDown,
  AlertTriangle,
  AlertCircle,
  Info,
  Sparkles,
  Loader2,
  Square,
  CheckCircle2,
  Wrench,
} from "lucide-react";
import { db } from "@/db";

interface AIMentorPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Severity = "high" | "medium" | "low";

interface MentorSuggestion {
  id: string;
  severity: Severity;
  category: string; // 显示用：机制 / 数值 / 文档 / 结构
  source: "issue" | "antipattern";
  title: string;
  problem: string;
  solution: string;
  example?: string;
  explainContext: string; // 给 AI 详细解释时的上下文
  /** 可选：一键修复动作标识 */
  fixId?: string;
}

const SEVERITY_META: Record<
  Severity,
  { label: string; color: string; icon: typeof AlertCircle }
> = {
  high: { label: "高", color: "#F87171", icon: AlertCircle },
  medium: { label: "中", color: "#FBBF24", icon: AlertTriangle },
  low: { label: "低", color: "#60A5FA", icon: Info },
};

const CATEGORY_LABEL: Record<AntiPattern["category"], string> = {
  mechanism: "机制",
  numeric: "数值",
  gdd: "文档",
  structure: "结构",
};

/** 反模式 → 一键修复动作标识的映射 */
const FIX_ID_MAP: Record<string, string> = {
  "no-failure-penalty": "add-penalty-node",
  "reward-too-uniform": "add-rng-node",
  "numeric-no-cap": "cap-numeric-values",
  "gdd-no-core-loop": "add-core-loop-section",
};

function levelToSeverity(level: FriendlyError["level"]): Severity {
  if (level === "error") return "high";
  if (level === "warning") return "medium";
  return "low";
}

function findPattern(id: string): AntiPattern | undefined {
  return ANTI_PATTERNS.find((p) => p.id === id);
}

/**
 * 根据当前项目状态匹配可能命中的反模式。
 */
function matchAntiPatterns(params: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  attributes: Attribute[];
  formulas: Formula[];
  sections: DocSection[];
}): Array<{ pattern: AntiPattern; detail: string }> {
  const { nodes, edges, attributes, formulas, sections } = params;
  const matched: Array<{ pattern: AntiPattern; detail: string }> = [];

  const attrName = (f: Formula) =>
    attributes.find((a) => a.id === f.attributeId)?.name ?? "?";

  // 1. 机制图节点过多无分层
  if (nodes.length > 20) {
    const categories = new Set(
      nodes.map((n) => NODE_TYPE_META[n.type]?.category ?? "aux")
    );
    if (categories.size < 4) {
      const p = findPattern("mechanism-too-many-no-layer")!;
      matched.push({
        pattern: p,
        detail: `当前有 ${nodes.length} 个节点，仅覆盖 ${categories.size} 个维度分类，建议按逻辑层/资源层/反馈层等分层组织。`,
      });
    }
  }

  // 2. 数值曲线前期太陡（高底数指数公式）
  for (const f of formulas) {
    const expr = f.expression ?? "";
    const m = expr.match(/pow\s*\(\s*(1\.[3-9]\d*)\s*,/);
    if (m) {
      const p = findPattern("numeric-curve-too-steep-early")!;
      matched.push({
        pattern: p,
        detail: `属性「${attrName(f)}」的公式使用了高底数指数 pow(${m[1]}, …)，前期数值会快速增长，建议前期改用线性公式。`,
      });
      break;
    }
  }

  // 3. GDD 无核心循环描述
  if (sections.length > 0) {
    const text = sections
      .map((s) => `${s.title} ${s.content}`)
      .join(" ");
    if (!/核心循环|core loop|核心玩法循环|主循环/.test(text)) {
      const p = findPattern("gdd-no-core-loop")!;
      matched.push({
        pattern: p,
        detail: `GDD 共 ${sections.length} 个段落，但未检测到「核心循环」相关描述。`,
      });
    }
  }

  // 4. 无资源消耗机制
  const hasResource = nodes.some(
    (n) => n.type === "resource" || n.type === "pool"
  );
  const hasConsume = edges.some((e) => e.type === "consume");
  if (hasResource && !hasConsume) {
    const p = findPattern("no-resource-sink")!;
    matched.push({
      pattern: p,
      detail: "存在资源/资源池节点，但没有 consume（消耗）连接，资源只进不出。",
    });
  }

  // 5. 奖励过于均匀（多奖励节点但无随机）
  const rewardCount = nodes.filter((n) => n.type === "reward").length;
  if (rewardCount >= 3) {
    const hasRng = nodes.some((n) => n.type === "rng");
    if (!hasRng) {
      const p = findPattern("reward-too-uniform")!;
      matched.push({
        pattern: p,
        detail: `有 ${rewardCount} 个奖励节点，但没有 rng（随机数）节点，奖励可能过于均匀、缺乏惊喜。`,
      });
    }
  }

  // 6. 公式过于复杂
  for (const f of formulas) {
    const expr = f.expression ?? "";
    const opCount = (expr.match(/[+\-*/]/g) ?? []).length;
    const ifCount = (expr.match(/\bif\b/gi) ?? []).length;
    if (expr.length > 60 || opCount > 6 || ifCount >= 2) {
      const p = findPattern("formula-too-complex")!;
      matched.push({
        pattern: p,
        detail: `属性「${attrName(f)}」的公式较复杂（长度 ${expr.length}、运算符 ${opCount}、if 嵌套 ${ifCount}），建议拆分为中间属性。`,
      });
      break;
    }
  }

  // 7. 无失败惩罚（与 friendlyError「缺少反馈节点」互补：此处仅当无 penalty 时触发）
  const hasPenalty = nodes.some((n) => n.type === "penalty");
  if (!hasPenalty && nodes.length > 0) {
    const p = findPattern("no-failure-penalty")!;
    matched.push({
      pattern: p,
      detail: "机制图没有 penalty（惩罚）节点，玩家失败没有任何损失，缺少紧张感。",
    });
  }

  // 8. 节点类型误用：resource 节点没有 produce/consume 边
  const misusedResource = nodes.filter(
    (n) =>
      n.type === "resource" &&
      !edges.some(
        (e) =>
          (e.source === n.id || e.target === n.id) &&
          (e.type === "produce" || e.type === "consume")
      )
  );
  if (misusedResource.length > 0) {
    const p = findPattern("node-type-misuse")!;
    matched.push({
      pattern: p,
      detail: `${misusedResource.length} 个 resource 节点没有 produce/consume 连接，可能类型误用（如用 resource 表示状态）。`,
    });
  }

  // 9. 数值无上限
  const bigAttrs = attributes.filter((a) => {
    if (a.type !== "number") return false;
    const v = parseFloat(a.value);
    return !isNaN(v) && v > 1_000_000;
  });
  if (bigAttrs.length > 0) {
    const p = findPattern("numeric-no-cap")!;
    matched.push({
      pattern: p,
      detail: `${bigAttrs.length} 个数值属性的值超过 1,000,000（如「${bigAttrs[0].name}=${bigAttrs[0].value}」），存在溢出风险。`,
    });
  }

  // 10. GDD 过于冗长无结构
  if (sections.length > 15) {
    const headings = sections.filter((s) => s.type === "heading").length;
    if (headings < 3) {
      const p = findPattern("gdd-too-long-no-structure")!;
      matched.push({
        pattern: p,
        detail: `GDD 共 ${sections.length} 个段落，但仅 ${headings} 个标题，结构不清。`,
      });
    }
  }

  return matched;
}

function buildSuggestions(params: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  attributes: Attribute[];
  formulas: Formula[];
  sections: DocSection[];
}): MentorSuggestion[] {
  const { nodes, edges, attributes, formulas, sections } = params;
  const suggestions: MentorSuggestion[] = [];

  // 1. 公式错误 → 数值
  const formulaErrors = analyzeFormulaErrors(attributes, formulas);
  for (const e of formulaErrors) {
    suggestions.push({
      id: `formula-${e.title}`,
      severity: levelToSeverity(e.level),
      category: "数值",
      source: "issue",
      title: e.title,
      problem: e.message,
      solution: e.suggestion ?? "",
      explainContext: `数值表问题：${e.title}\n${e.message}`,
    });
  }

  // 2. 机制图问题 → 机制
  const graphIssues = analyzeGraphIssues(nodes, edges);
  for (const e of graphIssues) {
    suggestions.push({
      id: `graph-${e.title}`,
      severity: levelToSeverity(e.level),
      category: "机制",
      source: "issue",
      title: e.title,
      problem: e.message,
      solution: e.suggestion ?? "",
      explainContext: `机制图问题：${e.title}\n${e.message}`,
    });
  }

  // 3. 反模式匹配
  const matched = matchAntiPatterns({ nodes, edges, attributes, formulas, sections });

  // 去重：若 friendlyError 已报告「缺少反馈节点」（reward & penalty 都缺），
  // 则跳过反模式「无失败惩罚」避免重复
  const hasMissingFeedback = graphIssues.some(
    (e) => e.title === "缺少反馈节点"
  );

  for (const { pattern, detail } of matched) {
    if (pattern.id === "no-failure-penalty" && hasMissingFeedback) continue;
    suggestions.push({
      id: `ap-${pattern.id}`,
      severity: pattern.severity,
      category: CATEGORY_LABEL[pattern.category],
      source: "antipattern",
      title: pattern.title,
      problem: `${pattern.problem}\n\n${detail}`,
      solution: pattern.solution,
      example: pattern.example,
      explainContext: `反模式：${pattern.title}\n为什么是问题：${pattern.why}\n当前情况：${detail}`,
      fixId: FIX_ID_MAP[pattern.id],
    });
  }

  // 按严重度排序：high → medium → low
  const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return suggestions.sort((a, b) => order[a.severity] - order[b.severity]);
}

export default function AIMentorPanel({
  open,
  onOpenChange,
}: AIMentorPanelProps) {
  const { currentProject } = useProjectStore();
  const { nodes, edges } = useMechanismStore();
  const { attributes, formulas } = useNumericStore();
  const { sections } = useDocumentStore();
  const loops = useGameplayStore((s) => s.loops);
  const moments = useGameplayStore((s) => s.moments);
  const rules = useRuleStore((s) => s.rules);
  const flows = useLevelStore((s) => s.flows);
  const loadLoops = useGameplayStore((s) => s.loadLoops);
  const loadMoments = useGameplayStore((s) => s.loadMoments);
  const loadRules = useRuleStore((s) => s.loadRules);
  const loadFlows = useLevelStore((s) => s.loadFlows);
  const { getActiveConfig, isGenerating, setIsGenerating } = useAIStore();
  const addToast = useUIStore((s) => s.addToast);

  const config = getActiveConfig();

  const suggestions = useMemo(
    () => buildSuggestions({ nodes, edges, attributes, formulas, sections }),
    [nodes, edges, attributes, formulas, sections]
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aiExplain, setAiExplain] = useState<Record<string, string>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // 关闭面板时中止进行中的流式请求
  useEffect(() => {
    if (!open) {
      abortRef.current?.abort();
      abortRef.current = null;
      setLoadingId(null);
    }
  }, [open]);

  // 面板打开时加载 6 维度数据（循环 / 时刻 / 规则 / 关卡流程）
  useEffect(() => {
    if (!open || !currentProject) return;
    loadLoops(currentProject.id);
    loadMoments(currentProject.id);
    loadRules(currentProject.id);
    loadFlows(currentProject.id);
  }, [open, currentProject, loadLoops, loadMoments, loadRules, loadFlows]);

  // 组件卸载时也中止
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const counts = useMemo(() => {
    const c = { high: 0, medium: 0, low: 0 } as Record<Severity, number>;
    for (const s of suggestions) c[s.severity] += 1;
    return c;
  }, [suggestions]);

  const handleExplain = async (s: MentorSuggestion) => {
    if (!currentProject) {
      addToast({ title: "无当前项目", variant: "warning" });
      return;
    }
    if (!config) {
      addToast({
        title: "AI 未启用",
        description: "请在设置中配置 API Key",
        variant: "warning",
      });
      return;
    }
    if (isGenerating || loadingId !== null) {
      addToast({
        title: "AI 正在生成中",
        description: "请等待当前请求完成",
        variant: "warning",
      });
      return;
    }

    const messages = buildMentorPrompt(
      currentProject,
      {
        title: s.title,
        problem: s.problem,
        why: s.explainContext,
        solution: s.solution ?? "",
      },
      {
        nodes,
        edges,
        attributes,
        formulas,
        sections,
        loops,
        moments,
        rules,
        levelFlows: flows,
      }
    );
    const controller = new AbortController();
    abortRef.current = controller;
    setIsGenerating(true);
    setLoadingId(s.id);
    setAiExplain((prev) => ({ ...prev, [s.id]: "" }));

    try {
      await callAIStream(
        { config, messages, signal: controller.signal },
        (chunk) => {
          setAiExplain((prev) => ({
            ...prev,
            [s.id]: (prev[s.id] ?? "") + chunk,
          }));
        }
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        // 用户主动停止，不打扰
      } else {
        const errInfo = explainAIError(e);
        addToast({
          title: errInfo.title,
          description: errInfo.description,
          variant: "error",
        });
      }
    } finally {
      setLoadingId(null);
      setIsGenerating(false);
      abortRef.current = null;
    }
  };

  const handleStop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoadingId(null);
    setIsGenerating(false);
  };

  const handleFix = async (s: MentorSuggestion) => {
    if (!s.fixId || fixingId !== null) return;
    if (!currentProject) {
      addToast({ title: "无当前项目", variant: "warning" });
      return;
    }
    setFixingId(s.id);
    try {
      switch (s.fixId) {
        case "add-penalty-node": {
          const mech = useMechanismStore.getState();
          if (!mech.currentGraphId) {
            const graphs = await db.mechanismGraphs
              .where("projectId")
              .equals(currentProject.id)
              .toArray();
            graphs.sort((a, b) => b.updatedAt - a.updatedAt);
            const first = graphs[0];
            if (!first) throw new Error("当前项目没有机制图，请先创建一个");
            await mech.selectGraph(first.id);
          }
          const nodeId = await useMechanismStore.getState().addNode(
            "penalty",
            { x: 200, y: 200 },
            "失败惩罚"
          );
          if (!nodeId) throw new Error("添加节点失败，未选择机制图");
          addToast({ title: "已添加惩罚节点", variant: "success" });
          break;
        }
        case "add-rng-node": {
          const mech = useMechanismStore.getState();
          if (!mech.currentGraphId) {
            const graphs = await db.mechanismGraphs
              .where("projectId")
              .equals(currentProject.id)
              .toArray();
            graphs.sort((a, b) => b.updatedAt - a.updatedAt);
            const first = graphs[0];
            if (!first) throw new Error("当前项目没有机制图，请先创建一个");
            await mech.selectGraph(first.id);
          }
          const nodeId = await useMechanismStore.getState().addNode(
            "rng",
            { x: 200, y: 200 },
            "随机数"
          );
          if (!nodeId) throw new Error("添加节点失败，未选择机制图");
          addToast({ title: "已添加随机数节点", variant: "success" });
          break;
        }
        case "cap-numeric-values": {
          const num = useNumericStore.getState();
          const bigAttrs = num.attributes.filter((a) => {
            if (a.type !== "number") return false;
            const v = parseFloat(a.value);
            return !isNaN(v) && v > 1_000_000;
          });
          if (bigAttrs.length === 0) {
            addToast({ title: "没有需要封顶的数值属性", variant: "warning" });
            break;
          }
          for (const a of bigAttrs) {
            await num.updateAttribute(a.id, { value: "1000000" });
          }
          addToast({
            title: `已封顶 ${bigAttrs.length} 个数值属性`,
            variant: "success",
          });
          break;
        }
        case "add-core-loop-section": {
          const doc = useDocumentStore.getState();
          if (!doc.currentDocId) {
            const docs = await db.gddDocuments
              .where("projectId")
              .equals(currentProject.id)
              .toArray();
            docs.sort((a, b) => b.updatedAt - a.updatedAt);
            const first = docs[0];
            if (!first) throw new Error("当前项目没有 GDD 文档，请先创建一个");
            await doc.selectDocument(first.id);
          }
          await useDocumentStore.getState().addSection(
            "heading",
            "核心循环",
            "核心循环描述玩家在游戏中最频繁执行的主玩法闭环。\n\n建议补充以下内容：\n- 核心动作：玩家反复执行的关键行为\n- 反馈：每次动作带来的即时反馈\n- 奖励：循环产出的成长或资源\n- 目标：驱动玩家持续循环的长期目标"
          );
          addToast({ title: "已添加「核心循环」段落", variant: "success" });
          break;
        }
        default:
          break;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "未知错误";
      addToast({ title: "修复失败", description: msg, variant: "error" });
    } finally {
      setFixingId(null);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="AI 导师建议"
      description="基于当前项目的机制图、数值表与 GDD 自动分析，无需提问"
      className="max-w-2xl"
    >
      {/* 概览 */}
      <div className="flex items-center gap-2 mb-3 text-2xs">
        <GraduationCap className="w-3.5 h-3.5 text-accent" />
        <span className="text-ink-secondary">
          共 {suggestions.length} 条建议
        </span>
        <div className="flex items-center gap-1.5 ml-auto">
          <CountBadge count={counts.high} severity="high" />
          <CountBadge count={counts.medium} severity="medium" />
          <CountBadge count={counts.low} severity="low" />
        </div>
      </div>

      {suggestions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <CheckCircle2
            className="w-8 h-8 mb-2"
            style={{ color: "#A3E635" }}
          />
          <p className="text-sm text-ink-primary font-medium mb-1">
            未发现明显问题
          </p>
          <p className="text-2xs text-ink-muted">
            当前设计未检测到错误或反模式，继续完善机制、数值与文档吧
          </p>
        </div>
      ) : (
        <div className="max-h-[58vh] overflow-auto pr-1 space-y-1.5">
          {suggestions.map((s) => (
            <SuggestionItem
              key={s.id}
              suggestion={s}
              expanded={expandedId === s.id}
              onToggle={() =>
                setExpandedId((cur) => (cur === s.id ? null : s.id))
              }
              aiExplain={aiExplain[s.id]}
              loading={loadingId === s.id}
              aiEnabled={!!config}
              onExplain={() => void handleExplain(s)}
              onStop={handleStop}
              onFix={() => void handleFix(s)}
              fixing={fixingId === s.id}
            />
          ))}
        </div>
      )}
    </Modal>
  );
}

function CountBadge({ count, severity }: { count: number; severity: Severity }) {
  if (count === 0) return null;
  const meta = SEVERITY_META[severity];
  return (
    <span
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs font-medium"
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}1A`,
        border: `1px solid ${meta.color}40`,
      }}
    >
      {meta.label} {count}
    </span>
  );
}

function SuggestionItem({
  suggestion,
  expanded,
  onToggle,
  aiExplain,
  loading,
  aiEnabled,
  onExplain,
  onStop,
  onFix,
  fixing,
}: {
  suggestion: MentorSuggestion;
  expanded: boolean;
  onToggle: () => void;
  aiExplain?: string;
  loading: boolean;
  aiEnabled: boolean;
  onExplain: () => void;
  onStop: () => void;
  onFix?: () => void;
  fixing: boolean;
}) {
  const sev = SEVERITY_META[suggestion.severity];
  const SevIcon = sev.icon;
  return (
    <div
      className="rounded-md border bg-canvas-sunken/60"
      style={{ borderColor: `${sev.color}33` }}
    >
      {/* 折叠头 */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2.5 py-2 text-left hover:bg-canvas-sunken transition-colors"
      >
        <span
          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium flex-shrink-0"
          style={{
            color: sev.color,
            backgroundColor: `${sev.color}1A`,
            border: `1px solid ${sev.color}40`,
          }}
        >
          <SevIcon className="w-2.5 h-2.5" />
          {sev.label}
        </span>
        <span className="text-2xs text-ink-muted flex-shrink-0">
          {suggestion.category}
        </span>
        <span className="text-xs font-medium text-ink-primary flex-1 truncate">
          {suggestion.title}
        </span>
        {suggestion.source === "antipattern" && (
          <span className="text-2xs text-ink-muted flex-shrink-0">反模式</span>
        )}
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-ink-muted flex-shrink-0 transition-transform",
            expanded && "rotate-180"
          )}
        />
      </button>

      {/* 展开内容 */}
      {expanded && (
        <div className="px-2.5 pb-2.5 pt-0.5 space-y-2 animate-slide-down">
          <div>
            <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-0.5">
              问题描述
            </div>
            <p className="text-2xs text-ink-secondary leading-relaxed whitespace-pre-line">
              {suggestion.problem}
            </p>
          </div>

          {suggestion.solution && (
            <div>
              <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-0.5">
                修复建议
              </div>
              <p className="text-2xs text-ink-secondary leading-relaxed whitespace-pre-line">
                {suggestion.solution}
              </p>
            </div>
          )}

          {suggestion.example && (
            <div>
              <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-0.5">
                示例
              </div>
              <p className="text-2xs text-ink-muted leading-relaxed whitespace-pre-line bg-canvas px-2 py-1.5 rounded border border-line-subtle">
                {suggestion.example}
              </p>
            </div>
          )}

          {/* AI 详细解释区 */}
          <div className="pt-1">
            {aiExplain !== undefined ? (
              <div className="rounded border border-accent/30 bg-accent/5 p-2">
                <div className="flex items-center gap-1 mb-1">
                  <Sparkles className="w-3 h-3 text-accent" />
                  <span className="text-2xs font-medium text-accent">
                    AI 详细解释
                  </span>
                  {suggestion.fixId && onFix && (
                    <button
                      onClick={onFix}
                      disabled={fixing}
                      className={cn(
                        "ml-auto inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-2xs font-medium transition-colors border",
                        fixing
                          ? "border-line text-ink-muted cursor-not-allowed"
                          : "text-[#A3E635] bg-[rgba(163,230,53,0.1)] border-[rgba(163,230,53,0.4)] hover:bg-[#A3E635] hover:text-canvas-sunken"
                      )}
                      title="一键应用修复"
                    >
                      <Wrench className="w-2.5 h-2.5" />
                      {fixing ? "修复中…" : "一键修复"}
                    </button>
                  )}
                  {loading && (
                    <button
                      onClick={onStop}
                      className={cn(
                        "inline-flex items-center gap-1 text-2xs text-danger hover:underline",
                        !(suggestion.fixId && onFix) && "ml-auto"
                      )}
                    >
                      <Square className="w-2.5 h-2.5 fill-current" />
                      停止
                    </button>
                  )}
                </div>
                {aiExplain === "" && loading ? (
                  <div className="flex items-center gap-1.5 text-2xs text-ink-muted py-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    正在生成…
                  </div>
                ) : (
                  <MarkdownRenderer content={aiExplain} />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={onExplain}
                  disabled={!aiEnabled}
                  className={cn(
                    "inline-flex items-center gap-1 px-2 py-1 rounded text-2xs font-medium transition-colors border",
                    aiEnabled
                      ? "border-accent text-accent bg-accent-glow hover:bg-accent hover:text-canvas-sunken"
                      : "border-line text-ink-muted cursor-not-allowed"
                  )}
                  title={aiEnabled ? "让 AI 详细解释这条建议" : "未配置 AI"}
                >
                  <Sparkles className="w-3 h-3" />
                  问 AI 详细解释
                </button>
                {suggestion.fixId && onFix && (
                  <button
                    onClick={onFix}
                    disabled={fixing}
                    className={cn(
                      "inline-flex items-center gap-1 px-2 py-1 rounded text-2xs font-medium transition-colors border",
                      fixing
                        ? "border-line text-ink-muted cursor-not-allowed"
                        : "text-[#A3E635] bg-[rgba(163,230,53,0.1)] border-[rgba(163,230,53,0.4)] hover:bg-[#A3E635] hover:text-canvas-sunken"
                    )}
                    title="一键应用修复"
                  >
                    <Wrench className="w-3 h-3" />
                    {fixing ? "修复中…" : "一键修复"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
