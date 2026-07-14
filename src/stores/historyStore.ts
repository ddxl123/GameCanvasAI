import { create } from "zustand";

/**
 * 统一的撤销/重做命令历史栈。
 *
 * 设计：命令模式（Command Pattern）
 * - 每个破坏性操作在执行前包装成 Command 入栈
 * - undo() 调用 command.undo()，redo() 调用 command.redo()
 * - 历史 + 未来两个栈
 * - 不同模块共用同一个全局历史，所以 Ctrl+Z 在任何页面都能撤销最近的操作
 * - 简单的描述用于 UI 显示
 *
 * 不适用：节点拖拽位置（太频繁）、AI 流式生成（异步不可逆）
 */

export interface Command {
  /** 显示用的描述，如"删除节点 攻击力" */
  description: string;
  /** 命令作用域：撤销前会校验当前是否仍在同一作用域，不一致则跳过 undo */
  scope?: { type: "graph" | "sheet" | "doc" | "level"; id: string };
  /** 撤销 */
  undo: () => Promise<void>;
  /** 重做 */
  redo: () => Promise<void>;
}

/**
 * 动态导入避免循环依赖：historyStore 被其他 store import，
 * 这里反向读取它们的"当前作用域 ID"用于撤销前校验。
 */
async function getCurrentScopeId(type: string): Promise<string | null> {
  const { useMechanismStore } = await import("./mechanismStore");
  const { useNumericStore } = await import("./numericStore");
  const { useDocumentStore } = await import("./documentStore");
  const { useLevelStore } = await import("./levelStore");
  switch (type) {
    case "graph":
      return useMechanismStore.getState().currentGraphId;
    case "sheet":
      return useNumericStore.getState().currentSheetId;
    case "doc":
      return useDocumentStore.getState().currentDocId;
    case "level":
      return useLevelStore.getState().currentFlowId;
    default:
      return null;
  }
}

interface HistoryState {
  past: Command[];
  future: Command[];
  /** 撤销/重做是否正在执行（互斥锁，防止并发竞态） */
  isRunning: boolean;

  /** 仅入栈不执行（用于已经执行过的操作，需要补登记） */
  push: (cmd: Command) => void;
  /** 撤销 */
  undo: () => Promise<void>;
  /** 重做 */
  redo: () => Promise<void>;
  /** 清空历史（切换项目时调用） */
  clear: () => void;
  /** 是否可撤销 */
  canUndo: () => boolean;
  /** 是否可重做 */
  canRedo: () => boolean;
  /** 最近一条命令描述（用于 UI） */
  lastDescription: () => string | null;
  /** 下一条重做命令描述（用于 UI） */
  nextRedoDescription: () => string | null;
}

const MAX_HISTORY = 50;

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  isRunning: false,

  push: (cmd) => {
    set((s) => ({
      past: [...s.past, cmd].slice(-MAX_HISTORY),
      future: [],
    }));
  },

  undo: async () => {
    // 互斥锁：连按 Cmd+Z 时后续调用直接返回，避免读取同一个 past 快照导致栈损坏
    if (get().isRunning || get().past.length === 0) return;
    set({ isRunning: true });
    try {
      const { past } = get();
      const cmd = past[past.length - 1];
      // 命令作用域校验：若已切换到其他作用域，跳过 undo（但仍从 past 移到 future）
      if (cmd.scope) {
        const currentId = await getCurrentScopeId(cmd.scope.type);
        if (currentId !== cmd.scope.id) {
          console.warn(
            `撤销跳过：作用域已切换（${cmd.scope.type}: 期望 ${cmd.scope.id}，当前 ${currentId}）`
          );
          set((s) => ({
            past: s.past.slice(0, -1),
            future: [...s.future, cmd],
          }));
          return;
        }
      }
      await cmd.undo();
      set((s) => ({
        past: s.past.slice(0, -1),
        future: [...s.future, cmd],
      }));
    } catch (e) {
      console.error("撤销失败:", e);
    } finally {
      set({ isRunning: false });
    }
  },

  redo: async () => {
    if (get().isRunning || get().future.length === 0) return;
    set({ isRunning: true });
    try {
      const { future } = get();
      const cmd = future[future.length - 1];
      await cmd.redo();
      set((s) => ({
        past: [...s.past, cmd],
        future: s.future.slice(0, -1),
      }));
    } catch (e) {
      console.error("重做失败:", e);
    } finally {
      set({ isRunning: false });
    }
  },

  clear: () => set({ past: [], future: [] }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
  lastDescription: () => {
    const past = get().past;
    return past.length > 0 ? past[past.length - 1].description : null;
  },
  nextRedoDescription: () => {
    const future = get().future;
    return future.length > 0 ? future[future.length - 1].description : null;
  },
}));
