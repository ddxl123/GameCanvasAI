import type { GraphNode, GraphEdge, NodeType, EdgeType } from "@/types";

/**
 * 机制图运行模拟引擎
 *
 * 设计理念：把机制图当作离散事件状态机
 * - 每个 tick 沿边传播激活信号
 * - event 节点是起始触发点
 * - resource/pool 节点累积数值
 * - reward/penalty 影响资源
 * - feedback 节点形成闭环，让信号循环
 * - condition 节点根据条件决定信号走向
 *
 * 这是"玩法验证"工具：让设计师看到几轮循环后，资源如何累积、
 * 反馈回路如何作用、是否会出现资源爆炸或枯竭。
 */

// 运行时节点状态
export interface RuntimeNodeState {
  nodeId: string;
  activated: boolean; // 本 tick 是否被激活
  activationCount: number; // 累计激活次数
  value?: number; // resource/pool/level 的当前值
  history: number[]; // 值的历史（用于图表）
}

// 运行时模拟状态
export interface SimulationState {
  tick: number;
  nodes: Map<string, RuntimeNodeState>;
  // 本 tick 激活的边（用于视觉高亮）
  activeEdges: Set<string>;
  // 事件日志（最近 N 条）
  logs: SimulationLog[];
  // 是否结束（无更多激活）
  ended: boolean;
}

export interface SimulationLog {
  tick: number;
  nodeId: string;
  nodeLabel: string;
  nodeType: NodeType;
  action: string; // 描述：激活/产出/消耗/转换
  value?: number;
}

export interface SimulationConfig {
  maxTicks: number; // 最多跑多少 tick（防止死循环）
  initialResource?: number; // resource 初始值
  initialPool?: number; // pool 初始值
}

const DEFAULT_CONFIG: SimulationConfig = {
  maxTicks: 30,
  initialResource: 0,
  initialPool: 100,
};

/**
 * 初始化模拟状态
 */
export function initSimulation(
  nodes: GraphNode[],
  _edges: GraphEdge[],
  config: Partial<SimulationConfig> = {}
): SimulationState {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const nodeStates = new Map<string, RuntimeNodeState>();

  for (const node of nodes) {
    const state: RuntimeNodeState = {
      nodeId: node.id,
      activated: false,
      activationCount: 0,
      history: [],
    };
    // 资源类节点初始化值
    if (node.type === "resource" || node.type === "pool") {
      state.value = node.type === "pool" ? cfg.initialPool : cfg.initialResource;
    }
    if (node.type === "level") {
      state.value = 1;
    }
    nodeStates.set(node.id, state);
  }

  // 第一 tick：激活所有 event 节点（起始触发）
  const logs: SimulationLog[] = [];
  for (const node of nodes) {
    if (node.type === "event") {
      const state = nodeStates.get(node.id)!;
      state.activated = true;
      state.activationCount = 1;
      logs.push({
        tick: 0,
        nodeId: node.id,
        nodeLabel: node.label || node.type,
        nodeType: node.type,
        action: "触发",
      });
    }
  }

  return {
    tick: 0,
    nodes: nodeStates,
    activeEdges: new Set(),
    logs,
    ended: false,
  };
}

/**
 * 推进一个 tick
 *
 * 传播逻辑：
 * 1. 收集本 tick 已激活节点
 * 2. 沿出边传播激活信号
 * 3. 根据边类型和目标节点类型应用效果
 * 4. condition 节点根据条件选择分支
 * 5. 更新资源/状态
 */
export function stepSimulation(
  state: SimulationState,
  nodes: GraphNode[],
  edges: GraphEdge[]
): SimulationState {
  if (state.ended) return state;

  const newTick = state.tick + 1;
  const newNodes = new Map<string, RuntimeNodeState>();
  // 复制状态
  for (const [id, ns] of state.nodes) {
    newNodes.set(id, {
      ...ns,
      history: [...ns.history, ns.value ?? 0],
    });
  }
  const newActiveEdges = new Set<string>();
  const newLogs: SimulationLog[] = [...state.logs];

  // 清除上一 tick 的激活标记（保留 activationCount）
  for (const ns of newNodes.values()) {
    ns.activated = false;
  }

  // 收集上一 tick 激活的节点
  const activatedNodeIds: string[] = [];
  for (const [id, ns] of state.nodes) {
    if (ns.activated) activatedNodeIds.push(id);
  }

  if (activatedNodeIds.length === 0) {
    // 没有激活节点，模拟结束
    return { ...state, ended: true, activeEdges: new Set() };
  }

  // 沿出边传播
  for (const sourceId of activatedNodeIds) {
    const sourceNode = nodes.find((n) => n.id === sourceId);
    if (!sourceNode) continue;

    const outEdges = edges.filter((e) => e.source === sourceId);

    for (const edge of outEdges) {
      const targetNode = nodes.find((n) => n.id === edge.target);
      if (!targetNode) continue;

      const targetState = newNodes.get(edge.target);
      if (!targetState) continue;

      // 标记边激活
      newActiveEdges.add(edge.id);

      // 根据边类型 + 目标节点类型应用效果
      applyEdgeEffect(
        edge.type,
        sourceNode,
        targetNode,
        targetState,
        newLogs,
        newTick,
        newNodes
      );
    }
  }

  // 检查是否有新激活
  const hasNewActivation = Array.from(newNodes.values()).some((n) => n.activated);

  // 达到最大 tick 或无新激活则结束
  if (newTick >= (state.nodes.size > 0 ? 100 : DEFAULT_CONFIG.maxTicks) || !hasNewActivation) {
    // 不强制结束，让用户手动控制；只在完全没有激活时结束
  }

  // 限制日志数量
  const trimmedLogs = newLogs.slice(-50);

  return {
    tick: newTick,
    nodes: newNodes,
    activeEdges: newActiveEdges,
    logs: trimmedLogs,
    ended: !hasNewActivation,
  };
}

/**
 * 应用边的效果到目标节点
 */
function applyEdgeEffect(
  edgeType: EdgeType,
  _sourceNode: GraphNode,
  targetNode: GraphNode,
  targetState: RuntimeNodeState,
  logs: SimulationLog[],
  tick: number,
  _allNodes: Map<string, RuntimeNodeState>
) {
  const targetType = targetNode.type;
  const label = targetNode.label || targetNode.type;

  // 根据目标节点类型决定行为
  switch (targetType) {
    case "action":
    case "state":
    case "event":
      // 激活目标节点
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "激活",
      });
      break;

    case "condition":
      // 条件节点：根据值判断分支（简化为随机或基于资源值）
      targetState.activated = true;
      targetState.activationCount++;
      // 简化条件：如果有关联资源且 > 0 则 true
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "判断",
      });
      break;

    case "resource": {
      targetState.activated = true;
      targetState.activationCount++;
      if (edgeType === "produce" || edgeType === "transform") {
        const delta = 10;
        targetState.value = (targetState.value ?? 0) + delta;
        logs.push({
          tick,
          nodeId: targetNode.id,
          nodeLabel: label,
          nodeType: targetType,
          action: `产出 +${delta}`,
          value: targetState.value,
        });
      } else if (edgeType === "consume") {
        const delta = 5;
        targetState.value = Math.max(0, (targetState.value ?? 0) - delta);
        logs.push({
          tick,
          nodeId: targetNode.id,
          nodeLabel: label,
          nodeType: targetType,
          action: `消耗 -${delta}`,
          value: targetState.value,
        });
      } else {
        logs.push({
          tick,
          nodeId: targetNode.id,
          nodeLabel: label,
          nodeType: targetType,
          action: `变动`,
          value: targetState.value,
        });
      }
      break;
    }

    case "pool": {
      targetState.activated = true;
      targetState.activationCount++;
      if (edgeType === "produce" || edgeType === "transform") {
        const delta = 5;
        const max = 100;
        targetState.value = Math.min(max, (targetState.value ?? 0) + delta);
        logs.push({
          tick,
          nodeId: targetNode.id,
          nodeLabel: label,
          nodeType: targetType,
          action: `注入 +${delta}`,
          value: targetState.value,
        });
      } else if (edgeType === "consume") {
        const delta = 10;
        targetState.value = Math.max(0, (targetState.value ?? 0) - delta);
        logs.push({
          tick,
          nodeId: targetNode.id,
          nodeLabel: label,
          nodeType: targetType,
          action: `取出 -${delta}`,
          value: targetState.value,
        });
      }
      break;
    }

    case "converter":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "转换",
      });
      break;

    case "level": {
      targetState.activated = true;
      targetState.activationCount++;
      if (edgeType === "produce" || edgeType === "subscribe") {
        targetState.value = (targetState.value ?? 1) + 1;
        logs.push({
          tick,
          nodeId: targetNode.id,
          nodeLabel: label,
          nodeType: targetType,
          action: `升级 → Lv${targetState.value}`,
          value: targetState.value,
        });
      }
      break;
    }

    case "attribute":
    case "modifier":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: edgeType === "modify" ? "修改" : "激活",
      });
      break;

    case "reward":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "给予奖励",
      });
      break;

    case "penalty":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "施加惩罚",
      });
      break;

    case "feedback":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "反馈调节",
      });
      break;

    case "ai_behavior":
    case "social":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "响应",
      });
      break;

    // 辅助层：便签不参与模拟
    case "note":
      break;

    // 世界观层：状态容器，被触发后可传播
    case "region":
    case "landmark":
    case "path":
    case "weather":
    case "biome":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "进入",
      });
      break;

    // 内容元素层：实体，被触发后可传播
    case "character":
    case "item":
    case "skill":
    case "quest":
    case "dialogue":
    case "enemy":
    case "shop":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "触发",
      });
      break;

    // 感官体验层：终端节点，只记录日志，不传播（不置 activated）
    case "music":
    case "sfx":
    case "fx":
    case "animation":
    case "camera":
    case "ui":
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: edgeType === "invoke" ? "播放" : "呈现",
      });
      break;

    // 系统机制层
    case "timer":
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "计时触发",
      });
      break;

    case "rng":
      // 按概率传播：简化为 50% 通过
      if (Math.random() < 0.5) {
        targetState.activated = true;
        targetState.activationCount++;
        logs.push({
          tick,
          nodeId: targetNode.id,
          nodeLabel: label,
          nodeType: targetType,
          action: "随机命中",
        });
      } else {
        logs.push({
          tick,
          nodeId: targetNode.id,
          nodeLabel: label,
          nodeType: targetType,
          action: "随机未命中",
        });
      }
      break;

    case "trigger_zone":
      // 类似事件源：被进入即触发
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "区域触发",
      });
      break;

    case "spawner":
      // 生成器：生成实体
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: edgeType === "produce" ? "生成实体" : "激活",
      });
      break;

    case "savepoint":
      // 存档点：记录
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "记录存档",
      });
      break;

    case "difficulty":
      // 难度调节
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: edgeType === "modify" ? "调节难度" : "激活",
      });
      break;

    default:
      // 兜底：未知类型保守激活，便于发现遗漏
      targetState.activated = true;
      targetState.activationCount++;
      logs.push({
        tick,
        nodeId: targetNode.id,
        nodeLabel: label,
        nodeType: targetType,
        action: "激活",
      });
      break;
  }
}

/**
 * 重置模拟
 */
export function resetSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  config: Partial<SimulationConfig> = {}
): SimulationState {
  return initSimulation(nodes, edges, config);
}
