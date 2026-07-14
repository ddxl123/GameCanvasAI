import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import Modal from "@/components/ui/Modal";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useUIStore } from "@/stores/uiStore";
import { useGsapEntrance } from "@/hooks/useGsap";
import { NODE_TYPE_META, getNodeIcon } from "./nodeTypes";
import { cn } from "@/lib/utils";
import {
  Cpu,
  MemoryStick,
  Layers,
  AlertTriangle,
  CheckCircle2,
  Monitor,
  Smartphone,
  Gamepad2,
  Gauge,
} from "lucide-react";
import type { GraphNode, NodeType } from "@/types";

// ===== 平台预算阈值 =====
type Platform = "PC" | "Mobile" | "Switch";

interface PlatformBudget {
  cpu: number;
  memory: number;
}

const PLATFORM_BUDGETS: Record<Platform, PlatformBudget & { label: string; icon: typeof Monitor }> = {
  PC: { cpu: 100, memory: 1024, label: "PC", icon: Monitor },
  Mobile: { cpu: 60, memory: 512, label: "Mobile", icon: Smartphone },
  Switch: { cpu: 40, memory: 256, label: "Switch", icon: Gamepad2 },
};

// ===== 节点维度分类（与 GraphStatsPanel 保持一致）=====
const CATEGORY_META: Record<string, { label: string; color: string }> = {
  logic: { label: "逻辑层", color: "#FB923C" },
  system: { label: "资源层", color: "#FBBF24" },
  growth: { label: "成长层", color: "#10B981" },
  feedback: { label: "反馈层", color: "#06B6D4" },
  social: { label: "社交/AI", color: "#D946EF" },
  aux: { label: "辅助", color: "#FDE047" },
  world: { label: "世界观", color: "#34D399" },
  content: { label: "内容元素", color: "#F472B6" },
  sensory: { label: "感官体验", color: "#A78BFA" },
};

const CATEGORY_ORDER = ["logic", "system", "growth", "feedback", "social", "world", "content", "sensory", "aux"];

// ===== 类型安全的 data 字段读取 =====
function getNodeCpu(node: GraphNode): number {
  const v = node.data.cpuCost;
  return typeof v === "number" && isFinite(v) ? v : 0;
}
function getNodeMemory(node: GraphNode): number {
  const v = node.data.memoryMB;
  return typeof v === "number" && isFinite(v) && v >= 0 ? v : 0;
}
function getNodeMaxInstances(node: GraphNode): number {
  const v = node.data.maxInstances;
  return typeof v === "number" && isFinite(v) && v >= 0 ? v : 0;
}

interface PerformanceBudgetPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function PerformanceBudgetPanel({
  open,
  onOpenChange,
}: PerformanceBudgetPanelProps) {
  const nodes = useMechanismStore((s) => s.nodes);
  const selectedNodeId = useMechanismStore((s) => s.selectedNodeId);
  const updateNode = useMechanismStore((s) => s.updateNode);
  const addToast = useUIStore((s) => s.addToast);

  const [platform, setPlatform] = useState<Platform>("PC");
  const contentRef = useRef<HTMLDivElement>(null);
  useGsapEntrance(contentRef, { duration: 0.4, y: 16, deps: [open] });

  // 选中节点的预算编辑表单状态
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const [editCpu, setEditCpu] = useState("");
  const [editMemory, setEditMemory] = useState("");
  const [editInstances, setEditInstances] = useState("");

  // 选中节点变化时同步表单
  useEffect(() => {
    if (!selectedNode) {
      setEditCpu("");
      setEditMemory("");
      setEditInstances("");
      return;
    }
    setEditCpu(String(getNodeCpu(selectedNode)));
    setEditMemory(String(getNodeMemory(selectedNode)));
    setEditInstances(String(getNodeMaxInstances(selectedNode)));
  }, [selectedNodeId, selectedNode]);

  // ===== 预算汇总 =====
  const totals = useMemo(() => {
    let cpu = 0;
    let memory = 0;
    for (const n of nodes) {
      cpu += getNodeCpu(n);
      memory += getNodeMemory(n);
    }
    return { cpu, memory };
  }, [nodes]);

  // Top 5 实例数最高的节点
  const topInstances = useMemo(() => {
    return [...nodes]
      .map((n) => ({ node: n, instances: getNodeMaxInstances(n) }))
      .filter((x) => x.instances > 0)
      .sort((a, b) => b.instances - a.instances)
      .slice(0, 5);
  }, [nodes]);

  // 按节点维度分类的预算汇总（用于 BarChart）
  const categoryChartData = useMemo(() => {
    const map = new Map<string, { cpu: number; memory: number; count: number }>();
    for (const n of nodes) {
      const meta = NODE_TYPE_META[n.type as NodeType];
      const cat = meta?.category ?? "aux";
      const entry = map.get(cat) ?? { cpu: 0, memory: 0, count: 0 };
      entry.cpu += getNodeCpu(n);
      entry.memory += getNodeMemory(n);
      entry.count += 1;
      map.set(cat, entry);
    }
    return CATEGORY_ORDER.filter((c) => map.has(c)).map((c) => {
      const entry = map.get(c)!;
      const meta = CATEGORY_META[c] ?? { label: c, color: "#5C6678" };
      return {
        category: c,
        name: meta.label,
        color: meta.color,
        cpu: Number(entry.cpu.toFixed(1)),
        memory: Number(entry.memory.toFixed(1)),
        count: entry.count,
      };
    });
  }, [nodes]);

  const budget = PLATFORM_BUDGETS[platform];
  const cpuOver = totals.cpu > budget.cpu;
  const memoryOver = totals.memory > budget.memory;

  // ===== 编辑保存 =====
  const handleSaveBudget = async () => {
    if (!selectedNode) return;
    const cpu = parseFloat(editCpu);
    const memory = parseFloat(editMemory);
    const instances = parseInt(editInstances, 10);
    const nextData = {
      ...selectedNode.data,
      cpuCost: isNaN(cpu) ? 0 : Math.max(0, Math.min(100, cpu)),
      memoryMB: isNaN(memory) ? 0 : Math.max(0, memory),
      maxInstances: isNaN(instances) ? 0 : Math.max(0, instances),
    };
    await updateNode(selectedNode.id, { data: nextData });
    addToast({ title: "预算已更新", variant: "success" });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="性能预算汇总"
      description="基于节点 CPU 开销、内存占用与同屏实例上限的预算分析"
      className="max-w-4xl w-[92vw] max-h-[90vh] flex flex-col"
    >
      <div ref={contentRef} className="flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
        {/* 平台选择 */}
        <div className="flex items-center gap-2 pb-3 border-b border-line-subtle">
          <Gauge className="w-3.5 h-3.5 text-accent" />
          <span className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
            目标平台
          </span>
          <div className="flex items-center gap-1 ml-1">
            {(Object.keys(PLATFORM_BUDGETS) as Platform[]).map((p) => {
              const cfg = PLATFORM_BUDGETS[p];
              const Icon = cfg.icon;
              const active = platform === p;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlatform(p)}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-2xs font-medium border transition-colors",
                    active
                      ? "border-accent bg-accent-glow text-accent"
                      : "border-line text-ink-secondary hover:border-line-strong hover:text-ink-primary"
                  )}
                >
                  <Icon className="w-3 h-3" />
                  {cfg.label}
                </button>
              );
            })}
          </div>
          <div className="ml-auto text-2xs text-ink-muted">
            阈值：CPU ≤ {budget.cpu}，内存 ≤ {budget.memory}MB
          </div>
        </div>

        {nodes.length === 0 ? (
          <div className="py-10 text-center">
            <Gauge className="w-8 h-8 text-ink-muted mx-auto mb-2" />
            <p className="text-xs text-ink-secondary mb-1">机制图为空</p>
            <p className="text-2xs text-ink-muted">添加节点后即可查看性能预算汇总</p>
          </div>
        ) : (
          <>
            {/* 总预算卡片 */}
            <div className="grid grid-cols-2 gap-3">
              <BudgetStatCard
                icon={<Cpu className="w-4 h-4" />}
                label="总 CPU 开销"
                value={totals.cpu.toFixed(1)}
                unit={`/ ${budget.cpu}`}
                threshold={budget.cpu}
                current={totals.cpu}
                over={cpuOver}
                overColor="#F87171"
                overLabel="超出预算"
              />
              <BudgetStatCard
                icon={<MemoryStick className="w-4 h-4" />}
                label="总内存占用"
                value={totals.memory.toFixed(1)}
                unit={`/ ${budget.memory}MB`}
                threshold={budget.memory}
                current={totals.memory}
                over={memoryOver}
                overColor="#FBBF24"
                overLabel="超出预算"
              />
            </div>

            {/* 进度条 */}
            <div className="space-y-2">
              <BudgetProgressBar
                label="CPU"
                current={totals.cpu}
                threshold={budget.cpu}
                color="#FB923C"
              />
              <BudgetProgressBar
                label="内存"
                current={totals.memory}
                threshold={budget.memory}
                color="#60A5FA"
                unit="MB"
              />
            </div>

            {/* BarChart + Top5 */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              {/* 按维度分类的预算柱状图 */}
              <div className="md:col-span-3 p-3 rounded-lg bg-canvas-sunken border border-line-subtle">
                <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-2">
                  按节点维度分类的预算分布
                </div>
                {categoryChartData.length === 0 ? (
                  <p className="text-2xs text-ink-muted py-8 text-center">暂无可统计数据</p>
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={categoryChartData}
                        margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                      >
                        <CartesianGrid stroke="#2A3548" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="name"
                          stroke="#5C6678"
                          fontSize={10}
                          tickLine={false}
                          interval={0}
                          angle={-20}
                          textAnchor="end"
                          height={50}
                        />
                        <YAxis
                          yAxisId="left"
                          stroke="#5C6678"
                          fontSize={10}
                          tickLine={false}
                          width={36}
                        />
                        <YAxis
                          yAxisId="right"
                          orientation="right"
                          stroke="#5C6678"
                          fontSize={10}
                          tickLine={false}
                          width={44}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1A2235",
                            border: "1px solid #2A3548",
                            borderRadius: "6px",
                            fontSize: "11px",
                          }}
                          labelStyle={{ color: "#9AA5B8" }}
                          formatter={(value: number, name: string) => {
                            if (name === "CPU 开销") return [`${value}`, name];
                            return [`${value} MB`, name];
                          }}
                        />
                        <Legend
                          wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
                          iconType="circle"
                        />
                        <Bar
                          yAxisId="left"
                          dataKey="cpu"
                          name="CPU 开销"
                          fill="#FB923C"
                          radius={[3, 3, 0, 0]}
                          isAnimationActive={false}
                        />
                        <Bar
                          yAxisId="right"
                          dataKey="memory"
                          name="内存 (MB)"
                          fill="#60A5FA"
                          radius={[3, 3, 0, 0]}
                          isAnimationActive={false}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              {/* Top 5 实例数最高的节点 */}
              <div className="md:col-span-2 p-3 rounded-lg bg-canvas-sunken border border-line-subtle">
                <div className="flex items-center gap-1.5 mb-2">
                  <Layers className="w-3 h-3 text-accent" />
                  <span className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
                    实例数 Top 5
                  </span>
                </div>
                {topInstances.length === 0 ? (
                  <p className="text-2xs text-ink-muted py-6 text-center">
                    暂无节点配置 maxInstances
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {topInstances.map(({ node, instances }, idx) => {
                      const meta = NODE_TYPE_META[node.type as NodeType];
                      const Icon = getNodeIcon(node.type);
                      return (
                        <div
                          key={node.id}
                          className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-canvas-elevated/60 border border-line-subtle"
                        >
                          <span className="text-2xs text-ink-muted font-mono w-4">
                            {idx + 1}
                          </span>
                          <div
                            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${meta?.color ?? "#5C6678"}20` }}
                          >
                            {Icon && <Icon className="w-3 h-3" style={{ color: meta?.color ?? "#5C6678" }} />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs text-ink-primary truncate">
                              {node.label || meta?.label || node.type}
                            </div>
                            <div className="text-2xs text-ink-muted">
                              {meta?.label ?? node.type}
                            </div>
                          </div>
                          <span className="text-xs text-accent font-mono tabular-nums font-medium">
                            ×{instances}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* 选中节点的预算编辑 */}
            <div className="p-3 rounded-lg bg-canvas-sunken border border-line-subtle">
              <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-2">
                选中节点预算编辑
              </div>
              {!selectedNode ? (
                <p className="text-2xs text-ink-muted py-3 text-center">
                  在机制图中选中一个节点后，可在此编辑其预算字段
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-canvas-elevated/60 border border-line-subtle">
                    {(() => {
                      const meta = NODE_TYPE_META[selectedNode.type as NodeType];
                      const Icon = getNodeIcon(selectedNode.type);
                      return (
                        <>
                          <div
                            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: `${meta?.color ?? "#5C6678"}20` }}
                          >
                            {Icon && <Icon className="w-3 h-3" style={{ color: meta?.color ?? "#5C6678" }} />}
                          </div>
                          <span className="text-xs text-ink-primary truncate">
                            {selectedNode.label || meta?.label || selectedNode.type}
                          </span>
                          <span className="text-2xs text-ink-muted ml-auto font-mono">
                            {selectedNode.id.slice(0, 12)}
                          </span>
                        </>
                      );
                    })()}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <BudgetEditField
                      label="CPU 开销 (0-100)"
                      value={editCpu}
                      onChange={setEditCpu}
                      placeholder="0"
                    />
                    <BudgetEditField
                      label="内存 (MB)"
                      value={editMemory}
                      onChange={setEditMemory}
                      placeholder="0"
                    />
                    <BudgetEditField
                      label="同屏实例上限"
                      value={editInstances}
                      onChange={setEditInstances}
                      placeholder="0"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSaveBudget}
                    className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-canvas-sunken text-xs font-medium hover:bg-accent-hover transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    保存预算
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

// ===== 子组件 =====

function BudgetStatCard({
  icon,
  label,
  value,
  unit,
  threshold,
  current,
  over,
  overColor,
  overLabel,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit: string;
  threshold: number;
  current: number;
  over: boolean;
  overColor: string;
  overLabel: string;
}) {
  const pct = threshold > 0 ? Math.min(100, (current / threshold) * 100) : 0;
  return (
    <div
      className="p-3 rounded-lg border bg-canvas-sunken"
      style={{ borderColor: over ? `${overColor}55` : "var(--color-line-subtle)" }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color: over ? overColor : "#9AA5B8" }}>{icon}</span>
        <span className="text-2xs text-ink-muted">{label}</span>
        {over ? (
          <span
            className="inline-flex items-center gap-0.5 ml-auto text-2xs px-1.5 py-0.5 rounded"
            style={{
              color: overColor,
              backgroundColor: `${overColor}1A`,
              border: `1px solid ${overColor}40`,
            }}
          >
            <AlertTriangle className="w-2.5 h-2.5" />
            {overLabel}
          </span>
        ) : (
          <CheckCircle2 className="w-3 h-3 ml-auto" style={{ color: "#A3E635" }} />
        )}
      </div>
      <div className="flex items-baseline gap-1">
        <span
          className="text-2xl font-display font-semibold tabular-nums leading-tight"
          style={{ color: over ? overColor : "#E6EAF2" }}
        >
          {value}
        </span>
        <span className="text-2xs text-ink-muted">{unit}</span>
      </div>
      <div className="h-1 rounded-full bg-canvas-elevated overflow-hidden mt-1.5">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: over ? overColor : "#A3E635",
            opacity: 0.9,
          }}
        />
      </div>
    </div>
  );
}

function BudgetProgressBar({
  label,
  current,
  threshold,
  color,
  unit,
}: {
  label: string;
  current: number;
  threshold: number;
  color: string;
  unit?: string;
}) {
  const pct = threshold > 0 ? Math.min(100, (current / threshold) * 100) : 0;
  const over = current > threshold;
  const displayColor = over ? "#F87171" : color;
  return (
    <div>
      <div className="flex items-center justify-between text-2xs text-ink-muted mb-1">
        <span>{label}</span>
        <span className="font-mono tabular-nums">
          <span style={{ color: over ? "#F87171" : "#E6EAF2" }}>
            {current.toFixed(1)}
            {unit ? ` ${unit}` : ""}
          </span>
          {" / "}
          {threshold}
          {unit ? ` ${unit}` : ""}
          <span style={{ color: over ? "#F87171" : "#A3E635" }}>
            {" "}({pct.toFixed(0)}%)
          </span>
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-canvas-elevated overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${pct}%`,
            backgroundColor: displayColor,
            opacity: 0.85,
          }}
        />
      </div>
    </div>
  );
}

function BudgetEditField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-2xs text-ink-muted mb-1">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input-field text-xs py-1.5"
        step="any"
      />
    </div>
  );
}
