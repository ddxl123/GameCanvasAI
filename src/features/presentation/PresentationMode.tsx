import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Play,
  Pause,
  Network,
  TrendingUp,
  FileText,
  Hash,
} from "lucide-react";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useProjectStore } from "@/stores/projectStore";
import { useGsapEntrance, useGsapFadeSwitch } from "@/hooks/useGsap";
import { NODE_TYPE_META, getNodeIcon } from "@/features/mechanism/nodeTypes";
import { generateCurveData } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { GraphNode, Attribute, DocSection, NodeType } from "@/types";

type PresentationMode = "mechanism" | "numeric" | "gdd";

const MODE_CONFIG: Record<
  PresentationMode,
  { label: string; icon: typeof Network }
> = {
  mechanism: { label: "机制图", icon: Network },
  numeric: { label: "数值曲线", icon: TrendingUp },
  gdd: { label: "GDD 文档", icon: FileText },
};

const MODE_ORDER: PresentationMode[] = ["mechanism", "numeric", "gdd"];

// 数值曲线 X 轴范围
const CURVE_RANGE = { start: 1, end: 50, step: 1 };
const CURVE_VARIABLE = "等级";

// 自动播放间隔预设
const INTERVAL_PRESETS = [
  { label: "2s", value: 2000 },
  { label: "3s", value: 3000 },
  { label: "5s", value: 5000 },
  { label: "8s", value: 8000 },
];

interface PresentationModeProps {
  open: boolean;
  onClose: () => void;
}

export default function PresentationMode({
  open,
  onClose,
}: PresentationModeProps) {
  const nodes = useMechanismStore((s) => s.nodes);
  const currentGraphId = useMechanismStore((s) => s.currentGraphId);
  const graphs = useMechanismStore((s) => s.graphs);

  const attributes = useNumericStore((s) => s.attributes);
  const formulas = useNumericStore((s) => s.formulas);

  const sections = useDocumentStore((s) => s.sections);
  const documents = useDocumentStore((s) => s.documents);
  const currentDocId = useDocumentStore((s) => s.currentDocId);

  const currentProject = useProjectStore((s) => s.currentProject);

  const [mode, setMode] = useState<PresentationMode>("mechanism");
  const [currentPage, setCurrentPage] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [interval, setIntervalMs] = useState(3000);

  const overlayRef = useRef<HTMLDivElement>(null);
  const slideRef = useRef<HTMLDivElement>(null);

  useGsapEntrance(overlayRef, { duration: 0.4, y: 0, deps: [open] });

  // 当前图名称 / 文档名称
  const currentGraph = graphs.find((g) => g.id === currentGraphId);
  const currentDoc = documents.find((d) => d.id === currentDocId);

  // ===== 计算各模式的幻灯片数据 =====
  const mechanismSlides = useMemo(() => nodes, [nodes]);

  const numericSlides = useMemo(() => {
    return attributes.filter((a) => {
      if (a.type !== "number") return false;
      const f = formulas.find((f) => f.attributeId === a.id);
      return !!f?.expression?.trim();
    });
  }, [attributes, formulas]);

  const gddSlides = useMemo(() => sections, [sections]);

  const slides = useMemo(() => {
    if (mode === "mechanism") return mechanismSlides;
    if (mode === "numeric") return numericSlides;
    return gddSlides;
  }, [mode, mechanismSlides, numericSlides, gddSlides]);

  const totalPages = slides.length;

  // ===== 页码边界保护 =====
  useEffect(() => {
    if (currentPage >= totalPages) {
      setCurrentPage(Math.max(0, totalPages - 1));
    }
  }, [totalPages, currentPage]);

  // ===== 模式切换时重置页码 =====
  const handleModeChange = (m: PresentationMode) => {
    setMode(m);
    setCurrentPage(0);
    setAutoPlay(false);
  };

  // ===== 翻页 =====
  const goToPage = useCallback(
    (page: number) => {
      if (totalPages === 0) return;
      const next = ((page % totalPages) + totalPages) % totalPages;
      setCurrentPage(next);
    },
    [totalPages]
  );

  const goNext = useCallback(() => {
    goToPage(currentPage + 1);
  }, [goToPage, currentPage]);

  const goPrev = useCallback(() => {
    goToPage(currentPage - 1);
  }, [goToPage, currentPage]);

  // ===== 键盘控制 =====
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        setAutoPlay((p) => !p);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, goNext, goPrev, onClose]);

  // ===== 自动播放 =====
  useEffect(() => {
    if (!open || !autoPlay || totalPages <= 1) return;
    const timer = setTimeout(() => {
      setCurrentPage((p) => {
        const next = p + 1;
        if (next >= totalPages) {
          setAutoPlay(false);
          return p;
        }
        return next;
      });
    }, interval);
    return () => clearTimeout(timer);
  }, [open, autoPlay, interval, totalPages, currentPage]);

  // 每页/模式切换时的淡入动画
  useGsapFadeSwitch(slideRef, `${mode}-${currentPage}`);

  if (!open) return null;

  const currentSlide = totalPages > 0 ? slides[currentPage] : null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] bg-canvas-sunken flex flex-col"
    >
      {/* ===== 顶部栏：项目名 + 模式切换 + 关闭 ===== */}
      <header className="flex items-center gap-3 px-6 py-3 border-b border-line-subtle bg-canvas-elevated/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 animate-pulse-soft" />
          <span className="text-sm font-display font-semibold text-ink-primary truncate">
            {currentProject?.name ?? "未命名项目"}
          </span>
          <span className="text-2xs text-ink-muted flex-shrink-0">
            · 演示模式
          </span>
        </div>

        {/* 模式切换 */}
        <div className="flex items-center gap-1 mx-auto">
          {MODE_ORDER.map((m) => {
            const cfg = MODE_CONFIG[m];
            const Icon = cfg.icon;
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors",
                  active
                    ? "border-accent bg-accent-glow text-accent"
                    : "border-line text-ink-secondary hover:text-ink-primary hover:border-line-strong"
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* 页码 + 关闭 */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {totalPages > 0 && (
            <span className="text-xs text-ink-muted font-mono tabular-nums">
              {currentPage + 1} / {totalPages}
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            title="退出 (Esc)"
            className="w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-muted hover:text-ink-primary hover:bg-canvas-elevated transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ===== 内容区 ===== */}
      <main className="flex-1 min-h-0 flex items-center justify-center p-8 overflow-hidden">
        {totalPages === 0 ? (
          <EmptySlide mode={mode} />
        ) : (
          <div
            ref={slideRef}
            key={`${mode}-${currentPage}`}
            className="w-full h-full max-w-5xl flex items-center justify-center"
          >
            {mode === "mechanism" && currentSlide && (
              <MechanismSlide
                node={currentSlide as GraphNode}
                index={currentPage}
                total={totalPages}
                graphName={currentGraph?.name}
              />
            )}
            {mode === "numeric" && currentSlide && (
              <NumericSlide
                attribute={currentSlide as Attribute}
                allAttrs={attributes}
                formulas={formulas}
              />
            )}
            {mode === "gdd" && currentSlide && (
              <GddSlide
                section={currentSlide as DocSection}
                index={currentPage}
                total={totalPages}
                docName={currentDoc?.name}
              />
            )}
          </div>
        )}
      </main>

      {/* ===== 底部控制栏 ===== */}
      <footer className="flex items-center gap-4 px-6 py-3 border-t border-line-subtle bg-canvas-elevated/40 backdrop-blur-sm">
        {/* 自动播放 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAutoPlay((p) => !p)}
            disabled={totalPages <= 1}
            className={cn(
              "w-8 h-8 inline-flex items-center justify-center rounded-md border transition-colors",
              autoPlay
                ? "border-accent bg-accent-glow text-accent"
                : "border-line text-ink-secondary hover:text-ink-primary hover:border-line-strong",
              totalPages <= 1 && "opacity-40 cursor-not-allowed"
            )}
            title={autoPlay ? "暂停自动播放 (空格)" : "自动播放 (空格)"}
          >
            {autoPlay ? (
              <Pause className="w-3.5 h-3.5" />
            ) : (
              <Play className="w-3.5 h-3.5" />
            )}
          </button>
          <select
            value={interval}
            onChange={(e) => setIntervalMs(Number(e.target.value))}
            className="input-field text-2xs py-1 w-16"
            title="自动播放间隔"
          >
            {INTERVAL_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        {/* 进度条（可点击跳转） */}
        <div className="flex-1 flex items-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={totalPages <= 1}
            className={cn(
              "w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-ink-primary hover:bg-canvas-elevated transition-colors",
              totalPages <= 1 && "opacity-40 cursor-not-allowed"
            )}
            title="上一页 (←)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div
            className="flex-1 h-1.5 rounded-full bg-canvas-elevated overflow-hidden cursor-pointer relative"
            onClick={(e) => {
              if (totalPages <= 1) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              goToPage(Math.floor(pct * totalPages));
            }}
          >
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{
                width: `${
                  totalPages > 0 ? ((currentPage + 1) / totalPages) * 100 : 0
                }%`,
                opacity: 0.85,
              }}
            />
          </div>
          <button
            type="button"
            onClick={goNext}
            disabled={totalPages <= 1}
            className={cn(
              "w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-secondary hover:text-ink-primary hover:bg-canvas-elevated transition-colors",
              totalPages <= 1 && "opacity-40 cursor-not-allowed"
            )}
            title="下一页 (→)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 页码提示 */}
        <div className="text-2xs text-ink-muted font-mono tabular-nums flex-shrink-0">
          {totalPages > 0 ? `${currentPage + 1} / ${totalPages}` : "—"}
        </div>
      </footer>
    </div>
  );
}

// ===== 机制图单页 =====
function MechanismSlide({
  node,
  index,
  total,
  graphName,
}: {
  node: GraphNode;
  index: number;
  total: number;
  graphName?: string;
}) {
  const meta = NODE_TYPE_META[node.type as NodeType];
  const Icon = getNodeIcon(node.type);
  const description = (node.data.description as string) || meta?.description || "";
  const dataEntries = Object.entries(node.data).filter(
    ([k]) => !["description", "priority", "tags", "customFields"].includes(k)
  );

  return (
    <div className="w-full max-w-3xl text-center">
      {graphName && (
        <div className="text-2xs text-ink-muted uppercase tracking-widest mb-6">
          {graphName}
        </div>
      )}
      <div
        className="w-24 h-24 rounded-2xl flex items-center justify-center mx-auto mb-6"
        style={{
          backgroundColor: `${meta?.color ?? "#5C6678"}1A`,
          border: `2px solid ${meta?.color ?? "#5C6678"}55`,
        }}
      >
        {Icon && <Icon className="w-12 h-12" style={{ color: meta?.color ?? "#5C6678" }} />}
      </div>
      <div className="text-2xs text-ink-muted uppercase tracking-widest mb-2">
        {meta?.label ?? node.type} · {meta?.category ?? ""}
      </div>
      <h1 className="text-4xl font-display font-bold text-ink-primary mb-4 leading-tight">
        {node.label || meta?.label || "未命名节点"}
      </h1>
      {description && (
        <p className="text-base text-ink-secondary leading-relaxed max-w-2xl mx-auto mb-6">
          {description}
        </p>
      )}
      {dataEntries.length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center max-w-2xl mx-auto">
          {dataEntries.map(([k, v]) => (
            <span
              key={k}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-canvas-elevated border border-line-subtle text-2xs"
            >
              <span className="text-ink-muted">{k}</span>
              <span className="text-ink-secondary font-mono">
                {typeof v === "object" ? JSON.stringify(v) : String(v)}
              </span>
            </span>
          ))}
        </div>
      )}
      <div className="mt-8 text-2xs text-ink-muted font-mono">
        {index + 1} / {total}
      </div>
    </div>
  );
}

// ===== 数值曲线单页 =====
function NumericSlide({
  attribute,
  allAttrs,
  formulas,
}: {
  attribute: Attribute;
  allAttrs: Attribute[];
  formulas: ReturnType<typeof useNumericStore.getState>["formulas"];
}) {
  const formula = formulas.find((f) => f.attributeId === attribute.id);

  const chartData = useMemo(() => {
    const points = generateCurveData(
      attribute,
      allAttrs,
      formulas,
      CURVE_VARIABLE,
      CURVE_RANGE
    );
    return points.map((p) => ({
      level: p.x,
      value: Number(p.y.toFixed(2)),
    }));
  }, [attribute, allAttrs, formulas]);

  return (
    <div className="w-full h-full flex flex-col">
      <div className="text-center mb-4">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Hash className="w-4 h-4 text-accent" />
          <span className="text-2xs text-ink-muted uppercase tracking-widest">
            数值属性 · {attribute.unit || ""}
          </span>
        </div>
        <h1 className="text-3xl font-display font-bold text-ink-primary mb-2">
          {attribute.name}
        </h1>
        {formula?.expression && (
          <code className="inline-block px-3 py-1 rounded-md bg-canvas-elevated border border-line-subtle text-sm text-accent font-mono">
            {formula.expression}
          </code>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={chartData}
            margin={{ top: 16, right: 32, left: 8, bottom: 16 }}
          >
            <CartesianGrid stroke="#2A3548" strokeDasharray="3 3" />
            <XAxis
              dataKey="level"
              stroke="#5C6678"
              fontSize={12}
              tickLine={false}
              label={{
                value: CURVE_VARIABLE,
                position: "insideBottom",
                offset: -4,
                fontSize: 12,
                fill: "#5C6678",
              }}
            />
            <YAxis
              stroke="#5C6678"
              fontSize={12}
              tickLine={false}
              width={56}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#1A2235",
                border: "1px solid #2A3548",
                borderRadius: "8px",
                fontSize: "13px",
              }}
              labelStyle={{ color: "#9AA5B8" }}
              labelFormatter={(v) => `${CURVE_VARIABLE}: ${v}`}
              formatter={(value: number) => [
                `${value}`,
                attribute.name,
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              name={attribute.name}
              stroke="#A3E635"
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ===== GDD 文档单页 =====
function GddSlide({
  section,
  index,
  total,
  docName,
}: {
  section: DocSection;
  index: number;
  total: number;
  docName?: string;
}) {
  if (section.type === "heading") {
    return (
      <div className="w-full max-w-4xl text-center">
        {docName && (
          <div className="text-2xs text-ink-muted uppercase tracking-widest mb-8">
            {docName}
          </div>
        )}
        <h1 className="text-5xl font-display font-bold text-ink-primary leading-tight">
          {section.title || "无标题"}
        </h1>
        <div className="mt-12 text-2xs text-ink-muted font-mono">
          {index + 1} / {total}
        </div>
      </div>
    );
  }

  if (section.type === "embed") {
    return (
      <div className="w-full max-w-3xl text-center">
        {docName && (
          <div className="text-2xs text-ink-muted uppercase tracking-widest mb-8">
            {docName}
          </div>
        )}
        <div
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-accent/40 bg-accent/10 text-accent text-sm mb-4"
        >
          <FileText className="w-4 h-4" />
          嵌入引用：{section.embedType ?? "未知"} ·{" "}
          {section.embedRefId?.slice(0, 12) ?? "—"}
        </div>
        <h2 className="text-3xl font-display font-semibold text-ink-primary mb-4">
          {section.title || "嵌入内容"}
        </h2>
        <div className="mt-12 text-2xs text-ink-muted font-mono">
          {index + 1} / {total}
        </div>
      </div>
    );
  }

  // paragraph
  return (
    <div className="w-full max-w-3xl">
      {docName && (
        <div className="text-2xs text-ink-muted uppercase tracking-widest mb-6 text-center">
          {docName}
        </div>
      )}
      {section.title && (
        <h2 className="text-2xl font-display font-semibold text-accent mb-4 text-center">
          {section.title}
        </h2>
      )}
      <div className="text-xl text-ink-secondary leading-loose whitespace-pre-wrap text-left">
        {section.content || "（空段落）"}
      </div>
      <div className="mt-12 text-2xs text-ink-muted font-mono text-center">
        {index + 1} / {total}
      </div>
    </div>
  );
}

// ===== 空状态 =====
function EmptySlide({ mode }: { mode: PresentationMode }) {
  const cfg = MODE_CONFIG[mode];
  const Icon = cfg.icon;
  const hints: Record<PresentationMode, string> = {
    mechanism: "当前机制图没有节点，无法演示",
    numeric: "当前数值表没有可展示的公式属性",
    gdd: "当前文档没有段落，无法演示",
  };
  return (
    <div className="text-center">
      <Icon className="w-16 h-16 text-ink-muted mx-auto mb-4" />
      <p className="text-lg text-ink-secondary mb-1">{hints[mode]}</p>
      <p className="text-2xs text-ink-muted">请切换到其他模式或先添加内容</p>
    </div>
  );
}
