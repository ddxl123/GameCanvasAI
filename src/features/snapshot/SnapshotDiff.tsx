import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { useSnapshotStore } from "@/stores/snapshotStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type {
  MechanismGraph,
  GraphNode,
  GraphEdge,
  NumericSheet,
  Attribute,
  Formula,
  GDDDocument,
  DocSection,
} from "@/types";
import type { ProjectExportData } from "@/lib/engineExport";
import {
  GitCompare,
  Loader2,
  ArrowLeftRight,
  Network,
  Table2,
  FileText,
  Camera,
} from "lucide-react";

interface SnapshotDiffProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ===== diff 类型 =====

type DiffKind = "added" | "removed" | "modified";

interface FieldChange {
  field: string;
  from: string;
  to: string;
}

interface DiffEntry {
  kind: DiffKind;
  id: string;
  label: string;
  changes?: FieldChange[];
}

interface EntityDiffResult {
  added: number;
  removed: number;
  modified: number;
  entries: DiffEntry[];
}

interface FullDiff {
  graphs: EntityDiffResult;
  nodes: EntityDiffResult;
  edges: EntityDiffResult;
  sheets: EntityDiffResult;
  attributes: EntityDiffResult;
  formulas: EntityDiffResult;
  documents: EntityDiffResult;
  sections: EntityDiffResult;
  stats: { added: number; removed: number; modified: number };
}

// ===== diff 工具 =====

interface FieldDef<T> {
  key: keyof T;
  label: string;
}

function stringifyVal(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function diffCollection<T extends { id: string }>(
  before: T[] | undefined,
  after: T[] | undefined,
  fields: FieldDef<T>[],
  labelFn: (item: T) => string
): EntityDiffResult {
  const beforeMap = new Map((before ?? []).map((i) => [i.id, i]));
  const afterMap = new Map((after ?? []).map((i) => [i.id, i]));
  const ids = new Set<string>([...beforeMap.keys(), ...afterMap.keys()]);

  const entries: DiffEntry[] = [];
  let added = 0;
  let removed = 0;
  let modified = 0;

  for (const id of ids) {
    const b = beforeMap.get(id);
    const a = afterMap.get(id);
    if (!b && a) {
      added++;
      entries.push({ kind: "added", id, label: labelFn(a) });
    } else if (b && !a) {
      removed++;
      entries.push({ kind: "removed", id, label: labelFn(b) });
    } else if (b && a) {
      const changes: FieldChange[] = [];
      for (const f of fields) {
        const bv = stringifyVal(b[f.key]);
        const av = stringifyVal(a[f.key]);
        if (bv !== av) {
          changes.push({ field: f.label, from: bv, to: av });
        }
      }
      if (changes.length) {
        modified++;
        entries.push({ kind: "modified", id, label: labelFn(a), changes });
      }
    }
  }

  const order: Record<DiffKind, number> = { added: 0, modified: 1, removed: 2 };
  entries.sort((x, y) => {
    if (x.kind !== y.kind) return order[x.kind] - order[y.kind];
    return x.label.localeCompare(y.label);
  });

  return { added, removed, modified, entries };
}

function computeDiff(a: ProjectExportData, b: ProjectExportData): FullDiff {
  const graphs = diffCollection(
    a.graphs,
    b.graphs,
    [
      { key: "name", label: "名称" },
      { key: "type", label: "类型" },
    ],
    (g: MechanismGraph) => g.name
  );
  const nodes = diffCollection(
    a.nodes,
    b.nodes,
    [
      { key: "label", label: "标签" },
      { key: "type", label: "类型" },
      { key: "data", label: "数据" },
      { key: "position", label: "位置" },
      { key: "refAttributeId", label: "关联属性" },
      { key: "groupId", label: "分组" },
    ],
    (n: GraphNode) => n.label || n.type
  );
  const edges = diffCollection(
    a.edges,
    b.edges,
    [
      { key: "type", label: "类型" },
      { key: "source", label: "起点" },
      { key: "target", label: "终点" },
      { key: "label", label: "标签" },
      { key: "direction", label: "方向" },
      { key: "roles", label: "角色" },
      { key: "strength", label: "强度" },
    ],
    (e: GraphEdge) => e.label || `${e.source} → ${e.target}`
  );
  const sheets = diffCollection(
    a.sheets,
    b.sheets,
    [{ key: "name", label: "名称" }],
    (s: NumericSheet) => s.name
  );
  const attributes = diffCollection(
    a.attributes,
    b.attributes,
    [
      { key: "name", label: "名称" },
      { key: "type", label: "类型" },
      { key: "value", label: "值" },
      { key: "unit", label: "单位" },
      { key: "description", label: "描述" },
      { key: "order", label: "顺序" },
      { key: "parentId", label: "父属性" },
    ],
    (at: Attribute) => at.name
  );
  const formulas = diffCollection(
    a.formulas,
    b.formulas,
    [
      { key: "expression", label: "表达式" },
      { key: "description", label: "描述" },
      { key: "attributeId", label: "关联属性" },
    ],
    (f: Formula) => f.expression || f.id
  );
  const documents = diffCollection(
    a.documents,
    b.documents,
    [{ key: "name", label: "名称" }],
    (d: GDDDocument) => d.name
  );
  const sections = diffCollection(
    a.sections,
    b.sections,
    [
      { key: "title", label: "标题" },
      { key: "content", label: "内容" },
      { key: "type", label: "类型" },
      { key: "order", label: "顺序" },
    ],
    (s: DocSection) => s.title || s.id
  );

  const stats = {
    added:
      graphs.added +
      nodes.added +
      edges.added +
      sheets.added +
      attributes.added +
      formulas.added +
      documents.added +
      sections.added,
    removed:
      graphs.removed +
      nodes.removed +
      edges.removed +
      sheets.removed +
      attributes.removed +
      formulas.removed +
      documents.removed +
      sections.removed,
    modified:
      graphs.modified +
      nodes.modified +
      edges.modified +
      sheets.modified +
      attributes.modified +
      formulas.modified +
      documents.modified +
      sections.modified,
  };

  return {
    graphs,
    nodes,
    edges,
    sheets,
    attributes,
    formulas,
    documents,
    sections,
    stats,
  };
}

// ===== 展示组件 =====

const KIND_META: Record<
  DiffKind,
  { sign: string; badge: string; label: string }
> = {
  added: {
    sign: "+",
    label: "新增",
    badge: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  },
  removed: {
    sign: "-",
    label: "删除",
    badge: "text-red-400 bg-red-500/10 border-red-500/30",
  },
  modified: {
    sign: "~",
    label: "修改",
    badge: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  },
};

function DiffEntryRow({ entry }: { entry: DiffEntry }) {
  const meta = KIND_META[entry.kind];
  return (
    <div className="rounded-md border border-line bg-canvas-sunken px-2.5 py-2">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded text-2xs font-mono font-bold border",
            meta.badge
          )}
        >
          {meta.sign}
        </span>
        <span className="text-sm text-ink-primary break-all">{entry.label}</span>
        <span className="ml-auto flex-shrink-0 text-2xs text-ink-muted font-mono">
          {entry.id.slice(-6)}
        </span>
      </div>
      {entry.changes && entry.changes.length > 0 && (
        <div className="mt-1.5 ml-7 space-y-1">
          {entry.changes.map((c, i) => (
            <div key={i} className="text-2xs">
              <span className="text-ink-muted">{c.field}: </span>
              <span className="font-mono text-red-400 break-all">
                {c.from || "∅"}
              </span>
              <span className="text-ink-muted mx-1">→</span>
              <span className="font-mono text-emerald-400 break-all">
                {c.to || "∅"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiffSection({
  title,
  result,
}: {
  title: string;
  result: EntityDiffResult;
}) {
  const total = result.added + result.removed + result.modified;
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5 px-0.5">
        <span className="text-2xs font-medium text-ink-secondary uppercase tracking-wider">
          {title}
        </span>
        {total > 0 ? (
          <span className="text-2xs text-ink-muted">
            <span className="text-emerald-400">+{result.added}</span>
            {" / "}
            <span className="text-red-400">-{result.removed}</span>
            {" / "}
            <span className="text-amber-400">~{result.modified}</span>
          </span>
        ) : (
          <span className="text-2xs text-ink-muted">无差异</span>
        )}
      </div>
      {total > 0 ? (
        <div className="space-y-1">
          {result.entries.map((e) => (
            <DiffEntryRow key={`${e.kind}-${e.id}`} entry={e} />
          ))}
        </div>
      ) : (
        <div className="text-2xs text-ink-muted px-2.5 py-1.5 rounded-md border border-line-subtle bg-canvas-sunken/50">
          无变更
        </div>
      )}
    </div>
  );
}

// ===== 主组件 =====

type TabKey = "mechanism" | "numeric" | "gdd";

export default function SnapshotDiff({ open, onOpenChange }: SnapshotDiffProps) {
  const currentProject = useProjectStore((s) => s.currentProject);
  const addToast = useUIStore((s) => s.addToast);
  const { snapshots, loading: listLoading, loadSnapshots, getSnapshotData } =
    useSnapshotStore();

  const [snapshotAId, setSnapshotAId] = useState<string>("");
  const [snapshotBId, setSnapshotBId] = useState<string>("");
  const [dataA, setDataA] = useState<ProjectExportData | null>(null);
  const [dataB, setDataB] = useState<ProjectExportData | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("mechanism");

  // 打开时加载快照列表
  useEffect(() => {
    if (open && currentProject) {
      loadSnapshots(currentProject.id);
    }
  }, [open, currentProject, loadSnapshots]);

  // 列表加载后自动选择最新的两个快照（仅当用户尚未选择时）
  useEffect(() => {
    if (open && snapshots.length >= 2 && !snapshotAId && !snapshotBId) {
      setSnapshotBId(snapshots[0].id); // 最新
      setSnapshotAId(snapshots[1].id); // 次新
    }
  }, [open, snapshots, snapshotAId, snapshotBId]);

  // 两个快照都选中时拉取并解析数据
  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function fetchBoth() {
      if (!snapshotAId || !snapshotBId) {
        setDataA(null);
        setDataB(null);
        setError(null);
        return;
      }
      setDiffLoading(true);
      setError(null);
      try {
        const [a, b] = await Promise.all([
          getSnapshotData(snapshotAId),
          getSnapshotData(snapshotBId),
        ]);
        if (cancelled) return;
        if (!a || !b) {
          setError("无法读取快照数据");
          setDataA(null);
          setDataB(null);
          return;
        }
        try {
          const pa = JSON.parse(a.data) as ProjectExportData;
          const pb = JSON.parse(b.data) as ProjectExportData;
          if (cancelled) return;
          setDataA(pa);
          setDataB(pb);
        } catch {
          if (cancelled) return;
          setError("快照数据解析失败");
          setDataA(null);
          setDataB(null);
        }
      } catch (e) {
        if (cancelled) return;
        addToast({
          title: "加载快照数据失败",
          description: e instanceof Error ? e.message : "",
          variant: "error",
        });
        setError("加载失败");
        setDataA(null);
        setDataB(null);
      } finally {
        if (!cancelled) setDiffLoading(false);
      }
    }

    fetchBoth();
    return () => {
      cancelled = true;
    };
  }, [open, snapshotAId, snapshotBId, getSnapshotData, addToast]);

  const diff = useMemo<FullDiff | null>(() => {
    if (!dataA || !dataB) return null;
    return computeDiff(dataA, dataB);
  }, [dataA, dataB]);

  const handleSwap = () => {
    setSnapshotAId(snapshotBId);
    setSnapshotBId(snapshotAId);
  };

  const tabs: { key: TabKey; label: string; icon: typeof Network }[] = [
    { key: "mechanism", label: "机制图", icon: Network },
    { key: "numeric", label: "数值表", icon: Table2 },
    { key: "gdd", label: "GDD 文档", icon: FileText },
  ];

  const sameSnapshot = snapshotAId && snapshotBId && snapshotAId === snapshotBId;

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="快照对比"
      description="选择两个快照，对比机制图、数值表与文档的差异"
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {/* 选择器 */}
        <div className="p-3 rounded-lg bg-canvas-sunken border border-line space-y-2">
          <div className="flex items-center gap-1.5 text-2xs font-medium text-ink-muted uppercase tracking-wider">
            <GitCompare className="w-3 h-3" />
            <span>选择快照</span>
          </div>
          <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
            <div>
              <label className="block text-2xs text-ink-muted mb-1">
                基准快照（旧 · A）
              </label>
              <select
                value={snapshotAId}
                onChange={(e) => setSnapshotAId(e.target.value)}
                className="input-field text-xs"
              >
                <option value="">— 选择快照 —</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatRelativeTime(s.createdAt)}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={handleSwap}
              title="交换 A / B"
              className="mb-0.5 p-1.5 rounded text-ink-muted hover:text-accent hover:bg-canvas-elevated transition-colors"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
            </button>
            <div>
              <label className="block text-2xs text-ink-muted mb-1">
                对比快照（新 · B）
              </label>
              <select
                value={snapshotBId}
                onChange={(e) => setSnapshotBId(e.target.value)}
                className="input-field text-xs"
              >
                <option value="">— 选择快照 —</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {formatRelativeTime(s.createdAt)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {sameSnapshot && (
            <p className="text-2xs text-amber-400">两个快照相同，无对比意义。</p>
          )}
        </div>

        {/* 统计摘要 + 内容 */}
        {listLoading && snapshots.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-ink-muted animate-spin" />
          </div>
        ) : snapshots.length < 2 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Camera className="w-6 h-6 text-ink-muted mb-2 opacity-50" />
            <p className="text-xs text-ink-muted">至少需要两个快照才能对比</p>
            <p className="text-2xs text-ink-muted mt-0.5">
              当前项目共 {snapshots.length} 个快照
            </p>
          </div>
        ) : !snapshotAId || !snapshotBId ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <GitCompare className="w-6 h-6 text-ink-muted mb-2 opacity-50" />
            <p className="text-xs text-ink-muted">请选择两个快照进行对比</p>
          </div>
        ) : diffLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-4 h-4 text-ink-muted animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8 text-xs text-danger">{error}</div>
        ) : diff ? (
          <>
            {/* 统计摘要 */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-canvas-sunken border border-line">
              <span className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
                差异统计
              </span>
              <span className="text-sm text-emerald-400">
                + 新增 {diff.stats.added}
              </span>
              <span className="text-sm text-red-400">
                − 删除 {diff.stats.removed}
              </span>
              <span className="text-sm text-amber-400">
                ~ 修改 {diff.stats.modified}
              </span>
              {diff.stats.added + diff.stats.removed + diff.stats.modified ===
                0 && (
                <span className="text-2xs text-ink-muted ml-auto">
                  两快照内容完全一致
                </span>
              )}
            </div>

            {/* Tab 切换 */}
            <div className="flex gap-1 p-1 rounded-lg bg-canvas-sunken border border-line">
              {tabs.map((t) => {
                const active = tab === t.key;
                const Icon = t.icon;
                return (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors",
                      active
                        ? "bg-canvas-elevated text-ink-primary"
                        : "text-ink-muted hover:text-ink-secondary"
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                );
              })}
            </div>

            {/* 差异内容 */}
            <div className="space-y-3 max-h-[48vh] overflow-y-auto pr-1">
              {tab === "mechanism" && (
                <>
                  <DiffSection title="图 (Graphs)" result={diff.graphs} />
                  <DiffSection title="节点 (Nodes)" result={diff.nodes} />
                  <DiffSection title="边 (Edges)" result={diff.edges} />
                </>
              )}
              {tab === "numeric" && (
                <>
                  <DiffSection title="数值表 (Sheets)" result={diff.sheets} />
                  <DiffSection
                    title="属性 (Attributes)"
                    result={diff.attributes}
                  />
                  <DiffSection title="公式 (Formulas)" result={diff.formulas} />
                </>
              )}
              {tab === "gdd" && (
                <>
                  <DiffSection
                    title="文档 (Documents)"
                    result={diff.documents}
                  />
                  <DiffSection title="段落 (Sections)" result={diff.sections} />
                </>
              )}
            </div>
          </>
        ) : null}

        <div className="flex justify-end pt-1">
          <button
            onClick={() => onOpenChange(false)}
            className="btn-secondary"
          >
            关闭
          </button>
        </div>
      </div>
    </Modal>
  );
}
