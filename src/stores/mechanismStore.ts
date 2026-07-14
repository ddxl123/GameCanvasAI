import { create } from "zustand";
import { db } from "@/db";
import { generateId, generateNodeId, generateEdgeId } from "@/lib/id";
import { now } from "@/lib/time";
import type { LayoutDirection } from "@/lib/graphLayout";
import { useHistoryStore } from "./historyStore";
import type {
  MechanismGraph,
  GraphNode,
  GraphEdge,
  GraphType,
  NodeType,
  EdgeType,
  EdgeDirection,
  EdgeStrength,
} from "@/types";
import { migrateEdgeType } from "@/features/mechanism/nodeTypes";

interface MechanismState {
  graphs: MechanismGraph[];
  currentGraphId: string | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  loading: boolean;
  // 布局方向（LR=左到右 / TB=上到下），用于 ELK 自动布局
  layoutDirection: LayoutDirection;

  loadGraphs: (projectId: string) => Promise<void>;
  createGraph: (
    projectId: string,
    name: string,
    type: GraphType
  ) => Promise<MechanismGraph>;
  deleteGraph: (id: string) => Promise<void>;
  selectGraph: (id: string | null) => Promise<void>;
  renameGraph: (id: string, name: string) => Promise<void>;

  addNode: (
    type: NodeType,
    position: { x: number; y: number },
    label?: string,
    /** 恢复被删节点时传入原 id，保留跨实体引用（边、refAttributeId 等） */
    restoreId?: string
  ) => Promise<string | undefined>;
  updateNode: (id: string, updates: Partial<GraphNode>) => Promise<void>;
  updateNodePosition: (
    id: string,
    position: { x: number; y: number }
  ) => void;
  batchUpdateNodePositions: (
    positions: Map<string, { x: number; y: number }>
  ) => Promise<void>;
  removeNode: (id: string) => Promise<void>;
  batchDeleteNodes: (ids: string[]) => Promise<void>;
  batchCloneNodes: (
    ids: string[],
    offset?: { x: number; y: number }
  ) => Promise<void>;

  addEdge: (edge: {
    source: string;
    target: string;
    type: EdgeType;
    label?: string;
    direction?: EdgeDirection;
    roles?: { source?: string; target?: string };
    strength?: EdgeStrength;
  }) => Promise<string | undefined>;
  updateEdge: (id: string, updates: Partial<GraphEdge>) => Promise<void>;
  removeEdge: (id: string) => Promise<void>;

  // 子图片段插入：一次性插入多个节点与边
  addSubgraph: (snippet: {
    nodes: Array<{
      type: NodeType;
      label: string;
      position: { x: number; y: number };
      data?: Record<string, unknown>;
    }>;
    edges: Array<{
      sourceIndex: number;
      targetIndex: number;
      type: EdgeType;
      label?: string;
    }>;
  }) => Promise<void>;

  setSelectedNode: (id: string | null) => void;
  setSelectedEdge: (id: string | null) => void;
  setLayoutDirection: (dir: LayoutDirection) => void;
}

// 拖拽位置更新的本地缓存（防抖写入）
const positionCache = new Map<string, { x: number; y: number }>();
let positionFlushTimer: ReturnType<typeof setTimeout> | null = null;

export const useMechanismStore = create<MechanismState>((set, get) => ({
  graphs: [],
  currentGraphId: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  selectedEdgeId: null,
  loading: false,
  layoutDirection: "LR",

  loadGraphs: async (projectId) => {
    set({ loading: true });
    try {
      const graphs = await db.mechanismGraphs
        .where("projectId")
        .equals(projectId)
        .toArray();
      graphs.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ graphs, loading: false });
      // 自愈 currentGraphId：若指向已不存在的图，则回退到首个
      const current = get().currentGraphId;
      if (current && !graphs.find((g) => g.id === current)) {
        set({ currentGraphId: graphs[0]?.id ?? null });
      }
    } catch (e) {
      console.error("加载机制图失败:", e);
      set({ loading: false });
    }
  },

  createGraph: async (projectId, name, type) => {
    const graph: MechanismGraph = {
      id: generateId("graph"),
      projectId,
      name: name.trim() || "未命名图",
      type,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.mechanismGraphs.add(graph);
    set({ graphs: [graph, ...get().graphs] });
    useHistoryStore.getState().push({
      description: `创建机制图 ${graph.name}`,
      undo: async () => {
        await db.mechanismGraphs.delete(graph.id);
        set({ graphs: get().graphs.filter((g) => g.id !== graph.id) });
      },
      redo: async () => {
        await db.mechanismGraphs.add(graph);
        set({ graphs: [graph, ...get().graphs] });
      },
    });
    return graph;
  },

  deleteGraph: async (id) => {
    const deletedGraph = get().graphs.find((g) => g.id === id);
    if (!deletedGraph) return;
    // 保存被级联删除的 nodes 和 edges 快照，便于撤销恢复
    const deletedNodes = await db.graphNodes.where("graphId").equals(id).toArray();
    const deletedEdges = await db.graphEdges.where("graphId").equals(id).toArray();
    const prevCurrentGraphId = get().currentGraphId;
    const prevNodes = get().nodes;
    const prevEdges = get().edges;
    await db.transaction("rw", [db.mechanismGraphs, db.graphNodes, db.graphEdges], async () => {
      await db.graphNodes.where("graphId").equals(id).delete();
      await db.graphEdges.where("graphId").equals(id).delete();
      await db.mechanismGraphs.delete(id);
    });
    set({
      graphs: get().graphs.filter((g) => g.id !== id),
      currentGraphId: get().currentGraphId === id ? null : get().currentGraphId,
      nodes: get().currentGraphId === id ? [] : get().nodes,
      edges: get().currentGraphId === id ? [] : get().edges,
    });
    useHistoryStore.getState().push({
      description: `删除机制图 ${deletedGraph.name}`,
      undo: async () => {
        await db.transaction("rw", [db.mechanismGraphs, db.graphNodes, db.graphEdges], async () => {
          await db.mechanismGraphs.add(deletedGraph);
          if (deletedNodes.length > 0) await db.graphNodes.bulkAdd(deletedNodes);
          if (deletedEdges.length > 0) await db.graphEdges.bulkAdd(deletedEdges);
        });
        // 仅当被删除的是当前图时才恢复 currentGraphId/nodes/edges，
        // 否则保留用户在删除后可能发生的导航切换
        if (prevCurrentGraphId === id) {
          set({
            graphs: [deletedGraph, ...get().graphs.filter((g) => g.id !== id)],
            currentGraphId: prevCurrentGraphId,
            nodes: prevNodes,
            edges: prevEdges,
          });
        } else {
          set({
            graphs: [deletedGraph, ...get().graphs.filter((g) => g.id !== id)],
          });
        }
      },
      redo: async () => {
        await db.transaction("rw", [db.mechanismGraphs, db.graphNodes, db.graphEdges], async () => {
          await db.graphNodes.where("graphId").equals(id).delete();
          await db.graphEdges.where("graphId").equals(id).delete();
          await db.mechanismGraphs.delete(id);
        });
        set({
          graphs: get().graphs.filter((g) => g.id !== id),
          currentGraphId: get().currentGraphId === id ? null : get().currentGraphId,
          nodes: get().currentGraphId === id ? [] : get().nodes,
          edges: get().currentGraphId === id ? [] : get().edges,
        });
      },
    });
  },

  selectGraph: async (id) => {
    // 切换图时清理上一张图残留的位置缓存与防抖定时器，避免错位写入
    positionCache.clear();
    if (positionFlushTimer) {
      clearTimeout(positionFlushTimer);
      positionFlushTimer = null;
    }
    if (!id) {
      set({
        currentGraphId: null,
        nodes: [],
        edges: [],
        selectedNodeId: null,
        selectedEdgeId: null,
      });
      return;
    }
    set({
      currentGraphId: id,
      selectedNodeId: null,
      selectedEdgeId: null,
      loading: true,
    });
    try {
      const [nodes, edges] = await Promise.all([
        db.graphNodes.where("graphId").equals(id).toArray(),
        db.graphEdges.where("graphId").equals(id).toArray(),
      ]);
      // 迁移旧版 EdgeType 到新的 17 种语义化类型
      const migratedEdges = edges.map((e) => ({
        ...e,
        type: migrateEdgeType(e.type),
      }));
      set({ nodes, edges: migratedEdges, loading: false });
    } catch (e) {
      console.error("加载图数据失败:", e);
      set({ loading: false });
    }
  },

  renameGraph: async (id, name) => {
    const prev = get().graphs.find((g) => g.id === id);
    if (!prev) return;
    await db.mechanismGraphs.update(id, { name, updatedAt: now() });
    set({
      graphs: get().graphs.map((g) =>
        g.id === id ? { ...g, name } : g
      ),
    });
    useHistoryStore.getState().push({
      description: `重命名机制图 ${name}`,
      undo: async () => {
        await db.mechanismGraphs.update(id, prev);
        set({
          graphs: get().graphs.map((g) => (g.id === id ? prev : g)),
        });
      },
      redo: async () => {
        await db.mechanismGraphs.update(id, { name, updatedAt: now() });
        set({
          graphs: get().graphs.map((g) =>
            g.id === id ? { ...g, name } : g
          ),
        });
      },
    });
  },

  addNode: async (type, position, label, restoreId) => {
    const graphId = get().currentGraphId;
    if (!graphId) return undefined;
    const node: GraphNode = {
      id: restoreId ?? generateNodeId(),
      graphId,
      type,
      label: label || "",
      data: {},
      position,
    };
    await db.graphNodes.add(node);
    await db.mechanismGraphs.update(graphId, { updatedAt: now() });
    set({ nodes: [...get().nodes, node] });
    // 登记撤销
    useHistoryStore.getState().push({
      description: `添加节点 ${node.label || node.type}`,
      undo: async () => {
        await db.graphNodes.delete(node.id);
        set({ nodes: get().nodes.filter((n) => n.id !== node.id) });
      },
      redo: async () => {
        await db.graphNodes.add(node);
        set({ nodes: [...get().nodes, node] });
      },
    });
    return node.id;
  },

  updateNode: async (id, updates) => {
    const prev = get().nodes.find((n) => n.id === id);
    if (!prev) return;
    await db.graphNodes.update(id, updates);
    set({
      nodes: get().nodes.map((n) => (n.id === id ? { ...n, ...updates } : n)),
    });
    // 登记撤销（仅对内容修改，不含位置拖拽）
    if (!("position" in updates) || Object.keys(updates).length > 1) {
      useHistoryStore.getState().push({
        description: `修改节点 ${prev.label || prev.type}`,
        undo: async () => {
          // 还原完整前序状态：prev.id === id，put 会按主键替换既有记录
          await db.graphNodes.put(prev);
          set({
            nodes: get().nodes.map((n) => (n.id === id ? prev : n)),
          });
        },
        redo: async () => {
          const merged = { ...prev, ...updates };
          await db.graphNodes.update(id, updates);
          set({
            nodes: get().nodes.map((n) => (n.id === id ? merged : n)),
          });
        },
      });
    }
  },

  updateNodePosition: (id, position) => {
    // 本地立即更新
    set({
      nodes: get().nodes.map((n) =>
        n.id === id ? { ...n, position } : n
      ),
    });
    // 防抖写入 IndexedDB
    positionCache.set(id, position);
    if (positionFlushTimer) clearTimeout(positionFlushTimer);
    positionFlushTimer = setTimeout(async () => {
      const entries = Array.from(positionCache.entries());
      positionCache.clear();
      for (const [nodeId, pos] of entries) {
        await db.graphNodes.update(nodeId, { position: pos });
      }
      const graphId = get().currentGraphId;
      if (graphId) {
        await db.mechanismGraphs.update(graphId, { updatedAt: now() });
      }
    }, 500);
  },

  batchUpdateNodePositions: async (positions) => {
    // 一次性批量更新节点位置（用于 ELK 自动布局）
    const updates: Array<Promise<unknown>> = [];
    const newNodes = get().nodes.map((n) => {
      const pos = positions.get(n.id);
      if (!pos) return n;
      updates.push(db.graphNodes.update(n.id, { position: pos }));
      return { ...n, position: pos };
    });
    set({ nodes: newNodes });
    await Promise.all(updates);
    const graphId = get().currentGraphId;
    if (graphId) {
      await db.mechanismGraphs.update(graphId, { updatedAt: now() });
    }
  },

  removeNode: async (id) => {
    const node = get().nodes.find((n) => n.id === id);
    if (!node) return;
    // 先记录关联边，便于撤销
    const relatedEdges = get().edges.filter(
      (e) => e.source === id || e.target === id
    );
    await db.transaction("rw", [db.graphNodes, db.graphEdges], async () => {
      await db.graphNodes.delete(id);
      const edgeIds = relatedEdges.map((e) => e.id);
      if (edgeIds.length > 0) await db.graphEdges.bulkDelete(edgeIds);
    });
    set({
      nodes: get().nodes.filter((n) => n.id !== id),
      edges: get().edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: get().selectedNodeId === id ? null : get().selectedNodeId,
      selectedEdgeId:
        relatedEdges.some((e) => e.id === get().selectedEdgeId)
          ? null
          : get().selectedEdgeId,
    });
    useHistoryStore.getState().push({
      description: `删除节点 ${node.label || node.type}`,
      undo: async () => {
        await db.graphNodes.add(node);
        if (relatedEdges.length > 0) await db.graphEdges.bulkAdd(relatedEdges);
        set({
          nodes: [...get().nodes, node],
          edges: [...get().edges, ...relatedEdges],
        });
      },
      redo: async () => {
        await db.graphNodes.delete(id);
        const edgeIds = relatedEdges.map((e) => e.id);
        if (edgeIds.length > 0) await db.graphEdges.bulkDelete(edgeIds);
        set({
          nodes: get().nodes.filter((n) => n.id !== id),
          edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        });
      },
    });
  },

  batchDeleteNodes: async (ids) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const deletedNodes = get().nodes.filter((n) => idSet.has(n.id));
    const deletedEdges = get().edges.filter(
      (e) => idSet.has(e.source) || idSet.has(e.target)
    );
    await db.transaction("rw", [db.graphNodes, db.graphEdges], async () => {
      await db.graphNodes.bulkDelete(ids);
      if (deletedEdges.length > 0) {
        await db.graphEdges.bulkDelete(deletedEdges.map((e) => e.id));
      }
    });
    set({
      nodes: get().nodes.filter((n) => !idSet.has(n.id)),
      edges: get().edges.filter(
        (e) => !idSet.has(e.source) && !idSet.has(e.target)
      ),
      selectedNodeId: null,
      selectedEdgeId: null,
    });
    useHistoryStore.getState().push({
      description: `批量删除 ${deletedNodes.length} 个节点`,
      undo: async () => {
        await db.graphNodes.bulkAdd(deletedNodes);
        if (deletedEdges.length > 0) await db.graphEdges.bulkAdd(deletedEdges);
        set({
          nodes: [...get().nodes, ...deletedNodes],
          edges: [...get().edges, ...deletedEdges],
        });
      },
      redo: async () => {
        await db.graphNodes.bulkDelete(ids);
        if (deletedEdges.length > 0) {
          await db.graphEdges.bulkDelete(deletedEdges.map((e) => e.id));
        }
        set({
          nodes: get().nodes.filter((n) => !idSet.has(n.id)),
          edges: get().edges.filter(
            (e) => !idSet.has(e.source) && !idSet.has(e.target)
          ),
        });
      },
    });
  },

  batchCloneNodes: async (ids, offset) => {
    if (ids.length === 0) return;
    const dx = offset?.x ?? 40;
    const dy = offset?.y ?? 40;
    const sourceNodes = get().nodes.filter((n) => ids.includes(n.id));
    if (sourceNodes.length === 0) return;
    const graphId = get().currentGraphId;
    if (!graphId) return;
    const clonedNodes: GraphNode[] = sourceNodes.map((n) => ({
      id: generateNodeId(),
      graphId,
      type: n.type,
      label: `${n.label} 副本`,
      data: { ...n.data },
      position: { x: n.position.x + dx, y: n.position.y + dy },
      refAttributeId: n.refAttributeId,
    }));
    await db.graphNodes.bulkAdd(clonedNodes);
    set({ nodes: [...get().nodes, ...clonedNodes] });
    useHistoryStore.getState().push({
      description: `克隆 ${clonedNodes.length} 个节点`,
      undo: async () => {
        await db.graphNodes.bulkDelete(clonedNodes.map((n) => n.id));
        set({
          nodes: get().nodes.filter(
            (n) => !clonedNodes.some((c) => c.id === n.id)
          ),
        });
      },
      redo: async () => {
        await db.graphNodes.bulkAdd(clonedNodes);
        set({ nodes: [...get().nodes, ...clonedNodes] });
      },
    });
  },

  addSubgraph: async (snippet) => {
    const graphId = get().currentGraphId;
    if (!graphId) return;
    const createdNodes: GraphNode[] = snippet.nodes.map((n) => ({
      id: generateNodeId(),
      graphId,
      type: n.type,
      label: n.label,
      data: n.data ?? {},
      position: n.position,
    }));
    const createdEdges: GraphEdge[] = snippet.edges.map((e) => ({
      id: generateEdgeId(),
      graphId,
      source: createdNodes[e.sourceIndex].id,
      target: createdNodes[e.targetIndex].id,
      type: e.type,
      label: e.label,
    }));
    await db.transaction("rw", [db.graphNodes, db.graphEdges], async () => {
      await db.graphNodes.bulkAdd(createdNodes);
      if (createdEdges.length > 0) await db.graphEdges.bulkAdd(createdEdges);
    });
    set({
      nodes: [...get().nodes, ...createdNodes],
      edges: [...get().edges, ...createdEdges],
    });
    useHistoryStore.getState().push({
      description: `插入片段：${createdNodes.length} 节点 ${createdEdges.length} 连接`,
      undo: async () => {
        await db.graphNodes.bulkDelete(createdNodes.map((n) => n.id));
        await db.graphEdges.bulkDelete(createdEdges.map((e) => e.id));
        const nodeIdSet = new Set(createdNodes.map((n) => n.id));
        set({
          nodes: get().nodes.filter((n) => !nodeIdSet.has(n.id)),
          edges: get().edges.filter(
            (e) =>
              !nodeIdSet.has(e.source) && !nodeIdSet.has(e.target)
          ),
        });
      },
      redo: async () => {
        await db.graphNodes.bulkAdd(createdNodes);
        if (createdEdges.length > 0) await db.graphEdges.bulkAdd(createdEdges);
        set({
          nodes: [...get().nodes, ...createdNodes],
          edges: [...get().edges, ...createdEdges],
        });
      },
    });
  },

  addEdge: async (edge) => {
    const graphId = get().currentGraphId;
    if (!graphId) return undefined;
    const newEdge: GraphEdge = {
      id: generateEdgeId(),
      graphId,
      source: edge.source,
      target: edge.target,
      type: edge.type,
      label: edge.label,
      direction: edge.direction,
      roles: edge.roles,
      strength: edge.strength,
    };
    await db.graphEdges.add(newEdge);
    set({ edges: [...get().edges, newEdge] });
    useHistoryStore.getState().push({
      description: `添加连接 ${edge.type}`,
      undo: async () => {
        await db.graphEdges.delete(newEdge.id);
        set({ edges: get().edges.filter((e) => e.id !== newEdge.id) });
      },
      redo: async () => {
        await db.graphEdges.add(newEdge);
        set({ edges: [...get().edges, newEdge] });
      },
    });
    return newEdge.id;
  },

  updateEdge: async (id, updates) => {
    const prev = get().edges.find((e) => e.id === id);
    if (!prev) return;
    await db.graphEdges.update(id, updates);
    set({
      edges: get().edges.map((e) =>
        e.id === id ? { ...e, ...updates } : e
      ),
    });
    useHistoryStore.getState().push({
      description: `修改连接`,
      undo: async () => {
        await db.graphEdges.update(id, prev);
        set({
          edges: get().edges.map((e) => (e.id === id ? prev : e)),
        });
      },
      redo: async () => {
        const merged = { ...prev, ...updates };
        await db.graphEdges.update(id, updates);
        set({
          edges: get().edges.map((e) => (e.id === id ? merged : e)),
        });
      },
    });
  },

  removeEdge: async (id) => {
    const edge = get().edges.find((e) => e.id === id);
    if (!edge) return;
    await db.graphEdges.delete(id);
    set({
      edges: get().edges.filter((e) => e.id !== id),
      selectedEdgeId: get().selectedEdgeId === id ? null : get().selectedEdgeId,
    });
    useHistoryStore.getState().push({
      description: `删除连接 ${edge.type}`,
      undo: async () => {
        await db.graphEdges.add(edge);
        set({ edges: [...get().edges, edge] });
      },
      redo: async () => {
        await db.graphEdges.delete(id);
        set({ edges: get().edges.filter((e) => e.id !== id) });
      },
    });
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  setSelectedEdge: (id) => set({ selectedEdgeId: id }),

  setLayoutDirection: (dir) => set({ layoutDirection: dir }),
}));

export function clearPositionCache() {
  positionCache.clear();
  if (positionFlushTimer) {
    clearTimeout(positionFlushTimer);
    positionFlushTimer = null;
  }
}
