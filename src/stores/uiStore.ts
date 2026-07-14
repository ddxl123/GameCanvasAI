import { create } from "zustand";
import type { CanvasElement, CanvasElementType } from "@/types";

interface UIState {
  // 面板折叠状态
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
  // 主题
  theme: "dark" | "light";
  // 命令面板
  commandPaletteOpen: boolean;
  // AI 助手面板
  aiPanelOpen: boolean;
  // 通知列表
  toasts: Toast[];
  // 统一画布选中的元素（供右侧属性面板使用）
  selectedCanvasElement: CanvasElement | null;
  // 画布创建请求：CreateToolbar 单击 → ReactFlowCanvas 在视口中心创建
  // nodeSubtype：当 type="node" 时指定具体子类型（如 "event"/"action"），缺省为 "action"
  canvasCreateRequest: { type: CanvasElementType; nodeSubtype?: string; ts: number } | null;
  // 节点图标模式：semantic（语义图标为核心）/ dimension（维度图标为核心）
  iconMode: "semantic" | "dimension";
  // 隐藏的维度集合（dimension 模式下生效）
  hiddenDimensions: Set<string>;
  // 隐藏的语义集合（semantic 模式下生效）
  hiddenSemantics: Set<string>;
  // 节点卡片内是否显示自定义字段（全局开关）
  showNodeFields: boolean;

  toggleLeftPanel: () => void;
  toggleRightPanel: () => void;
  setTheme: (theme: "dark" | "light") => void;
  toggleCommandPalette: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleAIPanel: () => void;
  setAIPanelOpen: (open: boolean) => void;
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
  setSelectedCanvasElement: (el: CanvasElement | null) => void;
  requestCanvasCreate: (type: CanvasElementType, nodeSubtype?: string) => void;
  consumeCanvasCreateRequest: () => void;
  toggleIconMode: () => void;
  toggleHiddenDimension: (dim: string) => void;
  toggleHiddenSemantic: (sem: string) => void;
  clearHiddenFilters: () => void;
  toggleShowNodeFields: () => void;
}

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant: "default" | "success" | "error" | "warning";
}

export const useUIStore = create<UIState>((set, get) => ({
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  theme: "dark",
  commandPaletteOpen: false,
  aiPanelOpen: false,
  toasts: [],
  selectedCanvasElement: null,
  canvasCreateRequest: null,
  iconMode: "semantic",
  hiddenDimensions: new Set<string>(),
  hiddenSemantics: new Set<string>(),
  showNodeFields: true,

  toggleLeftPanel: () =>
    set((s) => ({ leftPanelCollapsed: !s.leftPanelCollapsed })),
  toggleRightPanel: () =>
    set((s) => ({ rightPanelCollapsed: !s.rightPanelCollapsed })),
  setTheme: (theme) => set({ theme }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  setAIPanelOpen: (open) => set({ aiPanelOpen: open }),

  addToast: (toast) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    // 3 秒后自动移除
    setTimeout(() => {
      get().removeToast(id);
    }, 3000);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  setSelectedCanvasElement: (el) => set({ selectedCanvasElement: el }),
  requestCanvasCreate: (type, nodeSubtype) =>
    set({ canvasCreateRequest: { type, nodeSubtype, ts: Date.now() } }),
  consumeCanvasCreateRequest: () => set({ canvasCreateRequest: null }),
  toggleIconMode: () =>
    set((s) => ({
      iconMode: s.iconMode === "semantic" ? "dimension" : "semantic",
    })),
  toggleHiddenDimension: (dim) =>
    set((s) => {
      const next = new Set(s.hiddenDimensions);
      if (next.has(dim)) next.delete(dim);
      else next.add(dim);
      return { hiddenDimensions: next };
    }),
  toggleHiddenSemantic: (sem) =>
    set((s) => {
      const next = new Set(s.hiddenSemantics);
      if (next.has(sem)) next.delete(sem);
      else next.add(sem);
      return { hiddenSemantics: next };
    }),
  clearHiddenFilters: () =>
    set({ hiddenDimensions: new Set(), hiddenSemantics: new Set() }),
  toggleShowNodeFields: () =>
    set((s) => ({ showNodeFields: !s.showNodeFields })),
}));
