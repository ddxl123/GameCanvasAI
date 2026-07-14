import type {
  GraphNode,
  GraphEdge,
  Attribute,
  NodeType,
  EdgeType,
} from "@/types";
import { EDGE_TYPE_META } from "@/features/mechanism/nodeTypes";

/**
 * 机制图健康度分析库
 *
 * 提供图统计、环检测、最长路径深度、复杂度评分与健康度问题检测。
 * 纯函数，不依赖任何 UI / store。
 */

export interface GraphStats {
  nodeCount: number;
  edgeCount: number;
  nodesByType: Record<string, number>; // type -> count
  nodesByCategory: Record<string, number>; // category -> count (logic/system/growth/feedback/social/aux)
  edgesByType: Record<string, number>;
  avgConnectivity: number; // 平均连接度 = 2 * edgeCount / nodeCount
  maxDepth: number; // 最长路径深度（DAG，拓扑排序+DP；若有环返回 -1）
  orphanNodes: string[]; // 无任何连接的节点 ID
  deadEndNodes: string[]; // 只有入度无出度的节点 ID（排除合理终端）
  cycleDetected: boolean;
  complexityScore: number; // 0-100 综合复杂度评分
}

export interface GraphIssue {
  severity: "high" | "medium" | "low";
  type: "orphan" | "dead-end" | "cycle" | "dangling-ref" | "dense";
  title: string;
  description: string;
  nodeIds?: string[]; // 相关节点 ID（用于点击跳转）
}

// 节点类型 -> 维度分类（与 NODE_TYPE_META 一致，本地维护以解耦 lib -> features）
const NODE_CATEGORY: Record<NodeType, string> = {
  event: "logic",
  action: "logic",
  state: "logic",
  condition: "logic",
  resource: "system",
  pool: "system",
  converter: "system",
  attribute: "growth",
  modifier: "growth",
  level: "growth",
  reward: "feedback",
  penalty: "feedback",
  feedback: "feedback",
  ai_behavior: "social",
  social: "social",
  note: "aux",
  // 世界观层
  region: "world",
  landmark: "world",
  path: "world",
  weather: "world",
  biome: "world",
  // 内容元素层
  character: "content",
  item: "content",
  skill: "content",
  quest: "content",
  dialogue: "content",
  enemy: "content",
  shop: "content",
  // 感官体验层
  music: "sensory",
  sfx: "sensory",
  fx: "sensory",
  animation: "sensory",
  camera: "sensory",
  ui: "sensory",
  // 系统机制层（归入 system 维度）
  timer: "system",
  rng: "system",
  trigger_zone: "system",
  spawner: "system",
  savepoint: "system",
  difficulty: "system",
};

// 合理的终端节点类型：有入度无出度是设计上的终点，不算死端
const TERMINAL_TYPES: ReadonlySet<NodeType> = new Set<NodeType>([
  "reward",
  "penalty",
  "feedback",
  // 感官体验层：本就是终端输出
  "music",
  "sfx",
  "fx",
  "animation",
  "camera",
  "ui",
]);

const CATEGORY_ORDER: string[] = [
  "logic",
  "system",
  "growth",
  "feedback",
  "social",
  "world",
  "content",
  "sensory",
  "aux",
];

const EDGE_TYPE_ORDER: EdgeType[] = [
  // 通信类
  "invoke", "subscribe", "emit", "pass",
  // 数据流类
  "produce", "consume", "transform", "modify",
  // 结构类
  "compose", "reference", "belong",
  // 控制类
  "enable", "inhibit", "branch",
  // 交互类
  "cooperate", "interact", "oppose",
];

interface CycleResult {
  hasCycle: boolean;
  hasNonBenignCycle: boolean; // 存在非纯 structure/interaction 边构成的环
  cycleCount: number; // 检测到的回边数（环数近似）
}

/**
 * DFS 三色标记法检测有向环。
 * 同时判断每个环是否完全由 structure/interaction 类边构成（无向/双向关系的环不算 issue）。
 */
function detectCycles(nodes: GraphNode[], edges: GraphEdge[]): CycleResult {
  const adj = new Map<string, Array<{ target: string; edgeType: EdgeType }>>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    if (!adj.has(edge.source)) adj.set(edge.source, []);
    if (!adj.has(edge.target)) adj.set(edge.target, []);
    adj.get(edge.source)!.push({ target: edge.target, edgeType: edge.type });
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const node of nodes) color.set(node.id, WHITE);

  // parent[x] = 进入 x 的树边 { from: parent, edgeType }
  const parent = new Map<string, { node: string; edgeType: EdgeType } | null>();

  let hasCycle = false;
  let hasNonBenignCycle = false;
  let cycleCount = 0;

  const dfs = (u: string): void => {
    color.set(u, GRAY);
    const neighbors = adj.get(u) ?? [];
    for (const { target: v, edgeType } of neighbors) {
      const vc = color.get(v);
      if (vc === undefined || vc === WHITE) {
        parent.set(v, { node: u, edgeType });
        dfs(v);
      } else if (vc === GRAY) {
        // 回边 -> 发现环。重建环上的边类型：回边 u->v + 树路径 v~>u
        hasCycle = true;
        cycleCount += 1;
        const cycleTypes: EdgeType[] = [edgeType];
        let cur: string = u;
        let guard = 0;
        while (cur !== v && guard < nodes.length + 1) {
          const p = parent.get(cur);
          if (!p) break;
          cycleTypes.push(p.edgeType);
          cur = p.node;
          guard += 1;
        }
        const allBenign = cycleTypes.every((t) => {
          const meta = EDGE_TYPE_META[t];
          return meta.category === "structure" || meta.category === "interaction";
        });
        if (!allBenign) hasNonBenignCycle = true;
      }
    }
    color.set(u, BLACK);
  };

  for (const node of nodes) {
    if (color.get(node.id) === WHITE) {
      dfs(node.id);
    }
  }

  return { hasCycle, hasNonBenignCycle, cycleCount };
}

/**
 * Kahn 拓扑排序 + DP 求最长路径深度（边数）。
 * 若存在环（无法完整拓扑排序）返回 -1。
 */
function computeMaxDepth(nodes: GraphNode[], edges: GraphEdge[]): number {
  if (nodes.length === 0) return 0;

  const inDeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const node of nodes) {
    inDeg.set(node.id, 0);
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    if (!adj.has(edge.source)) {
      adj.set(edge.source, []);
      inDeg.set(edge.source, inDeg.get(edge.source) ?? 0);
    }
    if (!inDeg.has(edge.target)) {
      inDeg.set(edge.target, 0);
      adj.set(edge.target, adj.get(edge.target) ?? []);
    }
    adj.get(edge.source)!.push(edge.target);
    inDeg.set(edge.target, (inDeg.get(edge.target) ?? 0) + 1);
  }

  const queue: string[] = [];
  const depth = new Map<string, number>();
  for (const node of nodes) {
    if ((inDeg.get(node.id) ?? 0) === 0) {
      queue.push(node.id);
      depth.set(node.id, 0);
    }
  }

  let processed = 0;
  let maxDepth = 0;
  while (queue.length > 0) {
    const u = queue.shift()!;
    processed += 1;
    const du = depth.get(u) ?? 0;
    if (du > maxDepth) maxDepth = du;
    for (const v of adj.get(u) ?? []) {
      const candidate = du + 1;
      if (candidate > (depth.get(v) ?? 0)) depth.set(v, candidate);
      const next = (inDeg.get(v) ?? 0) - 1;
      inDeg.set(v, next);
      if (next === 0) queue.push(v);
    }
  }

  if (processed < nodes.length) return -1; // 存在环
  return maxDepth;
}

/**
 * 综合复杂度评分（0-100）。
 * 综合：节点数 / 边数 / 平均连接度 / 环数。
 */
function computeComplexityScore(
  nodeCount: number,
  edgeCount: number,
  avgConnectivity: number,
  cycleCount: number,
  hasNonBenignCycle: boolean
): number {
  const nodeScore = Math.min(40, nodeCount * 0.8);
  const edgeScore = Math.min(30, edgeCount * 0.5);
  const connScore = Math.min(20, avgConnectivity * 6);
  const cycleScore = Math.min(
    10,
    cycleCount * 3 + (hasNonBenignCycle ? 5 : 0)
  );
  const total = nodeScore + edgeScore + connScore + cycleScore;
  return Math.round(Math.max(0, Math.min(100, total)));
}

export function analyzeGraph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  numericAttributes?: Attribute[]
): { stats: GraphStats; issues: GraphIssue[] } {
  const nodeCount = nodes.length;
  const edgeCount = edges.length;

  // 节点按类型 / 维度分类统计
  const nodesByType: Record<string, number> = {};
  const nodesByCategory: Record<string, number> = {};
  for (const node of nodes) {
    nodesByType[node.type] = (nodesByType[node.type] ?? 0) + 1;
    const category = NODE_CATEGORY[node.type] ?? "aux";
    nodesByCategory[category] = (nodesByCategory[category] ?? 0) + 1;
  }

  // 边按类型统计
  const edgesByType: Record<string, number> = {};
  for (const edge of edges) {
    edgesByType[edge.type] = (edgesByType[edge.type] ?? 0) + 1;
  }

  // 入度 / 出度
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  for (const node of nodes) {
    inDegree.set(node.id, 0);
    outDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    outDegree.set(edge.source, (outDegree.get(edge.source) ?? 0) + 1);
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1);
  }

  // 平均连接度 = 2 * E / N
  const avgConnectivity = nodeCount > 0 ? (2 * edgeCount) / nodeCount : 0;

  // 孤立节点：无任何边引用（排除 note 便签，便签本就独立）
  const orphanNodes: string[] = [];
  for (const node of nodes) {
    if (node.type === "note") continue;
    const deg =
      (inDegree.get(node.id) ?? 0) + (outDegree.get(node.id) ?? 0);
    if (deg === 0) orphanNodes.push(node.id);
  }

  // 死端节点：出度 0 且入度 > 0，排除合理终端类型（reward/penalty/feedback）
  const deadEndNodes: string[] = [];
  for (const node of nodes) {
    if (TERMINAL_TYPES.has(node.type)) continue;
    if (
      (outDegree.get(node.id) ?? 0) === 0 &&
      (inDegree.get(node.id) ?? 0) > 0
    ) {
      deadEndNodes.push(node.id);
    }
  }

  // 环检测
  const { hasCycle, hasNonBenignCycle, cycleCount } = detectCycles(
    nodes,
    edges
  );

  // 最长路径深度（有环返回 -1）
  const maxDepth = hasCycle ? -1 : computeMaxDepth(nodes, edges);

  // 复杂度评分
  const complexityScore = computeComplexityScore(
    nodeCount,
    edgeCount,
    avgConnectivity,
    cycleCount,
    hasNonBenignCycle
  );

  const stats: GraphStats = {
    nodeCount,
    edgeCount,
    nodesByType,
    nodesByCategory,
    edgesByType,
    avgConnectivity,
    maxDepth,
    orphanNodes,
    deadEndNodes,
    cycleDetected: hasCycle,
    complexityScore,
  };

  // ===== 生成健康度问题 =====
  const issues: GraphIssue[] = [];

  // 孤立节点：每个生成 low
  for (const id of orphanNodes) {
    const node = nodes.find((n) => n.id === id);
    const label =
      node?.label || node?.type || "未命名节点";
    issues.push({
      severity: "low",
      type: "orphan",
      title: "孤立节点",
      description: `节点「${label}」没有任何连接，未参与到玩法流程中。`,
      nodeIds: [id],
    });
  }

  // 死端节点：medium
  if (deadEndNodes.length > 0) {
    issues.push({
      severity: "medium",
      type: "dead-end",
      title: "存在死端节点",
      description: `有 ${deadEndNodes.length} 个节点只有入度没有出度，流程在此中断，可能缺少后续逻辑。`,
      nodeIds: deadEndNodes,
    });
  }

  // 循环依赖：非纯 structure/interaction 环为 high
  if (hasCycle && hasNonBenignCycle) {
    issues.push({
      severity: "high",
      type: "cycle",
      title: "检测到循环依赖",
      description:
        "图中存在非结构/交互类型的循环依赖，可能导致模拟无法收敛或逻辑死锁。纯 structure/interaction 边构成的环不计入此问题。",
    });
  }

  // 悬空属性引用：medium
  if (numericAttributes) {
    const attrIds = new Set(numericAttributes.map((a) => a.id));
    const danglingNodes: string[] = [];
    for (const node of nodes) {
      if (node.refAttributeId && !attrIds.has(node.refAttributeId)) {
        danglingNodes.push(node.id);
      }
    }
    if (danglingNodes.length > 0) {
      issues.push({
        severity: "medium",
        type: "dangling-ref",
        title: "存在悬空属性引用",
        description: `有 ${danglingNodes.length} 个节点引用了不存在的数值属性，可能导致模拟取值异常。`,
        nodeIds: danglingNodes,
      });
    }
  }

  // 连接过密：low
  if (avgConnectivity > 3) {
    issues.push({
      severity: "low",
      type: "dense",
      title: "连接密度偏高",
      description: `平均连接度为 ${avgConnectivity.toFixed(2)}，超过 3.0，图结构较密集，建议拆分或归组以提升可读性。`,
    });
  }

  return { stats, issues };
}

// 导出固定顺序，便于 UI 按统一顺序渲染
export const GRAPH_CATEGORY_ORDER = CATEGORY_ORDER;
export const GRAPH_EDGE_TYPE_ORDER = EDGE_TYPE_ORDER;
