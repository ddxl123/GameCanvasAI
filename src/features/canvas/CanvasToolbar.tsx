import { Maximize, Minus, Plus, RotateCcw, LayoutGrid, Layers, Target, ListTree } from "lucide-react";
import type { ReactNode } from "react";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";

interface CanvasToolbarProps {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitView: () => void;
  onResetLayout: () => void;
  onAutoLayout: () => void;
}

/** 工具栏按钮内的快捷键标签 */
function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="font-mono text-2xs text-ink-muted/70 leading-none">
      {children}
    </kbd>
  );
}

export default function CanvasToolbar({
  zoom,
  onZoomIn,
  onZoomOut,
  onFitView,
  onResetLayout,
  onAutoLayout,
}: CanvasToolbarProps) {
  const iconMode = useUIStore((s) => s.iconMode);
  const toggleIconMode = useUIStore((s) => s.toggleIconMode);
  const showNodeFields = useUIStore((s) => s.showNodeFields);
  const toggleShowNodeFields = useUIStore((s) => s.toggleShowNodeFields);

  // 按钮改为纵向排列图标+kbd，高度略增至 h-9 容纳两行
  const btnClass =
    "flex flex-col items-center justify-center gap-0.5 w-8 h-9 rounded-md text-ink-secondary hover:text-ink-primary hover:bg-canvas-sunken/60 transition-colors";

  return (
    <div className="absolute bottom-4 right-4 z-50 flex items-center gap-1 px-2 py-1.5 rounded-xl border border-line-subtle frosted-panel shadow-layered">
      <button onClick={onZoomOut} className={btnClass} title="缩小 (-)" aria-label="缩小 (-)">
        <Minus className="w-3.5 h-3.5" />
        <Kbd>-</Kbd>
      </button>

      <span className="text-2xs text-ink-muted min-w-[3rem] text-center font-mono">
        {Math.round(zoom * 100)}%
      </span>

      <button onClick={onZoomIn} className={btnClass} title="放大 (=)" aria-label="放大 (=)">
        <Plus className="w-3.5 h-3.5" />
        <Kbd>=</Kbd>
      </button>

      <div className="w-px h-5 bg-line-subtle mx-0.5" />

      <button onClick={onFitView} className={btnClass} title="适应视图 (0)" aria-label="适应视图 (0)">
        <Maximize className="w-3.5 h-3.5" />
        <Kbd>0</Kbd>
      </button>

      <button onClick={onAutoLayout} className={btnClass} title="自动布局 (Shift+A)" aria-label="自动布局 (Shift+A)">
        <LayoutGrid className="w-3.5 h-3.5" />
        <Kbd>⇧A</Kbd>
      </button>

      <button onClick={onResetLayout} className={btnClass} title="重置布局 (Shift+R)" aria-label="重置布局 (Shift+R)">
        <RotateCcw className="w-3.5 h-3.5" />
        <Kbd>⇧R</Kbd>
      </button>

      <div className="w-px h-5 bg-line-subtle mx-0.5" />

      {/* 图标模式切换：语义图标 / 维度图标 为核心视觉 */}
      <button
        onClick={toggleIconMode}
        className={cn(
          btnClass,
          iconMode === "semantic" ? "text-accent" : "text-accent"
        )}
        title={
          iconMode === "semantic"
            ? "当前：语义图标为核心（点击切换为维度图标）"
            : "当前：维度图标为核心（点击切换为语义图标）"
        }
        aria-label="切换节点图标模式"
      >
        {iconMode === "semantic" ? (
          <Target className="w-3.5 h-3.5" />
        ) : (
          <Layers className="w-3.5 h-3.5" />
        )}
        <Kbd>{iconMode === "semantic" ? "语义" : "维度"}</Kbd>
      </button>

      {/* 玩法属性显示开关：控制所有节点卡片内是否展示已设置的玩法属性 */}
      <button
        onClick={toggleShowNodeFields}
        className={cn(btnClass, showNodeFields && "text-accent")}
        title={
          showNodeFields
            ? "当前：显示玩法属性（点击隐藏全部节点的玩法属性）"
            : "当前：隐藏玩法属性（点击显示全部节点的玩法属性）"
        }
        aria-label="切换玩法属性显示"
      >
        <ListTree className="w-3.5 h-3.5" />
        <Kbd>{showNodeFields ? "显字" : "隐字"}</Kbd>
      </button>
    </div>
  );
}

export { CanvasToolbar };
