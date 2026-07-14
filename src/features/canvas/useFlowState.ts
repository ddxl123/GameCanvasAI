import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Connection,
  Edge,
  EdgeChange,
  Node,
  NodeChange,
  OnConnect,
  OnEdgesChange,
  OnNodesChange,
} from "@xyflow/react";
import type {
  CanvasElement,
  EdgeType,
  EdgeStrength,
  EdgeDirection,
  LevelEdgeType,
} from "@/types";
import { layoutGraph } from "@/lib/graphLayout";
import type { LayoutAlgorithm } from "@/lib/graphLayout";
import { EDGE_TYPE_META } from "@/features/mechanism/nodeTypes";

/** 画布节点间连线（业务语义，区别于 React Flow 的 Connection） */
export interface CanvasConnection {
  fromBlock: string;
  toBlock: string;
  label?: string;
  color?: string;
  /** 机制图语义边类型（驱动颜色/线型/方向） */
  edgeType?: EdgeType;
  /** 关卡图边类型 */
  levelEdgeType?: LevelEdgeType;
  /** 关系强度（驱动线宽） */
  strength?: EdgeStrength;
  /** 方向覆盖（驱动箭头：unidirectional 单箭头 / bidirectional 双箭头 / undirected 无箭头） */
  direction?: EdgeDirection;
}

// ===== 边样式映射：把 EdgeTypeMeta / LevelEdgeType → React Flow 边样式 =====

const STRENGTH_WIDTH: Record<EdgeStrength, number> = {
  strong: 2.5,
  normal: 1.8,
  weak: 1.2,
};

/** 关卡边类型 → 颜色/线型（LevelEdgeType 无 EdgeTypeMeta，单独映射） */
const LEVEL_EDGE_STYLE: Record<
  LevelEdgeType,
  { color: string; dashed: boolean; label: string }
> = {
  normal: { color: "#6B7280", dashed: false, label: "通路" },
  secret: { color: "#FBBF24", dashed: true, label: "隐藏" },
  locked: { color: "#EF4444", dashed: false, label: "锁定" },
  branch: { color: "#A78BFA", dashed: false, label: "分支" },
};

// ===== 交叉边去同色：基于边 id 做色相偏移 =====
// 当多条同类型边交叉时，颜色一样无法区分。
// 用边 id 的 hash 生成 -25°~+25° 色相偏移，让同色边在交叉时可区分。

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h /= 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

/** 对 hex 颜色做色相偏移（度），返回 rgba 字符串 */
function shiftHue(hex: string, hueShift: number, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const [hue, sat, lit] = rgbToHsl(r, g, b);
  const [nr, ng, nb] = hslToRgb(hue + hueShift, sat, lit);
  return `rgba(${nr},${ng},${nb},${alpha})`;
}

/** 基于字符串生成稳定的 -25°~+25° 色相偏移 */
function hashHueShift(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  // 映射到 -25 ~ +25
  return ((hash % 50) + 50) % 50 - 25;
}

interface ResolvedEdgeStyle {
  stroke: string;
  strokeWidth: number;
  dashed: boolean;
  /** 是否弱连接（用于「折叠 weak 边」开关） */
  weak: boolean;
  markerEnd?: { type: "arrowclosed"; width: number; height: number; color: string };
  markerStart?: { type: "arrowclosed"; width: number; height: number; color: string };
  label?: string;
}

/**
 * 把 CanvasConnection 解析为 React Flow 边样式。
 * 优先级：机制语义边(edgeType) > 关卡边(levelEdgeType) > 固定色回退。
 * @param edgeId 边 id，用于生成色相偏移，避免同类型边交叉时同色不可区分
 */
function resolveEdgeStyle(conn: CanvasConnection, edgeId: string): ResolvedEdgeStyle {
  const hueShift = hashHueShift(edgeId);
  // 机制语义边：用 EDGE_TYPE_META 映射颜色/线型/方向，strength 映射线宽
  if (conn.edgeType) {
    const meta = EDGE_TYPE_META[conn.edgeType];
    const strength = conn.strength ?? meta.defaultStrength ?? "normal";
    const weak = strength === "weak";
    const alpha = weak ? 0.5 : 0.65;
    // 色相偏移让同类型交叉边可区分
    const stroke = shiftHue(meta.color, hueShift, alpha);
    const strokeWidth = STRENGTH_WIDTH[strength];
    const arrow = {
      type: "arrowclosed" as const,
      width: 16,
      height: 16,
      color: stroke,
    };
    const direction = conn.direction ?? meta.direction;
    const label = conn.label ?? meta.label;
    if (direction === "undirected") {
      return { stroke, strokeWidth, dashed: meta.dashed, weak, label };
    }
    if (direction === "bidirectional") {
      return {
        stroke,
        strokeWidth,
        dashed: meta.dashed,
        weak,
        markerEnd: arrow,
        markerStart: arrow,
        label,
      };
    }
    return { stroke, strokeWidth, dashed: meta.dashed, weak, markerEnd: arrow, label };
  }

  // 关卡边
  if (conn.levelEdgeType) {
    const ls = LEVEL_EDGE_STYLE[conn.levelEdgeType];
    const stroke = shiftHue(ls.color, hueShift, 0.6);
    const arrow = {
      type: "arrowclosed" as const,
      width: 16,
      height: 16,
      color: stroke,
    };
    return {
      stroke,
      strokeWidth: 1.8,
      dashed: ls.dashed,
      weak: false,
      markerEnd: arrow,
      label: conn.label ?? ls.label,
    };
  }

  // 其他固定色连线（loop-step 顺序/循环等）：不做色相偏移，保持标识色
  const stroke = conn.color ?? "rgba(163,230,53,0.3)";
  const arrow = {
    type: "arrowclosed" as const,
    width: 16,
    height: 16,
    color: stroke,
  };
  return {
    stroke,
    strokeWidth: 1.5,
    dashed: false,
    weak: false,
    markerEnd: arrow,
    label: conn.label,
  };
}

/** React Flow 节点数据载荷：携带原始 CanvasElement */
export type FlowNodeData = {
  element: CanvasElement;
  onDoubleClick?: (element: CanvasElement) => void;
  [key: string]: unknown;
};

type FlowNode = Node<FlowNodeData, "element">;

// ===== 位置持久化（localStorage，与旧版 key 兼容）=====

const POSITION_STORAGE_PREFIX = "canvas-elements-";
const LINK_STORAGE_PREFIX = "canvas-links-";
const SAVE_DEBOUNCE_MS = 500;

function loadPositions(projectId: string): Record<string, { x: number; y: number }> {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_PREFIX + projectId);
    if (raw) return JSON.parse(raw) as Record<string, { x: number; y: number }>;
  } catch {
    // ignore
  }
  return {};
}

function loadLinks(projectId: string): CanvasConnection[] {
  try {
    const raw = localStorage.getItem(LINK_STORAGE_PREFIX + projectId);
    if (raw) return JSON.parse(raw) as CanvasConnection[];
  } catch {
    // ignore
  }
  return [];
}

/** 生成网格默认位置，避免重叠 */
function getDefaultPosition(index: number): { x: number; y: number } {
  const col = index % 5;
  const row = Math.floor(index / 5);
  return { x: 40 + col * 220, y: 40 + row * 160 };
}

/**
 * 受控管理 React Flow 的 nodes / edges。
 *
 * 核心能力：
 * - 受控模式 + applyNodeChanges：自行合并变更批次
 * - 位置 debounce 持久化到 localStorage
 * - onConnect 支持手动连线（通过回调让上层写入对应 store）
 * - 用户自定义跨类型连线持久化到 localStorage
 */
export function useFlowState(
  projectId: string,
  elements: CanvasElement[],
  connections: CanvasConnection[],
  /** 手动连线回调：由上层决定如何持久化 */
  onConnectCallback?: (connection: Connection, sourceElement: CanvasElement, targetElement: CanvasElement) => void,
  /** 待分配位置：新元素出现时用此位置而非默认网格 */
  pendingPosition?: { x: number; y: number } | null,
  /** 待分配位置被消费后回调 */
  onPendingPositionConsumed?: () => void
) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() =>
    loadPositions(projectId)
  );

  // 用户手动创建的跨类型连线（不归属任何业务 store 的）
  const [customLinks, setCustomLinks] = useState<CanvasConnection[]>(() => loadLinks(projectId));

  // 为新元素分配位置：有 pendingPosition 用它，否则用默认网格
  const assignedRef = useRef<Set<string>>(new Set());
  const pendingRef = useRef<typeof pendingPosition>(pendingPosition);
  pendingRef.current = pendingPosition;
  const onConsumedRef = useRef(onPendingPositionConsumed);
  onConsumedRef.current = onPendingPositionConsumed;

  useEffect(() => {
    let consumed = false;
    setPositions((prev) => {
      let changed = false;
      const next = { ...prev };
      elements.forEach((el, i) => {
        if (!next[el.key] && !assignedRef.current.has(el.key)) {
          if (pendingRef.current) {
            next[el.key] = pendingRef.current;
            // 立即清零，确保同一批次只有一个元素能拿到 pendingPosition，
            // 避免多个新元素被叠放到同一位置
            pendingRef.current = null;
            consumed = true;
          } else {
            next[el.key] = getDefaultPosition(i);
          }
          assignedRef.current.add(el.key);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    // 在 updater 外面清除 pendingPosition，避免 render 期间 setState
    if (consumed) {
      queueMicrotask(() => onConsumedRef.current?.());
    }
  }, [elements]);

  // ===== 清理悬空的 customLinks：source/target 元素被删除后，连线也要移除 =====
  useEffect(() => {
    const validKeys = new Set(elements.map((e) => e.key));
    setCustomLinks((prev) => {
      const filtered = prev.filter(
        (l) => validKeys.has(l.fromBlock) && validKeys.has(l.toBlock)
      );
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [elements, setCustomLinks]);

  // projectId 切换时重载
  useEffect(() => {
    setPositions(loadPositions(projectId));
    setCustomLinks(loadLinks(projectId));
    assignedRef.current = new Set();
  }, [projectId]);

  // Debounced 持久化位置
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(
          POSITION_STORAGE_PREFIX + projectId,
          JSON.stringify(positions)
        );
      } catch {
        // ignore
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current !== null) clearTimeout(saveTimer.current);
    };
  }, [positions, projectId]);

  // Debounced 持久化自定义连线
  const linkSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (linkSaveTimer.current !== null) clearTimeout(linkSaveTimer.current);
    linkSaveTimer.current = setTimeout(() => {
      try {
        localStorage.setItem(
          LINK_STORAGE_PREFIX + projectId,
          JSON.stringify(customLinks)
        );
      } catch {
        // ignore
      }
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (linkSaveTimer.current !== null) clearTimeout(linkSaveTimer.current);
    };
  }, [customLinks, projectId]);

  // ===== 从业务数据派生 React Flow nodes =====
  // 不设置 width/height，让 ElementNode 通过 CSS 控制尺寸，
  // React Flow v12 会通过 ResizeObserver 自动测量（支持 loop-step 展开宫格时动态变大）
  const nodes = useMemo<FlowNode[]>(
    () => {
      const result: FlowNode[] = [];
      for (const el of elements) {
        const pos = positions[el.key];
        if (!pos) continue;
        result.push({
          id: el.key,
          type: "element",
          position: pos,
          data: { element: el },
        });
      }
      return result;
    },
    [elements, positions]
  );

  // ===== 合并业务 connections + 用户自定义 customLinks =====
  const allConnections = useMemo(
    () => [...connections, ...customLinks],
    [connections, customLinks]
  );

  const edges = useMemo<Edge[]>(
    () =>
      allConnections.map((conn) => {
        const edgeId = `${conn.fromBlock}->${conn.toBlock}`;
        const s = resolveEdgeStyle(conn, edgeId);
        const edge: Edge = {
          id: edgeId,
          source: conn.fromBlock,
          target: conn.toBlock,
          // 正交折线：交叉时走向更清晰，比 bezier 更易追踪
          type: "smoothstep",
          label: s.label,
          style: {
            stroke: s.stroke,
            strokeWidth: s.strokeWidth,
            // 柔和发光：磨砂风格下边线带微光，深色背景上更有质感但不刺眼
            filter: `drop-shadow(0 0 3px ${s.stroke}40)`,
            ...(s.dashed ? { strokeDasharray: "5 4" } : {}),
          },
          markerEnd: s.markerEnd,
          ...(s.markerStart ? { markerStart: s.markerStart } : {}),
          // 携带 weak 标记 + 原始 stroke，供下游 hover 高亮 / 折叠 weak 边使用
          data: { weak: s.weak, baseStroke: s.stroke, baseStrokeWidth: s.strokeWidth },
          labelBgStyle: { fill: "rgba(14,21,37,0.88)", fillOpacity: 1, rx: 4, ry: 4 },
          labelStyle: { fill: "#E5E7EB", fontSize: 11, fontWeight: 500 },
        };
        return edge;
      }),
    [allConnections]
  );

  // ===== 受控变更处理 =====
  const onNodesChange: OnNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const c of changes) {
        if (c.type === "position" && c.position) {
          const pos = c.position;
          setPositions((prev) => ({
            ...prev,
            [c.id]: { x: pos.x, y: pos.y },
          }));
        }
      }
    },
    []
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      // 支持删除用户自定义连线（业务连线由 store 管理，不在此删除）
      for (const c of changes) {
        if (c.type === "remove") {
          const [from, to] = c.id.split("->");
          if (from && to) {
            setCustomLinks((prev) => prev.filter(
              (link) => !(link.fromBlock === from && link.toBlock === to)
            ));
          }
        }
      }
    },
    []
  );

  // ===== 手动连线 =====
  const elementMap = useMemo(
    () => new Map(elements.map((el) => [el.key, el])),
    [elements]
  );

  const onConnect: OnConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const sourceElement = elementMap.get(connection.source);
      const targetElement = elementMap.get(connection.target);
      if (!sourceElement || !targetElement) return;

      // 同类型节点连线交给上层处理（写入对应 store）
      if (onConnectCallback) {
        onConnectCallback(connection, sourceElement, targetElement);
      }

      // 跨类型连线存为自定义 link
      const isSameType = sourceElement.type === targetElement.type;
      if (!isSameType) {
        const newLink: CanvasConnection = {
          fromBlock: connection.source,
          toBlock: connection.target,
          label: "关联",
          color: "rgba(163,230,53,0.4)",
        };
        setCustomLinks((prev) => {
          // 避免重复
          const exists = prev.some(
            (l) => l.fromBlock === newLink.fromBlock && l.toBlock === newLink.toBlock
          );
          return exists ? prev : [...prev, newLink];
        });
      }
    },
    [elementMap, onConnectCallback]
  );

  // ===== 工具方法 =====

  /** 为指定 key 设置位置（外部创建节点时调用） */
  const setPosition = useCallback(
    (key: string, pos: { x: number; y: number }) => {
      assignedRef.current.add(key);
      setPositions((prev) => ({ ...prev, [key]: pos }));
    },
    []
  );

  const updatePosition = useCallback(
    (key: string, pos: { x: number; y: number }) => {
      setPositions((prev) => ({ ...prev, [key]: pos }));
    },
    []
  );

  const resetPositions = useCallback(() => {
    const next: Record<string, { x: number; y: number }> = {};
    elements.forEach((el, i) => {
      next[el.key] = getDefaultPosition(i);
    });
    assignedRef.current = new Set(elements.map((el) => el.key));
    setPositions(next);
  }, [elements]);

  /**
   * 自动布局：使用 ELK 对所有画布元素布局，支持 5 种算法。
   * 默认 stress（应力布局），最适合稠密多对多图。
   * 元素间的连线（customLinks + 业务 connections）作为图的边。
   */
  const autoLayout = useCallback(async (algorithm?: LayoutAlgorithm) => {
    if (elements.length === 0) return;

    // 收集所有边：customLinks（用户手动连线）+ connections（业务连线）
    const allEdges: Array<{ source: string; target: string }> = [];
    for (const link of customLinks) {
      allEdges.push({ source: link.fromBlock, target: link.toBlock });
    }
    for (const conn of connections) {
      allEdges.push({ source: conn.fromBlock, target: conn.toBlock });
    }

    // ELK 需要节点有 type，CanvasElement 没有 NodeType 字段，用 "note" 占位
    const layoutNodes = elements.map((el) => ({
      id: el.key,
      type: "note" as const,
    }));

    const positionsMap = await layoutGraph(layoutNodes, allEdges, {
      direction: "LR",
      nodeWidth: 280,
      nodeHeight: 140,
      rankSpacing: 120,
      nodeSpacing: 80,
      algorithm,
    });

    const next: Record<string, { x: number; y: number }> = {};
    elements.forEach((el, i) => {
      const pos = positionsMap.get(el.key);
      // ELK 未布局的孤立节点用网格兜底
      next[el.key] = pos ?? getDefaultPosition(i);
    });
    assignedRef.current = new Set(elements.map((el) => el.key));
    setPositions(next);
  }, [elements, customLinks, connections]);

  return {
    nodes,
    edges,
    positions,
    onNodesChange,
    onEdgesChange,
    onConnect,
    setPosition,
    updatePosition,
    resetPositions,
    autoLayout,
  };
}
