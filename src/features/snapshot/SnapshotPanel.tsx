import { useEffect, useState } from "react";
import Modal from "@/components/ui/Modal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { useSnapshotStore } from "@/stores/snapshotStore";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import { formatRelativeTime } from "@/lib/time";
import { Camera, RotateCcw, Trash2, Plus, Clock, Loader2 } from "lucide-react";

interface SnapshotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SnapshotPanel({
  open,
  onOpenChange,
}: SnapshotPanelProps) {
  const currentProject = useProjectStore((s) => s.currentProject);
  const addToast = useUIStore((s) => s.addToast);
  const {
    snapshots,
    loading,
    loadSnapshots,
    createSnapshot,
    deleteSnapshot,
    restoreSnapshot,
  } = useSnapshotStore();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [pendingDeleteSnapshot, setPendingDeleteSnapshot] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (open && currentProject) {
      loadSnapshots(currentProject.id);
    }
  }, [open, currentProject, loadSnapshots]);

  const handleCreate = async () => {
    if (!currentProject) {
      addToast({ title: "请先选择项目", variant: "warning" });
      return;
    }
    if (!name.trim()) {
      addToast({ title: "请输入快照名称", variant: "warning" });
      return;
    }
    setCreating(true);
    try {
      await createSnapshot(currentProject.id, name, description);
      addToast({
        title: "快照已创建",
        description: name,
        variant: "success",
      });
      setName("");
      setDescription("");
    } catch (e) {
      addToast({
        title: "创建失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleRestore = (id: string) => {
    setPendingRestoreId(id);
    setRestoreConfirmOpen(true);
  };

  const confirmRestore = async () => {
    if (!pendingRestoreId) return;
    const id = pendingRestoreId;
    setRestoreConfirmOpen(false);
    setPendingRestoreId(null);
    setRestoringId(id);
    try {
      await restoreSnapshot(id);
      addToast({
        title: "快照已恢复",
        description: "正在刷新页面...",
        variant: "success",
      });
      onOpenChange(false);
      // store 数据已直接写入 IndexedDB，刷新页面以重新加载所有 store
      window.location.reload();
    } catch (e) {
      addToast({
        title: "恢复失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
      setRestoringId(null);
    }
  };

  const handleDelete = (id: string, snapshotName: string) => {
    setPendingDeleteSnapshot({ id, name: snapshotName });
    setDeleteConfirmOpen(true);
  };

  const confirmDeleteSnapshot = async () => {
    if (!pendingDeleteSnapshot) return;
    const { id } = pendingDeleteSnapshot;
    setDeleteConfirmOpen(false);
    setPendingDeleteSnapshot(null);
    setDeletingId(id);
    try {
      await deleteSnapshot(id);
      addToast({ title: "已删除", variant: "success" });
    } catch (e) {
      addToast({
        title: "删除失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (creating || restoringId) return;
        onOpenChange(next);
      }}
      title="设计快照"
      description="管理项目版本，随时回滚到历史状态"
      className="max-w-lg"
    >
      <div className="space-y-4">
        {/* 创建快照区 */}
        <div className="p-3 rounded-lg bg-canvas-sunken border border-line space-y-2">
          <div className="flex items-center gap-1.5 text-2xs font-medium text-ink-muted uppercase tracking-wider">
            <Camera className="w-3 h-3" />
            <span>新建快照</span>
          </div>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="快照名称，例如：v1.0 上线版本"
            className="input-field text-sm"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && !creating) handleCreate();
            }}
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="描述本次快照的变更内容（可选）"
            rows={2}
            className="input-field resize-none text-sm"
          />
          <button
            onClick={handleCreate}
            disabled={creating || !name.trim()}
            className="btn-primary w-full flex items-center justify-center gap-1.5"
          >
            {creating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在创建...
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" />
                创建快照
              </>
            )}
          </button>
        </div>

        {/* 快照列表 */}
        <div>
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-2xs font-medium text-ink-muted uppercase tracking-wider">
              历史快照
            </span>
            <span className="text-2xs text-ink-muted">
              共 {snapshots.length} 个
            </span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-4 h-4 text-ink-muted animate-spin" />
            </div>
          ) : snapshots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Camera className="w-6 h-6 text-ink-muted mb-2 opacity-50" />
              <p className="text-xs text-ink-muted">暂无快照</p>
              <p className="text-2xs text-ink-muted mt-0.5">
                创建第一个快照以保存当前设计状态
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-[40vh] overflow-y-auto pr-1">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="group p-2.5 rounded-lg border border-line bg-canvas-sunken hover:border-line-strong transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Camera className="w-3 h-3 text-accent flex-shrink-0" />
                        <span className="text-sm font-medium text-ink-primary truncate">
                          {snapshot.name}
                        </span>
                      </div>
                      {snapshot.description && (
                        <p className="text-2xs text-ink-secondary mt-1 line-clamp-2 break-words">
                          {snapshot.description}
                        </p>
                      )}
                      <div className="flex items-center gap-1 mt-1.5 text-2xs text-ink-muted">
                        <Clock className="w-2.5 h-2.5" />
                        <span>{formatRelativeTime(snapshot.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleRestore(snapshot.id)}
                        disabled={restoringId === snapshot.id}
                        title="恢复此快照"
                        className="p-1.5 rounded text-ink-muted hover:text-accent hover:bg-canvas-elevated transition-colors disabled:opacity-50"
                      >
                        {restoringId === snapshot.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(snapshot.id, snapshot.name)}
                        disabled={deletingId === snapshot.id}
                        title="删除此快照"
                        className="p-1.5 rounded text-ink-muted hover:text-danger hover:bg-canvas-elevated transition-colors disabled:opacity-50"
                      >
                        {deletingId === snapshot.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end pt-1">
          <button
            onClick={() => onOpenChange(false)}
            disabled={creating || !!restoringId}
            className="btn-secondary"
          >
            关闭
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={restoreConfirmOpen}
        title="恢复快照"
        description="恢复快照将覆盖当前所有设计数据，且不可撤销。确定继续吗？"
        variant="default"
        onConfirm={() => void confirmRestore()}
        onCancel={() => {
          setRestoreConfirmOpen(false);
          setPendingRestoreId(null);
        }}
      />
      <ConfirmDialog
        open={deleteConfirmOpen}
        title="删除快照"
        description={
          pendingDeleteSnapshot
            ? `确定删除快照"${pendingDeleteSnapshot.name}"？`
            : ""
        }
        variant="danger"
        onConfirm={() => void confirmDeleteSnapshot()}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setPendingDeleteSnapshot(null);
        }}
      />
    </Modal>
  );
}
