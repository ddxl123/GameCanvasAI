import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import ProjectCard from "@/features/project/ProjectCard";
import NewProjectModal from "@/features/project/NewProjectModal";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import {
  Settings,
  Plus,
  Gamepad2,
  Search,
  Sparkles,
  Network,
  Zap,
  Trophy,
  Target,
  ChevronRight,
  LayoutGrid,
  List,
  Clock,
  CalendarDays,
  ArrowDownAZ,
  Folder,
  Swords,
  Coins,
  Scroll,
  Trash2,
  BookOpen,
  Lightbulb,
  Rocket,
  PlayCircle,
} from "lucide-react";
import type { Project, ProjectTemplate } from "@/types";
import CaseLibraryDialog from "@/features/project/CaseLibraryDialog";
import GuidedCreationWizard from "@/features/onboarding/GuidedCreationWizard";
import InspirationBoard from "@/features/inspiration/InspirationBoard";
import { createHelloWorldProject } from "@/data/helloWorldTemplate";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

// 能力标签数据
const FEATURES = [
  {
    icon: Network,
    title: "机制网络",
    desc: "15 种节点 · 9 种连接",
    color: "#A3E635",
  },
  {
    icon: Zap,
    title: "AI 生成",
    desc: "DeepSeek · GPT · Claude",
    color: "#22D3EE",
  },
  {
    icon: Target,
    title: "数值平衡",
    desc: "公式引擎 · 曲线预览",
    color: "#A78BFA",
  },
  {
    icon: Trophy,
    title: "GDD 文档",
    desc: "结构化 · 可嵌入",
    color: "#F472B6",
  },
];

// 模板元数据（紧凑视图用，与 ProjectCard 保持视觉一致）
const TEMPLATE_META: Record<
  ProjectTemplate,
  { label: string; color: string; gradient: string; icon: typeof Folder }
> = {
  blank: {
    label: "空白",
    color: "#9AA5B8",
    gradient: "linear-gradient(135deg, #4B5563 0%, #1F2937 100%)",
    icon: Folder,
  },
  combat: {
    label: "战斗",
    color: "#F43F5E",
    gradient: "linear-gradient(135deg, #F43F5E 0%, #9F1239 100%)",
    icon: Swords,
  },
  economy: {
    label: "经济",
    color: "#FBBF24",
    gradient: "linear-gradient(135deg, #FBBF24 0%, #B45309 100%)",
    icon: Coins,
  },
  rpg: {
    label: "RPG",
    color: "#A78BFA",
    gradient: "linear-gradient(135deg, #A78BFA 0%, #6D28D9 100%)",
    icon: Scroll,
  },
};

// 排序选项
type SortKey = "recent" | "created" | "name";
const SORT_OPTIONS: {
  key: SortKey;
  label: string;
  icon: typeof Clock;
}[] = [
  { key: "recent", label: "最近编辑", icon: Clock },
  { key: "created", label: "创建时间", icon: CalendarDays },
  { key: "name", label: "名称", icon: ArrowDownAZ },
];

export default function Home() {
  const navigate = useNavigate();
  const { projects, loading, loadProjects, deleteProject } = useProjectStore();
  const addToast = useUIStore((s) => s.addToast);
  const [modalOpen, setModalOpen] = useState(false);
  const [caseLibraryOpen, setCaseLibraryOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const filteredProjects = useMemo(() => {
    const filtered = projects.filter(
      (p) =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.description.toLowerCase().includes(search.toLowerCase())
    );
    // 按排序键排序
    const sorted = [...filtered];
    switch (sort) {
      case "recent":
        sorted.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      case "created":
        sorted.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
        break;
    }
    return sorted;
  }, [projects, search, sort]);

  // 最近编辑的项目（取前 3 个，按 updatedAt 降序）
  const recentProjects = useMemo(
    () =>
      [...projects]
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 3),
    [projects]
  );

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setDeleteConfirmOpen(false);
    setPendingDeleteId(null);
    try {
      await deleteProject(id);
      addToast({ title: "项目已删除", variant: "success" });
    } catch (e) {
      addToast({
        title: "删除失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    }
  };

  return (
    <div className="min-h-screen canvas-ambient relative overflow-hidden scanline">
      {/* 动态网格背景 */}
      <div className="absolute inset-0 bg-grid-game pointer-events-none opacity-40" />

      {/* 多层渐变光晕 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute -top-32 -left-32 w-[700px] h-[700px] rounded-full opacity-25 animate-float"
          style={{
            background:
              "radial-gradient(circle, rgba(163,230,53,0.5) 0%, transparent 70%)",
          }}
        />
        <div
          className="absolute -top-20 right-0 w-[600px] h-[600px] rounded-full opacity-20 animate-float"
          style={{
            background:
              "radial-gradient(circle, rgba(34,211,238,0.5) 0%, transparent 70%)",
            animationDelay: "1.5s",
          }}
        />
        <div
          className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[900px] h-[500px] rounded-full opacity-15 animate-float"
          style={{
            background:
              "radial-gradient(ellipse, rgba(168,139,250,0.5) 0%, transparent 70%)",
            animationDelay: "3s",
          }}
        />
        <div
          className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full opacity-15 animate-float"
          style={{
            background:
              "radial-gradient(circle, rgba(244,114,182,0.4) 0%, transparent 70%)",
            animationDelay: "2s",
          }}
        />
      </div>

      {/* 顶部栏 */}
      <header className="relative border-b border-line-subtle frosted-panel z-10">
        <div className="max-w-7xl mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center animate-neon-pulse pixel-corner"
              style={{
                background:
                  "linear-gradient(135deg, #A3E635 0%, #22D3EE 100%)",
              }}
            >
              <Gamepad2 className="w-5 h-5 text-canvas-sunken" strokeWidth={2.5} />
            </div>
            <div>
              <span className="font-display font-bold text-ink-primary leading-tight block tracking-tight">
                玩法设计平台
              </span>
              <span className="font-pixel text-[8px] text-accent leading-tight tracking-wider">
                GAME DESIGN WORKBENCH
              </span>
            </div>
          </div>
          <button onClick={() => navigate("/settings")} className="btn-ghost">
            <Settings className="w-4 h-4" />
            设置
          </button>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-8 py-12 z-10">
        {/* Hero 区 */}
        <section className="mb-14">
          {/* 像素徽章 */}
          <div className="flex items-center gap-2 mb-4">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-2xs font-medium border holo-glow"
              style={{
                background: "rgba(163,230,53,0.08)",
                borderColor: "rgba(163,230,53,0.3)",
                color: "#A3E635",
              }}
            >
              <Sparkles className="w-3 h-3" />
              AI 驱动 · v1.0
            </span>
            <span className="font-pixel text-[8px] text-ink-muted">
              PRESS START TO BEGIN
            </span>
            <span className="blink-cursor font-pixel text-[8px] text-accent" />
          </div>

          {/* 主标题 */}
          <h1 className="font-display text-5xl font-bold mb-4 leading-[1.1] tracking-tight">
            <span className="text-ink-primary">设计下一个</span>
            <br />
            <span className="text-gradient-game">令人上瘾的玩法</span>
          </h1>

          <p className="text-ink-secondary text-base max-w-2xl mb-6 leading-relaxed">
            从灵感到完整 GDD 的一体化工作台。
            <span className="text-accent">可视化机制网络</span>、
            <span className="text-cyan-400">数值平衡公式引擎</span>、
            <span className="text-purple-400">AI 自动生成设计稿</span>、
            <span className="text-pink-400">结构化 GDD 文档</span>
            —— 让设计过程像玩游戏一样有趣。
          </p>

          {/* CTA */}
          <div className="flex flex-wrap items-center gap-3 mb-8">
            <button
              onClick={() => setWizardOpen(true)}
              className="btn-primary animate-neon-pulse"
              style={{
                background: "linear-gradient(135deg, #A3E635, #84CC16)",
                border: "1px solid rgba(163,230,53,0.5)",
              }}
            >
              <Rocket className="w-4 h-4" strokeWidth={2.5} />
              <span className="font-semibold">引导式创作</span>
              <ChevronRight className="w-4 h-4" strokeWidth={2.5} />
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="btn-secondary"
            >
              <Plus className="w-4 h-4" />
              <span className="font-semibold">空白项目</span>
            </button>
            <button
              onClick={async () => {
                try {
                  const id = await createHelloWorldProject();
                  navigate(`/project/${id}/mechanism`);
                } catch {
                  // 错误已在函数内 toast
                }
              }}
              className="btn-secondary"
              title="5 分钟入门：3 节点 + 1 公式的极简项目"
            >
              <PlayCircle className="w-4 h-4" />
              <span className="font-semibold">Hello World</span>
            </button>
            <button
              onClick={() => setCaseLibraryOpen(true)}
              className="btn-secondary"
              title="从经典游戏案例导入"
            >
              <BookOpen className="w-4 h-4" />
              <span className="font-semibold">案例库</span>
            </button>
            <button
              onClick={() => setInspirationOpen(true)}
              className="btn-secondary"
              title="记录天马行空的想法"
            >
              <Lightbulb className="w-4 h-4" />
              <span className="font-semibold">灵感便签</span>
            </button>
            <span className="font-pixel text-[8px] text-ink-muted">
              ▸ FREE · LOCAL · NO LOGIN
            </span>
          </div>

          {/* 能力标签 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
            {FEATURES.map((f, i) => {
              const Icon = f.icon;
              return (
                <div
                  key={f.title}
                  className="group relative p-3 rounded-xl frosted shadow-layered transition-all duration-200 hover:border-line-strong hover:shadow-hover hover:-translate-y-0.5"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div
                    className="w-8 h-8 rounded-md flex items-center justify-center mb-2 border"
                    style={{
                      backgroundColor: `${f.color}15`,
                      borderColor: `${f.color}30`,
                    }}
                  >
                    <Icon
                      className="w-4 h-4"
                      style={{ color: f.color }}
                      strokeWidth={2.2}
                    />
                  </div>
                  <div className="text-sm font-semibold text-ink-primary">
                    {f.title}
                  </div>
                  <div className="text-2xs text-ink-muted">{f.desc}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 最近编辑快捷区（有项目时展示） */}
        {!loading && recentProjects.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-3">
              <Clock className="w-3.5 h-3.5 text-accent" />
              <span className="font-pixel text-[8px] text-ink-muted tracking-wider">
                ▸ RECENT SAVES
              </span>
              <span className="text-2xs text-ink-muted">最近编辑</span>
              <div className="flex-1 h-px bg-gradient-to-r from-line via-line-subtle to-transparent" />
              <span className="text-2xs text-ink-muted font-mono">
                {formatRelativeTime(recentProjects[0].updatedAt)}
              </span>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {recentProjects.map((project) => (
                <RecentCard
                  key={project.id}
                  project={project}
                  onClick={() =>
                    navigate(`/project/${project.id}/mechanism`)
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* 搜索栏 + 视图切换 */}
        {projects.length > 0 && (
          <div className="mb-6 flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索项目..."
                className="input-field pl-9"
              />
            </div>
            {/* 视图切换 */}
            <div className="flex items-center rounded-md frosted shadow-layered p-0.5">
              <button
                onClick={() => setView("grid")}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  view === "grid"
                    ? "bg-accent-glow text-accent"
                    : "text-ink-muted hover:text-ink-primary"
                )}
                title="网格视图"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setView("list")}
                className={cn(
                  "p-1.5 rounded transition-colors",
                  view === "list"
                    ? "bg-accent-glow text-accent"
                    : "text-ink-muted hover:text-ink-primary"
                )}
                title="列表视图"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 项目列表标题 + 排序切换 */}
        {!loading && projects.length > 0 && (
          <div className="flex items-center gap-2 mb-4">
            <span className="font-pixel text-[8px] text-ink-muted">
              ▸ SELECT PROJECT
            </span>
            <div className="flex-1 h-px bg-gradient-to-r from-line via-line-subtle to-transparent" />
            {/* 排序切换 */}
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = sort === opt.key;
                return (
                  <button
                    key={opt.key}
                    onClick={() => setSort(opt.key)}
                    className={cn(
                      "flex items-center gap-1 px-2 py-1 rounded text-2xs transition-colors",
                      active
                        ? "text-accent bg-accent-glow"
                        : "text-ink-muted hover:text-ink-primary hover:bg-canvas-elevated"
                    )}
                    title={`按${opt.label}排序`}
                  >
                    <Icon className="w-3 h-3" />
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <span className="text-2xs text-ink-muted ml-1">
              {filteredProjects.length} 个存档
            </span>
          </div>
        )}

        {/* 项目列表 */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-52 rounded-xl bg-canvas-elevated border border-line animate-pulse"
              />
            ))}
          </div>
        ) : filteredProjects.length === 0 ? (
          <EmptyState
            onCreate={() => setModalOpen(true)}
            hasProjects={projects.length > 0}
          />
        ) : view === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredProjects.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                onDelete={handleDelete}
              />
            ))}
          </div>
        ) : (
          /* 列表视图：一行一个，更紧凑 */
          <div className="flex flex-col gap-2">
            {filteredProjects.map((project) => (
              <ProjectListRow
                key={project.id}
                project={project}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </main>

      <NewProjectModal open={modalOpen} onOpenChange={setModalOpen} />
      <CaseLibraryDialog open={caseLibraryOpen} onOpenChange={setCaseLibraryOpen} />
      <GuidedCreationWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      <InspirationBoard open={inspirationOpen} onOpenChange={setInspirationOpen} />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="删除项目"
        description="确定删除该项目及其所有数据？此操作不可撤销。"
        variant="danger"
        onConfirm={() => void confirmDelete()}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setPendingDeleteId(null);
        }}
      />
    </div>
  );
}

// 最近编辑卡片缩略图（简化版，横向滚动用）
function RecentCard({
  project,
  onClick,
}: {
  project: Project;
  onClick: () => void;
}) {
  const meta = TEMPLATE_META[project.template];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className="group relative w-64 flex-shrink-0 rounded-xl frosted shadow-layered color-band-top overflow-hidden text-left transition-all duration-300 hover:border-line-strong hover:shadow-hover hover:-translate-y-0.5"
      style={{ ["--band-color" as string]: meta.color }}
    >
      {/* 顶部模板色条 */}
      <div className="relative h-12 overflow-hidden">
        <div className="absolute inset-0" style={{ background: meta.gradient }} />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.12) 2px, rgba(0,0,0,0.12) 3px)",
          }}
        />
        <div className="absolute top-2.5 left-3 flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/40">
            <Icon className="w-3.5 h-3.5 text-white" strokeWidth={2.2} />
          </div>
          <span className="text-2xs font-bold text-white uppercase tracking-widest">
            {meta.label}
          </span>
        </div>
        <div className="absolute bottom-2 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-2 transition-all">
          <ChevronRight className="w-3 h-3 text-white" strokeWidth={2.5} />
        </div>
      </div>
      {/* 底部信息 */}
      <div className="p-3">
        <h4 className="text-sm font-semibold text-ink-primary truncate group-hover:text-accent transition-colors mb-0.5">
          {project.name}
        </h4>
        <div className="flex items-center gap-1.5">
          <Clock className="w-2.5 h-2.5 text-ink-muted" />
          <span className="text-2xs text-ink-muted">
            {formatRelativeTime(project.updatedAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

// 列表视图行（紧凑，一行一个）
function ProjectListRow({
  project,
  onDelete,
}: {
  project: Project;
  onDelete: (id: string) => void;
}) {
  const navigate = useNavigate();
  const meta = TEMPLATE_META[project.template];
  const Icon = meta.icon;

  return (
    <div
      onClick={() => navigate(`/project/${project.id}/mechanism`)}
      className="group relative flex items-center gap-3 p-3 rounded-xl frosted shadow-layered cursor-pointer transition-all duration-200 hover:border-line-strong hover:shadow-hover hover:-translate-y-0.5"
    >
      {/* 模板图标 */}
      <div
        className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 border"
        style={{
          background: meta.gradient,
          borderColor: `${meta.color}55`,
        }}
      >
        <Icon className="w-4 h-4 text-white" strokeWidth={2.2} />
      </div>

      {/* 名称 + 描述 */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-semibold text-ink-primary truncate group-hover:text-accent transition-colors">
            {project.name}
          </h4>
          <span
            className="text-2xs px-1.5 py-0.5 rounded font-medium flex-shrink-0"
            style={{
              color: meta.color,
              backgroundColor: `${meta.color}15`,
              border: `1px solid ${meta.color}33`,
            }}
          >
            {meta.label}
          </span>
        </div>
        <p className="text-2xs text-ink-muted truncate">
          {project.description || "暂无描述"}
        </p>
      </div>

      {/* 最近编辑时间 */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <Clock className="w-3 h-3 text-ink-muted" />
        <span className="text-2xs text-ink-muted font-mono">
          {formatRelativeTime(project.updatedAt)}
        </span>
      </div>

      {/* 删除按钮 */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onDelete(project.id);
        }}
        className="flex-shrink-0 w-7 h-7 rounded-md text-ink-muted hover:text-danger hover:bg-danger/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
        title="删除项目"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      {/* 进入箭头 */}
      <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-accent flex-shrink-0 transition-colors" />
    </div>
  );
}

function EmptyState({
  onCreate,
  hasProjects,
}: {
  onCreate: () => void;
  hasProjects: boolean;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div
        className="w-24 h-24 rounded-2xl flex items-center justify-center mb-6 border animate-float pixel-corner"
        style={{
          background:
            "linear-gradient(135deg, rgba(163,230,53,0.15), rgba(34,211,238,0.08))",
          borderColor: "rgba(163,230,53,0.3)",
          boxShadow: "0 0 60px rgba(163,230,53,0.15)",
        }}
      >
        <Gamepad2 className="w-10 h-10 text-accent" strokeWidth={1.8} />
      </div>
      <h3 className="font-display text-2xl font-bold text-ink-primary mb-2">
        {hasProjects ? "没有找到匹配的项目" : "准备好开始冒险了吗？"}
      </h3>
      <p className="text-sm text-ink-secondary mb-6 max-w-sm">
        {hasProjects
          ? "尝试调整搜索关键词"
          : "创建你的第一个玩法设计项目，AI 将帮你生成机制网络、数值体系与 GDD 文档"}
      </p>
      {!hasProjects && (
        <button
          onClick={onCreate}
          className="btn-primary animate-neon-pulse"
          style={{
            background: "linear-gradient(135deg, #A3E635, #84CC16)",
            boxShadow: "0 0 40px rgba(163,230,53,0.4)",
          }}
        >
          <Plus className="w-4 h-4" strokeWidth={2.5} />
          <span className="font-semibold">创建第一个项目</span>
        </button>
      )}
    </div>
  );
}
