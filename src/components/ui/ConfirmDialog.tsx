import Modal from "./Modal";
import { cn } from "@/lib/utils";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  variant = "default",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
      title={title}
      description={description}
    >
      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="btn-ghost text-sm"
        >
          {cancelText}
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "inline-flex items-center justify-center px-4 py-2 rounded-md text-sm font-medium transition-colors",
            variant === "danger"
              ? "bg-red-500 text-white hover:bg-red-600"
              : "bg-accent text-canvas-sunken hover:bg-accent-hover"
          )}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
