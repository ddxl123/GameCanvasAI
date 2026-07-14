import { useLevelStore } from "@/stores/levelStore";
import { cn } from "@/lib/utils";
import { Trash2, Flag } from "lucide-react";
import {
  LEVEL_NODE_TYPE_META,
  LEVEL_NODE_TYPES,
} from "./levelNodeTypes";
import type { LevelNodeType } from "@/types";

// 难度滑块刻度颜色
function difficultyColor(d: number): string {
  if (d <= 3) return "#34D399";
  if (d <= 6) return "#FBBF24";
  if (d <= 8) return "#FB923C";
  return "#F87171";
}

export default function LevelNodeEditor() {
  const {
    flows,
    currentFlowId,
    selectedNodeId,
    updateNode,
    removeNode,
  } = useLevelStore();

  const flow = flows.find((f) => f.id === currentFlowId);
  const node = flow?.nodes.find((n) => n.id === selectedNodeId);

  if (!node || !currentFlowId) {
    return (
      <div className="text-center py-10">
        <Flag className="w-7 h-7 text-ink-muted mx-auto mb-2" strokeWidth={1.3} />
        <p className="text-xs text-ink-secondary mb-1">未选中关卡节点</p>
        <p className="text-2xs text-ink-muted">
          在画布中点击一个节点后，此处可编辑其属性
        </p>
      </div>
    );
  }

  const meta = LEVEL_NODE_TYPE_META[node.type];
  const Icon = meta.icon;

  const handleLabelChange = (label: string) => {
    void updateNode(currentFlowId, node.id, { label });
  };
  const handleTypeChange = (type: LevelNodeType) => {
    void updateNode(currentFlowId, node.id, { type });
  };
  const handleDifficultyChange = (difficulty: number) => {
    void updateNode(currentFlowId, node.id, { difficulty });
  };
  const handleDurationChange = (duration: number) => {
    void updateNode(currentFlowId, node.id, { duration });
  };
  const handleDescriptionChange = (description: string) => {
    void updateNode(currentFlowId, node.id, { description });
  };
  const handleGatesChange = (text: string) => {
    const gates = text
      .split("\n")
      .map((g) => g.trim())
      .filter((g) => g.length > 0);
    void updateNode(currentFlowId, node.id, { gates });
  };
  const handleDelete = () => {
    void removeNode(currentFlowId, node.id);
  };

  return (
    <div className="space-y-4">
      {/* 节点类型信息 */}
      <div className="p-3 rounded-lg bg-canvas-sunken border border-line">
        <div className="flex items-center gap-2 mb-1">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ backgroundColor: `${meta.color}20` }}
          >
            <Icon className="w-4 h-4" style={{ color: meta.color }} />
          </div>
          <div>
            <div className="text-sm font-medium text-ink-primary">
              {meta.label}
            </div>
            <div className="text-2xs text-ink-muted">{meta.description}</div>
          </div>
        </div>
      </div>

      {/* 名称 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          名称
        </label>
        <input
          type="text"
          value={node.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="输入节点名称..."
          className="input-field text-sm"
        />
      </div>

      {/* 类型 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          类型
        </label>
        <div className="grid grid-cols-4 gap-1">
          {LEVEL_NODE_TYPES.map((t) => {
            const m = LEVEL_NODE_TYPE_META[t];
            const TIcon = m.icon;
            const active = node.type === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => handleTypeChange(t)}
                title={m.label}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-1.5 rounded-md border text-2xs transition-colors",
                  active
                    ? "border-transparent text-white shadow-sm"
                    : "border-line text-ink-muted hover:text-ink-secondary hover:border-line-strong bg-canvas-sunken"
                )}
                style={active ? { backgroundColor: m.color } : undefined}
              >
                <TIcon size={13} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* 难度 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
            难度
          </label>
          <span
            className="text-xs font-semibold tabular-nums"
            style={{ color: difficultyColor(node.difficulty) }}
          >
            {node.difficulty} / 10
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={node.difficulty}
          onChange={(e) => handleDifficultyChange(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, ${difficultyColor(
              node.difficulty
            )} ${(node.difficulty / 10) * 100}%, rgba(255,255,255,0.1) ${
              (node.difficulty / 10) * 100
            }%)`,
          }}
        />
        <div className="flex justify-between mt-1 text-2xs text-ink-muted">
          <span>简单</span>
          <span>普通</span>
          <span>困难</span>
        </div>
      </div>

      {/* 时长 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          时长（分钟）
        </label>
        <input
          type="number"
          min={0}
          value={node.duration}
          onChange={(e) =>
            handleDurationChange(Math.max(0, Number(e.target.value) || 0))
          }
          className="input-field text-sm"
        />
      </div>

      {/* 描述 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          描述
        </label>
        <textarea
          value={node.description}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="描述这个关卡的内容与目标..."
          rows={3}
          className="input-field text-sm resize-none"
        />
      </div>

      {/* 门控条件 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          门控条件
          <span className="normal-case font-normal ml-1 text-ink-muted/70">
            （每行一个）
          </span>
        </label>
        <textarea
          value={node.gates.join("\n")}
          onChange={(e) => handleGatesChange(e.target.value)}
          placeholder={"如：通关第 2 关\n持有钥匙 x1"}
          rows={3}
          className="input-field text-sm resize-none font-mono"
        />
        {node.gates.length > 0 && (
          <p className="text-2xs text-ink-muted mt-1">
            共 {node.gates.length} 个门控条件
          </p>
        )}
      </div>

      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-danger/40 text-danger text-sm hover:bg-danger/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        删除节点
      </button>
    </div>
  );
}
