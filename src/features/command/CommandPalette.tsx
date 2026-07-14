import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/ui/Modal";
import { useUIStore } from "@/stores/uiStore";
import { useHistoryStore } from "@/stores/historyStore";
import { useProjectStore } from "@/stores/projectStore";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useSnapshotStore } from "@/stores/snapshotStore";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import {
  Network,
  Calculator,
  FileText,
  Home,
  Settings,
  FolderPlus,
  Sparkles,
  PanelLeft,
  PanelRight,
  Moon,
  Undo2,
  Redo2,
  Camera,
  Search,
} from "lucide-react";

interface Command {
  id: string;
  title: string;
  category: "导航" | "操作" | "AI" | "视图" | "历史" | "快照";
  icon: LucideIcon;
  keywords?: string[];
  shortcut?: string;
  action: () => void;
  disabled?: boolean;
}

const CATEGORY_LABEL_STYLE: Record<Command["category"], string> = {
  导航: "text-cyan-400 bg-cyan-400/10",
  操作: "text-accent bg-accent/10",
  AI: "text-purple-400 bg-purple-400/10",
  视图: "text-pink-400 bg-pink-400/10",
  历史: "text-warn bg-warn/10",
  快照: "text-cyan-400 bg-cyan-400/10",
};

// 简单模糊匹配：支持子串与子序列（按顺序出现即命中）
function fuzzyMatch(query: string, target: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) return true;
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) qi++;
  }
  return qi === q.length;
}

export default function CommandPalette() {
  const navigate = useNavigate();

  const commandPaletteOpen = useUIStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUIStore((s) => s.setCommandPaletteOpen);
  const toggleLeftPanel = useUIStore((s) => s.toggleLeftPanel);
  const toggleRightPanel = useUIStore((s) => s.toggleRightPanel);
  const toggleAIPanel = useUIStore((s) => s.toggleAIPanel);
  const aiPanelOpen = useUIStore((s) => s.aiPanelOpen);
  const theme = useUIStore((s) => s.theme);
  const setTheme = useUIStore((s) => s.setTheme);
  const addToast = useUIStore((s) => s.addToast);

  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);
  const canUndo = useHistoryStore((s) => s.past.length > 0);
  const canRedo = useHistoryStore((s) => s.future.length > 0);

  const currentProject = useProjectStore((s) => s.currentProject);
  const createProject = useProjectStore((s) => s.createProject);
  const createGraph = useMechanismStore((s) => s.createGraph);
  const selectGraph = useMechanismStore((s) => s.selectGraph);
  const createSheet = useNumericStore((s) => s.createSheet);
  const selectSheet = useNumericStore((s) => s.selectSheet);
  const createDocument = useDocumentStore((s) => s.createDocument);
  const selectDocument = useDocumentStore((s) => s.selectDocument);
  const createSnapshot = useSnapshotStore((s) => s.createSnapshot);

  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // 记录打开命令面板前的焦点元素，关闭后恢复
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const inProject = !!currentProject;
  const projectId = currentProject?.id;

  const close = () => setCommandPaletteOpen(false);

  const runCommand = (cmd: Command) => {
    if (cmd.disabled) return;
    close();
    cmd.action();
  };

  // 切换主题：更新 uiStore（唯一源），ProjectLayout useEffect 会同步 DOM
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(next);
    localStorage.setItem("theme", next);
  };

  const commands: Command[] = [
    // ===== 导航 =====
    {
      id: "nav-mechanism",
      title: "跳转机制设计",
      category: "导航",
      icon: Network,
      keywords: ["mechanism", "机制", "网络图"],
      action: () => {
        if (projectId) navigate(`/project/${projectId}/mechanism`);
      },
      disabled: !inProject,
    },
    {
      id: "nav-numeric",
      title: "跳转数值设计",
      category: "导航",
      icon: Calculator,
      keywords: ["numeric", "数值", "公式"],
      action: () => {
        if (projectId) navigate(`/project/${projectId}/numeric`);
      },
      disabled: !inProject,
    },
    {
      id: "nav-document",
      title: "跳转 GDD 文档",
      category: "导航",
      icon: FileText,
      keywords: ["document", "gdd", "文档"],
      action: () => {
        if (projectId) navigate(`/project/${projectId}/document`);
      },
      disabled: !inProject,
    },
    {
      id: "nav-home",
      title: "返回项目首页",
      category: "导航",
      icon: Home,
      keywords: ["home", "首页", "工作台"],
      action: () => navigate("/"),
    },
    {
      id: "nav-settings",
      title: "打开设置",
      category: "导航",
      icon: Settings,
      keywords: ["settings", "设置", "配置"],
      action: () => navigate("/settings"),
    },

    // ===== 操作 =====
    {
      id: "new-mechanism",
      title: "新建机制图",
      category: "操作",
      icon: Network,
      keywords: ["new", "graph", "机制", "创建"],
      action: async () => {
        if (!projectId) return;
        try {
          const graph = await createGraph(projectId, "新机制图", "node_graph");
          await selectGraph(graph.id);
          addToast({ title: "机制图已创建", variant: "success" });
        } catch (e) {
          addToast({
            title: "创建失败",
            description: e instanceof Error ? e.message : "",
            variant: "error",
          });
        }
      },
      disabled: !inProject,
    },
    {
      id: "new-numeric",
      title: "新建数值表",
      category: "操作",
      icon: Calculator,
      keywords: ["new", "sheet", "数值", "创建"],
      action: async () => {
        if (!projectId) return;
        try {
          const sheet = await createSheet(projectId, "新数值表");
          await selectSheet(sheet.id);
          addToast({ title: "数值表已创建", variant: "success" });
        } catch (e) {
          addToast({
            title: "创建失败",
            description: e instanceof Error ? e.message : "",
            variant: "error",
          });
        }
      },
      disabled: !inProject,
    },
    {
      id: "new-document",
      title: "新建文档",
      category: "操作",
      icon: FileText,
      keywords: ["new", "doc", "文档", "创建"],
      action: async () => {
        if (!projectId) return;
        try {
          const doc = await createDocument(projectId, "新文档");
          await selectDocument(doc.id);
          addToast({ title: "文档已创建", variant: "success" });
        } catch (e) {
          addToast({
            title: "创建失败",
            description: e instanceof Error ? e.message : "",
            variant: "error",
          });
        }
      },
      disabled: !inProject,
    },
    {
      id: "new-project",
      title: "新建项目",
      category: "操作",
      icon: FolderPlus,
      keywords: ["new", "project", "项目", "创建"],
      action: async () => {
        try {
          const project = await createProject("未命名项目", "", "blank");
          await createGraph(project.id, "主机制图", "node_graph");
          await createSheet(project.id, "主数值表");
          addToast({
            title: "项目已创建",
            description: project.name,
            variant: "success",
          });
          navigate(`/project/${project.id}/mechanism`);
        } catch (e) {
          addToast({
            title: "创建失败",
            description: e instanceof Error ? e.message : "",
            variant: "error",
          });
        }
      },
    },

    // ===== AI =====
    {
      id: "ai-open",
      title: "打开 AI 面板",
      category: "AI",
      icon: Sparkles,
      keywords: ["ai", "open", "助手", "sparkles"],
      action: () => toggleAIPanel(),
      disabled: !inProject || aiPanelOpen,
    },
    {
      id: "ai-close",
      title: "关闭 AI 面板",
      category: "AI",
      icon: Sparkles,
      keywords: ["ai", "close", "助手"],
      action: () => toggleAIPanel(),
      disabled: !inProject || !aiPanelOpen,
    },

    // ===== 视图 =====
    {
      id: "view-left",
      title: "切换左面板",
      category: "视图",
      icon: PanelLeft,
      keywords: ["left", "panel", "左面板"],
      action: () => toggleLeftPanel(),
      disabled: !inProject,
    },
    {
      id: "view-right",
      title: "切换右面板",
      category: "视图",
      icon: PanelRight,
      keywords: ["right", "panel", "右面板"],
      action: () => toggleRightPanel(),
      disabled: !inProject,
    },
    {
      id: "view-theme",
      title: "切换主题",
      category: "视图",
      icon: Moon,
      keywords: ["theme", "dark", "light", "主题", "深色", "浅色"],
      action: () => toggleTheme(),
    },

    // ===== 历史 =====
    {
      id: "history-undo",
      title: "撤销",
      category: "历史",
      icon: Undo2,
      keywords: ["undo", "撤销"],
      shortcut: "⌘Z",
      action: () => void undo(),
      disabled: !canUndo,
    },
    {
      id: "history-redo",
      title: "重做",
      category: "历史",
      icon: Redo2,
      keywords: ["redo", "重做"],
      shortcut: "⌘⇧Z",
      action: () => void redo(),
      disabled: !canRedo,
    },

    // ===== 快照 =====
    {
      id: "snapshot-create",
      title: "创建快照",
      category: "快照",
      icon: Camera,
      keywords: ["snapshot", "快照", "保存"],
      action: async () => {
        if (!projectId) return;
        try {
          const name = `快照 ${new Date().toLocaleString("zh-CN")}`;
          await createSnapshot(projectId, name);
          addToast({ title: "快照已创建", variant: "success" });
        } catch (e) {
          addToast({
            title: "创建快照失败",
            description: e instanceof Error ? e.message : "",
            variant: "error",
          });
        }
      },
      disabled: !inProject,
    },
  ];

  const filtered = commands.filter((cmd) => {
    const haystack = [cmd.title, cmd.category, ...(cmd.keywords ?? [])].join(
      " "
    );
    return fuzzyMatch(query, haystack);
  });

  // 查询变化时重置选中项
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // 选中项自动滚动到可视区域
  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  // 打开时记录先前焦点并聚焦输入框；关闭后恢复焦点到触发元素
  useEffect(() => {
    if (commandPaletteOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement | null;
      setQuery("");
      setSelectedIndex(0);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    } else {
      // 关闭后恢复焦点（用 rAF 避开 Radix Dialog 卸载时序）
      const prev = previousFocusRef.current;
      if (prev && typeof prev.focus === "function") {
        requestAnimationFrame(() => {
          prev.focus();
          previousFocusRef.current = null;
        });
      }
    }
  }, [commandPaletteOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = filtered[selectedIndex];
      if (cmd) runCommand(cmd);
    }
  };

  const safeIndex = Math.min(selectedIndex, Math.max(filtered.length - 1, 0));

  return (
    <Modal
      open={commandPaletteOpen}
      onOpenChange={setCommandPaletteOpen}
      className="max-w-xl p-0 overflow-hidden flex flex-col max-h-[70vh]"
    >
      {/* 搜索输入 */}
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-line-subtle pr-12">
        <Search className="w-4 h-4 text-ink-muted flex-shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入命令或关键词搜索..."
          className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
        />
      </div>

      {/* 命令列表 */}
      <div className="flex-1 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-ink-muted">
            无匹配命令
          </div>
        ) : (
          filtered.map((cmd, i) => {
            const Icon = cmd.icon;
            const selected = i === safeIndex;
            return (
              <button
                key={cmd.id}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                onClick={() => runCommand(cmd)}
                onMouseMove={() => setSelectedIndex(i)}
                tabIndex={-1}
                aria-disabled={cmd.disabled}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors",
                  selected
                    ? "bg-accent-glow text-ink-primary"
                    : "text-ink-secondary hover:bg-canvas-sunken hover:text-ink-primary",
                  cmd.disabled && "opacity-40 cursor-not-allowed"
                )}
              >
                <Icon
                  className={cn(
                    "w-4 h-4 flex-shrink-0",
                    selected ? "text-accent" : "text-ink-muted"
                  )}
                />
                <span className="flex-1 text-sm truncate">{cmd.title}</span>
                <span
                  className={cn(
                    "text-2xs px-1.5 py-0.5 rounded flex-shrink-0",
                    CATEGORY_LABEL_STYLE[cmd.category]
                  )}
                >
                  {cmd.category}
                </span>
                {cmd.shortcut && (
                  <kbd className="font-mono text-2xs px-1.5 py-0.5 rounded border border-line bg-canvas-sunken text-ink-muted flex-shrink-0">
                    {cmd.shortcut}
                  </kbd>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* 底部快捷键提示 */}
      <div className="px-4 h-8 border-t border-line-subtle flex items-center gap-3 text-2xs text-ink-muted">
        <span>
          <kbd className="font-mono">↑↓</kbd> 选择
        </span>
        <span>
          <kbd className="font-mono">↵</kbd> 执行
        </span>
        <span>
          <kbd className="font-mono">esc</kbd> 关闭
        </span>
        <div className="flex-1" />
        <span className="font-mono">{filtered.length} 条命令</span>
      </div>
    </Modal>
  );
}
