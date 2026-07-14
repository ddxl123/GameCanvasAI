import { memo, useState } from "react";
import type { CSSProperties } from "react";
import type { ComponentType } from "react";
import { Handle, Position } from "@xyflow/react";
import {
  RefreshCw,
  Flame,
  Network,
  ScrollText,
  GitBranch,
  Calculator,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Loader2,
  Repeat,
  Gamepad2,
  Clock,
  Sword,
  Map as MapIcon,
  MessageCircle,
  Coins,
  BookOpen,
  Sparkle,
  Trophy,
  Film,
  Home,
  Lock,
  GraduationCap,
  CircleDot,
  Link2,
  Copy,
  Trash2,
  Star,
  // 维度图标
  Workflow,
  Boxes,
  TrendingUp,
  Users,
  Package,
  Clapperboard,
  StickyNote,
  Scale,
  Hash,
  // 语义图标（rule 分类 / attribute 类型）
  Move,
  Type as TypeIcon,
  ToggleLeft,
  // 字段类型图标
  Sliders,
  Palette,
  List as ListIcon,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { NODE_TYPE_META, getNodeIcon } from "@/features/mechanism/nodeTypes";
import {
  getElementTitle,
  type CanvasElement,
  type LoopStep,
  type MomentType,
  type LevelNodeType,
  type RuleCategory,
  type AttributeType,
  type NodeType,
} from "@/types";
import StoryboardGrid from "./StoryboardGrid";
import { useUIStore } from "@/stores/uiStore";

/** 生成式节点尺寸常量（对齐 libtv 卡片规格） */
export const ELEMENT_NODE_WIDTH = 260;
export const ELEMENT_NODE_HEIGHT = 200;
/** loop-step 展开宫格时的尺寸 */
export const LOOP_STEP_EXPANDED_WIDTH = 400;
export const LOOP_STEP_EXPANDED_HEIGHT = 500;

// ===== 自定义字段渲染辅助（与 NodePropertyPanel 同源） =====

type CustomFieldType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "range"
  | "color"
  | "reference";

interface CustomFieldDef {
  id: string;
  key: string;
  type: CustomFieldType;
  value: unknown;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  referenceType?: "attribute" | "node";
}

/** 字段类型 → 图标 + 主题色（与 NodePropertyPanel 对齐） */
const FIELD_TYPE_META: Record<CustomFieldType, { icon: typeof Hash; color: string }> = {
  text: { icon: TypeIcon, color: "#60A5FA" },
  number: { icon: Hash, color: "#10B981" },
  boolean: { icon: ToggleLeft, color: "#F59E0B" },
  select: { icon: ListIcon, color: "#A855F7" },
  range: { icon: Sliders, color: "#06B6D4" },
  color: { icon: Palette, color: "#EC4899" },
  reference: { icon: LinkIcon, color: "#8B5CF6" },
};

/** 旧格式兼容：Record<string,string> → CustomFieldDef[] */
function migrateCustomFields(raw: unknown): CustomFieldDef[] {
  if (Array.isArray(raw)) return raw as CustomFieldDef[];
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, string>).map(([key, value]) => ({
      id: `m_${key}`,
      key,
      type: "text" as const,
      value,
    }));
  }
  return [];
}

/** 字段值 → 紧凑展示字符串 */
function formatFieldValue(field: CustomFieldDef): string {
  const v = field.value;
  switch (field.type) {
    case "boolean":
      return v ? "是" : "否";
    case "number":
    case "range": {
      const n = v as number;
      return `${n ?? 0}${field.unit ? field.unit : ""}`;
    }
    case "color":
      return String(v || "");
    case "select":
      return String(v || "—");
    case "reference":
      return v ? "已引用" : "—";
    case "text":
    default:
      return String(v || "—");
  }
}

/** 渲染节点卡片内的紧凑字段列表（最多 N 项，超出可滚动） */
function NodeFieldsList({ fields }: { fields: CustomFieldDef[] }) {
  if (!fields.length) return null;
  const visible = fields.slice(0, 10);
  return (
    <div
      className="space-y-0.5 mt-1 pt-1 border-t border-line-subtle/40 max-h-[140px] overflow-y-auto"
      data-node-fields
    >
      {visible.map((f) => {
        const meta = FIELD_TYPE_META[f.type] || FIELD_TYPE_META.text;
        const Icon = meta.icon;
        return (
          <div
            key={f.id}
            className="flex items-center gap-1 text-2xs leading-tight"
          >
            <Icon
              className="w-2.5 h-2.5 flex-shrink-0"
              style={{ color: meta.color }}
            />
            <span className="text-ink-muted flex-shrink-0 max-w-[80px] truncate">
              {f.key}
            </span>
            <span className="text-ink-muted/40 flex-shrink-0">·</span>
            <span className="text-ink-primary truncate font-mono">
              {formatFieldValue(f)}
            </span>
          </div>
        );
      })}
      {fields.length > 10 && (
        <div className="text-3xs text-ink-muted/60 text-center pt-0.5">
          +{fields.length - 10} 项
        </div>
      )}
    </div>
  );
}

/** 节点运行时状态（对齐 libtv 状态系统） */
export type ElementStatus = "pending" | "generating" | "generated" | "edited";

export interface ElementNodeData {
  element: CanvasElement;
  onDoubleClick?: (element: CanvasElement) => void;
  /** 生成回调：节点点击"生成"时触发 */
  onGenerate?: (element: CanvasElement, prompt: string) => void;
  /** 当前节点是否正在生成（向后兼容） */
  generating?: boolean;
  /** 运行时状态（pending/generating/generated/edited） */
  status?: ElementStatus;
  /** 复制回调 */
  onDuplicate?: (element: CanvasElement) => void;
  /** 删除回调 */
  onDelete?: (element: CanvasElement) => void;
  /** 是否已收藏 */
  isFavorite?: boolean;
  /** 收藏切换回调 */
  onToggleFavorite?: (element: CanvasElement) => void;
  /** 节点编号（按类型分别编号） */
  index?: number;
}

/** React Flow 自定义节点 props */
type ElementNodeProps = {
  id: string;
  data: ElementNodeData;
  selected: boolean;
};

// ===== 色板：维度色板 + 语义色板 =====
// iconMode = "dimension" 时用维度色板（相同维度同色）
// iconMode = "semantic" 时用语义色板（相同语义同色）

/** 维度色板：10 大维度 + 7 种 CanvasElement 类型的维度颜色 */
const DIMENSION_COLOR_MAP: Record<string, string> = {
  // 10 大维度（node 子类型按 category 映射）
  logic: "#6366F1",      // 逻辑层 - 靛蓝
  system: "#10B981",     // 资源层 - 翠绿
  growth: "#F59E0B",     // 成长层 - 琥珀
  feedback: "#06B6D4",   // 反馈层 - 青色
  social: "#D946EF",     // 社交层 - 品红
  world: "#059669",      // 世界观层 - 深绿
  content: "#EC4899",    // 内容层 - 粉红
  sensory: "#A855F7",    // 感官层 - 浅紫
  aux: "#FDE047",        // 辅助层 - 亮黄
  // 7 种 CanvasElement 类型的维度颜色
  "core-loop": "#8B5CF6",     // 循环维度 - 紫罗兰
  "loop-step": "#A3E635",     // 玩法维度 - 黄绿
  "moment": "#F59E0B",        // 体验维度 - 琥珀
  "rule": "#F43F5E",          // 规则维度 - 玫红
  "level-node": "#EF4444",    // 关卡维度 - 红色
  "attribute": "#10B981",     // 数据维度 - 翠绿
};

/** rule 分类 → 语义颜色 */
const RULE_CATEGORY_COLOR: Record<RuleCategory, string> = {
  combat: "#EF4444",      // 战斗 - 红
  movement: "#3B82F6",    // 移动 - 蓝
  economy: "#FBBF24",     // 经济 - 金
  social: "#D946EF",      // 社交 - 品红
  progression: "#10B981", // 成长 - 翠绿
  custom: "#64748B",      // 自定义 - 石板灰
};

/** attribute 类型 → 语义颜色 */
const ATTRIBUTE_TYPE_COLOR: Record<AttributeType, string> = {
  number: "#3B82F6",   // 数值 - 蓝
  string: "#A855F7",   // 文本 - 浅紫
  bool: "#F59E0B",     // 布尔 - 琥珀
  ref: "#06B6D4",      // 引用 - 青色
};

/** moment 类型 → 语义颜色 */
const MOMENT_TYPE_COLOR: Record<MomentType, string> = {
  combat: "#EF4444",     // 战斗 - 红
  exploration: "#10B981",// 探索 - 翠绿
  social: "#D946EF",     // 社交 - 品红
  economy: "#FBBF24",    // 经济 - 金
  story: "#A855F7",      // 剧情 - 浅紫
  custom: "#64748B",     // 自定义 - 石板灰
};

/** level-node 类型 → 语义颜色 */
const LEVEL_NODE_TYPE_COLOR: Record<LevelNodeType, string> = {
  level: "#3B82F6",      // 关卡 - 蓝
  boss: "#EF4444",       // Boss - 红
  cutscene: "#A855F7",   // 过场 - 浅紫
  hub: "#10B981",        // 枢纽 - 翠绿
  secret: "#FBBF24",     // 隐藏 - 金
  tutorial: "#06B6D4",   // 教学 - 青色
  ending: "#8B5CF6",     // 结局 - 紫罗兰
};

/** 各画布元素类型的颜色和图标映射 */
function getElementVisuals(el: CanvasElement, iconMode: "semantic" | "dimension"): {
  color: string;
  Icon: ComponentType<{ className?: string; style?: CSSProperties }>;
} {
  // 维度模式：按维度取色
  if (iconMode === "dimension") {
    switch (el.type) {
      case "node": {
        const category = NODE_TYPE_META[el.data.type as NodeType]?.category;
        return {
          color: (category && DIMENSION_COLOR_MAP[category]) || "#3B82F6",
          Icon: Network,
        };
      }
      default:
        return {
          color: DIMENSION_COLOR_MAP[el.type] || "#3B82F6",
          Icon: getElementIcon(el),
        };
    }
  }

  // 语义模式：按最具体的子类型取色
  switch (el.type) {
    case "core-loop":
      return { color: "#8B5CF6", Icon: Repeat };
    case "loop-step":
      return { color: el.data.color || "#A3E635", Icon: RefreshCw };
    case "moment":
      return { color: MOMENT_TYPE_COLOR[el.data.type], Icon: Flame };
    case "node":
      return {
        color: NODE_TYPE_META[el.data.type as NodeType]?.color || "#3B82F6",
        Icon: Network,
      };
    case "rule":
      return { color: RULE_CATEGORY_COLOR[el.data.category], Icon: ScrollText };
    case "level-node":
      return { color: LEVEL_NODE_TYPE_COLOR[el.data.type], Icon: GitBranch };
    case "attribute":
      return { color: ATTRIBUTE_TYPE_COLOR[el.data.type], Icon: Calculator };
  }
}

/** 返回元素的默认图标（维度模式用） */
function getElementIcon(el: CanvasElement): ComponentType<{ className?: string; style?: CSSProperties }> {
  switch (el.type) {
    case "core-loop": return Repeat;
    case "loop-step": return RefreshCw;
    case "moment": return Flame;
    case "node": return Network;
    case "rule": return ScrollText;
    case "level-node": return GitBranch;
    case "attribute": return Calculator;
  }
}

/** 标题栏类型标签文案 */
function getTypeLabel(el: CanvasElement): string {
  switch (el.type) {
    case "core-loop":
      return "核心循环";
    case "loop-step":
      return "玩步·宫格";
    case "moment":
      return "高光时刻";
    case "node":
      return NODE_TYPE_META[el.data.type]?.label ?? "机制节点";
    case "rule":
      return "规则";
    case "level-node":
      return "关卡节点";
    case "attribute":
      return "属性";
  }
}

/** 生成区输入框 placeholder，随类型变化 */
function getPromptPlaceholder(el: CanvasElement): string {
  switch (el.type) {
    case "core-loop":
      return "描述核心玩法循环...";
    case "loop-step":
      return "描述玩家反复执行的行动...";
    case "moment":
      return "描述想要的情绪高峰...";
    case "node":
      return "描述你想要的机制...";
    case "rule":
      return "描述触发条件与效果...";
    case "level-node":
      return "描述关卡主题与结构...";
    case "attribute":
      return "描述属性的用途与数值...";
  }
}

/** 读取 localStorage 中的宫格变体数量（用于 loop-step 展示"已有 N 个变体方案"） */
function countVariants(elementKey: string): number {
  try {
    const raw = localStorage.getItem(`storyboard-grid-${elementKey}`);
    if (raw) {
      const parsed = JSON.parse(raw) as { cells?: unknown[] };
      if (Array.isArray(parsed.cells)) {
        return parsed.cells.filter((c) => c !== null).length;
      }
    }
  } catch {
    // ignore
  }
  return 0;
}

/** moment 类型 → 图标 */
function getMomentIcon(type: MomentType): ComponentType<{ className?: string }> {
  switch (type) {
    case "combat": return Sword;
    case "exploration": return MapIcon;
    case "social": return MessageCircle;
    case "economy": return Coins;
    case "story": return BookOpen;
    case "custom": return Sparkle;
  }
}

/** moment 类型 → 中文标签 */
function getMomentTypeLabel(type: MomentType): string {
  switch (type) {
    case "combat": return "战斗";
    case "exploration": return "探索";
    case "social": return "社交";
    case "economy": return "经济";
    case "story": return "剧情";
    case "custom": return "自定义";
  }
}

/** level-node 类型 → 图标 */
function getLevelNodeIcon(type: LevelNodeType): ComponentType<{ className?: string }> {
  switch (type) {
    case "level": return MapIcon;
    case "boss": return Trophy;
    case "cutscene": return Film;
    case "hub": return Home;
    case "secret": return Lock;
    case "tutorial": return GraduationCap;
    case "ending": return CircleDot;
  }
}

/** level-node 类型 → 中文标签 */
function getLevelNodeTypeLabel(type: LevelNodeType): string {
  switch (type) {
    case "level": return "关卡";
    case "boss": return "Boss";
    case "cutscene": return "过场";
    case "hub": return "枢纽";
    case "secret": return "隐藏";
    case "tutorial": return "教学";
    case "ending": return "结局";
  }
}

/** rule 分类 → 中文标签 */
function getRuleCategoryLabel(category: RuleCategory): string {
  switch (category) {
    case "combat": return "战斗";
    case "movement": return "移动";
    case "economy": return "经济";
    case "social": return "社交";
    case "progression": return "成长";
    case "custom": return "自定义";
  }
}

/** attribute 类型 → 中文标签 */
function getAttributeTypeLabel(type: AttributeType): string {
  switch (type) {
    case "number": return "数值";
    case "string": return "文本";
    case "bool": return "布尔";
    case "ref": return "引用";
  }
}

// ===== 语义图标：返回每种节点最具体的图标 =====

/** rule 分类 → 语义图标 */
function getRuleCategoryIcon(category: RuleCategory): ComponentType<{ className?: string }> {
  switch (category) {
    case "combat": return Sword;
    case "movement": return Move;
    case "economy": return Coins;
    case "social": return Users;
    case "progression": return TrendingUp;
    case "custom": return StickyNote;
  }
}

/** attribute 类型 → 语义图标 */
function getAttributeTypeIcon(type: AttributeType): ComponentType<{ className?: string }> {
  switch (type) {
    case "number": return Hash;
    case "string": return TypeIcon;
    case "bool": return ToggleLeft;
    case "ref": return Link2;
  }
}

/**
 * 返回节点的语义图标（最具体的图标，一眼辨识功能）。
 * - core-loop: Repeat（循环）
 * - loop-step: RefreshCw（玩步）
 * - moment: 按时刻类型（Sword/MapIcon/MessageCircle/Coins/BookOpen/Sparkle）
 * - node: 按 NODE_TYPE_META 的 40+ 种子类型图标（Zap/Play/Circle/...）
 * - rule: 按分类（Sword/Move/Coins/Users/TrendingUp/StickyNote）
 * - level-node: 按关卡类型（MapIcon/Trophy/Film/Home/Lock/GraduationCap/CircleDot）
 * - attribute: 按属性类型（Hash/TypeIcon/ToggleLeft/Link2）
 */
function getSemanticIcon(el: CanvasElement): ComponentType<{ className?: string; style?: CSSProperties }> {
  switch (el.type) {
    case "core-loop":
      return Repeat;
    case "loop-step":
      return RefreshCw;
    case "moment":
      return getMomentIcon(el.data.type);
    case "node":
      return getNodeIcon(el.data.type as NodeType) || Network;
    case "rule":
      return getRuleCategoryIcon(el.data.category);
    case "level-node":
      return getLevelNodeIcon(el.data.type);
    case "attribute":
      return getAttributeTypeIcon(el.data.type);
  }
}

/** 返回子类型标签（比 getTypeLabel 更具体） */
function getSubtypeLabel(el: CanvasElement): string {
  switch (el.type) {
    case "core-loop":
      return el.data.loopType === "core" ? "核心循环" : el.data.loopType === "secondary" ? "次级循环" : "元循环";
    case "loop-step":
      return "玩步";
    case "moment":
      return getMomentTypeLabel(el.data.type);
    case "node":
      return NODE_TYPE_META[el.data.type as NodeType]?.label ?? "机制节点";
    case "rule":
      return getRuleCategoryLabel(el.data.category);
    case "level-node":
      return getLevelNodeTypeLabel(el.data.type);
    case "attribute":
      return getAttributeTypeLabel(el.data.type);
  }
}

// ===== 维度图标：返回节点所属维度的图标和标签 =====

/** NODE_TYPE_META category → 维度图标和标签 */
const CATEGORY_DIMENSION_MAP: Record<string, { icon: ComponentType<{ className?: string; style?: CSSProperties }>; label: string }> = {
  logic: { icon: Workflow, label: "逻辑层" },
  system: { icon: Boxes, label: "资源层" },
  growth: { icon: TrendingUp, label: "成长层" },
  feedback: { icon: RefreshCw, label: "反馈层" },
  social: { icon: Users, label: "社交层" },
  world: { icon: MapIcon, label: "世界观层" },
  content: { icon: Package, label: "内容层" },
  sensory: { icon: Clapperboard, label: "感官层" },
  aux: { icon: StickyNote, label: "辅助层" },
};

/**
 * 返回节点的维度图标和维度标签（标识节点所属的大类）。
 * 维度图标 + 语义图标共同出现在 HeroBanner 中。
 */
function getDimensionVisuals(el: CanvasElement): {
  DimIcon: ComponentType<{ className?: string; style?: CSSProperties }>;
  dimLabel: string;
} {
  switch (el.type) {
    case "core-loop":
      return { DimIcon: Repeat, dimLabel: "循环维度" };
    case "loop-step":
      return { DimIcon: Gamepad2, dimLabel: "玩法维度" };
    case "moment":
      return { DimIcon: Flame, dimLabel: "体验维度" };
    case "node": {
      const category = NODE_TYPE_META[el.data.type as NodeType]?.category;
      const dim = CATEGORY_DIMENSION_MAP[category || ""];
      return dim
        ? { DimIcon: dim.icon, dimLabel: dim.label }
        : { DimIcon: Network, dimLabel: "机制维度" };
    }
    case "rule":
      return { DimIcon: Scale, dimLabel: "规则维度" };
    case "level-node":
      return { DimIcon: MapIcon, dimLabel: "关卡维度" };
    case "attribute":
      return { DimIcon: Hash, dimLabel: "数据维度" };
  }
}

/**
 * 返回节点的维度 key（用于筛选隐藏）。
 * 与 DIMENSION_COLOR_MAP 的 key 对齐。
 */
export function getDimensionKey(el: CanvasElement): string {
  switch (el.type) {
    case "node": {
      const category = NODE_TYPE_META[el.data.type as NodeType]?.category;
      return category || "unknown";
    }
    default:
      return el.type;
  }
}

/**
 * 返回节点的语义 key（用于筛选隐藏）。
 * 与各语义色板的 key 对齐。
 */
export function getSemanticKey(el: CanvasElement): string {
  switch (el.type) {
    case "core-loop":
      return el.data.loopType || "core";
    case "loop-step":
      return "loop-step";
    case "moment":
      return `moment-${el.data.type}`;
    case "node":
      return `node-${el.data.type}`;
    case "rule":
      return `rule-${el.data.category}`;
    case "level-node":
      return `level-${el.data.type}`;
    case "attribute":
      return `attr-${el.data.type}`;
  }
}

/** 维度标签映射（用于筛选面板显示） */
export const DIMENSION_LABELS: Record<string, string> = {
  logic: "逻辑层",
  system: "资源层",
  growth: "成长层",
  feedback: "反馈层",
  social: "社交层",
  world: "世界观层",
  content: "内容层",
  sensory: "感官层",
  aux: "辅助层",
  "core-loop": "循环维度",
  "loop-step": "玩法维度",
  "moment": "体验维度",
  "rule": "规则维度",
  "level-node": "关卡维度",
  "attribute": "数据维度",
};

/** 语义标签映射（用于筛选面板显示） */
export function getSemanticLabel(el: CanvasElement): string {
  return getSubtypeLabel(el);
}

/** 节点状态 → 颜色和文字（对齐 libtv 状态指示器） */
function getStatusVisuals(status: ElementStatus): {
  color: string;
  label: string;
  pulse?: boolean;
} {
  switch (status) {
    case "pending":
      return { color: "#6B7280", label: "待生成" };
    case "generating":
      return { color: "#F59E0B", label: "生成中", pulse: true };
    case "generated":
      return { color: "#10B981", label: "已生成" };
    case "edited":
      return { color: "#3B82F6", label: "已编辑" };
  }
}

/** 检测规则条件是否包含概率性，返回概率百分比或 null */
function detectRuleProbability(condition: string): number | null {
  const lower = condition.toLowerCase();
  const hasProbability =
    condition.includes("概率") ||
    condition.includes("几率") ||
    condition.includes("随机") ||
    condition.includes("%") ||
    lower.includes("chance") ||
    lower.includes("random") ||
    lower.includes("probability");
  if (!hasProbability) return null;
  // 尝试从文本中提取百分比数字
  const match = condition.match(/(\d+(?:\.\d+)?)\s*%/);
  if (match) return Math.min(100, Math.max(0, parseFloat(match[1])));
  return 50; // 有概率关键词但无具体数值，默认 50%
}

/** 规则优先级 → 标签和颜色（1-10 映射到高/中/低） */
function getPriorityLabel(priority: number): { label: string; color: string } {
  if (priority >= 8) return { label: "高优先级", color: "bg-red-500/15 text-red-400" };
  if (priority >= 4) return { label: "中优先级", color: "bg-amber-500/15 text-amber-400" };
  return { label: "低优先级", color: "bg-blue-500/15 text-blue-400" };
}

/** 对 number 类型的属性，解析 value 为数字并计算合理的 min/max 范围 */
function getAttributeRange(value: string): {
  value: number;
  min: number;
  max: number;
} | null {
  const num = parseFloat(value);
  if (isNaN(num)) return null;
  const min = 0;
  const max = Math.max(100, Math.ceil(Math.abs(num) * 1.5));
  return { value: num, min, max };
}

// ===== 内联 SVG 可视化组件（游戏设计专业可视化，每个 60-80px） =====

/** core-loop 循环结构图：圆形排列步骤，箭头连接，当前步骤高亮 */
function LoopStructureSVG({
  steps,
  currentStep,
}: {
  steps: LoopStep[];
  currentStep?: number;
}) {
  const n = steps.length;
  if (n === 0) return null;
  const cx = 30;
  const cy = 30;
  const r = 22;
  // 按圆形排列计算每个步骤的坐标
  const points = steps.map((_, i) => {
    const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
  return (
    <svg width="60" height="60" className="flex-shrink-0">
      {/* 连接线：形成循环箭头 */}
      {points.map((p, i) => {
        const next = points[(i + 1) % n];
        return (
          <line
            key={`line-${i}`}
            x1={p.x}
            y1={p.y}
            x2={next.x}
            y2={next.y}
            stroke="rgba(139,92,246,0.4)"
            strokeWidth="1"
          />
        );
      })}
      {/* 步骤圆点：当前步骤高亮放大 */}
      {points.map((p, i) => (
        <circle
          key={`dot-${i}`}
          cx={p.x}
          cy={p.y}
          r={i === currentStep ? 5 : 3}
          fill={i === currentStep ? "#8B5CF6" : "rgba(139,92,246,0.3)"}
          stroke="#8B5CF6"
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

/** loop-step 情绪曲线：折线图显示情绪变化，标注当前位置 */
function EmotionCurveSVG({ position }: { position: number }) {
  // position 是当前步骤在循环中的相对位置 (0-1)
  const w = 56;
  const h = 24;
  const cy = h / 2;
  // 用正弦波模拟情绪起伏曲线
  const points: string[] = [];
  for (let i = 0; i <= 20; i++) {
    const x = 2 + (i / 20) * w;
    const y = cy - Math.sin((i / 20) * Math.PI * 2) * (h / 2 - 2);
    points.push(`${x},${y}`);
  }
  const currentX = 2 + position * w;
  const currentY = cy - Math.sin(position * Math.PI * 2) * (h / 2 - 2);
  return (
    <svg width="60" height="28" className="flex-shrink-0">
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke="rgba(163,230,53,0.4)"
        strokeWidth="1"
      />
      {/* 当前位置标记 */}
      <circle cx={currentX} cy={currentY} r="3" fill="#A3E635" />
    </svg>
  );
}

/** moment 时间轴：水平线 + 当前位置标记，显示前期/中期/后期 */
function MomentTimelineSVG({ position }: { position: number }) {
  // position 是 timing (0-100)
  const x = 4 + (position / 100) * 52;
  const stage = position < 33 ? "前期" : position < 66 ? "中期" : "后期";
  return (
    <div className="flex items-center gap-1.5">
      <svg width="60" height="16" className="flex-shrink-0">
        {/* 水平时间线 */}
        <line x1="4" y1="8" x2="56" y2="8" stroke="rgba(245,158,11,0.3)" strokeWidth="1" />
        {/* 当前位置标记 */}
        <circle cx={x} cy="8" r="3" fill="#F59E0B" />
      </svg>
      <span className="text-2xs text-ink-muted">{stage}</span>
    </div>
  );
}

/** level-node 关卡流程缩略图：起点 → 挑战 → Boss → 终点 */
function LevelFlowSVG({ currentType }: { currentType: LevelNodeType }) {
  // 关卡流程阶段：教学 → 关卡 → Boss → 结局
  const stages: { type: LevelNodeType; x: number; w: number; label: string }[] = [
    { type: "tutorial", x: 2, w: 12, label: "起" },
    { type: "level", x: 18, w: 12, label: "战" },
    { type: "boss", x: 34, w: 14, label: "B" },
    { type: "ending", x: 52, w: 12, label: "终" },
  ];
  return (
    <svg width="66" height="16" className="flex-shrink-0">
      {stages.map((s, i) => {
        const isCurrent = s.type === currentType;
        return (
          <g key={s.type}>
            {/* 连接箭头 */}
            {i < stages.length - 1 && (
              <line
                x1={s.x + s.w}
                y1="8"
                x2={stages[i + 1].x}
                y2="8"
                stroke="rgba(239,68,68,0.4)"
                strokeWidth="0.5"
              />
            )}
            {/* 阶段方块：当前阶段高亮 */}
            <rect
              x={s.x}
              y={isCurrent ? 4 : 5}
              width={s.w}
              height={isCurrent ? 8 : 6}
              fill={isCurrent ? "rgba(239,68,68,0.6)" : "rgba(239,68,68,0.2)"}
              stroke="#EF4444"
              strokeWidth="0.5"
              rx="1"
            />
          </g>
        );
      })}
    </svg>
  );
}

/** attribute 数值范围指示器：水平进度条，标注 min/当前值/max */
function AttributeRangeBar({
  value,
  min,
  max,
}: {
  value: number;
  min: number;
  max: number;
}) {
  const percent = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
  return (
    <div className="space-y-0.5">
      <div className="h-1.5 bg-canvas-sunken rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-green-500/60 to-green-400 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="flex justify-between text-2xs text-ink-muted">
        <span>{min}</span>
        <span className="text-green-400 font-mono">{value}</span>
        <span>{max}</span>
      </div>
    </div>
  );
}

/**
 * 英雄横幅：内容区顶部的大图标块 + 子类型名 + 维度徽章。
 *
 * 视觉结构（iconMode = "semantic" 时，语义图标为核心）：
 * ┌──────────────────────────────────────┐
 * │ ┌──────┐  事件                         │  ← 子类型名（大字）
 * │ │  ⚡  │  🔀 逻辑层                     │  ← 维度图标 + 维度标签
 * │ └──────┘                              │
 * └──────────────────────────────────────┘
 *
 * iconMode = "dimension" 时，维度图标为核心（大图标块），语义图标为小徽章：
 * ┌──────────────────────────────────────┐
 * │ ┌──────┐  逻辑层                         │  ← 维度标签（大字）
 * │ │  🔀  │  ⚡ 事件                        │  ← 语义图标 + 子类型名
 * │ └──────┘                              │
 * └──────────────────────────────────────┘
 *
 * - 40x40 圆角图标块，带节点色半透明背景 + 细边框
 * - 大图标（w-5 h-5）居中，使用节点色
 * - 右侧上方：核心标签（font-semibold）
 * - 右侧下方：次要图标 + 次要标签（text-2xs text-ink-muted）
 */
function HeroBanner({
  color,
  SemIcon,
  DimIcon,
  subtypeLabel,
  dimLabel,
}: {
  color: string;
  SemIcon: ComponentType<{ className?: string; style?: CSSProperties }>;
  DimIcon: ComponentType<{ className?: string; style?: CSSProperties }>;
  subtypeLabel: string;
  dimLabel: string;
}) {
  // 图标模式：semantic（语义图标为核心）/ dimension（维度图标为核心）
  const iconMode = useUIStore((s) => s.iconMode);

  // 根据模式决定大图标和小图标的角色
  const isSemanticCore = iconMode === "semantic";
  const BigIcon = isSemanticCore ? SemIcon : DimIcon;
  const SmallIcon = isSemanticCore ? DimIcon : SemIcon;
  const bigLabel = isSemanticCore ? subtypeLabel : dimLabel;
  const smallLabel = isSemanticCore ? dimLabel : subtypeLabel;

  return (
    <div className="flex items-center gap-2.5 pb-2 mb-2 border-b border-line-subtle/30">
      {/* 大图标块：40x40 圆角，带节点色半透明背景 */}
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
        style={{
          backgroundColor: `${color}1A`,
          border: `1px solid ${color}40`,
          boxShadow: `0 0 12px ${color}20`,
        }}
      >
        <BigIcon className="w-5 h-5" style={{ color }} />
      </div>
      {/* 右侧：核心标签 + 次要图标徽章 */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-ink-primary truncate">
          {bigLabel}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          <SmallIcon className="w-3 h-3 text-ink-muted flex-shrink-0" />
          <span className="text-2xs text-ink-muted">{smallLabel}</span>
        </div>
      </div>
    </div>
  );
}

/** 内容展示区：根据类型渲染不同字段（增强版，富语义展示 + 专业可视化） */
function renderContent(el: CanvasElement, showNodeFields = true) {
  switch (el.type) {
    case "core-loop": {
      const desc = el.data.description || "（未设定描述）";
      const steps = el.data.steps || [];
      return (
        <div className="space-y-1">
          {/* 循环结构可视化：圆形排列步骤 + 步骤数 */}
          {steps.length > 0 && (
            <div className="flex items-start gap-2">
              <LoopStructureSVG steps={steps} />
              <div className="flex-1 min-w-0 space-y-1">
                <span className="text-2xs text-ink-muted">{steps.length} 个步骤</span>
                <div className="text-xs text-ink-primary line-clamp-2 leading-relaxed">{desc}</div>
              </div>
            </div>
          )}
          {steps.length === 0 && (
            <>
              <span className="text-2xs text-ink-muted">{steps.length} 个步骤</span>
              <div className="text-xs text-ink-primary line-clamp-2 leading-relaxed">{desc}</div>
            </>
          )}
          {/* 步骤列表：用 → 箭头连接 */}
          {steps.length > 0 && (
            <div className="text-2xs text-ink-secondary leading-relaxed line-clamp-2">
              {steps.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && <span className="text-ink-muted mx-0.5">→</span>}
                  {s.label}
                </span>
              ))}
            </div>
          )}
        </div>
      );
    }
    case "loop-step": {
      const action = el.data.playerAction || "（未设定玩家行动）";
      const emotion = el.data.emotion || "—";
      const variantCount = countVariants(el.key);
      // 用 order 计算情绪曲线位置 (0-1)
      const curvePosition = (el.data.order % 4) / 3;
      return (
        <div className="space-y-1">
          {/* 所属循环名称（小字灰色） */}
          <div className="flex items-center gap-1 text-2xs text-ink-muted">
            <span>所属循环</span>
            <span className="text-ink-secondary truncate">{el.loopName}</span>
          </div>
          {/* 玩家行动（突出显示，带图标） */}
          <div className="text-2xs text-ink-muted">玩家行动</div>
          <div className="flex items-start gap-1">
            <Gamepad2 className="w-3 h-3 text-accent flex-shrink-0 mt-0.5" />
            <div className="text-xs text-ink-primary line-clamp-2 leading-relaxed">{action}</div>
          </div>
          {/* 情绪标签（彩色 pill）+ 情绪曲线可视化 */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-ink-muted">情绪</span>
            <span className="text-2xs px-1.5 py-0.5 rounded-full bg-accent/15 text-accent">
              {emotion}
            </span>
            <EmotionCurveSVG position={curvePosition} />
          </div>
          {/* 如果有宫格变体，显示数量 */}
          {variantCount > 0 && (
            <div className="text-2xs text-ink-muted">
              已有 <span className="text-accent font-medium">{variantCount}</span> 个变体方案
            </div>
          )}
        </div>
      );
    }
    case "moment": {
      const desc = el.data.description || "（未设定描述）";
      // 情绪强度进度条（1-10 映射到 10%-100%）
      const emotionPercent = Math.min(100, Math.max(0, el.data.emotion * 10));
      // 时间轴位置（timing 0-100）
      const timing = el.data.timing || 0;
      return (
        <div className="space-y-1">
          <div className="text-xs text-ink-primary line-clamp-2 leading-relaxed">{desc}</div>
          {/* 情绪强度进度条可视化 */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-ink-muted">情绪强度</span>
            <div className="flex-1 h-1.5 bg-canvas-sunken rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500/60 to-amber-400 transition-all"
                style={{ width: `${emotionPercent}%` }}
              />
            </div>
            <span className="text-2xs text-amber-400 font-mono">{el.data.emotion}/10</span>
          </div>
          {/* 时间轴位置可视化：显示在游戏流程中的位置 */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-ink-muted">时间轴</span>
            <MomentTimelineSVG position={timing} />
          </div>
          {/* 情绪标签 */}
          {el.data.emotionLabel && (
            <span className="inline-block text-2xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
              {el.data.emotionLabel}
            </span>
          )}
        </div>
      );
    }
    case "node": {
      const desc = (el.data.data?.description as string | undefined) || "（未设定描述）";
      const meta = NODE_TYPE_META[el.data.type as NodeType];
      // 尝试从 data 中读取触发条件和效果
      const trigger =
        (el.data.data?.trigger as string | undefined) ||
        (el.data.data?.input as string | undefined);
      const effect =
        (el.data.data?.effect as string | undefined) ||
        (el.data.data?.output as string | undefined);
      // 玩法属性：迁移 + 渲染（受全局开关控制）
      const customFields = showNodeFields
        ? migrateCustomFields(el.data.data?.customFields)
        : [];
      return (
        <div className="space-y-1">
          {/* 如果有 refAttributeId，显示"关联属性"（类型徽章已在 HeroBanner 中显示） */}
          {el.data.refAttributeId && (
            <div className="flex items-center gap-0.5 text-2xs text-ink-muted">
              <Link2 className="w-2.5 h-2.5" />
              关联数值
            </div>
          )}
          <div className="text-xs text-ink-primary line-clamp-3 leading-relaxed">{desc}</div>
          {/* 输入输出指示：优先显示具体触发/效果，否则显示端口数量 */}
          {trigger && (
            <div className="text-2xs text-ink-secondary line-clamp-1">
              <span className="text-ink-muted">触发: </span>
              {trigger}
            </div>
          )}
          {effect && (
            <div className="text-2xs text-ink-secondary line-clamp-1">
              <span className="text-ink-muted">效果: </span>
              {effect}
            </div>
          )}
          {!trigger && !effect && (
            <div className="flex items-center gap-2 text-2xs text-ink-muted">
              <span>输入 {meta.ports.inputs}</span>
              <span>输出 {meta.ports.outputs}</span>
            </div>
          )}
          {/* 已设置的玩法属性值列表 */}
          {customFields.length > 0 && <NodeFieldsList fields={customFields} />}
        </div>
      );
    }
    case "rule": {
      const condition = el.data.condition || "（未设定条件）";
      const action = el.data.action || "（未设定行动）";
      const enabled = el.data.enabled;
      const priority = el.data.priority || 1;
      const priorityMeta = getPriorityLabel(priority);
      // 检测规则是否有概率性
      const probability = detectRuleProbability(condition);
      return (
        <div className="space-y-1">
          {/* 优先级标签 + 启用状态指示器（分类标签已在 HeroBanner 中显示） */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={cn("text-2xs px-1 py-0.5 rounded", priorityMeta.color)}>
              {priorityMeta.label}
            </span>
            <span className="flex items-center gap-0.5 text-2xs text-ink-muted">
              <span
                className={cn(
                  "w-1.5 h-1.5 rounded-full",
                  enabled ? "bg-green-400" : "bg-ink-muted/50"
                )}
              />
              {enabled ? "启用" : "禁用"}
            </span>
          </div>
          {/* IF-THEN 卡片式展示（条件背景色） */}
          <div className="text-2xs px-1.5 py-1 rounded bg-amber-500/10 border-l-2 border-amber-500/50">
            <span className="text-amber-400 font-mono text-2xs mr-1">IF</span>
            <span className="text-ink-primary">{condition}</span>
          </div>
          <div className="text-2xs px-1.5 py-1 rounded bg-green-500/10 border-l-2 border-green-500/50">
            <span className="text-green-400 font-mono text-2xs mr-1">THEN</span>
            <span className="text-ink-primary">{action}</span>
          </div>
          {/* 触发概率可视化：如果规则有概率性，显示概率百分比条 */}
          {probability !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-2xs text-ink-muted">触发概率</span>
              <div className="flex-1 h-1.5 bg-canvas-sunken rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500/60 to-purple-400 transition-all"
                  style={{ width: `${probability}%` }}
                />
              </div>
              <span className="text-2xs text-purple-400 font-mono">{probability}%</span>
            </div>
          )}
        </div>
      );
    }
    case "level-node": {
      const desc = el.data.description || "（未设定描述）";
      // 难度星级（★可视化，5星制）
      const filledStars = Math.min(5, Math.ceil(el.data.difficulty / 2));
      const stars = "★".repeat(filledStars) + "☆".repeat(5 - filledStars);
      return (
        <div className="space-y-1">
          {/* 难度星级 + 时长（关卡类型已在 HeroBanner 中显示） */}
          <div className="flex items-center gap-2 text-2xs">
            <span className="text-ink-muted">难度</span>
            <span className="text-amber-400 tracking-tight">{stars}</span>
            <span className="text-ink-muted ml-1 flex items-center gap-0.5">
              <Clock className="w-2.5 h-2.5" />
              {el.data.duration}分钟
            </span>
          </div>
          <div className="text-xs text-ink-primary line-clamp-2 leading-relaxed">{desc}</div>
          {/* 关卡流程缩略图：起点 → 挑战 → Boss → 终点 */}
          <div className="flex items-center gap-1.5">
            <span className="text-2xs text-ink-muted">流程</span>
            <LevelFlowSVG currentType={el.data.type} />
          </div>
        </div>
      );
    }
    case "attribute": {
      const hasFormula = Boolean(el.formula);
      // 对 number 类型计算数值范围
      const range = el.data.type === "number" ? getAttributeRange(el.data.value) : null;
      return (
        <div className="space-y-1">
          {/* 单位（属性类型已在 HeroBanner 中显示） */}
          {el.data.unit && (
            <div className="text-2xs text-ink-muted">单位: {el.data.unit}</div>
          )}
          {/* 当前值（大字号显示）或公式表达式（等宽字体） */}
          <div className="flex items-baseline gap-1">
            {hasFormula ? (
              <>
                <span className="text-2xs text-ink-muted">←</span>
                <span className="text-sm font-mono text-accent truncate">
                  {el.formula!.expression}
                </span>
              </>
            ) : (
              <span className="text-base font-mono font-semibold text-accent truncate">
                {el.data.value}
              </span>
            )}
          </div>
          {/* 数值范围指示器：只对 number 类型显示 */}
          {range && <AttributeRangeBar value={range.value} min={range.min} max={range.max} />}
          {el.data.description && (
            <div className="text-2xs text-ink-secondary line-clamp-2 leading-relaxed">
              {el.data.description}
            </div>
          )}
        </div>
      );
    }
  }
}

/**
 * React Flow 自定义节点：生成式节点（对齐 libtv 风格）。
 *
 * 结构：
 * - 标题栏：#编号 + 图标 + 类型标签 + 标题 + 状态指示器 + hover操作按钮组
 * - 内容展示区：根据类型显示不同字段 + 专业 SVG 可视化
 * - 生成区：prompt 输入框 + 生成/重新生成按钮（根据状态变化）
 * - 四向 Handle：上下左右皆可连线
 * - 待生成状态时节点边框为虚线
 */
function ElementNodeImpl({ id: _id, data, selected }: ElementNodeProps) {
  const {
    element,
    onDoubleClick,
    onGenerate,
    generating,
    status,
    onDuplicate,
    onDelete,
    isFavorite,
    onToggleFavorite,
    index,
  } = data;
  const { color } = getElementVisuals(element, useUIStore((s) => s.iconMode));
  const showNodeFields = useUIStore((s) => s.showNodeFields);
  const title = getElementTitle(element);
  const typeLabel = getTypeLabel(element);
  // 英雄横幅：语义图标 + 维度图标
  const SemIcon = getSemanticIcon(element);
  const { DimIcon, dimLabel } = getDimensionVisuals(element);
  const subtypeLabel = getSubtypeLabel(element);
  const [prompt, setPrompt] = useState("");
  const [expanded, setExpanded] = useState(true);
  // loop-step 是否展开宫格（独立于内容展开状态）
  const [gridExpanded, setGridExpanded] = useState(true);

  const isLoopStep = element.type === "loop-step";
  const isLargeNode = isLoopStep && gridExpanded && expanded;

  // 状态指示器信息（如果 status 存在）
  const statusVisuals = status ? getStatusVisuals(status) : null;
  // 是否处于生成中状态（status 优先，回退到 generating prop）
  const isGenerating = status === "generating" || generating;
  // 是否已生成内容（用于按钮文案）
  const hasContent = status === "generated" || status === "edited";

  const handleGenerateClick = () => {
    onGenerate?.(element, prompt);
    setPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Cmd/Ctrl + Enter 触发生成
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleGenerateClick();
    }
  };

  // Handle 样式：对齐 libtv / React Flow 默认风格
  // 默认 8px 半透明，hover 节点时显示并放大，连线时清晰可见
  const handleBase =
    "!w-2 !h-2 !rounded-full !border !cursor-crosshair !z-50 transition-all duration-150 opacity-0 group-hover:opacity-100";
  const handleStyle = {
    backgroundColor: "rgba(163,230,53,0.6)",
    borderColor: "rgba(163,230,53,1)",
  };

  // 节点尺寸：loop-step 展开宫格时用大尺寸，否则用标准尺寸
  const nodeWidth = isLargeNode ? LOOP_STEP_EXPANDED_WIDTH : ELEMENT_NODE_WIDTH;
  const nodeMinHeight = isLargeNode ? LOOP_STEP_EXPANDED_HEIGHT : ELEMENT_NODE_HEIGHT;

  // 生成按钮文案和图标：根据状态变化
  const getButtonContent = () => {
    if (isGenerating) {
      return { icon: <Loader2 className="w-3 h-3 animate-spin" />, label: "生成中" };
    }
    if (hasContent) {
      return { icon: <RefreshCw className="w-3 h-3" />, label: "重新生成" };
    }
    return { icon: <Sparkles className="w-3 h-3" />, label: "生成" };
  };
  const buttonContent = getButtonContent();

  return (
    <div
      className={cn(
        "group relative rounded-xl border-2 frosted transition-all duration-200 flex flex-col overflow-hidden color-band-top",
        // 待生成状态时边框虚线，其他状态实线
        status === "pending" && "border-dashed",
        selected
          ? "shadow-selected"
          : "shadow-layered hover:shadow-hover hover:-translate-y-0.5"
      )}
      style={{
        width: nodeWidth,
        minHeight: nodeMinHeight,
        ["--band-color" as string]: color,
        // 非选中态：边框用节点色半透明描边，让相同颜色节点一眼可辨
        // 选中态：用 accent 色边框
        borderColor: selected
          ? "rgb(var(--color-accent) / 0.6)"
          : `${color}55`,
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(element);
      }}
    >
      {/* 四向连接点 —— 对齐 libtv：默认隐藏，hover 节点时显示 */}
      <Handle
        type="target"
        position={Position.Top}
        className={cn(handleBase, "hover:!w-3 hover:!h-3 hover:!bg-accent hover:!border-accent")}
        style={handleStyle}
        id="top"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        className={cn(handleBase, "hover:!w-3 hover:!h-3 hover:!bg-accent hover:!border-accent")}
        style={handleStyle}
        id="bottom"
      />
      <Handle
        type="target"
        position={Position.Left}
        className={cn(handleBase, "hover:!w-3 hover:!h-3 hover:!bg-accent hover:!border-accent")}
        style={handleStyle}
        id="left"
      />
      <Handle
        type="source"
        position={Position.Right}
        className={cn(handleBase, "hover:!w-3 hover:!h-3 hover:!bg-accent hover:!border-accent")}
        style={handleStyle}
        id="right"
      />

      {/* 标题栏：顶部色带已由 ::before 提供，此处用柔和底色 */}
      <div
        className="flex items-center gap-1.5 px-2.5 py-1.5 border-b border-line-subtle/40 bg-canvas-sunken/30 flex-shrink-0"
      >
        {/* 节点编号（对齐 libtv） */}
        {index !== undefined && (
          <span className="text-2xs text-ink-muted/60 font-mono flex-shrink-0">#{index}</span>
        )}
        <span
          className="text-2xs font-medium px-1 py-0.5 rounded flex-shrink-0"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {typeLabel}
        </span>
        <div className="flex-1 min-w-0 text-xs font-medium text-ink-primary truncate">
          {title || "未命名"}
        </div>
        {/* 状态指示器：小圆点（对齐 libtv 状态系统） */}
        {statusVisuals && (
          <div className="flex items-center gap-1 flex-shrink-0" title={statusVisuals.label}>
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                statusVisuals.pulse && "animate-pulse"
              )}
              style={{ backgroundColor: statusVisuals.color }}
            />
            <span className="text-2xs text-ink-muted">{statusVisuals.label}</span>
          </div>
        )}
        {/* hover 操作工具栏：复制、收藏、删除（对齐 libtv） */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          {onDuplicate && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate(element);
              }}
              className="p-0.5 rounded text-ink-muted hover:text-ink-primary hover:bg-canvas-sunken/80 transition-colors"
              title="复制"
              aria-label="复制"
            >
              <Copy className="w-3 h-3" />
            </button>
          )}
          {onToggleFavorite && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleFavorite(element);
              }}
              className="p-0.5 rounded hover:bg-canvas-sunken/80 transition-colors"
              title={isFavorite ? "取消收藏" : "收藏"}
              aria-label={isFavorite ? "取消收藏" : "收藏"}
            >
              <Star
                className={cn(
                  "w-3 h-3",
                  isFavorite ? "text-amber-400 fill-amber-400" : "text-ink-muted hover:text-ink-primary"
                )}
              />
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(element);
              }}
              className="p-0.5 rounded text-ink-muted hover:text-red-400 hover:bg-canvas-sunken/80 transition-colors"
              title="删除"
              aria-label="删除"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
        {/* loop-step 额外的宫格展开/折叠按钮 */}
        {isLoopStep && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setGridExpanded((v) => !v);
            }}
            className="text-ink-muted hover:text-accent transition-colors flex-shrink-0 text-2xs px-1"
            title={gridExpanded ? "折叠宫格" : "展开宫格"}
            aria-label={gridExpanded ? "折叠宫格" : "展开宫格"}
          >
            {gridExpanded ? "宫格" : "宫格"}
          </button>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded((v) => !v);
          }}
          className="text-ink-muted hover:text-ink-primary transition-colors flex-shrink-0"
          title={expanded ? "折叠" : "展开"}
          aria-label={expanded ? "折叠" : "展开"}
        >
          {expanded ? (
            <ChevronUp className="w-3.5 h-3.5" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {/* 内容展示区 */}
      {expanded && (
        <div className="flex-1 px-2.5 py-2 overflow-hidden min-h-0">
          {/* 英雄横幅：大图标块 + 子类型名 + 维度徽章（loop-step 展开宫格时不显示） */}
          {!(isLoopStep && gridExpanded) && (
            <HeroBanner
              color={color}
              SemIcon={SemIcon}
              DimIcon={DimIcon}
              subtypeLabel={subtypeLabel}
              dimLabel={dimLabel}
            />
          )}
          {/* loop-step 展开宫格时显示 StoryboardGrid，否则显示常规内容 */}
          {isLoopStep && gridExpanded ? (
            <StoryboardGrid element={element} />
          ) : (
            renderContent(element, showNodeFields)
          )}
        </div>
      )}

      {/* 生成区：prompt 输入框 + 生成/重新生成按钮 */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-t border-line-subtle/50 bg-canvas-sunken/40 flex-shrink-0">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          placeholder={getPromptPlaceholder(element)}
          disabled={isGenerating}
          className="flex-1 min-w-0 bg-canvas border border-line-subtle rounded px-2 py-1 text-2xs text-ink-primary placeholder:text-ink-muted/50 focus:outline-none focus:border-accent/50 disabled:opacity-50"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleGenerateClick();
          }}
          disabled={isGenerating}
          className="flex items-center gap-1 px-2 py-1 rounded bg-accent/15 text-accent text-2xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-50 flex-shrink-0"
          title="Cmd/Ctrl + Enter 快速生成"
        >
          {buttonContent.icon}
          {buttonContent.label}
        </button>
      </div>
    </div>
  );
}

export const ElementNode = memo(ElementNodeImpl);
