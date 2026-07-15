import {
  RefreshCw,
  Flame,
  Network,
  ScrollText,
  GitBranch,
  Calculator,
  Plus,
  Repeat,
  Layers,
  ChevronRight,
  Search,
  X,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/uiStore";
import type { CanvasElementType, NodeType } from "@/types";
import { NODE_LIBRARY_BY_GAMEPLAY, getNodeIcon } from "@/features/mechanism/nodeTypes";
import { DRAG_DATA_KEY } from "./ReactFlowCanvas";

interface CreateToolItem {
  type: CanvasElementType;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  /** node 子类型（仅 type="node" 时有效） */
  nodeSubtype?: NodeType;
}

interface CreateToolGroup {
  label: string;
  /** 维度色（用于分组标题左侧色条），缺省用 accent */
  accent?: string;
  items: CreateToolItem[];
}

/** 维度 → 主题色映射（玩法设计师视角分组，与 ElementNode DIMENSION_COLOR_MAP 风格对齐） */
const DIMENSION_ACCENT: Record<string, string> = {
  "战斗系统": "#EF4444",
  "成长系统": "#10B981",
  "经济系统": "#F59E0B",
  "任务与叙事": "#6366F1",
  "关卡与探索": "#06B6D4",
  "表现层": "#A855F7",
  "辅助": "#FDE047",
};

/** 核心元素分组（始终显示） */
const CORE_GROUPS: CreateToolGroup[] = [
  {
    label: "核心玩法",
    accent: "#8B5CF6",
    items: [
      { type: "core-loop", label: "核心循环", description: "游戏的顶层玩法循环", icon: Repeat, color: "#8B5CF6" },
      { type: "loop-step", label: "玩步·宫格", description: "循环中的每一步（支持宫格）", icon: RefreshCw, color: "#A3E635" },
      { type: "moment", label: "高光时刻", description: "标注玩家的情绪高峰", icon: Flame, color: "#F59E0B" },
    ],
  },
  {
    label: "规则与关卡",
    accent: "#EF4444",
    items: [
      { type: "rule", label: "规则", description: "IF-THEN 条件规则", icon: ScrollText, color: "#F59E0B" },
      { type: "level-node", label: "关卡节点", description: "一个关卡/Boss/过场", icon: GitBranch, color: "#EF4444" },
    ],
  },
  {
    label: "数值",
    accent: "#10B981",
    items: [
      { type: "attribute", label: "属性", description: "一个数值属性（HP/攻击力等）", icon: Calculator, color: "#10B981" },
    ],
  },
];

/** 机制节点按维度展开：从 NODE_LIBRARY_BY_GAMEPLAY 构建分组 */
function buildDimensionGroups(): CreateToolGroup[] {
  return NODE_LIBRARY_BY_GAMEPLAY.map((libGroup) => ({
    label: libGroup.category,
    accent: DIMENSION_ACCENT[libGroup.category] || "#A3E635",
    items: libGroup.types.map((meta) => {
      const Icon = getNodeIcon(meta.type);
      return {
        type: "node" as const,
        nodeSubtype: meta.type,
        label: meta.label,
        description: meta.description,
        icon: (Icon as LucideIcon) || Network,
        color: meta.color,
      };
    }),
  }));
}

export default function CreateToolbar() {
  const requestCanvasCreate = useUIStore((s) => s.requestCanvasCreate);
  // 折叠状态：默认核心分组展开，维度分组全部折叠
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    () => new Set(NODE_LIBRARY_BY_GAMEPLAY.map((g) => g.category))
  );
  // 搜索关键字：非空时强制展开所有匹配的分组
  const [query, setQuery] = useState("");

  const toggleGroup = (label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleDragStart = (
    event: React.DragEvent,
    type: CanvasElementType,
    nodeSubtype?: NodeType
  ) => {
    event.dataTransfer.setData(DRAG_DATA_KEY, type);
    if (nodeSubtype) {
      event.dataTransfer.setData(`${DRAG_DATA_KEY}-subtype`, nodeSubtype);
    }
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleClick = (type: CanvasElementType, nodeSubtype?: NodeType) => {
    requestCanvasCreate(type, nodeSubtype);
  };

  const dimensionGroups = useMemo(() => buildDimensionGroups(), []);

  // 搜索过滤：匹配 label 或 description
  const filterItem = (item: CreateToolItem, q: string) => {
    if (!q) return true;
    const lower = q.toLowerCase();
    return (
      item.label.toLowerCase().includes(lower) ||
      item.description.toLowerCase().includes(lower) ||
      (item.nodeSubtype ?? "").toLowerCase().includes(lower)
    );
  };

  // 搜索时所有分组强制展开
  const isSearching = query.trim().length > 0;

  // 渲染单个创建项
  const renderItem = (item: CreateToolItem) => {
    const Icon = item.icon;
    return (
      <div
        key={`${item.type}-${item.nodeSubtype ?? "default"}`}
        draggable
        onDragStart={(e) => handleDragStart(e, item.type, item.nodeSubtype)}
        onClick={() => handleClick(item.type, item.nodeSubtype)}
        className={cn(
          "group relative w-full flex items-start gap-2 pl-2.5 pr-2 py-1.5 rounded-md text-left transition-all cursor-grab active:cursor-grabbing overflow-hidden",
          "bg-canvas-elevated/30 hover:bg-canvas-sunken/60",
          "hover:shadow-card hover:-translate-y-0.5"
        )}
      >
        {/* 左侧色条：节点色半透明，hover 时加亮 */}
        <span
          className="absolute left-0 top-1 bottom-1 w-[3px] rounded-full transition-opacity opacity-40 group-hover:opacity-100"
          style={{ backgroundColor: item.color }}
        />
        <div
          className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ backgroundColor: `${item.color}15` }}
        >
          <Icon
            className="w-3.5 h-3.5 transition-transform group-hover:scale-110"
            style={{ color: item.color }}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-2xs font-medium text-ink-primary">{item.label}</div>
          <div className="text-3xs text-ink-muted truncate mt-0.5">{item.description}</div>
        </div>
      </div>
    );
  };

  // 渲染可折叠分组
  const renderGroup = (group: CreateToolGroup) => {
    const filteredItems = isSearching
      ? group.items.filter((it) => filterItem(it, query))
      : group.items;
    if (isSearching && filteredItems.length === 0) return null;
    const collapsed = !isSearching && collapsedGroups.has(group.label);
    const accent = group.accent || "#A3E635";
    return (
      <div key={group.label} className="space-y-1">
        <button
          type="button"
          onClick={() => toggleGroup(group.label)}
          className={cn(
            "w-full flex items-center gap-1.5 px-1.5 py-1 rounded-md text-2xs font-semibold uppercase tracking-wider transition-colors",
            "hover:bg-canvas-sunken/40"
          )}
        >
          {/* 维度色条 */}
          <span
            className="w-1 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: accent }}
          />
          <ChevronRight
            className={cn(
              "w-3 h-3 text-ink-muted transition-transform flex-shrink-0",
              !collapsed && "rotate-90"
            )}
          />
          <span className="text-ink-secondary">{group.label}</span>
          <span className="ml-auto text-3xs text-ink-muted/60 normal-case tracking-normal font-normal">
            {filteredItems.length}
          </span>
        </button>
        {!collapsed && (
          <div className="space-y-1 pl-1">
            {filteredItems.map(renderItem)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* 顶部标题 + 搜索 */}
      <div className="space-y-2 px-1">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded flex items-center justify-center bg-accent/15">
            <Plus className="w-3 h-3 text-accent" />
          </div>
          <span className="text-2xs font-semibold text-ink-primary uppercase tracking-wider">
            创建设计元素
          </span>
        </div>
        {/* 搜索框 */}
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索节点..."
            className={cn(
              "w-full pl-7 pr-6 py-1.5 rounded-md text-2xs",
              "bg-canvas-sunken/50 border border-line-subtle/60",
              "text-ink-primary placeholder:text-ink-muted/60",
              "focus:outline-none focus:border-accent/50 focus:bg-canvas-sunken/80",
              "transition-colors"
            )}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <div className="text-3xs text-ink-muted/60">
          拖拽到画布或点击在中心创建
        </div>
      </div>

      {/* 核心元素分区 */}
      <div className="space-y-1.5 rounded-lg border border-line-subtle/40 bg-canvas-sunken/20 p-2">
        <div className="flex items-center gap-1.5 px-1">
          <Flame className="w-3 h-3 text-accent/70" />
          <span className="text-3xs font-semibold text-ink-secondary uppercase tracking-wider">
            核心元素
          </span>
        </div>
        {CORE_GROUPS.map(renderGroup)}
      </div>

      {/* 机制节点分区 */}
      <div className="space-y-1.5 rounded-lg border border-line-subtle/40 bg-canvas-sunken/20 p-2">
        <div className="flex items-center gap-1.5 px-1">
          <Layers className="w-3 h-3 text-accent/70" />
          <span className="text-3xs font-semibold text-ink-secondary uppercase tracking-wider">
            机制节点（按玩法）
          </span>
        </div>
        {dimensionGroups.map(renderGroup)}
      </div>
    </div>
  );
}

export { CreateToolbar };
