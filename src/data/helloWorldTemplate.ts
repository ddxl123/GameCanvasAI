import { db } from "@/db";
import { generateId, generateNodeId, generateEdgeId } from "@/lib/id";
import { now } from "@/lib/time";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import { useHistoryStore } from "@/stores/historyStore";

/**
 * Hello World 极简模板 —— 新手入门项目。
 *
 * 用最少元素演示平台四大模块（机制图 / 数值表 / 公式 / GDD 文档）的协作：
 * - 1 张机制图：开始游戏 → 击杀怪物 → 获得分数
 * - 1 张数值表：分数 / 击杀数 + 1 条公式
 * - 1 篇 GDD 文档：标题 + 简介
 *
 * 节点位置遵循从左到右的流向，便于新手直观理解。
 */
export async function createHelloWorldProject(): Promise<string> {
  const addToast = useUIStore.getState().addToast;
  try {
    // 1. 创建项目（template 用 blank，避免触发 applyTemplate 的预置内容）
    const project = await useProjectStore
      .getState()
      .createProject("我的第一个游戏", "Hello World 极简入门项目", "blank");

    const ts = now();

    // 2-5. 在一个事务里写入全部实体：机制图/节点/边 + 数值表/属性/公式 + 文档/段落
    await db.transaction(
      "rw",
      [
        db.mechanismGraphs,
        db.graphNodes,
        db.graphEdges,
        db.numericSheets,
        db.attributes,
        db.formulas,
        db.gddDocuments,
        db.docSections,
      ],
      async () => {
        // 2. 创建机制图「基础玩法」
        const graphId = generateId("graph");
        await db.mechanismGraphs.add({
          id: graphId,
          projectId: project.id,
          name: "基础玩法",
          type: "node_graph",
          createdAt: ts,
          updatedAt: ts,
        });

        // 3. 创建 3 个节点：event(开始游戏) → action(击杀怪物) → reward(获得分数)
        const eventNodeId = generateNodeId();
        const actionNodeId = generateNodeId();
        const rewardNodeId = generateNodeId();

        await db.graphNodes.add({
          id: eventNodeId,
          graphId,
          type: "event",
          label: "开始游戏",
          data: {},
          position: { x: 250, y: 150 },
        });
        await db.graphNodes.add({
          id: actionNodeId,
          graphId,
          type: "action",
          label: "击杀怪物",
          data: {},
          position: { x: 450, y: 150 },
        });
        await db.graphNodes.add({
          id: rewardNodeId,
          graphId,
          type: "reward",
          label: "获得分数",
          data: {},
          position: { x: 650, y: 150 },
        });

        // 4. 创建 2 条边：event→action (emit), action→reward (produce)
        await db.graphEdges.add({
          id: generateEdgeId(),
          graphId,
          source: eventNodeId,
          target: actionNodeId,
          type: "emit",
        });
        await db.graphEdges.add({
          id: generateEdgeId(),
          graphId,
          source: actionNodeId,
          target: rewardNodeId,
          type: "produce",
        });

        // 5. 创建数值表「基础数值」
        const sheetId = generateId("sheet");
        await db.numericSheets.add({
          id: sheetId,
          projectId: project.id,
          name: "基础数值",
          createdAt: ts,
          updatedAt: ts,
        });

        // 6. 创建 2 个属性：分数(0) / 击杀数(0)
        const scoreAttrId = generateId("attr");
        const killAttrId = generateId("attr");
        await db.attributes.add({
          id: scoreAttrId,
          sheetId,
          name: "分数",
          type: "number",
          value: "0",
          parentId: null,
          order: 0,
        });
        await db.attributes.add({
          id: killAttrId,
          sheetId,
          name: "击杀数",
          type: "number",
          value: "0",
          parentId: null,
          order: 1,
        });

        // 7. 创建 1 条公式：分数 = 击杀数 * 10
        await db.formulas.add({
          id: generateId("formula"),
          sheetId,
          attributeId: scoreAttrId,
          expression: "@击杀数 * 10",
          description: "每击杀 1 个怪物获得 10 分",
        });

        // 8. 创建 GDD 文档「设计文档」
        const docId = generateId("doc");
        await db.gddDocuments.add({
          id: docId,
          projectId: project.id,
          name: "设计文档",
          createdAt: ts,
          updatedAt: ts,
        });

        // 9. 创建 2 个段落：heading / paragraph
        await db.docSections.add({
          id: generateId("sec"),
          docId,
          title: "我的第一个游戏",
          content: "",
          type: "heading",
          order: 0,
        });
        await db.docSections.add({
          id: generateId("sec"),
          docId,
          title: "",
          content: "玩家击杀怪物获得分数，简单好玩",
          type: "paragraph",
          order: 1,
        });
      }
    );

    // 模板生成是一次性批量操作，不应被逐条撤销
    useHistoryStore.getState().clear();

    addToast({
      title: "Hello World 项目已创建",
      description: project.name,
      variant: "success",
    });

    return project.id;
  } catch (e) {
    addToast({
      title: "创建 Hello World 项目失败",
      description: e instanceof Error ? e.message : "未知错误",
      variant: "error",
    });
    throw e;
  }
}
