import { db } from "@/db";
import { sanitizeFileName } from "@/lib/utils";
import {
  generateId,
  generateNodeId,
  generateEdgeId,
} from "@/lib/id";
import { sanitizeHtml } from "@/lib/sanitize";
import { now } from "@/lib/time";
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
  EmbedType,
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

// 导出文件结构版本号，未来结构变更时递增
const EXPORT_VERSION = 2;

// 导出文件的标准结构
interface ProjectExportData {
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
  // v2 新增字段（可选，向后兼容 v1 导出文件）
  nodeGroups?: NodeGroup[];
  comments?: Comment[];
  inspirations?: Inspiration[];
  coreLoops?: CoreLoop[];
  gameMoments?: GameMoment[];
  gameRules?: GameRule[];
  interactionMatrices?: InteractionMatrix[];
  levelFlows?: LevelFlow[];
  aiConversations?: AIConversation[];
  aiMessages?: AIChatMessage[];
}

/**
 * 导出指定项目为 JSON 文件并触发浏览器下载。
 * 文件名格式：${project.name}-${timestamp}.json
 */
export async function exportProject(projectId: string): Promise<void> {
  const project = await db.projects.get(projectId);
  if (!project) {
    throw new Error("项目不存在，无法导出");
  }

  // 拉取机制图相关数据
  const graphs = await db.mechanismGraphs
    .where("projectId")
    .equals(projectId)
    .toArray();
  const graphIds = graphs.map((g) => g.id);
  const nodes = graphIds.length
    ? await db.graphNodes.where("graphId").anyOf(graphIds).toArray()
    : [];
  const edges = graphIds.length
    ? await db.graphEdges.where("graphId").anyOf(graphIds).toArray()
    : [];

  // 拉取数值表相关数据
  const sheets = await db.numericSheets
    .where("projectId")
    .equals(projectId)
    .toArray();
  const sheetIds = sheets.map((s) => s.id);
  const attributes = sheetIds.length
    ? await db.attributes.where("sheetId").anyOf(sheetIds).toArray()
    : [];
  const formulas = sheetIds.length
    ? await db.formulas.where("sheetId").anyOf(sheetIds).toArray()
    : [];

  // 拉取文档相关数据
  const documents = await db.gddDocuments
    .where("projectId")
    .equals(projectId)
    .toArray();
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

  // 拉取灵感便签（仅项目级；projectId 为 null 的全局灵感不导出）
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

  const exportData: ProjectExportData = {
    version: EXPORT_VERSION,
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
  };

  // 序列化并触发下载
  const jsonStr = JSON.stringify(exportData, null, 2);
  const blob = new Blob([jsonStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  // 文件名做安全处理：去除文件系统非法字符，避免中文/特殊符号引发问题
  const safeName = sanitizeFileName(project.name || "未命名项目");
  const timestamp = formatTimestamp(exportData.exportedAt);
  const fileName = `${safeName}-${timestamp}.json`;

  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // 释放 URL 对象，避免内存泄漏
  URL.revokeObjectURL(url);
}

/**
 * 从 JSON 文件导入项目。
 * 会为所有实体生成新 ID，保持父子关系映射，避免与现有数据冲突。
 * 成功后返回新项目的 ID。
 */
export async function importProject(file: File): Promise<string> {
  // 文件大小校验，避免误选大文件
  if (file.size > 50 * 1024 * 1024) {
    throw new Error("文件过大，请检查是否选错文件");
  }

  // 读取并解析文件
  let rawText: string;
  try {
    rawText = await file.text();
  } catch {
    throw new Error("无法读取文件，请确认文件未损坏");
  }

  let data: ProjectExportData;
  try {
    data = JSON.parse(rawText) as ProjectExportData;
  } catch {
    throw new Error("JSON 格式错误，无法解析");
  }

  // 基础字段校验
  if (!data || typeof data !== "object") {
    throw new Error("文件内容不是有效的项目导出数据");
  }
  // 兼容 v1 与 v2；v1 缺失的字段在下方按空数组处理
  if (data.version !== 1 && data.version !== 2) {
    throw new Error(
      `版本不兼容：文件版本为 ${data.version}，当前支持版本为 ${EXPORT_VERSION}`
    );
  }
  if (!data.project || !data.project.id) {
    throw new Error("缺少项目数据，无法导入");
  }

  // 构建各实体新旧 ID 映射表（项目 ID 直接重映射，无需 map）
  const graphIdMap = new Map<string, string>();
  const nodeIdMap = new Map<string, string>();
  const sheetIdMap = new Map<string, string>();
  const attrIdMap = new Map<string, string>();
  const docIdMap = new Map<string, string>();
  const secIdMap = new Map<string, string>();
  // v2 新增表 ID 映射表
  const nodeGroupIdMap = new Map<string, string>();
  const commentIdMap = new Map<string, string>();
  const inspirationIdMap = new Map<string, string>();
  const loopIdMap = new Map<string, string>();
  const momentIdMap = new Map<string, string>();
  const ruleIdMap = new Map<string, string>();
  const matrixIdMap = new Map<string, string>();
  const levelFlowIdMap = new Map<string, string>();
  const convIdMap = new Map<string, string>();
  const aiMsgIdMap = new Map<string, string>();

  // 项目 ID
  const newProjectId = generateId("proj");

  // v1 文件缺失字段默认空数组（向后兼容）
  const nodeGroups = data.nodeGroups ?? [];
  const comments = data.comments ?? [];
  const inspirations = data.inspirations ?? [];
  const coreLoops = data.coreLoops ?? [];
  const gameMoments = data.gameMoments ?? [];
  const gameRules = data.gameRules ?? [];
  const interactionMatrices = data.interactionMatrices ?? [];
  const levelFlows = data.levelFlows ?? [];
  const aiConversations = data.aiConversations ?? [];
  const aiMessages = data.aiMessages ?? [];

  // 预生成所有实体新 ID，避免写入时父子关系无法对应
  for (const g of data.graphs) {
    graphIdMap.set(g.id, generateId("graph"));
  }
  for (const n of data.nodes) {
    nodeIdMap.set(n.id, generateNodeId());
  }
  // 边的 source/target 指向节点，节点 ID 已重映射；
  // 边自身不被其它实体引用，直接在下方 map 里生成新 ID 即可
  for (const s of data.sheets) {
    sheetIdMap.set(s.id, generateId("sheet"));
  }
  for (const a of data.attributes) {
    attrIdMap.set(a.id, generateId("attr"));
  }
  for (const d of data.documents) {
    docIdMap.set(d.id, generateId("doc"));
  }
  for (const sec of data.sections) {
    secIdMap.set(sec.id, generateId("sec"));
  }
  for (const ng of nodeGroups) {
    nodeGroupIdMap.set(ng.id, generateId("group"));
  }
  for (const c of comments) {
    commentIdMap.set(c.id, generateId("comment"));
  }
  for (const i of inspirations) {
    inspirationIdMap.set(i.id, generateId("insp"));
  }
  for (const cl of coreLoops) {
    loopIdMap.set(cl.id, generateId("loop"));
  }
  for (const gm of gameMoments) {
    momentIdMap.set(gm.id, generateId("moment"));
  }
  for (const gr of gameRules) {
    ruleIdMap.set(gr.id, generateId("rule"));
  }
  for (const im of interactionMatrices) {
    matrixIdMap.set(im.id, generateId("matrix"));
  }
  for (const lf of levelFlows) {
    levelFlowIdMap.set(lf.id, generateId("flow"));
  }
  for (const ac of aiConversations) {
    convIdMap.set(ac.id, generateId("conv"));
  }
  for (const am of aiMessages) {
    aiMsgIdMap.set(am.id, generateId("msg"));
  }

  // 重建项目对象
  const ts = now();
  const newProject: Project = {
    ...data.project,
    id: newProjectId,
    name: appendCopySuffix(data.project.name),
    createdAt: ts,
    updatedAt: ts,
  };

  // 重建机制图
  const newGraphs: MechanismGraph[] = data.graphs.map((g) => ({
    ...g,
    id: graphIdMap.get(g.id)!,
    projectId: newProjectId,
  }));

  // 重建节点（含 refAttributeId 重映射）
  const newNodes: GraphNode[] = data.nodes.map((n) => {
    const remapped: GraphNode = {
      ...n,
      id: nodeIdMap.get(n.id)!,
      graphId: graphIdMap.get(n.graphId)!,
    };
    if (n.refAttributeId) {
      const mapped = attrIdMap.get(n.refAttributeId);
      // 若引用的属性未在导出数据中，则置空避免悬挂引用
      remapped.refAttributeId = mapped;
    }
    return remapped;
  });

  // 重建边（source/target 指向节点；无法映射的悬挂边丢弃）
  let skippedEdges = 0;
  const newEdges: GraphEdge[] = [];
  for (const e of data.edges) {
    const newSource = nodeIdMap.get(e.source);
    const newTarget = nodeIdMap.get(e.target);
    if (!newSource || !newTarget) {
      skippedEdges++;
      continue;
    }
    newEdges.push({
      ...e,
      id: generateEdgeId(),
      graphId: graphIdMap.get(e.graphId)!,
      source: newSource,
      target: newTarget,
    });
  }

  // 重建数值表
  const newSheets: NumericSheet[] = data.sheets.map((s) => ({
    ...s,
    id: sheetIdMap.get(s.id)!,
    projectId: newProjectId,
  }));

  // 重建属性（parentId 指向同表属性）
  const newAttributes: Attribute[] = data.attributes.map((a) => {
    const remapped: Attribute = {
      ...a,
      id: attrIdMap.get(a.id)!,
      sheetId: sheetIdMap.get(a.sheetId)!,
      parentId: a.parentId ? attrIdMap.get(a.parentId) ?? null : null,
    };
    return remapped;
  });

  // 重建公式（attributeId 无法映射的悬挂公式丢弃）
  let skippedFormulas = 0;
  const newFormulas: Formula[] = [];
  for (const f of data.formulas) {
    const newAttrId = attrIdMap.get(f.attributeId);
    if (!newAttrId) {
      skippedFormulas++;
      continue;
    }
    newFormulas.push({
      ...f,
      id: generateId("formula"),
      sheetId: sheetIdMap.get(f.sheetId)!,
      attributeId: newAttrId,
    });
  }

  // 重建文档
  const newDocuments: GDDDocument[] = data.documents.map((d) => ({
    ...d,
    id: docIdMap.get(d.id)!,
    projectId: newProjectId,
  }));

  // 重建段落（embedRefId 根据 embedType 映射到 graph 或 sheet；content 经 sanitizeHtml 净化）
  const newSections: DocSection[] = data.sections.map((sec) => {
    const remapped: DocSection = {
      ...sec,
      id: secIdMap.get(sec.id)!,
      docId: docIdMap.get(sec.docId)!,
      content: sanitizeHtml(sec.content),
    };
    if (sec.embedType && sec.embedRefId) {
      remapped.embedRefId = remapEmbedRefId(
        sec.embedType,
        sec.embedRefId,
        graphIdMap,
        sheetIdMap
      );
    }
    return remapped;
  });

  // 重建节点分组（graphId 重映射）
  const newNodeGroups: NodeGroup[] = nodeGroups.map((ng) => ({
    ...ng,
    id: nodeGroupIdMap.get(ng.id)!,
    graphId: graphIdMap.get(ng.graphId)!,
  }));

  // 重建评论批注（targetId 按 targetType 重映射到对应实体）
  const newComments: Comment[] = comments.map((c) => {
    let targetId = c.targetId;
    if (c.targetType === "node") {
      targetId = nodeIdMap.get(c.targetId) ?? c.targetId;
    } else if (c.targetType === "attribute") {
      targetId = attrIdMap.get(c.targetId) ?? c.targetId;
    } else if (c.targetType === "section") {
      targetId = secIdMap.get(c.targetId) ?? c.targetId;
    } else if (c.targetType === "graph") {
      targetId = graphIdMap.get(c.targetId) ?? c.targetId;
    }
    return {
      ...c,
      id: commentIdMap.get(c.id)!,
      projectId: newProjectId,
      targetId,
    };
  });

  // 重建灵感便签
  const newInspirations: Inspiration[] = inspirations.map((i) => ({
    ...i,
    id: inspirationIdMap.get(i.id)!,
    projectId: newProjectId,
  }));

  // 重建核心循环（steps 内 step.id 重新生成）
  const newCoreLoops: CoreLoop[] = coreLoops.map((cl) => ({
    ...cl,
    id: loopIdMap.get(cl.id)!,
    projectId: newProjectId,
    steps: cl.steps.map((s) => ({ ...s, id: generateId("step") })),
  }));

  // 重建高光时刻
  const newGameMoments: GameMoment[] = gameMoments.map((gm) => ({
    ...gm,
    id: momentIdMap.get(gm.id)!,
    projectId: newProjectId,
  }));

  // 重建规则卡牌
  const newGameRules: GameRule[] = gameRules.map((gr) => ({
    ...gr,
    id: ruleIdMap.get(gr.id)!,
    projectId: newProjectId,
  }));

  // 重建交互矩阵
  const newInteractionMatrices: InteractionMatrix[] = interactionMatrices.map(
    (im) => ({
      ...im,
      id: matrixIdMap.get(im.id)!,
      projectId: newProjectId,
    })
  );

  // 重建关卡流程（节点/边 ID 重新生成；边的 source/target 经 levelNodeIdMap 重映射，悬挂边丢弃）
  const newLevelFlows: LevelFlow[] = levelFlows.map((lf) => {
    const levelNodeIdMap = new Map<string, string>();
    const newNodes = lf.nodes.map((n) => {
      const newId = generateId("lnode");
      levelNodeIdMap.set(n.id, newId);
      return { ...n, id: newId };
    });
    const newEdges = lf.edges
      .filter(
        (e) => levelNodeIdMap.has(e.source) && levelNodeIdMap.has(e.target)
      )
      .map((e) => ({
        ...e,
        id: generateId("ledge"),
        source: levelNodeIdMap.get(e.source)!,
        target: levelNodeIdMap.get(e.target)!,
      }));
    return {
      ...lf,
      id: levelFlowIdMap.get(lf.id)!,
      projectId: newProjectId,
      nodes: newNodes,
      edges: newEdges,
    };
  });

  // 重建 AI 对话
  const newAIConversations: AIConversation[] = aiConversations.map((ac) => ({
    ...ac,
    id: convIdMap.get(ac.id)!,
    projectId: newProjectId,
  }));

  // 重建 AI 对话消息（conversationId 重映射）
  const newAIMessages: AIChatMessage[] = aiMessages.map((am) => ({
    ...am,
    id: aiMsgIdMap.get(am.id)!,
    conversationId: convIdMap.get(am.conversationId)!,
  }));

  // 汇报被丢弃的悬挂引用数量
  if (skippedEdges > 0 || skippedFormulas > 0) {
    console.warn(
      `导入跳过：${skippedEdges} 条边、${skippedFormulas} 条公式（存在悬挂引用）`
    );
  }

  // 在一个事务里写入所有数据，保证原子性
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
      db.nodeGroups,
      db.comments,
      db.inspirations,
      db.coreLoops,
      db.gameMoments,
      db.gameRules,
      db.interactionMatrices,
      db.levelFlows,
      db.aiConversations,
      db.aiMessages,
    ],
    async () => {
      await db.projects.add(newProject);
      if (newGraphs.length) await db.mechanismGraphs.bulkAdd(newGraphs);
      if (newNodes.length) await db.graphNodes.bulkAdd(newNodes);
      if (newEdges.length) await db.graphEdges.bulkAdd(newEdges);
      if (newSheets.length) await db.numericSheets.bulkAdd(newSheets);
      if (newAttributes.length) await db.attributes.bulkAdd(newAttributes);
      if (newFormulas.length) await db.formulas.bulkAdd(newFormulas);
      if (newDocuments.length) await db.gddDocuments.bulkAdd(newDocuments);
      if (newSections.length) await db.docSections.bulkAdd(newSections);
      if (newNodeGroups.length) await db.nodeGroups.bulkAdd(newNodeGroups);
      if (newComments.length) await db.comments.bulkAdd(newComments);
      if (newInspirations.length) await db.inspirations.bulkAdd(newInspirations);
      if (newCoreLoops.length) await db.coreLoops.bulkAdd(newCoreLoops);
      if (newGameMoments.length) await db.gameMoments.bulkAdd(newGameMoments);
      if (newGameRules.length) await db.gameRules.bulkAdd(newGameRules);
      if (newInteractionMatrices.length)
        await db.interactionMatrices.bulkAdd(newInteractionMatrices);
      if (newLevelFlows.length) await db.levelFlows.bulkAdd(newLevelFlows);
      if (newAIConversations.length)
        await db.aiConversations.bulkAdd(newAIConversations);
      if (newAIMessages.length) await db.aiMessages.bulkAdd(newAIMessages);
    }
  );

  return newProjectId;
}

/**
 * 根据嵌入类型重映射 embedRefId。
 * mechanism 类型指向机制图，numeric 类型指向数值表。
 */
function remapEmbedRefId(
  embedType: EmbedType,
  oldRefId: string,
  graphIdMap: Map<string, string>,
  sheetIdMap: Map<string, string>
): string | undefined {
  if (embedType === "mechanism") {
    return graphIdMap.get(oldRefId);
  }
  if (embedType === "numeric") {
    return sheetIdMap.get(oldRefId);
  }
  return undefined;
}

/**
 * 格式化时间戳为文件名友好的形式：yyyyMMdd-HHmmss
 */
function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/**
 * 给导入的项目名追加"副本"后缀，避免与原项目重名混淆。
 */
function appendCopySuffix(name: string): string {
  const base = (name || "未命名项目").trim();
  return `${base}（副本）`;
}
