import { db } from "@/db";
import type { GraphNode, DocSection, Formula } from "@/types";

/**
 * 跨模块反向溯源工具库
 *
 * 用于从「被引用对象」反向查找「引用方」：
 * - 数值属性 -> 引用它的机制节点 / 公式
 * - 机制图 -> 嵌入它的 GDD 段落
 * - 数值表 -> 嵌入它的 GDD 段落
 *
 * Dexie 的 where 只能查索引字段，而 refAttributeId / embedRefId 未建索引，
 * 因此这里统一使用 table.toArray() 全表扫描后 filter。
 * 为了性能，部分接口接受 projectId 参数，先通过索引缩小扫描范围再过滤。
 */

export interface ProjectReferences {
  // 属性 -> 引用它的节点
  attributeToNodes: Map<string, GraphNode[]>;
  // 图 -> 嵌入它的文档段落
  graphToDocs: Map<string, DocSection[]>;
  // 数值表 -> 嵌入它的文档段落
  sheetToDocs: Map<string, DocSection[]>;
}

/**
 * 查询所有引用了指定数值属性的机制节点。
 * refAttributeId 未建索引，需全表扫描 graphNodes 后过滤。
 */
export async function findNodesByAttributeId(
  attributeId: string
): Promise<GraphNode[]> {
  const all = await db.graphNodes.toArray();
  return all.filter((n) => n.refAttributeId === attributeId);
}

/**
 * 查询所有嵌入了指定机制图的 GDD 段落。
 * embedRefId 未建索引，需全表扫描 docSections 后过滤。
 */
export async function findDocsByGraphId(
  graphId: string
): Promise<DocSection[]> {
  const all = await db.docSections.toArray();
  return all.filter(
    (s) => s.embedType === "mechanism" && s.embedRefId === graphId
  );
}

/**
 * 查询所有嵌入了指定数值表的 GDD 段落。
 * embedRefId 未建索引，需全表扫描 docSections 后过滤。
 */
export async function findDocsBySheetId(
  sheetId: string
): Promise<DocSection[]> {
  const all = await db.docSections.toArray();
  return all.filter(
    (s) => s.embedType === "numeric" && s.embedRefId === sheetId
  );
}

/**
 * 综合查询某个属性被引用的情况：
 * - 被哪些机制节点引用（node.refAttributeId）
 * - 被哪些公式引用（formula.attributeId，已建索引可直接 where 查询）
 */
export async function findAttributeUsageAcrossProject(
  attributeId: string
): Promise<{ nodes: GraphNode[]; formulas: Formula[] }> {
  const nodes = await findNodesByAttributeId(attributeId);
  // formulas 表已对 attributeId 建索引，可直接 where 查询
  const formulas = await db.formulas
    .where("attributeId")
    .equals(attributeId)
    .toArray();
  return { nodes, formulas };
}

/**
 * 构建项目的完整引用关系图。
 *
 * 为减少全表扫描开销，先通过 projectId 索引拉取项目的全部图 / 文档，
 * 再基于 graphId / docId 索引拉取对应的节点 / 段落，
 * 最后在内存中聚合出三类反向映射。
 */
export async function buildReferenceGraph(
  projectId: string
): Promise<ProjectReferences> {
  // 拉取项目下所有机制图，再按 graphId 索引取节点
  const graphs = await db.mechanismGraphs
    .where("projectId")
    .equals(projectId)
    .toArray();
  const graphIds = graphs.map((g) => g.id);
  const nodes = graphIds.length
    ? await db.graphNodes.where("graphId").anyOf(graphIds).toArray()
    : [];

  // 拉取项目下所有文档，再按 docId 索引取段落
  const documents = await db.gddDocuments
    .where("projectId")
    .equals(projectId)
    .toArray();
  const docIds = documents.map((d) => d.id);
  const sections = docIds.length
    ? await db.docSections.where("docId").anyOf(docIds).toArray()
    : [];

  // 拉取项目下所有数值表（用于区分 embedRefId 落在 numeric 还是 mechanism）
  const sheets = await db.numericSheets
    .where("projectId")
    .equals(projectId)
    .toArray();
  const sheetIdSet = new Set(sheets.map((s) => s.id));
  const graphIdSet = new Set(graphIds);

  // 属性 -> 引用它的节点
  const attributeToNodes = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    if (!node.refAttributeId) continue;
    const list = attributeToNodes.get(node.refAttributeId);
    if (list) {
      list.push(node);
    } else {
      attributeToNodes.set(node.refAttributeId, [node]);
    }
  }

  // 图 -> 嵌入它的文档段落；数值表 -> 嵌入它的文档段落
  const graphToDocs = new Map<string, DocSection[]>();
  const sheetToDocs = new Map<string, DocSection[]>();
  for (const section of sections) {
    if (!section.embedType || !section.embedRefId) continue;
    if (section.embedType === "mechanism" && graphIdSet.has(section.embedRefId)) {
      const list = graphToDocs.get(section.embedRefId);
      if (list) {
        list.push(section);
      } else {
        graphToDocs.set(section.embedRefId, [section]);
      }
    } else if (
      section.embedType === "numeric" &&
      sheetIdSet.has(section.embedRefId)
    ) {
      const list = sheetToDocs.get(section.embedRefId);
      if (list) {
        list.push(section);
      } else {
        sheetToDocs.set(section.embedRefId, [section]);
      }
    }
  }

  return { attributeToNodes, graphToDocs, sheetToDocs };
}
