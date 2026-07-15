import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "react-router-dom";
import type { Connection } from "@xyflow/react";

import { useGameplayStore } from "@/stores/gameplayStore";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useRuleStore } from "@/stores/ruleStore";
import { useLevelStore } from "@/stores/levelStore";
import { useNumericStore } from "@/stores/numericStore";
import { useUIStore } from "@/stores/uiStore";

import ReactFlowCanvas from "@/features/canvas/ReactFlowCanvas";
import type { CanvasConnection } from "@/features/canvas/useFlowState";
import { useNodeGeneration } from "@/features/canvas/useNodeGeneration";
import type { ElementStatus } from "@/features/canvas/ElementNode";
import type { SuggestedEdge } from "@/services/aiService";

import type {
  CanvasElement,
  CanvasElementType,
  CoreLoop,
  LoopStep,
  GameMoment,
  GraphNode,
  GameRule,
  LevelNode,
  Attribute,
  EdgeType,
  NodeType,
} from "@/types";

// ===== 元素状态计算（对齐 libtv 状态系统） =====

/** 计算元素的运行时状态：pending/generating/generated */
function getElementStatus(
  element: CanvasElement,
  generatingKeys: Set<string>
): ElementStatus {
  // 正在生成中
  if (generatingKeys.has(element.key)) return "generating";
  // 根据元素类型判断是否有内容
  switch (element.type) {
    case "core-loop":
      return element.data.description ? "generated" : "pending";
    case "loop-step":
      return element.data.playerAction ? "generated" : "pending";
    case "moment":
      return element.data.description ? "generated" : "pending";
    case "node": {
      const desc = element.data.data?.description as string | undefined;
      return desc ? "generated" : "pending";
    }
    case "rule":
      return element.data.condition ? "generated" : "pending";
    case "level-node":
      return element.data.description ? "generated" : "pending";
    case "attribute":
      return element.data.value ? "generated" : "pending";
  }
}

// ===== 元素收集：收集 7 个玩法维度 =====

function collectAllElements(
  loops: ReturnType<typeof useGameplayStore.getState>["loops"],
  moments: ReturnType<typeof useGameplayStore.getState>["moments"],
  nodes: ReturnType<typeof useMechanismStore.getState>["nodes"],
  graphs: ReturnType<typeof useMechanismStore.getState>["graphs"],
  rules: ReturnType<typeof useRuleStore.getState>["rules"],
  flows: ReturnType<typeof useLevelStore.getState>["flows"],
  attributes: ReturnType<typeof useNumericStore.getState>["attributes"],
  formulas: ReturnType<typeof useNumericStore.getState>["formulas"]
): CanvasElement[] {
  const elements: CanvasElement[] = [];

  // core-loop：每个 CoreLoop 作为一个顶层节点
  for (const loop of loops) {
    elements.push({
      key: `core-loop-${loop.id}`,
      type: "core-loop",
      data: loop,
    });
  }

  // loop-step：每个循环的步骤
  for (const loop of loops) {
    for (const step of loop.steps) {
      elements.push({
        key: `loop-step-${step.id}`,
        type: "loop-step",
        data: step,
        loopId: loop.id,
        loopName: loop.name,
      });
    }
  }

  for (const m of moments) {
    elements.push({ key: `moment-${m.id}`, type: "moment", data: m });
  }

  for (const n of nodes) {
    const graph = graphs.find((g) => g.id === n.graphId);
    elements.push({
      key: `node-${n.id}`,
      type: "node",
      data: n,
      graphName: graph?.name ?? "未命名图",
    });
  }

  for (const r of rules) {
    elements.push({ key: `rule-${r.id}`, type: "rule", data: r });
  }

  for (const flow of flows) {
    for (const ln of flow.nodes) {
      elements.push({
        key: `level-node-${ln.id}`,
        type: "level-node",
        data: ln,
        flowId: flow.id,
        flowName: flow.name,
      });
    }
  }

  const formulaMap = new Map(formulas.map((f) => [f.attributeId, f]));
  for (const a of attributes) {
    elements.push({
      key: `attribute-${a.id}`,
      type: "attribute",
      data: a,
      formula: formulaMap.get(a.id),
    });
  }

  return elements;
}

// ===== 连线检测：只保留基于 ID 的可信连线 =====

function detectConnections(
  elements: CanvasElement[],
  edges: ReturnType<typeof useMechanismStore.getState>["edges"],
  flows: ReturnType<typeof useLevelStore.getState>["flows"],
  loops: ReturnType<typeof useGameplayStore.getState>["loops"]
): CanvasConnection[] {
  const connections: CanvasConnection[] = [];
  const keySet = new Set(elements.map((e) => e.key));

  // core-loop → loop-step 连线（组合关系）
  for (const loop of loops) {
    for (const step of loop.steps) {
      const fromKey = `core-loop-${loop.id}`;
      const toKey = `loop-step-${step.id}`;
      if (keySet.has(fromKey) && keySet.has(toKey)) {
        connections.push({
          fromBlock: fromKey,
          toBlock: toKey,
          label: "包含",
          edgeType: "compose" as EdgeType,
        });
      }
    }
  }

  // 机制图语义边：透传 type/strength/direction，由 EDGE_TYPE_META 驱动颜色/线型/箭头
  for (const edge of edges) {
    const fromKey = `node-${edge.source}`;
    const toKey = `node-${edge.target}`;
    if (keySet.has(fromKey) && keySet.has(toKey)) {
      connections.push({
        fromBlock: fromKey,
        toBlock: toKey,
        label: edge.label,
        edgeType: edge.type,
        strength: edge.strength,
        direction: edge.direction,
      });
    }
  }

  // 关卡流边：透传 LevelEdgeType，驱动 normal/secret/locked/branch 配色
  for (const flow of flows) {
    for (const edge of flow.edges) {
      const fromKey = `level-node-${edge.source}`;
      const toKey = `level-node-${edge.target}`;
      if (keySet.has(fromKey) && keySet.has(toKey)) {
        connections.push({
          fromBlock: fromKey,
          toBlock: toKey,
          label: edge.label,
          levelEdgeType: edge.type,
        });
      }
    }
  }

  // 节点 → 属性引用（reference：虚线弱连接）
  for (const el of elements) {
    if (el.type === "node" && el.data.refAttributeId) {
      const attrKey = `attribute-${el.data.refAttributeId}`;
      if (keySet.has(attrKey)) {
        connections.push({
          fromBlock: el.key,
          toBlock: attrKey,
          edgeType: "reference" as EdgeType,
        });
      }
    }
  }

  // loop-step 顺序流 + 循环回路（固定色，不归属语义边类型）
  for (const loop of loops) {
    const steps = [...loop.steps].sort((a, b) => a.order - b.order);
    for (let i = 0; i < steps.length - 1; i++) {
      connections.push({
        fromBlock: `loop-step-${steps[i].id}`,
        toBlock: `loop-step-${steps[i + 1].id}`,
        label: "→",
        color: "rgba(163,230,53,0.3)",
      });
    }
    if (steps.length > 1) {
      connections.push({
        fromBlock: `loop-step-${steps[steps.length - 1].id}`,
        toBlock: `loop-step-${steps[0].id}`,
        label: "循环",
        color: "rgba(163,230,53,0.2)",
      });
    }
  }

  return connections;
}

// ===== 主组件 =====

export default function UnifiedWorkspace() {
  const { projectId } = useParams<{ projectId: string }>();

  const setSelectedCanvasElement = useUIStore((s) => s.setSelectedCanvasElement);
  const selectedElementKey = useUIStore((s) => s.selectedCanvasElement?.key ?? null);
  const addToast = useUIStore((s) => s.addToast);

  // 自动选中首个图/表
  const graphs = useMechanismStore((s) => s.graphs);
  const currentGraphId = useMechanismStore((s) => s.currentGraphId);
  const selectGraph = useMechanismStore((s) => s.selectGraph);
  const sheets = useNumericStore((s) => s.sheets);
  const currentSheetId = useNumericStore((s) => s.currentSheetId);
  const selectSheet = useNumericStore((s) => s.selectSheet);

  useEffect(() => {
    if (graphs.length > 0 && !currentGraphId) void selectGraph(graphs[0].id);
  }, [graphs, currentGraphId, selectGraph]);

  useEffect(() => {
    if (sheets.length > 0 && !currentSheetId) void selectSheet(sheets[0].id);
  }, [sheets, currentSheetId, selectSheet]);

  // 读取所有数据
  const loops = useGameplayStore((s) => s.loops);
  const moments = useGameplayStore((s) => s.moments);
  const nodes = useMechanismStore((s) => s.nodes);
  const edges = useMechanismStore((s) => s.edges);
  const rules = useRuleStore((s) => s.rules);
  const flows = useLevelStore((s) => s.flows);
  const attributes = useNumericStore((s) => s.attributes);
  const formulas = useNumericStore((s) => s.formulas);

  const elements = useMemo(
    () => collectAllElements(loops, moments, nodes, graphs, rules, flows, attributes, formulas),
    [loops, moments, nodes, graphs, rules, flows, attributes, formulas]
  );

  const connections = useMemo(
    () => detectConnections(elements, edges, flows, loops),
    [elements, edges, flows, loops]
  );

  // 选中元素时同步各 store
  const selectLoop = useGameplayStore((s) => s.selectLoop);
  const setSelectedStep = useGameplayStore((s) => s.setSelectedStep);
  const setSelectedMoment = useGameplayStore((s) => s.setSelectedMoment);
  const setSelectedNode = useMechanismStore((s) => s.setSelectedNode);
  const selectFlow = useLevelStore((s) => s.selectFlow);
  const setSelectedLevelNode = useLevelStore((s) => s.setSelectedNode);
  const setSelectedAttribute = useNumericStore((s) => s.setSelectedAttribute);

  const handleSelectElement = useCallback(
    (el: CanvasElement | null) => {
      if (!el) {
        setSelectedCanvasElement(null);
        return;
      }
      setSelectedCanvasElement(el);
      switch (el.type) {
        case "core-loop":
          selectLoop(el.data.id);
          break;
        case "loop-step":
          selectLoop(el.loopId);
          setSelectedStep(el.data.id);
          break;
        case "moment":
          setSelectedMoment(el.data.id);
          break;
        case "node":
          setSelectedNode(el.data.id);
          break;
        case "level-node":
          selectFlow(el.flowId);
          setSelectedLevelNode(el.data.id);
          break;
        case "attribute":
          setSelectedAttribute(el.data.id);
          break;
        case "rule":
          break;
      }
    },
    [
      setSelectedCanvasElement,
      selectLoop,
      setSelectedStep,
      setSelectedMoment,
      setSelectedNode,
      selectFlow,
      setSelectedLevelNode,
      setSelectedAttribute,
    ]
  );

  // ===== 全局搜索点击定位：读取 router state 聚焦到对应画布元素 =====
  const location = useLocation();
  useEffect(() => {
    const state = location.state as { focusId?: string; focusKind?: string } | null;
    if (!state?.focusId) return;
    const { focusId, focusKind } = state;

    // 容器型：切换到对应机制图 / 数值表
    if (focusKind === "graph") {
      void selectGraph(focusId);
      return;
    }
    if (focusKind === "sheet") {
      void selectSheet(focusId);
      return;
    }

    // 画布元素型：在 elements 中查找并选中（elements 异步加载完成后会再次触发）
    const key = `${focusKind}-${focusId}`;
    const el = elements.find((e) => e.key === key);
    if (el) handleSelectElement(el);
  }, [location.state, elements, selectGraph, selectSheet, handleSelectElement]);

  // ===== 手动连线回调 =====
  const mechanismAddEdge = useMechanismStore((s) => s.addEdge);
  const levelAddEdge = useLevelStore((s) => s.addEdge);

  const handleConnect = useCallback(
    (_connection: Connection, sourceElement: CanvasElement, targetElement: CanvasElement) => {
      // 机制节点 ↔ 机制节点 → 写入 mechanismStore
      if (sourceElement.type === "node" && targetElement.type === "node") {
        void mechanismAddEdge({
          source: sourceElement.data.id,
          target: targetElement.data.id,
          type: "reference",
          label: "",
        });
        addToast({ title: "已连接机制节点", variant: "success" });
        return;
      }

      // 关卡节点 ↔ 关卡节点 → 写入 levelStore
      if (sourceElement.type === "level-node" && targetElement.type === "level-node") {
        void levelAddEdge(sourceElement.flowId, {
          source: sourceElement.data.id,
          target: targetElement.data.id,
          type: "normal",
          label: "",
        });
        addToast({ title: "已连接关卡节点", variant: "success" });
        return;
      }

      // 其他跨类型连线由 useFlowState 自动存为 customLink
      addToast({ title: "已建立关联", variant: "success" });
    },
    [mechanismAddEdge, levelAddEdge, addToast]
  );

  // ===== 创建元素（拖拽到指定位置 或 点击在视口中心）=====
  const createLoop = useGameplayStore((s) => s.createLoop);
  const addStep = useGameplayStore((s) => s.addStep);
  const createMoment = useGameplayStore((s) => s.createMoment);
  const createGraph = useMechanismStore((s) => s.createGraph);
  const addNode = useMechanismStore((s) => s.addNode);
  const createRule = useRuleStore((s) => s.createRule);
  const createFlow = useLevelStore((s) => s.createFlow);
  const addLevelNode = useLevelStore((s) => s.addNode);
  const createSheet = useNumericStore((s) => s.createSheet);
  const addAttribute = useNumericStore((s) => s.addAttribute);

  // 待分配位置：创建元素时设置，新元素出现时被 useFlowState 消费
  const [pendingPosition, setPendingPosition] = useState<{ x: number; y: number } | null>(null);

  // ===== 生成式工作流：委托 aiService 生成节点内容 =====
  const { generatingKeys, generate } = useNodeGeneration();

  // 各 store 的 update 方法，用于生成完成后写入
  const updateLoop = useGameplayStore((s) => s.updateLoop);
  const updateStep = useGameplayStore((s) => s.updateStep);
  const updateMoment = useGameplayStore((s) => s.updateMoment);
  const updateMechanismNode = useMechanismStore((s) => s.updateNode);
  const updateRule = useRuleStore((s) => s.updateRule);
  const updateLevelNode = useLevelStore((s) => s.updateNode);
  const updateAttribute = useNumericStore((s) => s.updateAttribute);

  const handleGenerate = useCallback(
    async (element: CanvasElement, prompt: string) => {
      try {
        // "node" 类型传入画布已有节点，支持 AI 生成连接线
        const context =
          element.type === "node"
            ? {
                existingNodes: nodes
                  .filter((n) => n.id !== element.data.id)
                  .map((n) => ({ id: n.id, label: n.label, type: n.type })),
              }
            : undefined;
        const result = await generate(element, prompt, context);
        const patch = result.patch;
        // 根据元素类型构造类型安全的 patch 并写入对应 store
        switch (element.type) {
          case "core-loop": {
            // core-loop 的 patch 只包含 name/description/loopType，不包含 steps
            //（steps 是 LoopStep[]，需要完整对象，由专门的 loop-step 节点管理）
            const loopPatch: Partial<CoreLoop> = {};
            if (typeof patch.name === "string") loopPatch.name = patch.name;
            if (typeof patch.description === "string") loopPatch.description = patch.description;
            if (
              patch.loopType === "core" ||
              patch.loopType === "secondary" ||
              patch.loopType === "meta"
            ) {
              loopPatch.loopType = patch.loopType;
            }
            await updateLoop(element.data.id, loopPatch);
            break;
          }
          case "loop-step": {
            const stepPatch: Partial<LoopStep> = {};
            if (typeof patch.label === "string") stepPatch.label = patch.label;
            if (typeof patch.playerAction === "string") stepPatch.playerAction = patch.playerAction;
            if (typeof patch.emotion === "string") stepPatch.emotion = patch.emotion;
            await updateStep(element.loopId, element.data.id, stepPatch);
            break;
          }
          case "moment": {
            const momentPatch: Partial<GameMoment> = {};
            if (typeof patch.title === "string") momentPatch.title = patch.title;
            if (typeof patch.description === "string") momentPatch.description = patch.description;
            if (typeof patch.emotion === "number") momentPatch.emotion = patch.emotion;
            if (typeof patch.emotionLabel === "string") momentPatch.emotionLabel = patch.emotionLabel;
            await updateMoment(element.data.id, momentPatch);
            break;
          }
          case "node": {
            // GraphNode.data 是 Record<string, unknown>，需要合并到现有 data
            const nodePatch: Partial<GraphNode> = {};
            if (typeof patch.label === "string") nodePatch.label = patch.label;
            if (patch.data && typeof patch.data === "object") {
              nodePatch.data = {
                ...element.data.data,
                ...(patch.data as Record<string, unknown>),
              };
            }
            await updateMechanismNode(element.data.id, nodePatch);
            // 创建 AI 建议的连接线（targetLabel → 节点 id 解析，方向决定 source/target）
            const suggestedEdges = Array.isArray(patch.edges)
              ? (patch.edges as SuggestedEdge[])
              : [];
            if (suggestedEdges.length > 0) {
              // 当前画布节点 label→id 映射（含刚更新 label 后的最新值）
              const labelToId = new Map<string, string>();
              for (const n of nodes) {
                labelToId.set(n.label, n.id);
              }
              // 若 AI 更新了本节点 label，映射也需更新
              if (typeof patch.label === "string") {
                labelToId.set(patch.label, element.data.id);
                labelToId.delete(element.data.label);
              }
              let createdEdgeCount = 0;
              for (const se of suggestedEdges) {
                const targetId = labelToId.get(se.targetLabel);
                if (!targetId) {
                  console.warn(`[AI] 跳过连接：找不到目标节点「${se.targetLabel}」`);
                  continue;
                }
                const source = se.direction === "out" ? element.data.id : targetId;
                const target = se.direction === "out" ? targetId : element.data.id;
                await mechanismAddEdge({
                  source,
                  target,
                  type: se.type as EdgeType,
                  label: se.label,
                });
                createdEdgeCount++;
              }
              if (createdEdgeCount > 0) {
                addToast({
                  title: "已生成连接线",
                  description: `AI 建议并创建 ${createdEdgeCount} 条连接`,
                  variant: "success",
                });
              }
            }
            break;
          }
          case "rule": {
            const rulePatch: Partial<GameRule> = {};
            if (typeof patch.condition === "string") rulePatch.condition = patch.condition;
            if (typeof patch.action === "string") rulePatch.action = patch.action;
            await updateRule(element.data.id, rulePatch);
            break;
          }
          case "level-node": {
            const levelPatch: Partial<LevelNode> = {};
            if (typeof patch.description === "string") levelPatch.description = patch.description;
            if (typeof patch.difficulty === "number") levelPatch.difficulty = patch.difficulty;
            if (typeof patch.duration === "number") levelPatch.duration = patch.duration;
            await updateLevelNode(element.flowId, element.data.id, levelPatch);
            break;
          }
          case "attribute": {
            const attrPatch: Partial<Attribute> = {};
            if (typeof patch.value === "string") attrPatch.value = patch.value;
            if (typeof patch.description === "string") attrPatch.description = patch.description;
            await updateAttribute(element.data.id, attrPatch);
            break;
          }
        }
        addToast({ title: "生成完成", description: result.text, variant: "success" });
      } catch (e) {
        console.error("生成失败:", e);
        addToast({ title: "生成失败", variant: "error" });
      }
    },
    [
      generate, updateLoop, updateStep, updateMoment, updateMechanismNode,
      updateRule, updateLevelNode, updateAttribute, addToast,
      nodes, mechanismAddEdge,
    ]
  );

  // ===== 删除元素 =====
  const deleteLoop = useGameplayStore((s) => s.deleteLoop);
  const removeStep = useGameplayStore((s) => s.removeStep);
  const deleteMoment = useGameplayStore((s) => s.deleteMoment);
  const removeMechanismNode = useMechanismStore((s) => s.removeNode);
  const deleteRule = useRuleStore((s) => s.deleteRule);
  const removeLevelNode = useLevelStore((s) => s.removeNode);
  const removeAttribute = useNumericStore((s) => s.removeAttribute);

  const handleDeleteElement = useCallback(
    async (element: CanvasElement) => {
      try {
        switch (element.type) {
          case "core-loop":
            await deleteLoop(element.data.id);
            break;
          case "loop-step":
            await removeStep(element.loopId, element.data.id);
            break;
          case "moment":
            await deleteMoment(element.data.id);
            break;
          case "node":
            await removeMechanismNode(element.data.id);
            break;
          case "rule":
            await deleteRule(element.data.id);
            break;
          case "level-node":
            await removeLevelNode(element.flowId, element.data.id);
            break;
          case "attribute":
            await removeAttribute(element.data.id);
            break;
        }
        addToast({ title: "已删除", variant: "success" });
      } catch (e) {
        console.error("删除元素失败:", e);
        addToast({ title: "删除失败", variant: "error" });
      }
    },
    [
      deleteLoop, removeStep, deleteMoment, removeMechanismNode,
      deleteRule, removeLevelNode, removeAttribute, addToast,
    ]
  );

  const createElementAt = useCallback(
    async (type: CanvasElementType, position: { x: number; y: number }, nodeSubtype?: string) => {
      if (!projectId) return;
      // 设置 pendingPosition，useFlowState 会在新元素出现时消费它
      setPendingPosition(position);

      try {
        switch (type) {
          case "core-loop":
            await createLoop(projectId, "核心循环", "core");
            break;
          case "loop-step": {
            let loop = loops[0];
            if (!loop) loop = await createLoop(projectId, "核心循环", "core");
            await addStep(loop.id, { label: "新玩步", playerAction: "", emotion: "", color: "#A3E635" });
            break;
          }
          case "moment":
            await createMoment(projectId, "新高光时刻", "combat");
            break;
          case "node": {
            let graphId = currentGraphId;
            if (!graphId) {
              if (graphs.length > 0) {
                graphId = graphs[0].id;
                await selectGraph(graphId);
              } else {
                const g = await createGraph(projectId, "机制图", "node_graph");
                graphId = g.id;
              }
            }
            // 使用拖拽/点击指定的子类型，缺省 action
            await addNode((nodeSubtype as NodeType) || "action", position, "新节点");
            break;
          }
          case "rule":
            await createRule(projectId, "新规则", "combat");
            break;
          case "level-node": {
            let flow = flows[0];
            if (!flow) flow = await createFlow(projectId, "关卡流程");
            selectFlow(flow.id);
            await addLevelNode(flow.id, {
              label: "新关卡",
              type: "level",
              difficulty: 3,
              duration: 10,
              description: "",
              position,
              gates: [],
            });
            break;
          }
          case "attribute": {
            let sheetId = useNumericStore.getState().currentSheetId;
            if (!sheetId) {
              if (sheets.length > 0) {
                sheetId = sheets[0].id;
                await selectSheet(sheetId);
              } else {
                const s = await createSheet(projectId, "数值表");
                sheetId = s.id;
              }
            }
            await addAttribute(null, "新属性", "number");
            break;
          }
        }
        addToast({ title: "已创建", variant: "success" });
      } catch (e) {
        console.error("创建元素失败:", e);
        addToast({ title: "创建失败", variant: "error" });
      }
    },
    [
      projectId, loops, currentGraphId, graphs, flows, sheets,
      createLoop, addStep, createMoment, createGraph, addNode, selectGraph,
      createRule, createFlow, addLevelNode, selectFlow, createSheet, addAttribute, selectSheet, addToast,
    ]
  );

  // ===== 复制元素回调（对齐 libtv hover 工具栏） =====
  // 深拷贝现有元素数据，而非创建空白节点
  const handleDuplicateElement = useCallback(
    async (element: CanvasElement, position: { x: number; y: number }) => {
      if (!projectId) return;
      // 设置 pendingPosition，让新元素出现在指定位置
      setPendingPosition(position);
      try {
        switch (element.type) {
          case "core-loop": {
            const newLoop = await createLoop(
              projectId,
              `${element.data.name}（副本）`,
              element.data.loopType
            );
            // 深拷贝描述（steps 不在此复制，loop-step 是独立节点）
            await updateLoop(newLoop.id, {
              description: element.data.description,
            });
            break;
          }
          case "loop-step": {
            // 复制到所属 loop（找不到则用第一个 loop）
            const loop = loops.find((l) => l.id === element.loopId) ?? loops[0];
            if (loop) {
              await addStep(loop.id, {
                label: `${element.data.label}（副本）`,
                playerAction: element.data.playerAction,
                emotion: element.data.emotion,
                color: element.data.color,
              });
            }
            break;
          }
          case "moment": {
            const newMoment = await createMoment(
              projectId,
              `${element.data.title}（副本）`,
              element.data.type
            );
            await updateMoment(newMoment.id, {
              description: element.data.description,
              emotion: element.data.emotion,
              emotionLabel: element.data.emotionLabel,
              timing: element.data.timing,
              duration: element.data.duration,
              notes: element.data.notes,
            });
            break;
          }
          case "node": {
            // 确保有 graph
            let graphId = currentGraphId;
            if (!graphId) {
              if (graphs.length > 0) {
                graphId = graphs[0].id;
                await selectGraph(graphId);
              } else {
                const g = await createGraph(projectId, "机制图", "node_graph");
                graphId = g.id;
              }
            }
            const newId = await addNode(
              element.data.type,
              position,
              `${element.data.label}（副本）`
            );
            if (newId) {
              // 深拷贝节点数据（不复制 refAttributeId，避免引用冲突）
              await updateMechanismNode(newId, {
                data: structuredClone(element.data.data),
              });
            }
            break;
          }
          case "rule": {
            const newRule = await createRule(
              projectId,
              `${element.data.title}（副本）`,
              element.data.category
            );
            await updateRule(newRule.id, {
              condition: element.data.condition,
              action: element.data.action,
              priority: element.data.priority,
              enabled: element.data.enabled,
              notes: element.data.notes,
            });
            break;
          }
          case "level-node": {
            // 确保有 flow
            let flow = flows[0];
            if (!flow) flow = await createFlow(projectId, "关卡流程");
            selectFlow(flow.id);
            await addLevelNode(flow.id, {
              label: `${element.data.label}（副本）`,
              type: element.data.type,
              difficulty: element.data.difficulty,
              duration: element.data.duration,
              description: element.data.description,
              position,
              gates: structuredClone(element.data.gates),
            });
            break;
          }
          case "attribute": {
            // 确保有 sheet
            let sheetId = useNumericStore.getState().currentSheetId;
            if (!sheetId) {
              if (sheets.length > 0) {
                sheetId = sheets[0].id;
                await selectSheet(sheetId);
              } else {
                const s = await createSheet(projectId, "数值表");
                sheetId = s.id;
              }
            }
            const newAttr = await addAttribute(
              element.data.parentId,
              `${element.data.name}（副本）`,
              element.data.type
            );
            await updateAttribute(newAttr.id, {
              value: element.data.value,
              unit: element.data.unit,
              description: element.data.description,
            });
            break;
          }
        }
        addToast({ title: "已复制", variant: "success" });
      } catch (e) {
        console.error("复制元素失败:", e);
        addToast({ title: "复制失败", variant: "error" });
      }
    },
    [
      projectId, loops, currentGraphId, graphs, flows, sheets,
      createLoop, addStep, createMoment, createGraph, addNode, selectGraph,
      createRule, createFlow, addLevelNode, selectFlow, createSheet, addAttribute, selectSheet,
      updateLoop, updateMoment, updateMechanismNode, updateRule, updateAttribute,
      addToast, setPendingPosition,
    ]
  );

  // ===== 计算每个元素的运行时状态和编号 =====
  const elementStatusMap = useMemo(() => {
    const map = new Map<string, ElementStatus>();
    for (const el of elements) {
      map.set(el.key, getElementStatus(el, generatingKeys));
    }
    return map;
  }, [elements, generatingKeys]);

  // 节点编号：按类型分别从 1 开始编号
  const elementIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    const counters = new Map<CanvasElementType, number>();
    for (const el of elements) {
      const count = counters.get(el.type) ?? 0;
      map.set(el.key, count + 1);
      counters.set(el.type, count + 1);
    }
    return map;
  }, [elements]);

  return (
    <ReactFlowCanvas
      projectId={projectId ?? "default"}
      elements={elements}
      connections={connections}
      selectedElementKey={selectedElementKey}
      onSelectElement={handleSelectElement}
      onConnectElements={handleConnect}
      onCreateElementAt={createElementAt}
      onDeleteElement={handleDeleteElement}
      onDuplicateElement={handleDuplicateElement}
      pendingPosition={pendingPosition}
      onPendingPositionConsumed={() => setPendingPosition(null)}
      onGenerateElement={handleGenerate}
      generatingKeys={generatingKeys}
      elementStatusMap={elementStatusMap}
      elementIndexMap={elementIndexMap}
    />
  );
}
