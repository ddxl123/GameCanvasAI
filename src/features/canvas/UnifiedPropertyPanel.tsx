import { MousePointerClick, Flame, ScrollText, Trash2, Repeat } from "lucide-react";
import { useGameplayStore } from "@/stores/gameplayStore";
import { useRuleStore } from "@/stores/ruleStore";
import { cn } from "@/lib/utils";
import StepEditor from "@/features/gameplay/StepEditor";
import NodePropertyPanel from "@/features/mechanism/NodePropertyPanel";
import LevelNodeEditor from "@/features/level/LevelNodeEditor";
import FormulaEditor from "@/features/numeric/FormulaEditor";
import type { CanvasElement, CoreLoop, GameMoment, GameRule } from "@/types";

interface UnifiedPropertyPanelProps {
  selectedElement: CanvasElement | null;
}

export default function UnifiedPropertyPanel({
  selectedElement,
}: UnifiedPropertyPanelProps) {
  if (!selectedElement) {
    return (
      <div className="text-center py-10">
        <MousePointerClick
          className="w-7 h-7 text-ink-muted mx-auto mb-2"
          strokeWidth={1.3}
        />
        <p className="text-xs text-ink-secondary mb-1">未选中元素</p>
        <p className="text-2xs text-ink-muted">选中画布上的元素进行编辑</p>
      </div>
    );
  }

  switch (selectedElement.type) {
    case "core-loop":
      return <CoreLoopEditor element={selectedElement} />;
    case "loop-step":
      return <StepEditor loopId={selectedElement.loopId} />;
    case "moment":
      return <MomentEditor element={selectedElement} />;
    case "node":
      return <NodePropertyPanel />;
    case "rule":
      return <RuleEditor element={selectedElement} />;
    case "level-node":
      return <LevelNodeEditor />;
    case "attribute":
      return <FormulaEditor />;
  }
}

// ===== 核心循环编辑器 =====

const LOOP_TYPE_LABELS: Record<CoreLoop["loopType"], string> = {
  core: "核心循环",
  secondary: "次要循环",
  meta: "元循环",
};

function CoreLoopEditor({ element }: { element: Extract<CanvasElement, { type: "core-loop" }> }) {
  const updateLoop = useGameplayStore((s) => s.updateLoop);
  const deleteLoop = useGameplayStore((s) => s.deleteLoop);
  const selectLoop = useGameplayStore((s) => s.selectLoop);

  const loop = element.data;

  const handleChange = (patch: Partial<CoreLoop>) => {
    void updateLoop(loop.id, patch);
  };

  const handleDelete = () => {
    void deleteLoop(loop.id);
    selectLoop(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: "#8B5CF620" }}
        >
          <Repeat className="w-4 h-4" style={{ color: "#8B5CF6" }} />
        </div>
        <div className="text-sm font-medium text-ink-primary">核心循环</div>
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          名称
        </label>
        <input
          type="text"
          value={loop.name}
          onChange={(e) => handleChange({ name: e.target.value })}
          className="input-field text-sm"
        />
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          类型
        </label>
        <div className="text-sm text-ink-secondary px-3 py-2 rounded-md bg-canvas-sunken/40">
          {LOOP_TYPE_LABELS[loop.loopType]}
        </div>
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          描述
        </label>
        <textarea
          value={loop.description}
          onChange={(e) => handleChange({ description: e.target.value })}
          rows={4}
          className="input-field text-sm resize-none"
          placeholder="描述这个循环的核心玩法..."
        />
      </div>

      <div className="text-2xs text-ink-muted px-2 py-1.5 rounded bg-canvas-sunken/30">
        共 {loop.steps.length} 个玩步
      </div>

      <button
        onClick={handleDelete}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-danger/40 text-danger text-sm hover:bg-danger/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        删除循环
      </button>
    </div>
  );
}

// ===== 高光时刻编辑器 =====

function MomentEditor({ element }: { element: Extract<CanvasElement, { type: "moment" }> }) {
  const updateMoment = useGameplayStore((s) => s.updateMoment);
  const deleteMoment = useGameplayStore((s) => s.deleteMoment);
  const setSelectedMoment = useGameplayStore((s) => s.setSelectedMoment);

  const moment = element.data;

  const handleChange = (patch: Partial<GameMoment>) => {
    void updateMoment(moment.id, patch);
  };

  const handleDelete = () => {
    void deleteMoment(moment.id);
    setSelectedMoment(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: "#F59E0B20" }}
        >
          <Flame className="w-4 h-4" style={{ color: "#F59E0B" }} />
        </div>
        <div className="text-sm font-medium text-ink-primary">高光时刻</div>
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          标题
        </label>
        <input
          type="text"
          value={moment.title}
          onChange={(e) => handleChange({ title: e.target.value })}
          className="input-field text-sm"
        />
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          描述
        </label>
        <textarea
          value={moment.description}
          onChange={(e) => handleChange({ description: e.target.value })}
          rows={3}
          className="input-field text-sm resize-none"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
            情绪强度
          </label>
          <span className="text-xs font-mono text-amber-400">{moment.emotion} / 10</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={moment.emotion}
          onChange={(e) => handleChange({ emotion: Number(e.target.value) })}
          className="w-full accent-amber-400"
        />
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          情绪标签
        </label>
        <input
          type="text"
          value={moment.emotionLabel}
          onChange={(e) => handleChange({ emotionLabel: e.target.value })}
          placeholder="如：成就感 / 紧张 / 惊喜"
          className="input-field text-sm"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
            时机（游戏进度 %）
          </label>
          <span className="text-xs font-mono text-accent">{moment.timing}%</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={moment.timing}
          onChange={(e) => handleChange({ timing: Number(e.target.value) })}
          className="w-full accent-lime-400"
        />
      </div>

      <button
        onClick={handleDelete}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-danger/40 text-danger text-sm hover:bg-danger/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        删除时刻
      </button>
    </div>
  );
}

// ===== 规则编辑器 =====

function RuleEditor({ element }: { element: Extract<CanvasElement, { type: "rule" }> }) {
  const updateRule = useRuleStore((s) => s.updateRule);
  const deleteRule = useRuleStore((s) => s.deleteRule);

  const rule = element.data;

  const handleChange = (patch: Partial<GameRule>) => {
    void updateRule(rule.id, patch);
  };

  const handleDelete = () => {
    void deleteRule(rule.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ backgroundColor: "#F59E0B20" }}
        >
          <ScrollText className="w-4 h-4" style={{ color: "#F59E0B" }} />
        </div>
        <div className="text-sm font-medium text-ink-primary">规则</div>
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          标题
        </label>
        <input
          type="text"
          value={rule.title}
          onChange={(e) => handleChange({ title: e.target.value })}
          className="input-field text-sm"
        />
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          IF 条件
        </label>
        <textarea
          value={rule.condition}
          onChange={(e) => handleChange({ condition: e.target.value })}
          rows={2}
          className="input-field text-sm resize-none font-mono"
        />
      </div>

      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          THEN 动作
        </label>
        <textarea
          value={rule.action}
          onChange={(e) => handleChange({ action: e.target.value })}
          rows={2}
          className="input-field text-sm resize-none font-mono"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
            优先级
          </label>
          <span className="text-xs font-mono text-accent">{rule.priority}</span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={rule.priority}
          onChange={(e) => handleChange({ priority: Number(e.target.value) })}
          className="w-full accent-lime-400"
        />
      </div>

      <label className="flex items-center justify-between cursor-pointer">
        <span className="text-xs text-ink-secondary">启用此规则</span>
        <button
          type="button"
          onClick={() => handleChange({ enabled: !rule.enabled })}
          className={cn(
            "relative w-9 h-5 rounded-full transition-colors",
            rule.enabled ? "bg-accent" : "bg-line-strong"
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
              rule.enabled ? "translate-x-4" : "translate-x-0.5"
            )}
          />
        </button>
      </label>

      <button
        onClick={handleDelete}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-danger/40 text-danger text-sm hover:bg-danger/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        删除规则
      </button>
    </div>
  );
}

export { UnifiedPropertyPanel };
