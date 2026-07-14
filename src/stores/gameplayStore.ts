import { create } from "zustand";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import { useHistoryStore } from "./historyStore";
import type {
  CoreLoop,
  LoopStep,
  GameMoment,
  MomentType,
} from "@/types";

interface GameplayState {
  viewMode: "loop" | "moment";
  loops: CoreLoop[];
  currentLoopId: string | null;
  selectedStepId: string | null;
  moments: GameMoment[];
  selectedMomentId: string | null;
  loading: boolean;

  setViewMode: (mode: "loop" | "moment") => void;

  loadLoops: (projectId: string) => Promise<void>;
  createLoop: (
    projectId: string,
    name: string,
    loopType: "core" | "secondary" | "meta"
  ) => Promise<CoreLoop>;
  deleteLoop: (id: string) => Promise<void>;
  selectLoop: (id: string | null) => void;
  updateLoop: (id: string, patch: Partial<CoreLoop>) => Promise<void>;
  addStep: (
    loopId: string,
    step: Omit<LoopStep, "id" | "order">
  ) => Promise<void>;
  updateStep: (
    loopId: string,
    stepId: string,
    patch: Partial<LoopStep>
  ) => Promise<void>;
  removeStep: (loopId: string, stepId: string) => Promise<void>;
  reorderSteps: (
    loopId: string,
    fromIndex: number,
    toIndex: number
  ) => Promise<void>;
  setSelectedStep: (id: string | null) => void;

  loadMoments: (projectId: string) => Promise<void>;
  createMoment: (
    projectId: string,
    title: string,
    type: MomentType
  ) => Promise<GameMoment>;
  deleteMoment: (id: string) => Promise<void>;
  updateMoment: (id: string, patch: Partial<GameMoment>) => Promise<void>;
  reorderMoments: (fromIndex: number, toIndex: number) => Promise<void>;
  setSelectedMoment: (id: string | null) => void;
}

export const useGameplayStore = create<GameplayState>((set, get) => ({
  viewMode: "loop",
  loops: [],
  currentLoopId: null,
  selectedStepId: null,
  moments: [],
  selectedMomentId: null,
  loading: false,

  setViewMode: (mode) => set({ viewMode: mode }),

  loadLoops: async (projectId) => {
    set({ loading: true });
    try {
      const loops = await db.coreLoops
        .where("projectId")
        .equals(projectId)
        .toArray();
      loops.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ loops, loading: false });
    } catch (e) {
      console.error("加载核心循环失败:", e);
      set({ loading: false });
    }
  },

  createLoop: async (projectId, name, loopType) => {
    const loop: CoreLoop = {
      id: generateId("loop"),
      projectId,
      name: name.trim() || "未命名循环",
      description: "",
      steps: [],
      loopType,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.coreLoops.add(loop);
    set({ loops: [loop, ...get().loops] });
    useHistoryStore.getState().push({
      description: `创建循环 ${loop.name}`,
      undo: async () => {
        await db.coreLoops.delete(loop.id);
        set({ loops: get().loops.filter((l) => l.id !== loop.id) });
      },
      redo: async () => {
        await db.coreLoops.add(loop);
        set({ loops: [loop, ...get().loops] });
      },
    });
    return loop;
  },

  deleteLoop: async (id) => {
    const deleted = get().loops.find((l) => l.id === id);
    if (!deleted) return;
    const prevCurrentLoopId = get().currentLoopId;
    await db.coreLoops.delete(id);
    set({
      loops: get().loops.filter((l) => l.id !== id),
      currentLoopId:
        get().currentLoopId === id ? null : get().currentLoopId,
      selectedStepId:
        prevCurrentLoopId === id ? null : get().selectedStepId,
    });
    useHistoryStore.getState().push({
      description: `删除循环 ${deleted.name}`,
      undo: async () => {
        await db.coreLoops.add(deleted);
        set({
          loops: [deleted, ...get().loops.filter((l) => l.id !== id)],
          currentLoopId:
            prevCurrentLoopId === id
              ? prevCurrentLoopId
              : get().currentLoopId,
        });
      },
      redo: async () => {
        await db.coreLoops.delete(id);
        set({
          loops: get().loops.filter((l) => l.id !== id),
          currentLoopId:
            get().currentLoopId === id ? null : get().currentLoopId,
        });
      },
    });
  },

  selectLoop: (id) =>
    set({
      currentLoopId: id,
      selectedStepId: null,
    }),

  updateLoop: async (id, patch) => {
    const prev = get().loops.find((l) => l.id === id);
    if (!prev) return;
    const updated = { ...prev, ...patch, updatedAt: now() };
    await db.coreLoops.update(id, { ...patch, updatedAt: now() });
    set({
      loops: get().loops.map((l) => (l.id === id ? updated : l)),
    });
    useHistoryStore.getState().push({
      description: `修改循环 ${prev.name}`,
      undo: async () => {
        await db.coreLoops.put(prev);
        set({
          loops: get().loops.map((l) => (l.id === id ? prev : l)),
        });
      },
      redo: async () => {
        await db.coreLoops.update(id, { ...patch, updatedAt: now() });
        set({
          loops: get().loops.map((l) => (l.id === id ? updated : l)),
        });
      },
    });
  },

  addStep: async (loopId, step) => {
    const loop = get().loops.find((l) => l.id === loopId);
    if (!loop) return;
    const newStep: LoopStep = {
      ...step,
      id: generateId("step"),
      order: loop.steps.length,
    };
    const newSteps = [...loop.steps, newStep];
    const prevSteps = loop.steps;
    await db.coreLoops.update(loopId, {
      steps: newSteps,
      updatedAt: now(),
    });
    set({
      loops: get().loops.map((l) =>
        l.id === loopId
          ? { ...l, steps: newSteps, updatedAt: now() }
          : l
      ),
      selectedStepId: newStep.id,
    });
    useHistoryStore.getState().push({
      description: `添加玩步 ${newStep.label || "未命名"}`,
      undo: async () => {
        await db.coreLoops.update(loopId, {
          steps: prevSteps,
          updatedAt: now(),
        });
        set({
          loops: get().loops.map((l) =>
            l.id === loopId ? { ...l, steps: prevSteps } : l
          ),
        });
      },
      redo: async () => {
        await db.coreLoops.update(loopId, {
          steps: newSteps,
          updatedAt: now(),
        });
        set({
          loops: get().loops.map((l) =>
            l.id === loopId
              ? { ...l, steps: newSteps, updatedAt: now() }
              : l
          ),
        });
      },
    });
  },

  updateStep: async (loopId, stepId, patch) => {
    const loop = get().loops.find((l) => l.id === loopId);
    if (!loop) return;
    const prevStep = loop.steps.find((s) => s.id === stepId);
    if (!prevStep) return;
    const newSteps = loop.steps.map((s) =>
      s.id === stepId ? { ...s, ...patch } : s
    );
    const prevSteps = loop.steps;
    await db.coreLoops.update(loopId, {
      steps: newSteps,
      updatedAt: now(),
    });
    set({
      loops: get().loops.map((l) =>
        l.id === loopId
          ? { ...l, steps: newSteps, updatedAt: now() }
          : l
      ),
    });
    useHistoryStore.getState().push({
      description: `修改玩步 ${prevStep.label || "未命名"}`,
      undo: async () => {
        await db.coreLoops.update(loopId, {
          steps: prevSteps,
          updatedAt: now(),
        });
        set({
          loops: get().loops.map((l) =>
            l.id === loopId ? { ...l, steps: prevSteps } : l
          ),
        });
      },
      redo: async () => {
        await db.coreLoops.update(loopId, {
          steps: newSteps,
          updatedAt: now(),
        });
        set({
          loops: get().loops.map((l) =>
            l.id === loopId
              ? { ...l, steps: newSteps, updatedAt: now() }
              : l
          ),
        });
      },
    });
  },

  removeStep: async (loopId, stepId) => {
    const loop = get().loops.find((l) => l.id === loopId);
    if (!loop) return;
    const prevSteps = loop.steps;
    const filtered = loop.steps.filter((s) => s.id !== stepId);
    const newSteps = filtered.map((s, i) => ({ ...s, order: i }));
    await db.coreLoops.update(loopId, {
      steps: newSteps,
      updatedAt: now(),
    });
    set({
      loops: get().loops.map((l) =>
        l.id === loopId
          ? { ...l, steps: newSteps, updatedAt: now() }
          : l
      ),
      selectedStepId:
        get().selectedStepId === stepId ? null : get().selectedStepId,
    });
    useHistoryStore.getState().push({
      description: `删除玩步`,
      undo: async () => {
        await db.coreLoops.update(loopId, {
          steps: prevSteps,
          updatedAt: now(),
        });
        set({
          loops: get().loops.map((l) =>
            l.id === loopId ? { ...l, steps: prevSteps } : l
          ),
        });
      },
      redo: async () => {
        await db.coreLoops.update(loopId, {
          steps: newSteps,
          updatedAt: now(),
        });
        set({
          loops: get().loops.map((l) =>
            l.id === loopId
              ? { ...l, steps: newSteps, updatedAt: now() }
              : l
          ),
        });
      },
    });
  },

  reorderSteps: async (loopId, fromIndex, toIndex) => {
    const loop = get().loops.find((l) => l.id === loopId);
    if (!loop) return;
    if (
      fromIndex < 0 ||
      fromIndex >= loop.steps.length ||
      toIndex < 0 ||
      toIndex >= loop.steps.length ||
      fromIndex === toIndex
    )
      return;
    const prevSteps = loop.steps;
    const arr = [...loop.steps];
    const [moved] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, moved);
    const newSteps = arr.map((s, i) => ({ ...s, order: i }));
    await db.coreLoops.update(loopId, {
      steps: newSteps,
      updatedAt: now(),
    });
    set({
      loops: get().loops.map((l) =>
        l.id === loopId
          ? { ...l, steps: newSteps, updatedAt: now() }
          : l
      ),
    });
    useHistoryStore.getState().push({
      description: `调整玩步顺序`,
      undo: async () => {
        await db.coreLoops.update(loopId, {
          steps: prevSteps,
          updatedAt: now(),
        });
        set({
          loops: get().loops.map((l) =>
            l.id === loopId ? { ...l, steps: prevSteps } : l
          ),
        });
      },
      redo: async () => {
        await db.coreLoops.update(loopId, {
          steps: newSteps,
          updatedAt: now(),
        });
        set({
          loops: get().loops.map((l) =>
            l.id === loopId
              ? { ...l, steps: newSteps, updatedAt: now() }
              : l
          ),
        });
      },
    });
  },

  setSelectedStep: (id) => set({ selectedStepId: id }),

  loadMoments: async (projectId) => {
    set({ loading: true });
    try {
      const moments = await db.gameMoments
        .where("projectId")
        .equals(projectId)
        .toArray();
      moments.sort((a, b) => a.order - b.order);
      set({ moments, loading: false });
    } catch (e) {
      console.error("加载高光时刻失败:", e);
      set({ loading: false });
    }
  },

  createMoment: async (projectId, title, type) => {
    const moment: GameMoment = {
      id: generateId("moment"),
      projectId,
      title: title.trim() || "未命名时刻",
      description: "",
      emotion: 5,
      emotionLabel: "",
      timing: 50,
      type,
      duration: 30,
      notes: "",
      order: get().moments.length,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.gameMoments.add(moment);
    set({ moments: [...get().moments, moment] });
    useHistoryStore.getState().push({
      description: `创建高光时刻 ${moment.title}`,
      undo: async () => {
        await db.gameMoments.delete(moment.id);
        set({
          moments: get().moments.filter((m) => m.id !== moment.id),
        });
      },
      redo: async () => {
        await db.gameMoments.add(moment);
        set({ moments: [...get().moments, moment] });
      },
    });
    return moment;
  },

  deleteMoment: async (id) => {
    const deleted = get().moments.find((m) => m.id === id);
    if (!deleted) return;
    const prevMoments = get().moments;
    const filtered = prevMoments.filter((m) => m.id !== id);
    const renumbered = filtered.map((m, i) => ({ ...m, order: i }));
    await db.gameMoments.delete(id);
    await Promise.all(
      renumbered.map((m) =>
        db.gameMoments.update(m.id, { order: m.order })
      )
    );
    set({
      moments: renumbered,
      selectedMomentId:
        get().selectedMomentId === id
          ? null
          : get().selectedMomentId,
    });
    useHistoryStore.getState().push({
      description: `删除高光时刻 ${deleted.title}`,
      undo: async () => {
        await db.gameMoments.add(deleted);
        await Promise.all(
          prevMoments.map((m) =>
            db.gameMoments.update(m.id, { order: m.order })
          )
        );
        set({ moments: prevMoments });
      },
      redo: async () => {
        await db.gameMoments.delete(id);
        await Promise.all(
          renumbered.map((m) =>
            db.gameMoments.update(m.id, { order: m.order })
          )
        );
        set({ moments: renumbered });
      },
    });
  },

  updateMoment: async (id, patch) => {
    const prev = get().moments.find((m) => m.id === id);
    if (!prev) return;
    const updated = { ...prev, ...patch, updatedAt: now() };
    await db.gameMoments.update(id, { ...patch, updatedAt: now() });
    set({
      moments: get().moments.map((m) => (m.id === id ? updated : m)),
    });
    useHistoryStore.getState().push({
      description: `修改高光时刻 ${prev.title}`,
      undo: async () => {
        await db.gameMoments.put(prev);
        set({
          moments: get().moments.map((m) => (m.id === id ? prev : m)),
        });
      },
      redo: async () => {
        await db.gameMoments.update(id, { ...patch, updatedAt: now() });
        set({
          moments: get().moments.map((m) => (m.id === id ? updated : m)),
        });
      },
    });
  },

  reorderMoments: async (fromIndex, toIndex) => {
    const moments = [...get().moments];
    if (
      fromIndex < 0 ||
      fromIndex >= moments.length ||
      toIndex < 0 ||
      toIndex >= moments.length ||
      fromIndex === toIndex
    )
      return;
    const prevMoments = [...moments];
    const [moved] = moments.splice(fromIndex, 1);
    moments.splice(toIndex, 0, moved);
    const renumbered = moments.map((m, i) => ({ ...m, order: i }));
    await Promise.all(
      renumbered.map((m) =>
        db.gameMoments.update(m.id, { order: m.order })
      )
    );
    set({ moments: renumbered });
    useHistoryStore.getState().push({
      description: `调整高光时刻顺序`,
      undo: async () => {
        await Promise.all(
          prevMoments.map((m) =>
            db.gameMoments.update(m.id, { order: m.order })
          )
        );
        set({ moments: prevMoments });
      },
      redo: async () => {
        await Promise.all(
          renumbered.map((m) =>
            db.gameMoments.update(m.id, { order: m.order })
          )
        );
        set({ moments: renumbered });
      },
    });
  },

  setSelectedMoment: (id) => set({ selectedMomentId: id }),
}));
