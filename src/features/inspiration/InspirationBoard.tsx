import { useEffect, useMemo, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useInspirationStore, DEFAULT_NOTE_COLOR } from "@/stores/inspirationStore";
import { useProjectStore } from "@/stores/projectStore";
import { useAIStore } from "@/stores/aiStore";
import { useUIStore } from "@/stores/uiStore";
import { callAIStream } from "@/lib/aiClient";
import { buildInspirationPrompt } from "@/lib/aiPrompts";
import { formatRelativeTime } from "@/lib/time";
import type {
  Inspiration,
  InspirationCategory,
  InspirationStatus,
} from "@/types";
import {
  Lightbulb,
  Plus,
  Trash2,
  Pencil,
  X,
  Loader2,
  Tag,
  Network,
  FileText,
  Filter,
  Sparkles,
} from "lucide-react";

interface InspirationBoardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 便签颜色调色板
const NOTE_COLORS = [
  "#FBBF24",
  "#A3E635",
  "#22D3EE",
  "#A78BFA",
  "#F472B6",
  "#FB923C",
  "#34D399",
  "#60A5FA",
];

const CATEGORY_LABEL: Record<InspirationCategory, string> = {
  gameplay: "玩法",
  narrative: "叙事",
  art: "美术",
  music: "音乐",
  character: "角色",
  level: "关卡",
  economy: "经济",
  combat: "战斗",
  other: "其他",
};

const CATEGORY_OPTIONS: InspirationCategory[] = [
  "gameplay",
  "narrative",
  "art",
  "music",
  "character",
  "level",
  "economy",
  "combat",
  "other",
];

const STATUS_LABEL: Record<InspirationStatus, string> = {
  idea: "想法",
  drafted: "已起草",
  in_progress: "进行中",
  realized: "已实现",
  archived: "已归档",
};

const STATUS_OPTIONS: InspirationStatus[] = [
  "idea",
  "drafted",
  "in_progress",
  "realized",
  "archived",
];

// 状态徽章样式
const STATUS_BADGE_CLASS: Record<InspirationStatus, string> = {
  idea: "bg-blue-500/15 text-blue-300 border-blue-500/30",
  drafted: "bg-purple-500/15 text-purple-300 border-purple-500/30",
  in_progress: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  realized: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  archived: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
};

// 将 hex 颜色转为 rgba 字符串
function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface FormState {
  title: string;
  content: string;
  category: InspirationCategory;
  tags: string[];
  color: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  content: "",
  category: "other",
  tags: [],
  color: NOTE_COLORS[0],
};

export default function InspirationBoard({
  open,
  onOpenChange,
}: InspirationBoardProps) {
  const navigate = useNavigate();
  const currentProject = useProjectStore((s) => s.currentProject);
  const addToast = useUIStore((s) => s.addToast);
  const {
    inspirations,
    loading,
    loadInspirations,
    addInspiration,
    updateInspiration,
    deleteInspiration,
    upgradeToGraph,
    upgradeToGDD,
  } = useInspirationStore();

  const [categoryFilter, setCategoryFilter] = useState<
    InspirationCategory | "all"
  >("all");
  const [statusFilter, setStatusFilter] = useState<
    InspirationStatus | "all"
  >("all");

  // 表单状态
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tagInput, setTagInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // 操作中的便签 id
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      // 加载当前项目灵感；无项目时加载全局灵感
      loadInspirations(currentProject ? currentProject.id : null);
    }
  }, [open, currentProject, loadInspirations]);

  // 筛选
  const visibleInspirations = useMemo(() => {
    return inspirations.filter((i) => {
      if (categoryFilter !== "all" && i.category !== categoryFilter)
        return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      return true;
    });
  }, [inspirations, categoryFilter, statusFilter]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setTagInput("");
    setFormOpen(true);
  };

  const handleOpenEdit = (inspiration: Inspiration) => {
    setEditingId(inspiration.id);
    setForm({
      title: inspiration.title,
      content: inspiration.content ?? "",
      category: inspiration.category,
      tags: [...inspiration.tags],
      color: inspiration.color,
    });
    setTagInput("");
    setFormOpen(true);
  };

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (form.tags.includes(t)) {
      setTagInput("");
      return;
    }
    setForm((f) => ({ ...f, tags: [...f.tags, t] }));
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    setForm((f) => ({ ...f, tags: f.tags.filter((t) => t !== tag) }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      addToast({ title: "请输入灵感标题", variant: "warning" });
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        projectId: currentProject ? currentProject.id : null,
        title: form.title,
        content: form.content,
        tags: form.tags,
        category: form.category,
        color: form.color,
      };
      if (editingId) {
        await updateInspiration(editingId, payload);
        addToast({ title: "灵感已更新", variant: "success" });
      } else {
        await addInspiration(payload);
        addToast({ title: "灵感已记录", variant: "success" });
      }
      setFormOpen(false);
    } catch (e) {
      addToast({
        title: "保存失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: string) => {
    setPendingDeleteId(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteInspiration = async () => {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    setDeleteConfirmOpen(false);
    setPendingDeleteId(null);
    setBusyId(id);
    try {
      await deleteInspiration(id);
      addToast({ title: "已删除", variant: "success" });
    } catch (e) {
      addToast({
        title: "删除失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleUpgradeToGraph = async (inspiration: Inspiration) => {
    if (!currentProject) {
      addToast({ title: "请先选择项目", variant: "warning" });
      return;
    }
    setBusyId(inspiration.id);
    try {
      const graphId = await upgradeToGraph(inspiration.id, currentProject.id);
      addToast({
        title: "已升级为机制图",
        description: "灵感状态已更新为「已起草」",
        variant: "success",
      });
      onOpenChange(false);
      navigate(`/project/${currentProject.id}/mechanism`);
      void graphId;
    } catch (e) {
      addToast({
        title: "升级失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  const handleUpgradeToGDD = async (inspiration: Inspiration) => {
    if (!currentProject) {
      addToast({ title: "请先选择项目", variant: "warning" });
      return;
    }
    setBusyId(inspiration.id);
    try {
      const docId = await upgradeToGDD(inspiration.id, currentProject.id);
      addToast({
        title: "已升级为 GDD 文档",
        description: "灵感状态已更新为「已起草」",
        variant: "success",
      });
      onOpenChange(false);
      navigate(`/project/${currentProject.id}/document`);
      void docId;
    } catch (e) {
      addToast({
        title: "升级失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setBusyId(null);
    }
  };

  // AI 扩展灵感
  const { getActiveConfig } = useAIStore();
  const [aiExpandId, setAiExpandId] = useState<string | null>(null);
  const [aiExpandContent, setAiExpandContent] = useState<Record<string, string>>({});
  const aiAbortRef = useRef<AbortController | null>(null);

  const handleAiExpand = async (inspiration: Inspiration) => {
    const config = getActiveConfig();
    if (!config) {
      addToast({ title: "AI 未启用", description: "请在设置中配置 API Key", variant: "warning" });
      return;
    }
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiExpandId(inspiration.id);
    setAiExpandContent((prev) => ({ ...prev, [inspiration.id]: "" }));
    try {
      const messages = buildInspirationPrompt(
        { title: inspiration.title, content: inspiration.content, tags: inspiration.tags },
        currentProject ?? undefined
      );
      await callAIStream(
        { config, messages, signal: controller.signal },
        (chunk) => {
          setAiExpandContent((prev) => ({
            ...prev,
            [inspiration.id]: (prev[inspiration.id] ?? "") + chunk,
          }));
        }
      );
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      addToast({
        title: "AI 扩展失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      aiAbortRef.current = null;
      setAiExpandId(null);
    }
  };

  const handleStopAiExpand = () => {
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    setAiExpandId(null);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="灵感便签"
      description={
        currentProject
          ? `当前项目：${currentProject.name}`
          : "全局灵感（未归属项目）"
      }
      className="max-w-4xl"
    >
      <div className="flex flex-col max-h-[80vh]">
        {/* 工具栏 */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <button
            onClick={handleOpenAdd}
            className="btn-primary text-xs px-3 py-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            添加灵感
          </button>

          {/* 分类筛选 */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-ink-muted" />
            <select
              value={categoryFilter}
              onChange={(e) =>
                setCategoryFilter(e.target.value as InspirationCategory | "all")
              }
              className="input-field text-xs py-1 px-2 w-auto"
            >
              <option value="all">全部分类</option>
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          {/* 状态筛选 */}
          <select
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as InspirationStatus | "all")
            }
            className="input-field text-xs py-1 px-2 w-auto"
          >
            <option value="all">全部状态</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>

          <span className="text-2xs text-ink-muted ml-auto">
            {visibleInspirations.length} / {inspirations.length} 条
          </span>
        </div>

        {/* 便签列表（瀑布流） */}
        <div className="flex-1 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 text-ink-muted animate-spin" />
            </div>
          ) : visibleInspirations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Lightbulb className="w-10 h-10 text-ink-muted mb-3 opacity-40" />
              <p className="text-sm text-ink-secondary font-medium">
                还没有灵感便签
              </p>
              <p className="text-xs text-ink-muted mt-1">
                闪过一丝想法？把它记下来，日后可升级为机制图或文档
              </p>
              <button
                onClick={handleOpenAdd}
                className="btn-secondary text-xs mt-4 px-3 py-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                记录第一个灵感
              </button>
            </div>
          ) : (
            <div className="[column-fill:_balance] gap-3 space-y-3" style={{ columnCount: 2 }}>
              {visibleInspirations.map((inspiration) => (
                <NoteCard
                  key={inspiration.id}
                  inspiration={inspiration}
                  hasProject={!!currentProject}
                  busy={busyId === inspiration.id}
                  aiExpanding={aiExpandId === inspiration.id}
                  aiContent={aiExpandContent[inspiration.id]}
                  onEdit={() => handleOpenEdit(inspiration)}
                  onDelete={() => handleDelete(inspiration.id)}
                  onUpgradeGraph={() => handleUpgradeToGraph(inspiration)}
                  onUpgradeGDD={() => handleUpgradeToGDD(inspiration)}
                  onAiExpand={() => handleAiExpand(inspiration)}
                  onStopAiExpand={handleStopAiExpand}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 添加/编辑表单 Modal */}
      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editingId ? "编辑灵感" : "记录灵感"}
        className="max-w-lg"
      >
        <div className="space-y-3">
          {/* 标题 */}
          <div>
            <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
              标题 *
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="一句话想法，例如：用天气系统驱动探索节奏"
              className="input-field text-sm mt-1"
              autoFocus
            />
          </div>

          {/* 详细描述 */}
          <div>
            <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
              详细描述
            </label>
            <textarea
              value={form.content}
              onChange={(e) =>
                setForm((f) => ({ ...f, content: e.target.value }))
              }
              placeholder="展开描述玩法、动机、参考案例……"
              rows={3}
              className="input-field text-sm mt-1 resize-none"
            />
          </div>

          {/* 分类 */}
          <div>
            <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
              分类
            </label>
            <select
              value={form.category}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  category: e.target.value as InspirationCategory,
                }))
              }
              className="input-field text-sm mt-1"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </select>
          </div>

          {/* 标签 */}
          <div>
            <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
              标签
            </label>
            <div className="flex items-center gap-1.5 mt-1">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddTag();
                  }
                }}
                placeholder="输入标签后回车"
                className="input-field text-xs py-1.5 flex-1"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="btn-secondary text-xs px-2.5 py-1.5"
              >
                <Plus className="w-3 h-3" />
                添加
              </button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-2xs bg-canvas-sunken border border-line text-ink-secondary"
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="text-ink-muted hover:text-danger transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 颜色 */}
          <div>
            <label className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
              便签颜色
            </label>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {NOTE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, color }))}
                  className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor:
                      form.color === color ? "#fff" : "transparent",
                    outline:
                      form.color === color
                        ? `2px solid ${color}`
                        : "none",
                    outlineOffset: "1px",
                  }}
                  title={color}
                />
              ))}
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="btn-ghost text-sm"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !form.title.trim()}
              className="btn-primary text-sm"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  保存中...
                </>
              ) : editingId ? (
                "保存修改"
              ) : (
                "记录灵感"
              )}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="删除灵感"
        description="确定删除这条灵感便签？"
        variant="danger"
        onConfirm={() => void confirmDeleteInspiration()}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setPendingDeleteId(null);
        }}
      />
    </Modal>
  );
}

interface NoteCardProps {
  inspiration: Inspiration;
  hasProject: boolean;
  busy: boolean;
  aiExpanding: boolean;
  aiContent?: string;
  onEdit: () => void;
  onDelete: () => void;
  onUpgradeGraph: () => void;
  onUpgradeGDD: () => void;
  onAiExpand: () => void;
  onStopAiExpand: () => void;
}

function NoteCard({
  inspiration,
  hasProject,
  busy,
  aiExpanding,
  aiContent,
  onEdit,
  onDelete,
  onUpgradeGraph,
  onUpgradeGDD,
  onAiExpand,
  onStopAiExpand,
}: NoteCardProps) {
  const color = inspiration.color || DEFAULT_NOTE_COLOR;
  return (
    <div
      className="break-inside-avoid mb-3 rounded-lg border border-line overflow-hidden group"
      style={{
        backgroundColor: hexToRgba(color, 0.08),
        borderTop: `3px solid ${color}`,
      }}
    >
      {/* 头部：标题 + 状态 */}
      <div className="flex items-start justify-between gap-2 p-3 pb-1">
        <h4 className="text-sm font-semibold text-ink-primary leading-snug flex-1 break-words">
          {inspiration.title}
        </h4>
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-2xs border whitespace-nowrap flex-shrink-0 ${
            STATUS_BADGE_CLASS[inspiration.status]
          }`}
        >
          {STATUS_LABEL[inspiration.status]}
        </span>
      </div>

      {/* 内容 */}
      {inspiration.content && (
        <p className="px-3 text-xs text-ink-secondary leading-relaxed whitespace-pre-wrap break-words">
          {inspiration.content}
        </p>
      )}

      {/* 标签 */}
      {inspiration.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 mt-2">
          {inspiration.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs bg-canvas-sunken/60 border border-line-subtle text-ink-muted"
            >
              <Tag className="w-2 h-2" />
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* AI 扩展内容 */}
      {aiContent && (
        <div className="mx-3 mt-2 p-2 rounded-md bg-canvas-sunken/60 border border-accent/20 text-xs text-ink-secondary leading-relaxed max-h-64 overflow-y-auto whitespace-pre-wrap break-words">
          {aiContent}
        </div>
      )}

      {/* 底部：分类 + 时间 + 操作 */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 mt-2 border-t border-line-subtle">
        <div className="flex items-center gap-1.5 min-w-0">
          <span
            className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs border"
            style={{
              color,
              borderColor: hexToRgba(color, 0.4),
              backgroundColor: hexToRgba(color, 0.1),
            }}
          >
            {CATEGORY_LABEL[inspiration.category]}
          </span>
          <span className="text-2xs text-ink-muted truncate">
            {formatRelativeTime(inspiration.updatedAt)}
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {aiExpanding ? (
            <button
              onClick={onStopAiExpand}
              title="停止 AI 扩展"
              className="p-1.5 rounded text-danger hover:bg-canvas-elevated transition-colors"
            >
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </button>
          ) : (
            <button
              onClick={onAiExpand}
              disabled={busy}
              title="AI 扩展灵感"
              className="p-1.5 rounded text-ink-muted hover:text-accent hover:bg-canvas-elevated transition-colors disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}
          {hasProject && (
            <>
              <button
                onClick={onUpgradeGraph}
                disabled={busy}
                title="升级为机制图"
                className="p-1.5 rounded text-ink-muted hover:text-accent hover:bg-canvas-elevated transition-colors disabled:opacity-50"
              >
                <Network className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={onUpgradeGDD}
                disabled={busy}
                title="升级为 GDD"
                className="p-1.5 rounded text-ink-muted hover:text-accent hover:bg-canvas-elevated transition-colors disabled:opacity-50"
              >
                <FileText className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          <button
            onClick={onEdit}
            disabled={busy}
            title="编辑"
            className="p-1.5 rounded text-ink-muted hover:text-ink-primary hover:bg-canvas-elevated transition-colors disabled:opacity-50"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onDelete}
            disabled={busy}
            title="删除"
            className="p-1.5 rounded text-ink-muted hover:text-danger hover:bg-canvas-elevated transition-colors disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
