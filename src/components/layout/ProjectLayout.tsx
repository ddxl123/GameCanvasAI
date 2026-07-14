import { useEffect, useState } from "react";
import {
  useParams,
  Outlet,
  useNavigate,
  NavLink,
} from "react-router-dom";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import { useHistoryStore } from "@/stores/historyStore";
import {
  useMechanismStore,
  clearPositionCache as clearMechanismPositionCache,
} from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useGameplayStore } from "@/stores/gameplayStore";
import { useRuleStore } from "@/stores/ruleStore";
import { useLevelStore, clearPositionCache as clearLevelPositionCache } from "@/stores/levelStore";
import { useHistoryShortcuts } from "@/hooks/useHistoryShortcuts";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  Sparkles,
  PanelLeft,
  PanelRight,
  Gamepad2,
  Undo2,
  Redo2,
  Search,
  Camera,
  Sun,
  Moon,
  LayoutDashboard,
  Download,
  GitCompare,
  Cpu,
  Presentation,
  Lightbulb,
  PlayCircle,
  GraduationCap,
} from "lucide-react";
import AIPanel from "@/features/ai/AIPanel";
import AIMentorPanel from "@/features/ai/AIMentorPanel";
import CommandPalette from "@/features/command/CommandPalette";
import ShortcutCheatsheet from "@/features/command/ShortcutCheatsheet";
import GlobalSearch from "@/features/search/GlobalSearch";
import SnapshotPanel from "@/features/snapshot/SnapshotPanel";
import SnapshotDiff from "@/features/snapshot/SnapshotDiff";
import ExportDialog from "@/features/project/ExportDialog";
import PerformanceBudgetPanel from "@/features/mechanism/PerformanceBudgetPanel";
import PresentationMode from "@/features/presentation/PresentationMode";
import InspirationBoard from "@/features/inspiration/InspirationBoard";
import PlayPreview from "@/features/playtest/PlayPreview";
import OnboardingChecklist from "@/features/onboarding/OnboardingChecklist";
import SoundToggle from "@/features/settings/SoundToggle";
import CreateToolbar from "@/features/canvas/CreateToolbar";
import UnifiedPropertyPanel from "@/features/canvas/UnifiedPropertyPanel";

export default function ProjectLayout() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const { currentProject, setCurrentProject, getProject } = useProjectStore();
  const {
    leftPanelCollapsed,
    rightPanelCollapsed,
    toggleLeftPanel,
    toggleRightPanel,
    aiPanelOpen,
    toggleAIPanel,
    setCommandPaletteOpen,
    theme,
    setTheme,
  } = useUIStore();
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);
  const undoDesc = useHistoryStore((s) =>
    s.past.length > 0 ? s.past[s.past.length - 1].description : null
  );
  const redoDesc = useHistoryStore((s) =>
    s.future.length > 0 ? s.future[s.future.length - 1].description : null
  );
  const clearHistory = useHistoryStore((s) => s.clear);
  const selectedCanvasElement = useUIStore((s) => s.selectedCanvasElement);

  // 底部状态栏：所有维度元素计数
  const mechanismNodesCount = useMechanismStore((s) => s.nodes.length);
  const gameplayLoopsCount = useGameplayStore((s) => s.loops.length);
  const gameplayMomentsCount = useGameplayStore((s) => s.moments.length);
  const rulesCount = useRuleStore((s) => s.rules.length);
  const matricesCount = useRuleStore((s) => s.matrices.length);
  const levelFlowsCount = useLevelStore((s) => s.flows.length);
  const numericAttributesCount = useNumericStore((s) => s.attributes.length);
  const documentsCount = useDocumentStore((s) => s.documents.length);

  // 全局弹窗状态
  const [searchOpen, setSearchOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [snapshotDiffOpen, setSnapshotDiffOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [presentationOpen, setPresentationOpen] = useState(false);
  const [inspirationOpen, setInspirationOpen] = useState(false);
  const [playPreviewOpen, setPlayPreviewOpen] = useState(false);
  const [mentorOpen, setMentorOpen] = useState(false);
  const [cheatsheetOpen, setCheatsheetOpen] = useState(false);

  // 响应式：窗口宽度 ≤768px 视为移动端
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia("(max-width: 768px)").matches
  );

  useHistoryShortcuts();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // ? 键触发速查表（Shift+/ 产生 "?"，无修饰键）
      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const target = e.target as HTMLElement | null;
        const tag = target?.tagName?.toLowerCase();
        // 编辑态不触发
        if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
        e.preventDefault();
        setCheatsheetOpen(true);
        return;
      }
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      // Cmd+K → 命令面板
      if (e.key === "k" && !e.shiftKey) {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      // Cmd+Shift+F → 全局搜索（替代原 Cmd+P / Cmd+Shift+K，避免与浏览器打印冲突）
      if (e.key === "f" && e.shiftKey) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setCommandPaletteOpen]);

  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // 监听窗口尺寸变化，同步 isMobile 状态
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 768px)");
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  // 小屏首次进入时自动折叠左右面板为抽屉式
  useEffect(() => {
    if (isMobile) {
      useUIStore.setState({ leftPanelCollapsed: true, rightPanelCollapsed: true });
    }
  }, [isMobile]);

  useEffect(() => {
    if (!projectId) return;
    getProject(projectId).then((p) => {
      if (!p) {
        navigate("/");
        return;
      }
      setCurrentProject(p);
      clearHistory();
    });
    // 项目切换时清理上一份节点位置缓存，避免错位写入新项目
    return () => {
      clearMechanismPositionCache();
      clearLevelPositionCache();
    };
  }, [projectId, getProject, setCurrentProject, navigate, clearHistory]);

  if (!currentProject) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-ink-muted animate-pulse">加载项目中...</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col canvas-ambient overflow-hidden">
      {/* 顶部栏 */}
      <header
        className="h-12 border-b border-accent/20 flex items-center px-3 gap-2 flex-shrink-0 frosted-panel"
      >
        <button
          onClick={() => navigate("/")}
          className="btn-ghost h-8 px-2 group"
          title="返回工作台"
          aria-label="返回工作台"
        >
          <ChevronLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
        </button>

        <div className="flex items-center gap-2 text-sm">
          <div
            className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
            style={{
              background:
                "linear-gradient(135deg, #A3E635 0%, #84CC16 100%)",
            }}
          >
            <Gamepad2 className="w-3 h-3 text-canvas-sunken" strokeWidth={2.5} />
          </div>
          <span className="text-ink-muted text-xs">项目</span>
          <span className="text-ink-muted">/</span>
          <span className="font-medium text-ink-primary">
            {currentProject.name}
          </span>
        </div>

        <div className="flex-1" />

        {/* 模块 Tab */}
        <nav className="flex items-center gap-0.5 p-1 rounded-lg bg-canvas-sunken/50 border border-accent/15">
          <NavLink
            to={`/project/${projectId}/workspace`}
            className={({ isActive }) =>
              cn(
                "relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all bg-canvas-sunken/50",
                isActive
                  ? "text-accent shadow-[0_0_12px_rgba(163,230,53,0.2)]"
                  : "text-ink-secondary hover:text-ink-primary"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Gamepad2 className="w-3.5 h-3.5" />
                设计工作台
                {isActive && (
                  <span className="absolute left-2 right-2 bottom-0.5 h-0.5 rounded-full bg-accent" />
                )}
              </>
            )}
          </NavLink>
          <NavLink
            to={`/project/${projectId}/dashboard`}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                isActive
                  ? "text-accent bg-canvas-sunken/50"
                  : "text-ink-secondary hover:text-ink-primary"
              )
            }
          >
            <LayoutDashboard className="w-3.5 h-3.5" />
            概览
          </NavLink>
        </nav>

        <div className="flex-1" />

        {/* 右侧工具栏 */}
        <div className="flex items-center gap-0.5">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => void undo()}
              disabled={!canUndo}
              className={cn(
                "btn-ghost h-8 w-8 p-0 flex items-center justify-center",
                !canUndo && "opacity-30 cursor-not-allowed"
              )}
              title={canUndo ? `撤销：${undoDesc}` : "无可撤销操作"}
              aria-label={canUndo ? `撤销：${undoDesc}` : "无可撤销操作"}
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => void redo()}
              disabled={!canRedo}
              className={cn(
                "btn-ghost h-8 w-8 p-0 flex items-center justify-center",
                !canRedo && "opacity-30 cursor-not-allowed"
              )}
              title={canRedo ? `重做：${redoDesc}` : "无可重做操作"}
              aria-label={canRedo ? `重做：${redoDesc}` : "无可重做操作"}
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <span className="w-px h-4 bg-line-subtle mx-1" />

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setSearchOpen(true)}
              className="btn-ghost h-8 px-2"
              title="全局搜索 (Cmd+Shift+F)"
              aria-label="全局搜索 (Cmd+Shift+F)"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSnapshotOpen(true)}
              className="btn-ghost h-8 px-2"
              title="设计快照 / 版本"
              aria-label="设计快照 / 版本"
            >
              <Camera className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSnapshotDiffOpen(true)}
              className="btn-ghost h-8 px-2"
              title="快照对比 (Diff)"
              aria-label="快照对比 (Diff)"
            >
              <GitCompare className="w-4 h-4" />
            </button>
          </div>
          <span className="w-px h-4 bg-line-subtle mx-1" />

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setExportOpen(true)}
              className="btn-ghost h-8 px-2"
              title="引擎导出 (JSON/Unity/Godot)"
              aria-label="引擎导出 (JSON/Unity/Godot)"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => setBudgetOpen(true)}
              className="btn-ghost h-8 px-2"
              title="性能预算分析"
              aria-label="性能预算分析"
            >
              <Cpu className="w-4 h-4" />
            </button>
          </div>
          <span className="w-px h-4 bg-line-subtle mx-1" />

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setPresentationOpen(true)}
              className="btn-ghost h-8 px-2"
              title="演示 / 汇报模式"
              aria-label="演示 / 汇报模式"
            >
              <Presentation className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPlayPreviewOpen(true)}
              className="btn-ghost h-8 px-2 text-accent"
              title="可视化试玩：看机制图跑起来"
              aria-label="可视化试玩：看机制图跑起来"
            >
              <PlayCircle className="w-4 h-4" />
            </button>
          </div>
          <span className="w-px h-4 bg-line-subtle mx-1" />

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setInspirationOpen(true)}
              className="btn-ghost h-8 px-2"
              title="灵感便签"
              aria-label="灵感便签"
            >
              <Lightbulb className="w-4 h-4" />
            </button>
            <button
              onClick={() => setMentorOpen(true)}
              className="btn-ghost h-8 px-2 text-accent"
              title="AI 导师：主动分析设计并给建议"
              aria-label="AI 导师：主动分析设计并给建议"
            >
              <GraduationCap className="w-4 h-4" />
            </button>
          </div>
          <span className="w-px h-4 bg-line-subtle mx-1" />

          <div className="flex items-center gap-0.5">
            <button
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="btn-ghost h-8 w-8 p-0 flex items-center justify-center"
              title={theme === "dark" ? "切换到亮色" : "切换到暗色"}
              aria-label={theme === "dark" ? "切换到亮色" : "切换到暗色"}
            >
              {theme === "dark" ? (
                <Sun className="w-3.5 h-3.5" />
              ) : (
                <Moon className="w-3.5 h-3.5" />
              )}
            </button>
            <SoundToggle />
            <button
              onClick={toggleAIPanel}
              className={cn(
                "btn-ghost h-8 px-2.5 relative",
                aiPanelOpen && "text-accent bg-accent-glow"
              )}
              title="AI 助手"
              aria-label="AI 助手"
            >
              <Sparkles className="w-4 h-4" />
              {aiPanelOpen && (
                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
              )}
            </button>
            <button
              onClick={toggleRightPanel}
              className="btn-ghost h-8 px-2"
              title="切换右侧面板"
              aria-label="切换右侧面板"
            >
              <PanelRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* 主体区域 */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* 左侧面板 — 创建工具栏 */}
        <aside
          className={cn(
            "border-r border-accent/10 frosted flex flex-col",
            isMobile
              ? cn(
                  "absolute z-30 h-full w-56 transition-transform duration-200",
                  leftPanelCollapsed && "-translate-x-full"
                )
              : cn(
                  "w-56 flex-shrink-0",
                  leftPanelCollapsed && "hidden"
                )
          )}
        >
          <div className="h-9 border-b border-accent/15 flex items-center justify-between px-3">
            <span className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
              创建元素
            </span>
            <button
              onClick={toggleLeftPanel}
              className="text-ink-muted hover:text-ink-primary"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-2">
            <CreateToolbar />
          </div>
        </aside>

        {/* 中间编辑区 — 无限画布 */}
        <main className="flex-1 overflow-hidden min-w-0 relative canvas-ambient">
          <div className="relative h-full">
            <Outlet />
          </div>
        </main>

        {/* 右侧面板 — 属性编辑器 / AI 助手 */}
        <aside
          className={cn(
            "border-l border-accent/10 frosted flex flex-col",
            isMobile
              ? cn(
                  "absolute right-0 z-30 h-full w-72 transition-transform duration-200",
                  rightPanelCollapsed && "translate-x-full"
                )
              : cn(
                  "w-72 flex-shrink-0",
                  rightPanelCollapsed && "hidden"
                )
          )}
        >
          <div className="h-9 border-b border-accent/15 flex items-center px-3">
            <span className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
              {aiPanelOpen ? "AI 助手" : "属性编辑"}
            </span>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {aiPanelOpen ? (
              <AIPanel />
            ) : (
              <UnifiedPropertyPanel
                selectedElement={selectedCanvasElement}
              />
            )}
          </div>
        </aside>
      </div>

      {/* 底部状态栏 */}
      <footer className="h-6 flex-shrink-0 border-t border-accent/10 frosted flex items-center justify-between px-3 text-2xs text-ink-muted">
        <div className="flex items-center gap-2">
          <span className="text-accent/80">●</span>
          <span className="font-medium text-ink-secondary">设计工作台</span>
          <span className="flex items-center gap-1.5">
            <span>· 循环 {gameplayLoopsCount}</span>
            <span>时刻 {gameplayMomentsCount}</span>
            <span>节点 {mechanismNodesCount}</span>
            <span>规则 {rulesCount}</span>
            <span>矩阵 {matricesCount}</span>
            <span>关卡 {levelFlowsCount}</span>
            <span>属性 {numericAttributesCount}</span>
            <span>文档 {documentsCount}</span>
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
          <span>已自动保存</span>
          {currentProject.updatedAt && (
            <span className="tabular-nums">
              {new Date(currentProject.updatedAt).toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
        <div className="text-ink-muted/80">
          {mechanismNodesCount > 30
            ? "节点数较多，建议分组管理"
            : "Tip: Cmd+K 打开命令面板"}
        </div>
      </footer>

      {/* 全局弹窗 */}
      <CommandPalette />
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <SnapshotPanel open={snapshotOpen} onOpenChange={setSnapshotOpen} />
      <SnapshotDiff open={snapshotDiffOpen} onOpenChange={setSnapshotDiffOpen} />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        project={currentProject}
      />
      <PerformanceBudgetPanel
        open={budgetOpen}
        onOpenChange={setBudgetOpen}
      />
      <PresentationMode
        open={presentationOpen}
        onClose={() => setPresentationOpen(false)}
      />
      <InspirationBoard open={inspirationOpen} onOpenChange={setInspirationOpen} />
      <PlayPreview
        open={playPreviewOpen}
        onClose={() => setPlayPreviewOpen(false)}
      />
      <AIMentorPanel open={mentorOpen} onOpenChange={setMentorOpen} />
      <ShortcutCheatsheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />

      {projectId && <OnboardingChecklist projectId={projectId} />}
    </div>
  );
}
