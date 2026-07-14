import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, LayoutGrid, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CanvasElement } from "@/types";
import { generateVariants, type VariantResult } from "@/services/aiService";
import { useGameplayStore } from "@/stores/gameplayStore";
import { useUIStore } from "@/stores/uiStore";

/** 宫格大小选项：4(2×2) / 9(3×3) / 16(4×4) / 25(5×5) */
type GridSize = 4 | 9 | 16 | 25;

const GRID_OPTIONS: { size: GridSize; label: string }[] = [
  { size: 4, label: "4宫格 (2×2)" },
  { size: 9, label: "9宫格 (3×3)" },
  { size: 16, label: "16宫格 (4×4)" },
  { size: 25, label: "25宫格 (5×5)" },
];

/** 根据宫格大小计算列数 */
function gridColumns(size: GridSize): number {
  return Math.sqrt(size);
}

/** localStorage 持久化 key */
function storageKey(elementKey: string): string {
  return `storyboard-grid-${elementKey}`;
}

interface GridState {
  size: GridSize;
  // 每个单元格存一个变体方案，null 表示未生成
  cells: (VariantResult | null)[];
}

function loadGridState(elementKey: string): GridState {
  try {
    const raw = localStorage.getItem(storageKey(elementKey));
    if (raw) {
      const parsed = JSON.parse(raw) as GridState;
      if (Array.isArray(parsed.cells) && typeof parsed.size === "number") {
        return parsed;
      }
    }
  } catch {
    // ignore
  }
  return { size: 4, cells: Array(4).fill(null) };
}

/** 根据情绪关键词返回彩色标签样式 */
function emotionColor(emotion: string): string {
  const e = emotion;
  if (/紧张|刺激|急迫|热血|兴奋/.test(e)) return "bg-red-500/15 text-red-400";
  if (/好奇|惊喜|神秘|困惑/.test(e)) return "bg-purple-500/15 text-purple-400";
  if (/专注|责任|沉重|纠结/.test(e)) return "bg-blue-500/15 text-blue-400";
  if (/满足|愉悦|自由/.test(e)) return "bg-green-500/15 text-green-400";
  if (/沉浸|协作/.test(e)) return "bg-amber-500/15 text-amber-400";
  return "bg-accent/15 text-accent";
}

export interface StoryboardGridProps {
  element: CanvasElement;
}

/**
 * 宫格切分组件（对齐 libtv storyboard 招牌功能）。
 *
 * 语义：为当前玩步（loop-step）生成多个变体方案。
 * - 支持 4/9/16/25 宫格切换
 * - 每个单元格是一个变体方案 { title, playerAction, emotion }
 * - 单击空格子生成单个变体；"全部生成" 批量填充所有空格子
 * - 点击已生成格子可选中，选中后可"应用此变体"写入 loop-step store
 * - 内容持久化到 localStorage
 */
export default function StoryboardGrid({ element }: StoryboardGridProps) {
  const [state, setState] = useState<GridState>(() => loadGridState(element.key));
  const [prompt, setPrompt] = useState("");
  // 正在生成的单元格索引集合
  const [generatingCells, setGeneratingCells] = useState<Set<number>>(new Set());
  // 当前选中的格子索引
  const [selectedCell, setSelectedCell] = useState<number | null>(null);

  // 应用变体到 store
  const updateStep = useGameplayStore((s) => s.updateStep);
  const addToast = useUIStore((s) => s.addToast);

  // 持久化
  useEffect(() => {
    try {
      localStorage.setItem(storageKey(element.key), JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, element.key]);

  // 切换宫格大小：扩展或截断 cells
  const handleSizeChange = useCallback((size: GridSize) => {
    setState((prev) => {
      const cells = [...prev.cells];
      if (cells.length < size) {
        cells.push(...Array(size - cells.length).fill(null));
      } else if (cells.length > size) {
        cells.length = size;
      }
      return { size, cells };
    });
    setSelectedCell(null);
  }, []);

  // 生成单个单元格：调用 generateVariants 生成 1 个变体
  const generateCell = useCallback(
    async (index: number) => {
      setGeneratingCells((prev) => {
        const next = new Set(prev);
        next.add(index);
        return next;
      });
      try {
        // prompt 包含"第 i 个变体方案"，符合任务要求
        const cellPrompt = prompt.trim()
          ? `${prompt.trim()}（第 ${index + 1} 个变体方案）`
          : `第 ${index + 1} 个变体方案`;
        const variants = await generateVariants(element, 1, cellPrompt);
        if (variants.length > 0) {
          setState((prev) => {
            const cells = [...prev.cells];
            cells[index] = variants[0];
            return { ...prev, cells };
          });
        }
      } catch (e) {
        console.error("宫格生成失败:", e);
      } finally {
        setGeneratingCells((prev) => {
          const next = new Set(prev);
          next.delete(index);
          return next;
        });
      }
    },
    [element, prompt]
  );

  // 批量生成所有空单元格：一次调用 generateVariants 获取多个变体
  const generateAll = useCallback(async () => {
    const emptyIndices: number[] = [];
    for (let i = 0; i < state.size; i++) {
      if (!state.cells[i]) emptyIndices.push(i);
    }
    if (emptyIndices.length === 0) return;

    setGeneratingCells((prev) => {
      const next = new Set(prev);
      emptyIndices.forEach((i) => next.add(i));
      return next;
    });

    try {
      const count = emptyIndices.length;
      const variants = await generateVariants(element, count, prompt);
      setState((prev) => {
        const cells = [...prev.cells];
        emptyIndices.forEach((idx, i) => {
          if (i < variants.length) {
            cells[idx] = variants[i];
          }
        });
        return { ...prev, cells };
      });
    } catch (e) {
      console.error("批量生成失败:", e);
    } finally {
      setGeneratingCells((prev) => {
        const next = new Set(prev);
        emptyIndices.forEach((i) => next.delete(i));
        return next;
      });
    }
  }, [state, element, prompt]);

  // 应用选中的变体到 loop-step store
  const applyVariant = useCallback(
    async (index: number) => {
      const variant = state.cells[index];
      if (!variant) return;
      // 仅 loop-step 支持应用变体
      if (element.type !== "loop-step") return;
      try {
        await updateStep(element.loopId, element.data.id, {
          label: variant.title,
          playerAction: variant.playerAction,
          emotion: variant.emotion,
        });
        addToast({ title: "已应用变体", description: variant.title, variant: "success" });
      } catch (e) {
        console.error("应用变体失败:", e);
        addToast({ title: "应用失败", variant: "error" });
      }
    },
    [state, element, updateStep, addToast]
  );

  const cols = gridColumns(state.size);
  const filledCount = useMemo(
    () => state.cells.slice(0, state.size).filter((c) => c !== null).length,
    [state]
  );
  const isFull = filledCount === state.size;
  const pendingCount = state.size - filledCount;
  const isBatchGenerating = generatingCells.size > 0;
  const selectedVariant = selectedCell !== null ? state.cells[selectedCell] : null;

  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {/* 工具栏：宫格切换 + 批量生成 */}
      <div className="flex items-center gap-1 flex-wrap">
        <LayoutGrid className="w-3 h-3 text-accent flex-shrink-0" />
        {GRID_OPTIONS.map((opt) => (
          <button
            key={opt.size}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSizeChange(opt.size);
            }}
            className={cn(
              "px-1.5 py-0.5 rounded text-2xs font-medium transition-colors",
              state.size === opt.size
                ? "bg-accent/20 text-accent"
                : "bg-canvas-sunken/60 text-ink-muted hover:text-ink-secondary"
            )}
          >
            {opt.size}
          </button>
        ))}
        <span className="text-2xs text-ink-muted ml-auto">
          {isBatchGenerating
            ? `${generatingCells.size} 生成中`
            : `${pendingCount} 待生成`}
        </span>
      </div>

      {/* 共享 prompt 输入 */}
      <div className="flex items-center gap-1">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          placeholder="输入 prompt，为玩步生成变体方案..."
          className="flex-1 min-w-0 bg-canvas border border-line-subtle rounded px-1.5 py-1 text-2xs text-ink-primary placeholder:text-ink-muted/50 focus:outline-none focus:border-accent/50"
        />
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void generateAll();
          }}
          disabled={isFull || isBatchGenerating}
          className="flex items-center gap-0.5 px-1.5 py-1 rounded bg-accent/15 text-accent text-2xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-40 flex-shrink-0"
        >
          {isBatchGenerating ? (
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
          ) : (
            <Sparkles className="w-2.5 h-2.5" />
          )}
          全部生成
        </button>
      </div>

      {/* 宫格区域 */}
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: state.size }, (_, i) => {
          const cell = state.cells[i] || null;
          const isCellGenerating = generatingCells.has(i);
          const isSelected = selectedCell === i;
          return (
            <div
              key={i}
              className={cn(
                "relative rounded border p-1 min-h-[60px] flex flex-col gap-0.5 transition-colors cursor-pointer",
                isSelected
                  ? "border-accent/60 bg-accent/10 ring-1 ring-accent/40"
                  : cell
                    ? "border-accent/20 bg-accent/5 hover:border-accent/40"
                    : "border-line-subtle bg-canvas-sunken/40 hover:border-accent/30"
              )}
              onClick={(e) => {
                e.stopPropagation();
                if (isCellGenerating) return;
                if (cell) {
                  // 点击已生成的格子：选中/取消选中
                  setSelectedCell((prev) => (prev === i ? null : i));
                } else {
                  // 点击空格子：生成
                  void generateCell(i);
                }
              }}
              title={cell ? cell.title : "点击生成"}
            >
              <div className="flex items-center justify-between">
                <span className="text-2xs text-ink-muted font-mono">{i + 1}</span>
                {isCellGenerating && (
                  <Loader2 className="w-2 h-2 animate-spin text-accent" />
                )}
              </div>
              {cell ? (
                <>
                  {/* 变体标题（粗体） */}
                  <div className="text-2xs font-semibold text-ink-primary line-clamp-1 leading-tight">
                    {cell.title}
                  </div>
                  {/* 玩家行动（小字） */}
                  <div className="text-2xs text-ink-muted line-clamp-2 leading-tight">
                    {cell.playerAction}
                  </div>
                  {/* 情绪标签（彩色小标签） */}
                  <span
                    className={cn(
                      "inline-block self-start text-2xs px-1 py-0.5 rounded mt-0.5",
                      emotionColor(cell.emotion)
                    )}
                  >
                    {cell.emotion}
                  </span>
                </>
              ) : (
                <div className="text-2xs text-ink-muted/50 leading-tight">
                  {isCellGenerating ? "生成中..." : "待生成"}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 选中变体的应用按钮 */}
      {selectedVariant && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void applyVariant(selectedCell!);
          }}
          className="flex items-center justify-center gap-1 px-2 py-1 rounded bg-accent/20 text-accent text-2xs font-medium hover:bg-accent/30 transition-colors"
        >
          <Check className="w-3 h-3" />
          应用此变体：{selectedVariant.title}
        </button>
      )}

      {/* 宫格满提示 */}
      {isFull && selectedCell === null && (
        <div className="text-2xs text-amber-400/80 text-center">
          分镜宫格已满，点击格子选中后可应用变体
        </div>
      )}
    </div>
  );
}
