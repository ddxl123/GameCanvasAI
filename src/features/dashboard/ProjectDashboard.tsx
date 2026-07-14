import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "@/db";
import { formatRelativeTime } from "@/lib/time";
import { useUIStore } from "@/stores/uiStore";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useSnapshotStore } from "@/stores/snapshotStore";
import { cn } from "@/lib/utils";
import {
  Network,
  Calculator,
  FileText,
  Camera,
  MessageSquare,
  Boxes,
  GitBranch,
  Clock,
  Plus,
  ChevronRight,
  Loader2,
  AlignLeft,
  LayoutDashboard,
} from "lucide-react";

interface DashboardStats {
  graphCount: number;
  nodeCount: number;
  edgeCount: number;
  sheetCount: number;
  attributeCount: number;
  formulaCount: number;
  documentCount: number;
  sectionCount: number;
  snapshotCount: number;
  conversationCount: number;
}

interface RecentItem {
  id: string;
  name: string;
  type: "graph" | "sheet" | "document";
  updatedAt: number;
}

const STAT_CARDS: Array<{
  key: keyof DashboardStats;
  label: string;
  icon: typeof Network;
  color: string;
}> = [
  { key: "graphCount", label: "机制图", icon: Network, color: "#A3E635" },
  { key: "nodeCount", label: "节点", icon: Boxes, color: "#22D3EE" },
  { key: "edgeCount", label: "连接", icon: GitBranch, color: "#A78BFA" },
  { key: "sheetCount", label: "数值表", icon: Calculator, color: "#F472B6" },
  { key: "documentCount", label: "文档", icon: FileText, color: "#60A5FA" },
  { key: "sectionCount", label: "段落", icon: AlignLeft, color: "#FBBF24" },
  { key: "snapshotCount", label: "快照", icon: Camera, color: "#F59E0B" },
  { key: "conversationCount", label: "AI 对话", icon: MessageSquare, color: "#34D399" },
];

const RECENT_TYPE_META: Record<
  RecentItem["type"],
  { label: string; icon: typeof Network; color: string; module: string }
> = {
  graph: { label: "机制图", icon: Network, color: "#A3E635", module: "mechanism" },
  sheet: { label: "数值表", icon: Calculator, color: "#F472B6", module: "numeric" },
  document: { label: "文档", icon: FileText, color: "#60A5FA", module: "document" },
};

function getModuleStage(count: number): { label: string; color: string; pct: number } {
  if (count === 0) return { label: "未开始", color: "#9AA5B8", pct: 0 };
  if (count <= 2) return { label: "初稿", color: "#FBBF24", pct: 50 };
  return { label: "进行中", color: "#A3E635", pct: 100 };
}

export default function ProjectDashboard({ projectId }: { projectId: string }) {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const createGraph = useMechanismStore((s) => s.createGraph);
  const createSheet = useNumericStore((s) => s.createSheet);
  const createDocument = useDocumentStore((s) => s.createDocument);
  const createSnapshot = useSnapshotStore((s) => s.createSnapshot);

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [graphs, sheets, documents, snapshots, conversations] = await Promise.all([
        db.mechanismGraphs.where("projectId").equals(projectId).toArray(),
        db.numericSheets.where("projectId").equals(projectId).toArray(),
        db.gddDocuments.where("projectId").equals(projectId).toArray(),
        db.snapshots.where("projectId").equals(projectId).toArray(),
        db.aiConversations.where("projectId").equals(projectId).toArray(),
      ]);

      const graphIds = graphs.map((g) => g.id);
      const sheetIds = sheets.map((s) => s.id);
      const docIds = documents.map((d) => d.id);

      const [nodeCount, edgeCount, attributeCount, formulaCount, sectionCount] =
        await Promise.all([
          graphIds.length
            ? db.graphNodes.where("graphId").anyOf(graphIds).count()
            : Promise.resolve(0),
          graphIds.length
            ? db.graphEdges.where("graphId").anyOf(graphIds).count()
            : Promise.resolve(0),
          sheetIds.length
            ? db.attributes.where("sheetId").anyOf(sheetIds).count()
            : Promise.resolve(0),
          sheetIds.length
            ? db.formulas.where("sheetId").anyOf(sheetIds).count()
            : Promise.resolve(0),
          docIds.length
            ? db.docSections.where("docId").anyOf(docIds).count()
            : Promise.resolve(0),
        ]);

      setStats({
        graphCount: graphs.length,
        nodeCount,
        edgeCount,
        sheetCount: sheets.length,
        attributeCount,
        formulaCount,
        documentCount: documents.length,
        sectionCount,
        snapshotCount: snapshots.length,
        conversationCount: conversations.length,
      });

      const items: RecentItem[] = [
        ...graphs.map((g) => ({
          id: g.id,
          name: g.name,
          type: "graph" as const,
          updatedAt: g.updatedAt,
        })),
        ...sheets.map((s) => ({
          id: s.id,
          name: s.name,
          type: "sheet" as const,
          updatedAt: s.updatedAt,
        })),
        ...documents.map((d) => ({
          id: d.id,
          name: d.name,
          type: "document" as const,
          updatedAt: d.updatedAt,
        })),
      ];
      items.sort((a, b) => b.updatedAt - a.updatedAt);
      setRecent(items.slice(0, 5));
    } catch (e) {
      console.error("加载仪表盘数据失败:", e);
      addToast({
        title: "加载失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  }, [projectId, addToast]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleNewGraph = async () => {
    if (acting) return;
    setActing("graph");
    try {
      const seq = (stats?.graphCount ?? 0) + 1;
      await createGraph(projectId, `机制图 ${seq}`, "node_graph");
      addToast({ title: "机制图已创建", variant: "success" });
      navigate(`/project/${projectId}/mechanism`);
    } catch (e) {
      addToast({
        title: "创建失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setActing(null);
    }
  };

  const handleNewSheet = async () => {
    if (acting) return;
    setActing("sheet");
    try {
      const seq = (stats?.sheetCount ?? 0) + 1;
      await createSheet(projectId, `数值表 ${seq}`);
      addToast({ title: "数值表已创建", variant: "success" });
      navigate(`/project/${projectId}/numeric`);
    } catch (e) {
      addToast({
        title: "创建失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setActing(null);
    }
  };

  const handleNewDocument = async () => {
    if (acting) return;
    setActing("document");
    try {
      const seq = (stats?.documentCount ?? 0) + 1;
      await createDocument(projectId, `GDD 文档 ${seq}`);
      addToast({ title: "文档已创建", variant: "success" });
      navigate(`/project/${projectId}/document`);
    } catch (e) {
      addToast({
        title: "创建失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setActing(null);
    }
  };

  const handleNewSnapshot = async () => {
    if (acting) return;
    setActing("snapshot");
    try {
      const name = `快照 ${new Date().toLocaleString("zh-CN")}`;
      await createSnapshot(projectId, name);
      addToast({ title: "快照已保存", variant: "success" });
      void loadAll();
    } catch (e) {
      addToast({
        title: "快照失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setActing(null);
    }
  };

  const handleRecentClick = (item: RecentItem) => {
    navigate(`/project/${projectId}/${RECENT_TYPE_META[item.type].module}`);
  };

  if (loading && !stats) {
    return (
      <div className="h-full flex items-center justify-center text-ink-muted text-sm">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        加载中...
      </div>
    );
  }

  const moduleProgress = [
    {
      key: "mechanism",
      label: "机制设计",
      icon: Network,
      color: "#A3E635",
      stage: getModuleStage(stats?.graphCount ?? 0),
      detail: `${stats?.graphCount ?? 0} 张图 · ${stats?.nodeCount ?? 0} 节点 · ${stats?.edgeCount ?? 0} 连接`,
      onClick: () => navigate(`/project/${projectId}/mechanism`),
    },
    {
      key: "numeric",
      label: "数值设计",
      icon: Calculator,
      color: "#F472B6",
      stage: getModuleStage(stats?.sheetCount ?? 0),
      detail: `${stats?.sheetCount ?? 0} 张表 · ${stats?.attributeCount ?? 0} 属性 · ${stats?.formulaCount ?? 0} 公式`,
      onClick: () => navigate(`/project/${projectId}/numeric`),
    },
    {
      key: "document",
      label: "GDD 文档",
      icon: FileText,
      color: "#60A5FA",
      stage: getModuleStage(stats?.documentCount ?? 0),
      detail: `${stats?.documentCount ?? 0} 篇 · ${stats?.sectionCount ?? 0} 段落`,
      onClick: () => navigate(`/project/${projectId}/document`),
    },
  ];

  const quickActions = [
    {
      key: "graph",
      label: "新建机制图",
      icon: Network,
      color: "#A3E635",
      handler: handleNewGraph,
    },
    {
      key: "sheet",
      label: "新建数值表",
      icon: Calculator,
      color: "#F472B6",
      handler: handleNewSheet,
    },
    {
      key: "document",
      label: "新建文档",
      icon: FileText,
      color: "#60A5FA",
      handler: handleNewDocument,
    },
    {
      key: "snapshot",
      label: "保存快照",
      icon: Camera,
      color: "#F59E0B",
      handler: handleNewSnapshot,
    },
  ];

  return (
    <div className="h-full overflow-auto bg-canvas">
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
        {/* 标题区 */}
        <section>
          <div className="flex items-center gap-2 mb-2">
            <LayoutDashboard className="w-4 h-4 text-accent" />
            <span className="font-pixel text-[8px] text-ink-muted tracking-wider">
              ▸ PROJECT DASHBOARD
            </span>
          </div>
          <h1 className="font-display text-3xl font-bold text-ink-primary tracking-tight">
            项目概览
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            一览机制网络、数值体系与 GDD 文档的设计进度。
          </p>
        </section>

        {/* 顶部统计卡片网格 */}
        <section>
          <SectionHeader en="STATS" label="数据统计" hint="实时统计" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {STAT_CARDS.map((card) => {
              const Icon = card.icon;
              const value = stats?.[card.key] ?? 0;
              return (
                <div
                  key={card.key}
                  className="group relative p-4 rounded-lg border border-line bg-canvas-elevated/60 backdrop-blur-sm hover:border-line-strong transition-all hover:-translate-y-0.5"
                >
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center mb-3 border"
                    style={{
                      backgroundColor: `${card.color}15`,
                      borderColor: `${card.color}30`,
                    }}
                  >
                    <Icon
                      className="w-4 h-4"
                      style={{ color: card.color }}
                      strokeWidth={2.2}
                    />
                  </div>
                  <div className="text-2xl font-display font-bold text-ink-primary tabular-nums">
                    {value}
                  </div>
                  <div className="text-2xs text-ink-muted mt-0.5">{card.label}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 最近活动 + 模块进度 */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 最近活动 */}
          <div className="lg:col-span-2">
            <SectionHeader en="RECENT" label="最近活动" hint="前 5 项" />
            <div className="rounded-lg border border-line bg-canvas-elevated/40 divide-y divide-line-subtle overflow-hidden">
              {recent.length === 0 ? (
                <div className="p-8 text-center text-xs text-ink-muted">
                  暂无最近活动，开始创建第一个机制图、数值表或文档吧。
                </div>
              ) : (
                recent.map((item) => {
                  const meta = RECENT_TYPE_META[item.type];
                  const Icon = meta.icon;
                  return (
                    <button
                      key={`${item.type}-${item.id}`}
                      onClick={() => handleRecentClick(item)}
                      className="group w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-canvas-sunken/50 transition-colors"
                    >
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 border"
                        style={{
                          backgroundColor: `${meta.color}15`,
                          borderColor: `${meta.color}30`,
                        }}
                      >
                        <Icon
                          className="w-3.5 h-3.5"
                          style={{ color: meta.color }}
                          strokeWidth={2.2}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-ink-primary truncate group-hover:text-accent transition-colors">
                          {item.name}
                        </div>
                        <div className="text-2xs text-ink-muted">{meta.label}</div>
                      </div>
                      <div className="flex items-center gap-1 text-2xs text-ink-muted flex-shrink-0">
                        <Clock className="w-2.5 h-2.5" />
                        <span className="font-mono">
                          {formatRelativeTime(item.updatedAt)}
                        </span>
                      </div>
                      <ChevronRight className="w-3.5 h-3.5 text-ink-muted group-hover:text-accent flex-shrink-0 transition-colors" />
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 模块进度 */}
          <div>
            <SectionHeader en="PROGRESS" label="模块进度" hint="完成度" />
            <div className="space-y-2.5">
              {moduleProgress.map((m) => {
                const Icon = m.icon;
                return (
                  <button
                    key={m.key}
                    onClick={m.onClick}
                    className="group w-full p-3 rounded-lg border border-line bg-canvas-elevated/60 text-left hover:border-line-strong transition-all"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 border"
                        style={{
                          backgroundColor: `${m.color}15`,
                          borderColor: `${m.color}30`,
                        }}
                      >
                        <Icon
                          className="w-3.5 h-3.5"
                          style={{ color: m.color }}
                          strokeWidth={2.2}
                        />
                      </div>
                      <span className="text-sm font-medium text-ink-primary flex-1">
                        {m.label}
                      </span>
                      <span
                        className="text-2xs px-1.5 py-0.5 rounded font-medium"
                        style={{
                          color: m.stage.color,
                          backgroundColor: `${m.stage.color}15`,
                          border: `1px solid ${m.stage.color}33`,
                        }}
                      >
                        {m.stage.label}
                      </span>
                    </div>
                    <div className="text-2xs text-ink-muted mb-2">{m.detail}</div>
                    <div className="h-1 rounded-full bg-canvas-sunken overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${m.stage.pct}%`,
                          backgroundColor: m.stage.color,
                        }}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* 快捷操作 */}
        <section>
          <SectionHeader en="QUICK ACTIONS" label="快捷操作" hint="一键新建" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickActions.map((a) => {
              const Icon = a.icon;
              const isBusy = acting === a.key;
              const disabled = !!acting;
              return (
                <button
                  key={a.key}
                  onClick={a.handler}
                  disabled={disabled}
                  className={cn(
                    "group p-4 rounded-lg border bg-canvas-elevated/60 text-left transition-all",
                    disabled
                      ? "border-line opacity-60 cursor-not-allowed"
                      : "border-line hover:border-line-strong hover:-translate-y-0.5"
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className="w-9 h-9 rounded-md flex items-center justify-center border"
                      style={{
                        backgroundColor: `${a.color}15`,
                        borderColor: `${a.color}30`,
                      }}
                    >
                      {isBusy ? (
                        <Loader2
                          className="w-4 h-4 animate-spin"
                          style={{ color: a.color }}
                        />
                      ) : (
                        <Icon
                          className="w-4 h-4"
                          style={{ color: a.color }}
                          strokeWidth={2.2}
                        />
                      )}
                    </div>
                    <Plus
                      className="w-3.5 h-3.5 text-ink-muted group-hover:text-accent transition-colors"
                      strokeWidth={2.2}
                    />
                  </div>
                  <div className="text-sm font-medium text-ink-primary">
                    {a.label}
                  </div>
                  <div className="text-2xs text-ink-muted mt-0.5">
                    {isBusy ? "处理中..." : "点击新建"}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function SectionHeader({
  en,
  label,
  hint,
}: {
  en: string;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="font-pixel text-[8px] text-ink-muted tracking-wider">
        ▸ {en}
      </span>
      <span className="text-2xs text-ink-muted">{label}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-line via-line-subtle to-transparent" />
      {hint && <span className="text-2xs text-ink-muted">{hint}</span>}
    </div>
  );
}
