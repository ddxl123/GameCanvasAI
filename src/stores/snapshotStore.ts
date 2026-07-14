import { create } from "zustand";
import { db } from "@/db";
import { generateSnapshotId } from "@/lib/id";
import { now } from "@/lib/time";
import type {
  DesignSnapshot,
  Project,
  MechanismGraph,
  GraphNode,
  GraphEdge,
  NumericSheet,
  Attribute,
  Formula,
  GDDDocument,
  DocSection,
  NodeGroup,
  Comment,
  Inspiration,
  CoreLoop,
  GameMoment,
  GameRule,
  InteractionMatrix,
  LevelFlow,
  AIConversation,
  AIChatMessage,
} from "@/types";
import { useMechanismStore } from "./mechanismStore";
import { useNumericStore } from "./numericStore";
import { useDocumentStore } from "./documentStore";
import { useGameplayStore } from "./gameplayStore";
import { useLevelStore } from "./levelStore";
import { useRuleStore } from "./ruleStore";
import { useInspirationStore } from "./inspirationStore";
import { useCommentStore } from "./commentStore";
import { useNodeGroupStore } from "./nodeGroupStore";
import { useHistoryStore } from "./historyStore";

/** 快照反序列化后的数据结构（与 createSnapshot 写入的字段对齐） */
interface SnapshotData {
  version: number;
  exportedAt: number;
  project: Project;
  graphs: MechanismGraph[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  sheets: NumericSheet[];
  attributes: Attribute[];
  formulas: Formula[];
  documents: GDDDocument[];
  sections: DocSection[];
  nodeGroups: NodeGroup[];
  comments: Comment[];
  inspirations: Inspiration[];
  coreLoops: CoreLoop[];
  gameMoments: GameMoment[];
  gameRules: GameRule[];
  interactionMatrices: InteractionMatrix[];
  levelFlows: LevelFlow[];
  aiConversations: AIConversation[];
  aiMessages: AIChatMessage[];
}

interface SnapshotState {
  snapshots: DesignSnapshot[];
  loading: boolean;

  loadSnapshots: (projectId: string) => Promise<void>;
  createSnapshot: (projectId: string, name: string, description?: string) => Promise<string>;
  deleteSnapshot: (id: string) => Promise<void>;
  restoreSnapshot: (id: string) => Promise<void>;
  getSnapshotData: (id: string) => Promise<DesignSnapshot | undefined>;
}

export const useSnapshotStore = create<SnapshotState>((set, get) => ({
  snapshots: [],
  loading: false,

  loadSnapshots: async (projectId) => {
    set({ loading: true });
    try {
      const snapshots = await db.snapshots
        .where("projectId")
        .equals(projectId)
        .toArray();
      snapshots.sort((a, b) => b.createdAt - a.createdAt);
      // 仅加载元数据，剥离 data 字段以减少内存占用（完整数据按需通过 getSnapshotData 加载）
      set({ snapshots: snapshots.map((s) => ({ ...s, data: "" })), loading: false });
    } catch (e) {
      console.error("加载快照失败:", e);
      set({ loading: false });
    }
  },

  createSnapshot: async (projectId, name, description) => {
    // 收集项目所有数据，序列化为 JSON
    const project = await db.projects.get(projectId);
    if (!project) throw new Error("项目不存在");

    const graphs = await db.mechanismGraphs.where("projectId").equals(projectId).toArray();
    const graphIds = graphs.map((g) => g.id);
    const nodes = graphIds.length
      ? await db.graphNodes.where("graphId").anyOf(graphIds).toArray()
      : [];
    const edges = graphIds.length
      ? await db.graphEdges.where("graphId").anyOf(graphIds).toArray()
      : [];

    const sheets = await db.numericSheets.where("projectId").equals(projectId).toArray();
    const sheetIds = sheets.map((s) => s.id);
    const attributes = sheetIds.length
      ? await db.attributes.where("sheetId").anyOf(sheetIds).toArray()
      : [];
    const formulas = sheetIds.length
      ? await db.formulas.where("sheetId").anyOf(sheetIds).toArray()
      : [];

    const documents = await db.gddDocuments.where("projectId").equals(projectId).toArray();
    const docIds = documents.map((d) => d.id);
    const sections = docIds.length
      ? await db.docSections.where("docId").anyOf(docIds).toArray()
      : [];

    // 拉取节点分组（按 graphId 批量查询）
    const nodeGroups = graphIds.length
      ? await db.nodeGroups.where("graphId").anyOf(graphIds).toArray()
      : [];

    // 拉取评论批注
    const comments = await db.comments
      .where("projectId")
      .equals(projectId)
      .toArray();

    // 拉取灵感便签（仅项目级）
    const inspirations = await db.inspirations
      .where("projectId")
      .equals(projectId)
      .toArray();

    // 拉取玩法设计相关数据
    const coreLoops = await db.coreLoops
      .where("projectId")
      .equals(projectId)
      .toArray();
    const gameMoments = await db.gameMoments
      .where("projectId")
      .equals(projectId)
      .toArray();
    const gameRules = await db.gameRules
      .where("projectId")
      .equals(projectId)
      .toArray();
    const interactionMatrices = await db.interactionMatrices
      .where("projectId")
      .equals(projectId)
      .toArray();
    const levelFlows = await db.levelFlows
      .where("projectId")
      .equals(projectId)
      .toArray();

    // 拉取 AI 对话相关数据（先取对话，再按 conversationId 取消息）
    const aiConversations = await db.aiConversations
      .where("projectId")
      .equals(projectId)
      .toArray();
    const convIds = aiConversations.map((c) => c.id);
    const aiMessages = convIds.length
      ? await db.aiMessages.where("conversationId").anyOf(convIds).toArray()
      : [];

    const data = JSON.stringify({
      version: 1,
      exportedAt: now(),
      project,
      graphs,
      nodes,
      edges,
      sheets,
      attributes,
      formulas,
      documents,
      sections,
      nodeGroups,
      comments,
      inspirations,
      coreLoops,
      gameMoments,
      gameRules,
      interactionMatrices,
      levelFlows,
      aiConversations,
      aiMessages,
    });

    const snapshot: DesignSnapshot = {
      id: generateSnapshotId(),
      projectId,
      name: name.trim() || `快照 ${new Date().toLocaleString("zh-CN")}`,
      description,
      createdAt: now(),
      data,
    };
    await db.snapshots.add(snapshot);
    set({ snapshots: [snapshot, ...get().snapshots] });
    return snapshot.id;
  },

  deleteSnapshot: async (id) => {
    await db.snapshots.delete(id);
    set({ snapshots: get().snapshots.filter((s) => s.id !== id) });
  },

  restoreSnapshot: async (id) => {
    const snapshot = await db.snapshots.get(id);
    if (!snapshot) throw new Error("快照不存在");

    let data: SnapshotData;
    try {
      data = JSON.parse(snapshot.data) as SnapshotData;
    } catch {
      throw new Error("快照数据损坏，无法恢复");
    }
    const projectId = data.project.id;

    // 清空当前项目的所有数据，然后写回快照内容
    await db.transaction(
      "rw",
      [
        db.projects,
        db.mechanismGraphs,
        db.graphNodes,
        db.graphEdges,
        db.numericSheets,
        db.attributes,
        db.formulas,
        db.gddDocuments,
        db.docSections,
        db.aiConversations,
        db.aiMessages,
        db.nodeGroups,
        db.comments,
        db.inspirations,
        db.coreLoops,
        db.gameMoments,
        db.gameRules,
        db.interactionMatrices,
        db.levelFlows,
      ],
      async () => {
        // 删除旧数据
        const oldGraphs = await db.mechanismGraphs.where("projectId").equals(projectId).toArray();
        const oldGraphIds = oldGraphs.map((g) => g.id);
        for (const g of oldGraphs) {
          await db.graphNodes.where("graphId").equals(g.id).delete();
          await db.graphEdges.where("graphId").equals(g.id).delete();
        }
        await db.mechanismGraphs.where("projectId").equals(projectId).delete();
        await db.numericSheets.where("projectId").equals(projectId).delete();
        const oldDocs = await db.gddDocuments.where("projectId").equals(projectId).toArray();
        for (const d of oldDocs) {
          await db.docSections.where("docId").equals(d.id).delete();
        }
        await db.gddDocuments.where("projectId").equals(projectId).delete();

        // 先取旧 aiConversations 的 id 集合，供后续按 conversationId 删除 aiMessages
        const oldAiConvs = await db.aiConversations
          .where("projectId")
          .equals(projectId)
          .toArray();
        const oldConvIds = oldAiConvs.map((c) => c.id);

        // 删除新增表旧数据
        if (oldGraphIds.length) {
          await db.nodeGroups.where("graphId").anyOf(oldGraphIds).delete();
        }
        await db.comments.where("projectId").equals(projectId).delete();
        await db.inspirations.where("projectId").equals(projectId).delete();
        await db.coreLoops.where("projectId").equals(projectId).delete();
        await db.gameMoments.where("projectId").equals(projectId).delete();
        await db.gameRules.where("projectId").equals(projectId).delete();
        await db.interactionMatrices.where("projectId").equals(projectId).delete();
        await db.levelFlows.where("projectId").equals(projectId).delete();
        await db.aiConversations.where("projectId").equals(projectId).delete();
        if (oldConvIds.length) {
          await db.aiMessages
            .where("conversationId")
            .anyOf(oldConvIds)
            .delete();
        }

        // 写回快照数据
        await db.projects.put(data.project);
        if (data.graphs?.length) await db.mechanismGraphs.bulkAdd(data.graphs);
        if (data.nodes?.length) await db.graphNodes.bulkAdd(data.nodes);
        if (data.edges?.length) await db.graphEdges.bulkAdd(data.edges);
        if (data.sheets?.length) await db.numericSheets.bulkAdd(data.sheets);
        if (data.attributes?.length) await db.attributes.bulkAdd(data.attributes);
        if (data.formulas?.length) await db.formulas.bulkAdd(data.formulas);
        if (data.documents?.length) await db.gddDocuments.bulkAdd(data.documents);
        if (data.sections?.length) await db.docSections.bulkAdd(data.sections);
        if (data.nodeGroups?.length) await db.nodeGroups.bulkAdd(data.nodeGroups);
        if (data.comments?.length) await db.comments.bulkAdd(data.comments);
        if (data.inspirations?.length) await db.inspirations.bulkAdd(data.inspirations);
        if (data.coreLoops?.length) await db.coreLoops.bulkAdd(data.coreLoops);
        if (data.gameMoments?.length) await db.gameMoments.bulkAdd(data.gameMoments);
        if (data.gameRules?.length) await db.gameRules.bulkAdd(data.gameRules);
        if (data.interactionMatrices?.length) await db.interactionMatrices.bulkAdd(data.interactionMatrices);
        if (data.levelFlows?.length) await db.levelFlows.bulkAdd(data.levelFlows);
        if (data.aiConversations?.length) await db.aiConversations.bulkAdd(data.aiConversations);
        if (data.aiMessages?.length) await db.aiMessages.bulkAdd(data.aiMessages);
      }
    );

    // 事务完成后刷新各 store 的内存状态
    const pid = data.project.id;
    await Promise.all([
      useMechanismStore.getState().loadGraphs(pid),
      useNumericStore.getState().loadSheets(pid),
      useDocumentStore.getState().loadDocuments(pid),
      useGameplayStore.getState().loadLoops(pid),
      useGameplayStore.getState().loadMoments(pid),
      useLevelStore.getState().loadFlows(pid),
      useRuleStore.getState().loadRules(pid),
      useRuleStore.getState().loadMatrices(pid),
      useInspirationStore.getState().loadInspirations(pid),
      useCommentStore.getState().loadComments(pid),
    ]);
    // nodeGroupStore.loadGroups 需要 graphId 而非 projectId，恢复后清空避免残留旧数据
    useNodeGroupStore.setState({ groups: [] });
    useHistoryStore.getState().clear();
  },

  getSnapshotData: async (id) => {
    return db.snapshots.get(id);
  },
}));
