import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

const variantConfig = {
  default: {
    icon: Info,
    iconColor: "text-ink-secondary",
    border: "border-line",
  },
  success: {
    icon: CheckCircle2,
    iconColor: "text-accent",
    border: "border-accent/40",
  },
  error: {
    icon: AlertCircle,
    iconColor: "text-danger",
    border: "border-danger/40",
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-warn",
    border: "border-warn/40",
  },
};

export default function Toaster() {
  const { toasts, removeToast } = useUIStore();

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-2 w-80 pointer-events-none">
      {toasts.map((toast) => {
        const config = variantConfig[toast.variant];
        const Icon = config.icon;
        return (
          <div
            key={toast.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 p-3 rounded-lg border bg-canvas-elevated shadow-pop animate-slide-up",
              config.border
            )}
          >
            <Icon className={cn("w-4 h-4 mt-0.5 flex-shrink-0", config.iconColor)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-ink-primary">
                {toast.title}
              </p>
              {toast.description && (
                <p className="text-xs text-ink-secondary mt-0.5">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-ink-muted hover:text-ink-primary transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
