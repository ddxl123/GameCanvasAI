import { create } from "zustand";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import { useHistoryStore } from "./historyStore";
import type { LevelFlow, LevelNode, LevelEdge } from "@/types";

interface LevelState {
  flows: LevelFlow[];
  currentFlowId: string | null;
  selectedNodeId: string | null;
  loading: boolean;

  loadFlows: (projectId: string) => Promise<void>;
  createFlow: (projectId: string, name: string) => Promise<LevelFlow>;
  deleteFlow: (id: string) => Promise<void>;
  selectFlow: (id: string | null) => void;

  addNode: (flowId: string, node: Omit<LevelNode, "id">) => Promise<string | undefined>;
  updateNode: (
    flowId: string,
    nodeId: string,
    patch: Partial<LevelNode>
  ) => Promise<void>;
  removeNode: (flowId: string, nodeId: string) => Promise<void>;
  updateNodePosition: (
    flowId: string,
    nodeId: string,
    position: { x: number; y: number }
  ) => Promise<void>;

  addEdge: (flowId: string, edge: Omit<LevelEdge, "id">) => Promise<void>;
  removeEdge: (flowId: string, edgeId: string) => Promise<void>;

  setSelectedNode: (id: string | null) => void;
}

// 不可变更新某个 flow 的部分字段
function patchFlow(
  flows: LevelFlow[],
  flowId: string,
  patch: Partial<LevelFlow>
): LevelFlow[] {
  return flows.map((f) => (f.id === flowId ? { ...f, ...patch } : f));
}

// 拖拽位置更新的本地缓存（防抖写入 IndexedDB）
const positionCache = new Map<
  string,
  { flowId: string; position: { x: number; y: number } }
>();
let positionFlushTimer: ReturnType<typeof setTimeout> | null = null;

export const useLevelStore = create<LevelState>((set, get) => ({
  flows: [],
  currentFlowId: null,
  selectedNodeId: null,
  loading: false,

  loadFlows: async (projectId) => {
    set({ loading: true });
    try {
      const flows = await db.levelFlows
        .where("projectId")
        .equals(projectId)
        .toArray();
      flows.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ flows, loading: false });
      // 自愈 currentFlowId：若指向已不存在的关卡流程，则回退到首个
      const current = get().currentFlowId;
      if (current && !flows.find((f) => f.id === current)) {
        set({ currentFlowId: flows[0]?.id ?? null });
      }
    } catch (e) {
      console.error("加载关卡流程失败:", e);
      set({ loading: false });
    }
  },

  createFlow: async (projectId, name) => {
    const flow: LevelFlow = {
      id: generateId("level"),
      projectId,
      name: name.trim() || "未命名关卡流程",
      nodes: [],
      edges: [],
      createdAt: now(),
      updatedAt: now(),
    };
    await db.levelFlows.add(flow);
    set({ flows: [flow, ...get().flows] });
    useHistoryStore.getState().push({
      description: `创建关卡流程 ${flow.name}`,
      undo: async () => {
        await db.levelFlows.delete(flow.id);
        set({ flows: get().flows.filter((f) => f.id !== flow.id) });
      },
      redo: async () => {
        await db.levelFlows.add(flow);
        set({ flows: [flow, ...get().flows] });
      },
    });
    return flow;
  },

  deleteFlow: async (id) => {
    const deletedFlow = get().flows.find((f) => f.id === id);
    if (!deletedFlow) return;
    const prevCurrentFlowId = get().currentFlowId;
    const prevSelectedNodeId = get().selectedNodeId;
    await db.levelFlows.delete(id);
    set({
      flows: get().flows.filter((f) => f.id !== id),
      currentFlowId:
        get().currentFlowId === id ? null : get().currentFlowId,
      selectedNodeId:
        get().currentFlowId === id ? null : get().selectedNodeId,
    });
    useHistoryStore.getState().push({
      description: `删除关卡流程 ${deletedFlow.name}`,
      undo: async () => {
        await db.levelFlows.add(deletedFlow);
        if (prevCurrentFlowId === id) {
          set({
            flows: [deletedFlow, ...get().flows.filter((f) => f.id !== id)],
            currentFlowId: prevCurrentFlowId,
            selectedNodeId: prevSelectedNodeId,
          });
        } else {
          set({
            flows: [deletedFlow, ...get().flows.filter((f) => f.id !== id)],
          });
        }
      },
      redo: async () => {
        await db.levelFlows.delete(id);
        set({
          flows: get().flows.filter((f) => f.id !== id),
          currentFlowId:
            get().currentFlowId === id ? null : get().currentFlowId,
          selectedNodeId:
            get().currentFlowId === id ? null : get().selectedNodeId,
        });
      },
    });
  },

  selectFlow: (id) => {
    // 切换关卡流程时清理上一份位置缓存与防抖定时器
    positionCache.clear();
    if (positionFlushTimer) {
      clearTimeout(positionFlushTimer);
      positionFlushTimer = null;
    }
    set({
      currentFlowId: id,
      selectedNodeId: null,
    });
  },

  addNode: async (flowId, node) => {
    const flow = get().flows.find((f) => f.id === flowId);
    if (!flow) return undefined;
    const newNode: LevelNode = { ...node, id: generateId("levelnode") };
    const prevNodes = flow.nodes;
    const newNodes = [...flow.nodes, newNode];
    const ts = now();
    await db.levelFlows.update(flowId, { nodes: newNodes, updatedAt: ts });
    set({
      flows: patchFlow(get().flows, flowId, { nodes: newNodes, updatedAt: ts }),
    });
    useHistoryStore.getState().push({
      description: `添加关卡节点 ${newNode.label || newNode.type}`,
      undo: async () => {
        await db.levelFlows.update(flowId, { nodes: prevNodes });
        set({
          flows: patchFlow(get().flows, flowId, { nodes: prevNodes }),
        });
      },
      redo: async () => {
        await db.levelFlows.update(flowId, {
          nodes: newNodes,
          updatedAt: now(),
        });
        set({
          flows: patchFlow(get().flows, flowId, {
            nodes: newNodes,
            updatedAt: now(),
          }),
        });
      },
    });
    return newNode.id;
  },

  updateNode: async (flowId, nodeId, patch) => {
    const flow = get().flows.find((f) => f.id === flowId);
    if (!flow) return;
    const prevNode = flow.nodes.find((n) => n.id === nodeId);
    if (!prevNode) return;
    const newNode = { ...prevNode, ...patch };
    const newNodes = flow.nodes.map((n) => (n.id === nodeId ? newNode : n));
    const ts = now();
    await db.levelFlows.update(flowId, { nodes: newNodes, updatedAt: ts });
    set({
      flows: patchFlow(get().flows, flowId, { nodes: newNodes, updatedAt: ts }),
    });
    // 仅对内容修改登记撤销（不含纯位置拖拽）
    if (!("position" in patch) || Object.keys(patch).length > 1) {
      useHistoryStore.getState().push({
        description: `修改关卡节点 ${prevNode.label || prevNode.type}`,
        undo: async () => {
          const f = get().flows.find((x) => x.id === flowId);
          const restored = f
            ? f.nodes.map((n) => (n.id === nodeId ? prevNode : n))
            : [];
          await db.levelFlows.update(flowId, { nodes: restored });
          set({ flows: patchFlow(get().flows, flowId, { nodes: restored }) });
        },
        redo: async () => {
          const f = get().flows.find((x) => x.id === flowId);
          const redone = f
            ? f.nodes.map((n) => (n.id === nodeId ? newNode : n))
            : [];
          await db.levelFlows.update(flowId, {
            nodes: redone,
            updatedAt: now(),
          });
          set({
            flows: patchFlow(get().flows, flowId, {
              nodes: redone,
              updatedAt: now(),
            }),
          });
        },
      });
    }
  },

  removeNode: async (flowId, nodeId) => {
    const flow = get().flows.find((f) => f.id === flowId);
    if (!flow) return;
    const prevNodes = flow.nodes;
    const prevEdges = flow.edges;
    const newNodes = flow.nodes.filter((n) => n.id !== nodeId);
    const newEdges = flow.edges.filter(
      (e) => e.source !== nodeId && e.target !== nodeId
    );
    const ts = now();
    await db.levelFlows.update(flowId, {
      nodes: newNodes,
      edges: newEdges,
      updatedAt: ts,
    });
    set({
      flows: patchFlow(get().flows, flowId, {
        nodes: newNodes,
        edges: newEdges,
        updatedAt: ts,
      }),
      selectedNodeId:
        get().selectedNodeId === nodeId ? null : get().selectedNodeId,
    });
    useHistoryStore.getState().push({
      description: `删除关卡节点 ${
        prevNodes.find((n) => n.id === nodeId)?.label ?? ""
      }`,
      undo: async () => {
        await db.levelFlows.update(flowId, {
          nodes: prevNodes,
          edges: prevEdges,
        });
        set({
          flows: patchFlow(get().flows, flowId, {
            nodes: prevNodes,
            edges: prevEdges,
          }),
        });
      },
      redo: async () => {
        await db.levelFlows.update(flowId, {
          nodes: newNodes,
          edges: newEdges,
          updatedAt: now(),
        });
        set({
          flows: patchFlow(get().flows, flowId, {
            nodes: newNodes,
            edges: newEdges,
            updatedAt: now(),
          }),
        });
      },
    });
  },

  updateNodePosition: async (flowId, nodeId, position) => {
    // 本地立即更新（拖拽流畅）
    set({
      flows: get().flows.map((f) =>
        f.id === flowId
          ? {
              ...f,
              nodes: f.nodes.map((n) =>
                n.id === nodeId ? { ...n, position } : n
              ),
            }
          : f
      ),
    });
    // 防抖写入 IndexedDB
    positionCache.set(nodeId, { flowId, position });
    if (positionFlushTimer) clearTimeout(positionFlushTimer);
    positionFlushTimer = setTimeout(async () => {
      const entries = Array.from(positionCache.entries());
      positionCache.clear();
      if (entries.length === 0) return;
      // 按 flowId 分组批量落库
      const byFlow = new Map<
        string,
        Map<string, { x: number; y: number }>
      >();
      for (const [nodeId, { flowId: fid, position: pos }] of entries) {
        if (!byFlow.has(fid)) byFlow.set(fid, new Map());
        byFlow.get(fid)!.set(nodeId, pos);
      }
      for (const [fid, posMap] of byFlow) {
        const flow = get().flows.find((f) => f.id === fid);
        if (!flow) continue;
        const newNodes = flow.nodes.map((n) =>
          posMap.has(n.id) ? { ...n, position: posMap.get(n.id)! } : n
        );
        await db.levelFlows.update(fid, {
          nodes: newNodes,
          updatedAt: now(),
        });
      }
    }, 500);
  },

  addEdge: async (flowId, edge) => {
    const flow = get().flows.find((f) => f.id === flowId);
    if (!flow) return;
    const newEdge: LevelEdge = { ...edge, id: generateId("leveledge") };
    const prevEdges = flow.edges;
    const newEdges = [...flow.edges, newEdge];
    const ts = now();
    await db.levelFlows.update(flowId, { edges: newEdges, updatedAt: ts });
    set({
      flows: patchFlow(get().flows, flowId, { edges: newEdges, updatedAt: ts }),
    });
    useHistoryStore.getState().push({
      description: `添加关卡连线 ${newEdge.type}`,
      undo: async () => {
        await db.levelFlows.update(flowId, { edges: prevEdges });
        set({ flows: patchFlow(get().flows, flowId, { edges: prevEdges }) });
      },
      redo: async () => {
        await db.levelFlows.update(flowId, {
          edges: newEdges,
          updatedAt: now(),
        });
        set({
          flows: patchFlow(get().flows, flowId, {
            edges: newEdges,
            updatedAt: now(),
          }),
        });
      },
    });
  },

  removeEdge: async (flowId, edgeId) => {
    const flow = get().flows.find((f) => f.id === flowId);
    if (!flow) return;
    const prevEdges = flow.edges;
    const newEdges = flow.edges.filter((e) => e.id !== edgeId);
    const ts = now();
    await db.levelFlows.update(flowId, { edges: newEdges, updatedAt: ts });
    set({
      flows: patchFlow(get().flows, flowId, { edges: newEdges, updatedAt: ts }),
    });
    useHistoryStore.getState().push({
      description: `删除关卡连线`,
      undo: async () => {
        await db.levelFlows.update(flowId, { edges: prevEdges });
        set({ flows: patchFlow(get().flows, flowId, { edges: prevEdges }) });
      },
      redo: async () => {
        await db.levelFlows.update(flowId, {
          edges: newEdges,
          updatedAt: now(),
        });
        set({
          flows: patchFlow(get().flows, flowId, {
            edges: newEdges,
            updatedAt: now(),
          }),
        });
      },
    });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),
}));

export function clearPositionCache() {
  positionCache.clear();
  if (positionFlushTimer) {
    clearTimeout(positionFlushTimer);
    positionFlushTimer = null;
  }
}
