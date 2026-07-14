import type { GraphNode, GraphEdge, NodeType } from "@/types";
import { NODE_TYPE_META } from "@/features/mechanism/nodeTypes";
import type { ElkNode, ELK } from "elkjs/lib/elk.bundled.js";

export type LayoutDirection = "LR" | "TB";

/**
 * 布局算法选择。
 * - layered：分层布局（Sugiyama），适合有向/流程图，交叉最少
 * - stress：应力布局，适合稠密多对多图（杂乱无章连接），节点按图距离均匀分散
 * - force：力导向布局，适合无层级关系的网络图，节点互斥+边吸引
 * - radial：径向布局，根节点居中，子节点环状展开
 * - mrtree：树状布局，适合树形结构
 */
export type LayoutAlgorithm = "layered" | "stress" | "force" | "radial" | "mrtree";

export interface LayoutOptions {
  direction?: LayoutDirection;
  nodeWidth?: number;
  nodeHeight?: number;
  rankSpacing?: number; // 层间距
  nodeSpacing?: number; // 同层节点间距
  algorithm?: LayoutAlgorithm;
}

export interface LayoutedNode {
  id: string;
  position: { x: number; y: number };
}

// elkjs 实例懒加载：通过 dynamic import 不进首屏 bundle，多次布局复用同一实例
let elkInstancePromise: Promise<ELK> | null = null;
async function getElk(): Promise<ELK> {
  if (!elkInstancePromise) {
    elkInstancePromise = import("elkjs/lib/elk.bundled.js").then(
      ({ default: ELK }) => new ELK()
    );
  }
  return elkInstancePromise;
}

/**
 * 使用 ELK 对节点图进行自动布局，支持 5 种算法按图形态选择。
 *
 * 算法选择建议：
 * - layered：有向流程图、层级关系清晰，交叉最少
 * - stress：稠密多对多图（杂乱无章连接），节点按图距离均匀分散，最适合网络图
 * - force：无层级关系的网络图，节点互斥+边吸引
 * - radial：以某节点为中心的辐射结构
 * - mrtree：树形结构
 *
 * @param nodes 节点列表
 * @param edges 边列表
 * @param options 布局选项（算法、方向、间距等）
 * @returns 节点 id → 新位置（左上角）的映射
 */
export async function layoutGraph(
  nodes: Array<{ id: string; type: NodeType; description?: string }>,
  edges: Array<{ source: string; target: string }>,
  options: LayoutOptions = {}
): Promise<Map<string, { x: number; y: number }>> {
  const {
    direction = "LR",
    nodeWidth = 200,
    nodeHeight = 80,
    rankSpacing = 80,
    nodeSpacing = 40,
    algorithm = "stress",
  } = options;

  // 空图直接返回，避免 elkjs 空布局异常
  if (nodes.length === 0) return new Map();

  const elk = await getElk();

  const children = nodes.map((n) => ({
    id: n.id,
    width: nodeWidth,
    height: n.description
      ? estimateNodeHeight(n.type, n.description)
      : nodeHeight,
  }));

  const elkEdges = edges.map((e, i) => ({
    id: `e${i}-${e.source}->${e.target}`,
    sources: [e.source],
    targets: [e.target],
  }));

  const graph: ElkNode = {
    id: "root",
    layoutOptions: buildLayoutOptions(algorithm, direction, rankSpacing, nodeSpacing),
    children,
    edges: elkEdges,
  };

  const result = await elk.layout(graph);

  const positions = new Map<string, { x: number; y: number }>();
  for (const c of result.children ?? []) {
    // elkjs 返回的 x/y 即节点左上角，无需像 dagre 那样减半宽高
    if (c.id != null && c.x != null && c.y != null) {
      positions.set(c.id, { x: c.x, y: c.y });
    }
  }
  return positions;
}

/**
 * 按算法构建 ELK layoutOptions。
 * 不同算法的配置项不同，分构建避免无效参数告警。
 */
function buildLayoutOptions(
  algorithm: LayoutAlgorithm,
  direction: LayoutDirection,
  rankSpacing: number,
  nodeSpacing: number
): Record<string, string> {
  const dir = direction === "LR" ? "RIGHT" : "DOWN";
  const base: Record<string, string> = {
    "elk.spacing.nodeNode": String(Math.max(nodeSpacing, 60)),
  };

  switch (algorithm) {
    case "layered":
      return {
        ...base,
        "elk.algorithm": "layered",
        "elk.direction": dir,
        "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.max(rankSpacing, 100)),
        "elk.layered.nodePlacement.strategy": "NETWORK_SIMPLEX",
        "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
        "elk.layered.cycleBreaking.strategy": "GREEDY",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.layered.spacing.edgeNodeBetweenLayers": "40",
        "elk.layered.spacing.edgeEdge": "15",
        "elk.layered.nodePlacement.favorStraightEdges": "true",
      };
    case "stress":
      // 应力布局：适合稠密多对多图，按图距离均匀分散节点
      return {
        ...base,
        "elk.algorithm": "stress",
        "elk.direction": dir,
      };
    case "force":
      // 力导向布局：节点互斥+边吸引，适合无层级网络图
      return {
        ...base,
        "elk.algorithm": "force",
        "elk.direction": dir,
        "elk.forceModel": "FR",
        "elk.temperature": "100",
      };
    case "radial":
      // 径向布局：根节点居中，子节点环状展开
      return {
        ...base,
        "elk.algorithm": "radial",
        "elk.direction": dir,
        "elk.radial.spacing.nodeNode": String(Math.max(nodeSpacing, 80)),
      };
    case "mrtree":
      // 树状布局：适合树形结构
      return {
        ...base,
        "elk.algorithm": "mrtree",
        "elk.direction": dir,
        "elk.layered.spacing.nodeNodeBetweenLayers": String(Math.max(rankSpacing, 100)),
      };
    default:
      return { ...base, "elk.algorithm": "stress" };
  }
}

/**
 * 对当前机制图的所有节点重新布局（in-place 更新位置）。
 * 返回新位置映射，调用方负责写入 store。
 */
export async function relayoutExisting(
  nodes: GraphNode[],
  edges: GraphEdge[],
  options: LayoutOptions = {}
): Promise<Map<string, { x: number; y: number }>> {
  return layoutGraph(
    nodes.map((n) => ({
      id: n.id,
      type: n.type,
      description: n.data?.description as string | undefined,
    })),
    edges.map((e) => ({ source: e.source, target: e.target })),
    options
  );
}

/**
 * 估算节点的合理高度（根据类型和描述长度）。
 * 用于让布局更贴合实际节点尺寸。
 * 偏保守（偏大），避免 ELK 按过小尺寸布局导致实际节点重叠。
 */
export function estimateNodeHeight(_type: NodeType, description?: string): number {
  // 基数 110：标题(28) + 内边距(24) + hover 工具栏预留(28) + 底部留白(30)
  const baseHeight = 110;
  if (!description) return baseHeight;
  // 描述越长，节点越高（每 18 字符约一行，行高 20px）
  const lines = Math.ceil(description.length / 18);
  return Math.max(baseHeight, 90 + lines * 20);
}

/**
 * 获取节点颜色（用于布局调试与 minimap）。
 */
export function getNodeColor(type: NodeType): string {
  return NODE_TYPE_META[type]?.color ?? "#5C6678";
}
