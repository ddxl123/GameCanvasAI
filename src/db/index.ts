import Dexie, { type Table } from "dexie";
import { migrateEdgeType } from "@/features/mechanism/nodeTypes";
import type {
  Project,
  MechanismGraph,
  GraphNode,
  GraphEdge,
  NumericSheet,
  Attribute,
  Formula,
  GDDDocument,
  DocSection,
  AIConversation,
  AIChatMessage,
  DesignSnapshot,
  NodeGroup,
  Comment,
  Inspiration,
  CoreLoop,
  GameMoment,
  GameRule,
  InteractionMatrix,
  LevelFlow,
} from "@/types";

export class GameDesignDB extends Dexie {
  projects!: Table<Project, string>;
  mechanismGraphs!: Table<MechanismGraph, string>;
  graphNodes!: Table<GraphNode, string>;
  graphEdges!: Table<GraphEdge, string>;
  numericSheets!: Table<NumericSheet, string>;
  attributes!: Table<Attribute, string>;
  formulas!: Table<Formula, string>;
  gddDocuments!: Table<GDDDocument, string>;
  docSections!: Table<DocSection, string>;
  // 新增表
  aiConversations!: Table<AIConversation, string>;
  aiMessages!: Table<AIChatMessage, string>;
  snapshots!: Table<DesignSnapshot, string>;
  nodeGroups!: Table<NodeGroup, string>;
  comments!: Table<Comment, string>;
  inspirations!: Table<Inspiration, string>;
  coreLoops!: Table<CoreLoop, string>;
  gameMoments!: Table<GameMoment, string>;
  gameRules!: Table<GameRule, string>;
  interactionMatrices!: Table<InteractionMatrix, string>;
  levelFlows!: Table<LevelFlow, string>;

  constructor() {
    super("GameDesignPlatform");
    // v1: 初始 schema
    this.version(1).stores({
      projects: "id, name, updatedAt",
      mechanismGraphs: "id, projectId, type",
      graphNodes: "id, graphId, type",
      graphEdges: "id, graphId, source, target",
      numericSheets: "id, projectId",
      attributes: "id, sheetId, parentId, order",
      formulas: "id, sheetId, attributeId",
      gddDocuments: "id, projectId",
      docSections: "id, docId, order",
    });
    // v2: 新增 AI 对话、设计快照、节点分组表
    this.version(2).stores({
      projects: "id, name, updatedAt",
      mechanismGraphs: "id, projectId, type",
      graphNodes: "id, graphId, type, groupId",
      graphEdges: "id, graphId, source, target",
      numericSheets: "id, projectId",
      attributes: "id, sheetId, parentId, order",
      formulas: "id, sheetId, attributeId",
      gddDocuments: "id, projectId",
      docSections: "id, docId, order",
      aiConversations: "id, projectId, updatedAt",
      aiMessages: "id, conversationId, order",
      snapshots: "id, projectId, createdAt",
      nodeGroups: "id, graphId",
    });
    // v3: 新增评论批注表
    this.version(3).stores({
      projects: "id, name, updatedAt",
      mechanismGraphs: "id, projectId, type",
      graphNodes: "id, graphId, type, groupId",
      graphEdges: "id, graphId, source, target",
      numericSheets: "id, projectId",
      attributes: "id, sheetId, parentId, order",
      formulas: "id, sheetId, attributeId",
      gddDocuments: "id, projectId",
      docSections: "id, docId, order",
      aiConversations: "id, projectId, updatedAt",
      aiMessages: "id, conversationId, order",
      snapshots: "id, projectId, createdAt",
      nodeGroups: "id, graphId",
      comments: "id, projectId, targetType, targetId, createdAt",
    });
    // v4: 新增灵感便签表
    this.version(4).stores({
      projects: "id, name, updatedAt",
      mechanismGraphs: "id, projectId, type",
      graphNodes: "id, graphId, type, groupId",
      graphEdges: "id, graphId, source, target",
      numericSheets: "id, projectId",
      attributes: "id, sheetId, parentId, order",
      formulas: "id, sheetId, attributeId",
      gddDocuments: "id, projectId",
      docSections: "id, docId, order",
      aiConversations: "id, projectId, updatedAt",
      aiMessages: "id, conversationId, order",
      snapshots: "id, projectId, createdAt",
      nodeGroups: "id, graphId",
      comments: "id, projectId, targetType, targetId, createdAt",
      inspirations: "id, projectId, category, status, createdAt",
    });
    // v5: 新增玩法循环、高光时刻、规则卡牌、交互矩阵、关卡流程
    this.version(5).stores({
      projects: "id, name, updatedAt",
      mechanismGraphs: "id, projectId, type",
      graphNodes: "id, graphId, type, groupId",
      graphEdges: "id, graphId, source, target",
      numericSheets: "id, projectId",
      attributes: "id, sheetId, parentId, order",
      formulas: "id, sheetId, attributeId",
      gddDocuments: "id, projectId",
      docSections: "id, docId, order",
      aiConversations: "id, projectId, updatedAt",
      aiMessages: "id, conversationId, order",
      snapshots: "id, projectId, createdAt",
      nodeGroups: "id, graphId",
      comments: "id, projectId, targetType, targetId, createdAt",
      inspirations: "id, projectId, category, status, createdAt",
      coreLoops: "id, projectId, loopType",
      gameMoments: "id, projectId, type, order",
      gameRules: "id, projectId, category, order",
      interactionMatrices: "id, projectId",
      levelFlows: "id, projectId",
    });
    // v6: 数据迁移——迁移旧版 EdgeType 到新的语义化类型，确保旧节点有 groupId 字段
    this.version(6).stores({
      // 与 v5 相同的 schema
      projects: "id, name, updatedAt",
      mechanismGraphs: "id, projectId, type",
      graphNodes: "id, graphId, type, groupId",
      graphEdges: "id, graphId, source, target",
      numericSheets: "id, projectId",
      attributes: "id, sheetId, parentId, order",
      formulas: "id, sheetId, attributeId",
      gddDocuments: "id, projectId",
      docSections: "id, docId, order",
      aiConversations: "id, projectId, updatedAt",
      aiMessages: "id, conversationId, order",
      snapshots: "id, projectId, createdAt",
      nodeGroups: "id, graphId",
      comments: "id, projectId, targetType, targetId, createdAt",
      inspirations: "id, projectId, category, status, createdAt",
      coreLoops: "id, projectId, loopType",
      gameMoments: "id, projectId, type, order",
      gameRules: "id, projectId, category, order",
      interactionMatrices: "id, projectId",
      levelFlows: "id, projectId",
    }).upgrade(async (tx) => {
      // 迁移旧版 EdgeType 到新的 17 种语义化类型（已是新类型则原样保留）
      await tx.table("graphEdges").toCollection().modify((edge) => {
        const migrated = migrateEdgeType(edge.type);
        if (migrated !== edge.type) {
          edge.type = migrated;
        }
      });
      // 确保旧节点有 groupId 字段：缺失即 undefined（类型已声明为可选，无需额外写入）
    });
  }
}

export const db = new GameDesignDB();
