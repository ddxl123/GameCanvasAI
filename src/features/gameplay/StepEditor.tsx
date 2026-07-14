import { useRef } from "react";
import { useGameplayStore } from "@/stores/gameplayStore";
import { useGsapFlip } from "@/hooks/useGsap";
import { cn } from "@/lib/utils";
import { Trash2, ChevronUp, ChevronDown, MousePointerClick } from "lucide-react";
import type { LoopStep } from "@/types";

// 预设 8 色
const PRESET_COLORS = [
  "#A3E635", // 青柠（accent）
  "#60A5FA", // 蓝
  "#C084FC", // 紫
  "#FB7185", // 粉红
  "#FB923C", // 橙
  "#FBBF24", // 黄
  "#34D399", // 绿
  "#94A3B8", // 灰
];

interface StepEditorProps {
  loopId: string | null;
}

export default function StepEditor({ loopId }: StepEditorProps) {
  const {
    loops,
    selectedStepId,
    updateStep,
    removeStep,
    reorderSteps,
    setSelectedStep,
  } = useGameplayStore();
  const rootRef = useRef<HTMLDivElement>(null);

  const loop = loops.find((l) => l.id === loopId);
  const step: LoopStep | undefined = loop?.steps.find(
    (s) => s.id === selectedStepId
  );

  // 切换选中步骤时 3D 翻转
  useGsapFlip(rootRef, selectedStepId);

  if (!loopId || !loop) {
    return (
      <div className="text-center py-8">
        <MousePointerClick className="w-6 h-6 text-ink-muted mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-xs text-ink-muted">
          选择一个循环后，点击节点编辑
        </p>
      </div>
    );
  }

  if (!step) {
    return (
      <div ref={rootRef} className="text-center py-8">
        <MousePointerClick className="w-6 h-6 text-ink-muted mx-auto mb-2" strokeWidth={1.5} />
        <p className="text-xs text-ink-secondary mb-1">
          未选中玩步
        </p>
        <p className="text-2xs text-ink-muted">
          点击画布上的节点来编辑
        </p>
      </div>
    );
  }

  const stepIndex = loop.steps.findIndex((s) => s.id === step.id);
  const total = loop.steps.length;

  const handleLabelChange = (label: string) => {
    void updateStep(loopId, step.id, { label });
  };
  const handleActionChange = (playerAction: string) => {
    void updateStep(loopId, step.id, { playerAction });
  };
  const handleEmotionChange = (emotion: string) => {
    void updateStep(loopId, step.id, { emotion });
  };
  const handleColorChange = (color: string) => {
    void updateStep(loopId, step.id, { color });
  };

  const handleMoveUp = () => {
    if (stepIndex > 0) void reorderSteps(loopId, stepIndex, stepIndex - 1);
  };
  const handleMoveDown = () => {
    if (stepIndex < total - 1)
      void reorderSteps(loopId, stepIndex, stepIndex + 1);
  };
  const handleDelete = () => {
    void removeStep(loopId, step.id);
  };

  return (
    <div ref={rootRef} className="space-y-4">
      {/* 步骤序号 */}
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-semibold flex-shrink-0"
          style={{
            backgroundColor: `${step.color}20`,
            color: step.color,
          }}
        >
          {stepIndex + 1}
        </div>
        <div className="text-2xs text-ink-muted">
          第 {stepIndex + 1} / {total} 步
        </div>
      </div>

      {/* 标签 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          标签
        </label>
        <input
          type="text"
          value={step.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="玩步标签..."
          className="input-field text-sm"
        />
      </div>

      {/* 玩家动作 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          玩家动作
        </label>
        <textarea
          value={step.playerAction}
          onChange={(e) => handleActionChange(e.target.value)}
          placeholder="描述玩家在这个阶段做什么，如：探索地图寻找资源"
          rows={3}
          className="input-field text-sm resize-none"
        />
      </div>

      {/* 情绪 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          情绪标签
        </label>
        <input
          type="text"
          value={step.emotion}
          onChange={(e) => handleEmotionChange(e.target.value)}
          placeholder="如：成就感 / 紧张感 / 好奇"
          className="input-field text-sm"
        />
      </div>

      {/* 颜色选择器 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          节点颜色
        </label>
        <div className="flex items-center gap-1.5 flex-wrap">
          {PRESET_COLORS.map((color) => {
            const active = step.color === color;
            return (
              <button
                key={color}
                type="button"
                title={color}
                onClick={() => handleColorChange(color)}
                className={cn(
                  "w-6 h-6 rounded-md transition-all border-2",
                  active
                    ? "border-white scale-110"
                    : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: color }}
              />
            );
          })}
        </div>
      </div>

      <div className="border-t border-line-subtle pt-3" />

      {/* 上移/下移 */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={handleMoveUp}
          disabled={stepIndex === 0}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-line text-2xs text-ink-secondary hover:bg-canvas-sunken transition-colors",
            stepIndex === 0 && "opacity-40 cursor-not-allowed hover:bg-transparent"
          )}
        >
          <ChevronUp className="w-3.5 h-3.5" />
          上移
        </button>
        <button
          onClick={handleMoveDown}
          disabled={stepIndex === total - 1}
          className={cn(
            "flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-line text-2xs text-ink-secondary hover:bg-canvas-sunken transition-colors",
            stepIndex === total - 1 && "opacity-40 cursor-not-allowed hover:bg-transparent"
          )}
        >
          <ChevronDown className="w-3.5 h-3.5" />
          下移
        </button>
      </div>

      {/* 删除 */}
      <button
        onClick={handleDelete}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-danger/40 text-danger text-sm hover:bg-danger/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        删除玩步
      </button>

      {/* 取消选中 */}
      <button
        onClick={() => setSelectedStep(null)}
        className="w-full text-2xs text-ink-muted hover:text-ink-secondary transition-colors"
      >
        取消选中
      </button>
    </div>
  );
}
