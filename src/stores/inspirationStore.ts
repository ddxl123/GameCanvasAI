import { create } from "zustand";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import type {
  Inspiration,
  InspirationCategory,
  InspirationStatus,
} from "@/types";

export interface NewInspirationInput {
  projectId?: string | null;
  title: string;
  content?: string;
  tags?: string[];
  category?: InspirationCategory;
  status?: InspirationStatus;
  color?: string;
}

interface InspirationState {
  inspirations: Inspiration[];
  loading: boolean;

  loadInspirations: (projectId?: string | null) => Promise<void>;
  addInspiration: (data: NewInspirationInput) => Promise<string>;
  updateInspiration: (
    id: string,
    updates: Partial<Inspiration>
  ) => Promise<void>;
  deleteInspiration: (id: string) => Promise<void>;
  upgradeToGraph: (inspirationId: string, projectId: string) => Promise<string>;
  upgradeToGDD: (inspirationId: string, projectId: string) => Promise<string>;
}

// 默认便签颜色
export const DEFAULT_NOTE_COLOR = "#FBBF24";

export const useInspirationStore = create<InspirationState>((set, get) => ({
  inspirations: [],
  loading: false,

  loadInspirations: async (projectId) => {
    set({ loading: true });
    try {
      let list: Inspiration[];
      if (projectId === undefined) {
        // 未指定：加载全部
        list = await db.inspirations.toArray();
      } else if (projectId === null) {
        // null：加载全局灵感（未归属项目）
        list = await db.inspirations.filter((i) => i.projectId === null).toArray();
      } else {
        // 指定项目：加载该项目的灵感
        list = await db.inspirations
          .where("projectId")
          .equals(projectId)
          .toArray();
      }
      // 最新在上
      list.sort((a, b) => b.createdAt - a.createdAt);
      set({ inspirations: list, loading: false });
    } catch (e) {
      console.error("加载灵感便签失败:", e);
      set({ loading: false });
    }
  },

  addInspiration: async (data) => {
    const ts = now();
    const inspiration: Inspiration = {
      id: generateId("insp"),
      projectId: data.projectId ?? null,
      title: data.title.trim() || "未命名灵感",
      content: data.content?.trim() || undefined,
      tags: data.tags ?? [],
      category: data.category ?? "other",
      status: data.status ?? "idea",
      color: data.color ?? DEFAULT_NOTE_COLOR,
      createdAt: ts,
      updatedAt: ts,
    };
    await db.inspirations.add(inspiration);
    set({ inspirations: [inspiration, ...get().inspirations] });
    return inspiration.id;
  },

  updateInspiration: async (id, updates) => {
    const updated = { ...updates, updatedAt: now() };
    await db.inspirations.update(id, updated);
    set({
      inspirations: get().inspirations.map((i) =>
        i.id === id ? { ...i, ...updated } : i
      ),
    });
  },

  deleteInspiration: async (id) => {
    await db.inspirations.delete(id);
    set({ inspirations: get().inspirations.filter((i) => i.id !== id) });
  },

  upgradeToGraph: async (inspirationId, projectId) => {
    const inspiration = get().inspirations.find((i) => i.id === inspirationId);
    if (!inspiration) throw new Error("灵感不存在");
    const ts = now();
    // 创建空机制图
    const graphId = generateId("graph");
    await db.mechanismGraphs.add({
      id: graphId,
      projectId,
      name: inspiration.title || "未命名图",
      type: "node_graph",
      createdAt: ts,
      updatedAt: ts,
    });
    // 更新灵感状态为 drafted
    await db.inspirations.update(inspirationId, { status: "drafted", updatedAt: now() });
    set({
      inspirations: get().inspirations.map((i) =>
        i.id === inspirationId ? { ...i, status: "drafted", updatedAt: now() } : i
      ),
    });
    return graphId;
  },

  upgradeToGDD: async (inspirationId, projectId) => {
    const inspiration = get().inspirations.find((i) => i.id === inspirationId);
    if (!inspiration) throw new Error("灵感不存在");
    const ts = now();
    // 创建空 GDD 文档
    const docId = generateId("doc");
    await db.gddDocuments.add({
      id: docId,
      projectId,
      name: inspiration.title || "未命名文档",
      createdAt: ts,
      updatedAt: ts,
    });
    // 更新灵感状态为 drafted
    await db.inspirations.update(inspirationId, { status: "drafted", updatedAt: now() });
    set({
      inspirations: get().inspirations.map((i) =>
        i.id === inspirationId ? { ...i, status: "drafted", updatedAt: now() } : i
      ),
    });
    return docId;
  },
}));
