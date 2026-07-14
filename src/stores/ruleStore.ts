import { create } from "zustand";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import { useHistoryStore } from "./historyStore";
import type {
  GameRule,
  InteractionMatrix,
  InteractionCell,
  RuleCategory,
} from "@/types";

interface RuleState {
  rules: GameRule[];
  matrices: InteractionMatrix[];
  currentMatrixId: string | null;
  loading: boolean;

  // 规则 actions
  loadRules: (projectId: string) => Promise<void>;
  createRule: (
    projectId: string,
    title: string,
    category: RuleCategory
  ) => Promise<GameRule>;
  deleteRule: (id: string) => Promise<void>;
  updateRule: (id: string, patch: Partial<GameRule>) => Promise<void>;
  reorderRules: (fromIndex: number, toIndex: number) => Promise<void>;
  toggleRule: (id: string) => Promise<void>;

  // 矩阵 actions
  loadMatrices: (projectId: string) => Promise<void>;
  createMatrix: (projectId: string, name: string) => Promise<InteractionMatrix>;
  deleteMatrix: (id: string) => Promise<void>;
  selectMatrix: (id: string | null) => void;
  updateMatrix: (id: string, patch: Partial<InteractionMatrix>) => Promise<void>;
  addElement: (matrixId: string, element: string) => Promise<void>;
  removeElement: (matrixId: string, element: string) => Promise<void>;
  setInteraction: (matrixId: string, cell: InteractionCell) => Promise<void>;
  getInteraction: (
    matrixId: string,
    elementA: string,
    elementB: string
  ) => InteractionCell | undefined;
}

// 查找匹配的交互 cell（双向：A-B 或 B-A 都算）
function findInteraction(
  interactions: InteractionCell[],
  elementA: string,
  elementB: string
): number {
  return interactions.findIndex(
    (c) =>
      (c.elementA === elementA && c.elementB === elementB) ||
      (c.elementA === elementB && c.elementB === elementA)
  );
}

export const useRuleStore = create<RuleState>((set, get) => ({
  rules: [],
  matrices: [],
  currentMatrixId: null,
  loading: false,

  // ===== 规则 =====

  loadRules: async (projectId) => {
    set({ loading: true });
    try {
      const rules = await db.gameRules
        .where("projectId")
        .equals(projectId)
        .toArray();
      rules.sort((a, b) => a.order - b.order);
      set({ rules, loading: false });
    } catch (e) {
      console.error("加载规则失败:", e);
      set({ loading: false });
    }
  },

  createRule: async (projectId, title, category) => {
    const rule: GameRule = {
      id: generateId("rule"),
      projectId,
      title: title.trim() || "未命名规则",
      condition: "",
      action: "",
      category,
      priority: 5,
      enabled: true,
      notes: "",
      order: get().rules.length,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.gameRules.add(rule);
    set({ rules: [...get().rules, rule] });
    useHistoryStore.getState().push({
      description: `创建规则 ${rule.title}`,
      undo: async () => {
        await db.gameRules.delete(rule.id);
        set({ rules: get().rules.filter((r) => r.id !== rule.id) });
      },
      redo: async () => {
        await db.gameRules.add(rule);
        set({ rules: [...get().rules, rule] });
      },
    });
    return rule;
  },

  deleteRule: async (id) => {
    const rule = get().rules.find((r) => r.id === id);
    if (!rule) return;
    await db.gameRules.delete(id);
    set({ rules: get().rules.filter((r) => r.id !== id) });
    useHistoryStore.getState().push({
      description: `删除规则 ${rule.title}`,
      undo: async () => {
        await db.gameRules.add(rule);
        set({ rules: [...get().rules, rule] });
      },
      redo: async () => {
        await db.gameRules.delete(id);
        set({ rules: get().rules.filter((r) => r.id !== id) });
      },
    });
  },

  updateRule: async (id, patch) => {
    const prev = get().rules.find((r) => r.id === id);
    if (!prev) return;
    const updates = { ...patch, updatedAt: now() };
    await db.gameRules.update(id, updates);
    set({
      rules: get().rules.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    });
    useHistoryStore.getState().push({
      description: `修改规则 ${prev.title}`,
      undo: async () => {
        await db.gameRules.put(prev);
        set({ rules: get().rules.map((r) => (r.id === id ? prev : r)) });
      },
      redo: async () => {
        const merged = { ...prev, ...updates };
        await db.gameRules.update(id, updates);
        set({
          rules: get().rules.map((r) => (r.id === id ? merged : r)),
        });
      },
    });
  },

  reorderRules: async (fromIndex, toIndex) => {
    const list = [...get().rules];
    if (
      fromIndex < 0 ||
      fromIndex >= list.length ||
      toIndex < 0 ||
      toIndex >= list.length ||
      fromIndex === toIndex
    ) {
      return;
    }
    const prevList = get().rules;
    const [moved] = list.splice(fromIndex, 1);
    list.splice(toIndex, 0, moved);
    const reordered = list.map((r, i) => ({ ...r, order: i }));
    await Promise.all(
      reordered.map((r) =>
        db.gameRules.update(r.id, { order: r.order, updatedAt: now() })
      )
    );
    set({ rules: reordered });
    useHistoryStore.getState().push({
      description: `重排规则顺序`,
      undo: async () => {
        await Promise.all(
          prevList.map((r) => db.gameRules.update(r.id, { order: r.order }))
        );
        set({ rules: prevList });
      },
      redo: async () => {
        await Promise.all(
          reordered.map((r) =>
            db.gameRules.update(r.id, { order: r.order, updatedAt: now() })
          )
        );
        set({ rules: reordered });
      },
    });
  },

  toggleRule: async (id) => {
    const prev = get().rules.find((r) => r.id === id);
    if (!prev) return;
    const enabled = !prev.enabled;
    const updates = { enabled, updatedAt: now() };
    await db.gameRules.update(id, updates);
    set({
      rules: get().rules.map((r) =>
        r.id === id ? { ...r, ...updates } : r
      ),
    });
    useHistoryStore.getState().push({
      description: `${enabled ? "启用" : "禁用"}规则 ${prev.title}`,
      undo: async () => {
        await db.gameRules.update(id, { enabled: prev.enabled });
        set({ rules: get().rules.map((r) => (r.id === id ? prev : r)) });
      },
      redo: async () => {
        await db.gameRules.update(id, updates);
        set({
          rules: get().rules.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        });
      },
    });
  },

  // ===== 矩阵 =====

  loadMatrices: async (projectId) => {
    set({ loading: true });
    try {
      const matrices = await db.interactionMatrices
        .where("projectId")
        .equals(projectId)
        .toArray();
      matrices.sort((a, b) => b.updatedAt - a.updatedAt);
      const cur = get().currentMatrixId;
      const currentMatrixId =
        cur && matrices.some((m) => m.id === cur)
          ? cur
          : matrices[0]?.id ?? null;
      set({ matrices, currentMatrixId, loading: false });
    } catch (e) {
      console.error("加载交互矩阵失败:", e);
      set({ loading: false });
    }
  },

  createMatrix: async (projectId, name) => {
    const matrix: InteractionMatrix = {
      id: generateId("matrix"),
      projectId,
      name: name.trim() || "未命名矩阵",
      elements: [],
      interactions: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await db.interactionMatrices.add(matrix);
    set({
      matrices: [matrix, ...get().matrices],
      currentMatrixId: matrix.id,
    });
    useHistoryStore.getState().push({
      description: `创建交互矩阵 ${matrix.name}`,
      undo: async () => {
        await db.interactionMatrices.delete(matrix.id);
        set({
          matrices: get().matrices.filter((m) => m.id !== matrix.id),
          currentMatrixId:
            get().currentMatrixId === matrix.id
              ? null
              : get().currentMatrixId,
        });
      },
      redo: async () => {
        await db.interactionMatrices.add(matrix);
        set({
          matrices: [matrix, ...get().matrices.filter((m) => m.id !== matrix.id)],
          currentMatrixId: matrix.id,
        });
      },
    });
    return matrix;
  },

  deleteMatrix: async (id) => {
    const matrix = get().matrices.find((m) => m.id === id);
    if (!matrix) return;
    const prevCurrent = get().currentMatrixId;
    await db.interactionMatrices.delete(id);
    const remaining = get().matrices.filter((m) => m.id !== id);
    set({
      matrices: remaining,
      currentMatrixId:
        prevCurrent === id ? remaining[0]?.id ?? null : prevCurrent,
    });
    useHistoryStore.getState().push({
      description: `删除交互矩阵 ${matrix.name}`,
      undo: async () => {
        await db.interactionMatrices.add(matrix);
        set({
          matrices: [matrix, ...get().matrices.filter((m) => m.id !== id)],
          currentMatrixId: prevCurrent === id ? matrix.id : prevCurrent,
        });
      },
      redo: async () => {
        await db.interactionMatrices.delete(id);
        const rem = get().matrices.filter((m) => m.id !== id);
        set({
          matrices: rem,
          currentMatrixId:
            prevCurrent === id ? rem[0]?.id ?? null : prevCurrent,
        });
      },
    });
  },

  selectMatrix: (id) => set({ currentMatrixId: id }),

  updateMatrix: async (id, patch) => {
    const prev = get().matrices.find((m) => m.id === id);
    if (!prev) return;
    const updates = { ...patch, updatedAt: now() };
    await db.interactionMatrices.update(id, updates);
    set({
      matrices: get().matrices.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    });
    useHistoryStore.getState().push({
      description: `修改矩阵 ${prev.name}`,
      undo: async () => {
        await db.interactionMatrices.put(prev);
        set({
          matrices: get().matrices.map((m) => (m.id === id ? prev : m)),
        });
      },
      redo: async () => {
        const merged = { ...prev, ...updates };
        await db.interactionMatrices.update(id, updates);
        set({
          matrices: get().matrices.map((m) =>
            m.id === id ? merged : m
          ),
        });
      },
    });
  },

  addElement: async (matrixId, element) => {
    const matrix = get().matrices.find((m) => m.id === matrixId);
    if (!matrix) return;
    const el = element.trim();
    if (!el || matrix.elements.includes(el)) return;
    const elements = [...matrix.elements, el];
    const updates = { elements, updatedAt: now() };
    await db.interactionMatrices.update(matrixId, updates);
    set({
      matrices: get().matrices.map((m) =>
        m.id === matrixId ? { ...m, ...updates } : m
      ),
    });
    useHistoryStore.getState().push({
      description: `添加元素 ${el}`,
      undo: async () => {
        await db.interactionMatrices.update(matrixId, {
          elements: matrix.elements,
        });
        set({
          matrices: get().matrices.map((m) =>
            m.id === matrixId ? { ...m, elements: matrix.elements } : m
          ),
        });
      },
      redo: async () => {
        await db.interactionMatrices.update(matrixId, updates);
        set({
          matrices: get().matrices.map((m) =>
            m.id === matrixId ? { ...m, ...updates } : m
          ),
        });
      },
    });
  },

  removeElement: async (matrixId, element) => {
    const matrix = get().matrices.find((m) => m.id === matrixId);
    if (!matrix) return;
    const elements = matrix.elements.filter((e) => e !== element);
    // 同步移除涉及该元素的交互
    const interactions = matrix.interactions.filter(
      (c) => c.elementA !== element && c.elementB !== element
    );
    const updates = { elements, interactions, updatedAt: now() };
    await db.interactionMatrices.update(matrixId, updates);
    set({
      matrices: get().matrices.map((m) =>
        m.id === matrixId ? { ...m, ...updates } : m
      ),
    });
    useHistoryStore.getState().push({
      description: `删除元素 ${element}`,
      undo: async () => {
        await db.interactionMatrices.put(matrix);
        set({
          matrices: get().matrices.map((m) =>
            m.id === matrixId ? matrix : m
          ),
        });
      },
      redo: async () => {
        await db.interactionMatrices.update(matrixId, updates);
        set({
          matrices: get().matrices.map((m) =>
            m.id === matrixId ? { ...m, ...updates } : m
          ),
        });
      },
    });
  },

  setInteraction: async (matrixId, cell) => {
    const matrix = get().matrices.find((m) => m.id === matrixId);
    if (!matrix) return;
    const prevInteractions = matrix.interactions;
    const idx = findInteraction(
      matrix.interactions,
      cell.elementA,
      cell.elementB
    );
    let interactions: InteractionCell[];
    if (idx >= 0) {
      interactions = matrix.interactions.map((c, i) =>
        i === idx ? cell : c
      );
    } else {
      interactions = [...matrix.interactions, cell];
    }
    const updates = { interactions, updatedAt: now() };
    await db.interactionMatrices.update(matrixId, updates);
    set({
      matrices: get().matrices.map((m) =>
        m.id === matrixId ? { ...m, ...updates } : m
      ),
    });
    useHistoryStore.getState().push({
      description: `设置交互 ${cell.result || cell.type}`,
      undo: async () => {
        await db.interactionMatrices.update(matrixId, {
          interactions: prevInteractions,
        });
        set({
          matrices: get().matrices.map((m) =>
            m.id === matrixId
              ? { ...m, interactions: prevInteractions }
              : m
          ),
        });
      },
      redo: async () => {
        await db.interactionMatrices.update(matrixId, updates);
        set({
          matrices: get().matrices.map((m) =>
            m.id === matrixId ? { ...m, ...updates } : m
          ),
        });
      },
    });
  },

  getInteraction: (matrixId, elementA, elementB) => {
    const matrix = get().matrices.find((m) => m.id === matrixId);
    if (!matrix) return undefined;
    const idx = findInteraction(matrix.interactions, elementA, elementB);
    return idx >= 0 ? matrix.interactions[idx] : undefined;
  },
}));
