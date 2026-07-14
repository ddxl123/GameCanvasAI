import { useEffect } from "react";
import { useHistoryStore } from "@/stores/historyStore";

/**
 * 全局历史快捷键 Hook
 *
 * - Cmd/Ctrl + Z：撤销
 * - Cmd/Ctrl + Shift + Z 或 Cmd/Ctrl + Y：重做
 * - 输入框/文本域中不触发（让用户用浏览器原生撤销）
 */
export function useHistoryShortcuts() {
  const undo = useHistoryStore((s) => s.undo);
  const redo = useHistoryStore((s) => s.redo);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" ||
        tag === "textarea" ||
        target?.isContentEditable ||
        target?.getAttribute("contenteditable") === "true";
      if (isEditable) return;

      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        void redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);
}
