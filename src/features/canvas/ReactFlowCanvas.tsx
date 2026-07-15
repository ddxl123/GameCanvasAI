import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  useReactFlow,
  useViewport,
} from "@xyflow/react";
import type { Connection, Edge, NodeTypes, OnSelectionChangeParams } from "@xyflow/react";
import { Copy, Trash2, Star, Plus, Filter, X, Eye, EyeOff, ChevronRight } from "lucide-react";
import { ElementNode, type ElementStatus, getDimensionKey, getSemanticKey, DIMENSION_LABELS, getSemanticLabel } from "./ElementNode";
import { NODE_LIBRARY, getNodeIcon } from "@/features/mechanism/nodeTypes";
import { useFlowState } from "./useFlowState";
import type { CanvasConnection } from "./useFlowState";
import { CanvasToolbar } from "./CanvasToolbar";
import { useUIStore } from "@/stores/uiStore";
import { useGameplayStore } from "@/stores/gameplayStore";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useRuleStore } from "@/stores/ruleStore";
import { useLevelStore } from "@/stores/levelStore";
import { useNumericStore } from "@/stores/numericStore";
import ErrorBoundary from "@/components/ErrorBoundary";
import { cn } from "@/lib/utils";
import type { CanvasElement, CanvasElementType } from "@/types";
import type { LayoutAlgorithm } from "@/lib/graphLayout";

const nodeTypes: NodeTypes = {
  element: ElementNode as unknown as NodeTypes[string],
};

const DRAG_DATA_KEY = "application/canvas-element-type";

/** 所有可创建的节点类型（右键菜单和双击创建使用） */
const ALL_NODE_TYPES: { type: CanvasElementType; label: string }[] = [
  { type: "core-loop", label: "核心循环" },
  { type: "loop-step", label: "玩步·宫格" },
  { type: "moment", label: "高光时刻" },
  { type: "node", label: "机制节点" },
  { type: "rule", label: "规则" },
  { type: "level-node", label: "关卡节点" },
  { type: "attribute", label: "属性" },
];

/** 根据节点类型返回拖拽创建时的偏移量（让中心对齐鼠标位置） */
function getDropOffset(type: CanvasElementType): { x: number; y: number } {
  // loop-step 默认展开宫格，尺寸更大
  if (type === "loop-step") return { x: -200, y: -250 };
  return { x: -130, y: -100 };
}

/** 右键菜单状态 */
interface ContextMenuState {
  x: number;
  y: number;
  /** 右键的节点 key，null 表示空白处 */
  nodeKey: string | null;
}

interface ReactFlowCanvasProps {
  projectId: string;
  elements: CanvasElement[];
  connections: CanvasConnection[];
  selectedElementKey: string | null;
  onSelectElement: (element: CanvasElement | null) => void;
  onDoubleClickElement?: (element: CanvasElement) => void;
  onConnectElements?: (
    connection: Connection,
    sourceElement: CanvasElement,
    targetElement: CanvasElement
  ) => void;
  onCreateElementAt?: (type: CanvasElementType, position: { x: number; y: number }, nodeSubtype?: string) => void;
  onDeleteElement?: (element: CanvasElement) => void;
  pendingPosition?: { x: number; y: number } | null;
  onPendingPositionConsumed?: () => void;
  /** 节点生成回调：传入元素和 prompt */
  onGenerateElement?: (element: CanvasElement, prompt: string) => void;
  /** 正在生成的节点 key 集合 */
  generatingKeys?: Set<string>;
  /** 复制元素回调（hover 工具栏使用，传入目标位置） */
  onDuplicateElement?: (
    element: CanvasElement,
    position: { x: number; y: number }
  ) => void;
  /** 元素运行时状态映射（key → status） */
  elementStatusMap?: Map<string, ElementStatus>;
  /** 元素编号映射（key → index，按类型分别编号） */
  elementIndexMap?: Map<string, number>;
}

export default function ReactFlowCanvas({
  projectId,
  elements,
  connections,
  selectedElementKey,
  onSelectElement,
  onDoubleClickElement,
  onConnectElements,
  onCreateElementAt,
  onDeleteElement,
  pendingPosition,
  onPendingPositionConsumed,
  onGenerateElement,
  generatingKeys,
  onDuplicateElement,
  elementStatusMap,
  elementIndexMap,
}: ReactFlowCanvasProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    resetPositions,
    autoLayout,
  } = useFlowState(
    projectId,
    elements,
    connections,
    onConnectElements,
    pendingPosition,
    onPendingPositionConsumed
  );

  const rf = useReactFlow();
  const containerRef = useRef<HTMLDivElement>(null);
  const onDoubleClickRef = useRef(onDoubleClickElement);
  onDoubleClickRef.current = onDoubleClickElement;
  const onSelectRef = useRef(onSelectElement);
  onSelectRef.current = onSelectElement;
  const onCreateElementAtRef = useRef(onCreateElementAt);
  onCreateElementAtRef.current = onCreateElementAt;
  const onDeleteRef = useRef(onDeleteElement);
  onDeleteRef.current = onDeleteElement;
  const onGenerateRef = useRef(onGenerateElement);
  onGenerateRef.current = onGenerateElement;
  const onDuplicateRef = useRef(onDuplicateElement);
  onDuplicateRef.current = onDuplicateElement;
  const lastSyncedKey = useRef<string | null>(null);

  // 右键菜单状态
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // 右键菜单中"机制节点"子菜单是否展开（展示 40 种节点子类型）
  const [mechanismSubmenuOpen, setMechanismSubmenuOpen] = useState(false);
  // 收藏的节点 key 集合（localStorage 持久化）
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(`canvas-favorites-${projectId}`);
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch {
      // ignore
    }
    return new Set();
  });

  // 持久化收藏
  useEffect(() => {
    try {
      localStorage.setItem(
        `canvas-favorites-${projectId}`,
        JSON.stringify([...favorites])
      );
    } catch {
      // ignore
    }
  }, [favorites, projectId]);

  // hover 高亮：鼠标悬停的节点 id（与选中节点共同驱动「相邻边高亮」）
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  // 折叠弱连接：隐藏 strength=weak 的边，减少视觉噪声
  const [hideWeak, setHideWeak] = useState(false);
  // 连线形态切换：smoothstep 正交折线 / bezier 曲线 / straight 直线
  const [edgePathType, setEdgePathType] = useState<"smoothstep" | "bezier" | "straight">("smoothstep");
  // 布局算法切换：stress（稠密多对多默认）/ layered（分层）/ force（力导向）/ radial（径向）/ mrtree（树）
  const [layoutAlgorithm, setLayoutAlgorithm] = useState<LayoutAlgorithm>("stress");
  // 筛选面板：勾选隐藏/显示对应维度或语义节点
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  // 从 uiStore 读取图标模式和隐藏集合
  const iconMode = useUIStore((s) => s.iconMode);
  const hiddenDimensions = useUIStore((s) => s.hiddenDimensions);
  const hiddenSemantics = useUIStore((s) => s.hiddenSemantics);
  const toggleHiddenDimension = useUIStore((s) => s.toggleHiddenDimension);
  const toggleHiddenSemantic = useUIStore((s) => s.toggleHiddenSemantic);
  const clearHiddenFilters = useUIStore((s) => s.clearHiddenFilters);

  const decoratedNodes = useMemo(
    () =>
      nodes
        .filter((n) => {
          // 按当前图标模式过滤隐藏的节点
          const el = (n.data as { element: CanvasElement } | undefined)?.element;
          if (!el) return true;
          if (iconMode === "dimension") {
            const dimKey = getDimensionKey(el);
            return !hiddenDimensions.has(dimKey);
          }
          const semKey = getSemanticKey(el);
          return !hiddenSemantics.has(semKey);
        })
        .map((n) => ({
          ...n,
          // 选中状态双向同步：外部 selectedElementKey → 节点 selected
          selected: n.id === selectedElementKey,
          data: {
            ...n.data,
            onDoubleClick: (el: CanvasElement) => onDoubleClickRef.current?.(el),
            onGenerate: (el: CanvasElement, prompt: string) =>
              onGenerateRef.current?.(el, prompt),
            generating: generatingKeys?.has(n.id) ?? false,
            // 运行时状态（对齐 libtv 状态系统）
            status: elementStatusMap?.get(n.id),
            // 节点编号（按类型分别编号）
            index: elementIndexMap?.get(n.id),
            // 收藏状态
            isFavorite: favorites.has(n.id),
            // hover 工具栏：复制（在原节点右下方偏移创建副本）
            onDuplicate: (el: CanvasElement) => {
              onDuplicateRef.current?.(el, {
                x: n.position.x + 40,
                y: n.position.y + 40,
              });
            },
            // hover 工具栏：删除
            onDelete: (el: CanvasElement) => onDeleteRef.current?.(el),
            // hover 工具栏：收藏切换
            onToggleFavorite: (el: CanvasElement) => {
              setFavorites((prev) => {
                const next = new Set(prev);
                if (next.has(el.key)) {
                  next.delete(el.key);
                } else {
                  next.add(el.key);
                }
                return next;
              });
            },
          },
        })),
    [nodes, generatingKeys, elementStatusMap, elementIndexMap, favorites, selectedElementKey, iconMode, hiddenDimensions, hiddenSemantics]
  );

  // 高亮/折叠派生：hover 或选中节点时，相邻边加亮 + 蚂蚁线动画，非相邻边降透明度；
  // hideWeak 时过滤掉 strength=weak 的弱连接。
  const decoratedEdges = useMemo<Edge[]>(() => {
    const activeId = hoveredNodeId ?? selectedElementKey;
    const next: Edge[] = [];
    for (const e of edges) {
      const data = e.data as
        | { weak?: boolean; baseStrokeWidth?: number }
        | undefined;
      if (hideWeak && data?.weak) continue;
      // 覆盖连线形态（smoothstep/bezier/straight）
      const base: Edge = { ...e, type: edgePathType };
      if (!activeId) {
        next.push(base);
        continue;
      }
      const isAdjacent = e.source === activeId || e.target === activeId;
      if (isAdjacent) {
        // 相邻边加亮：加粗 + 蚂蚁线 + 增强发光，突出当前节点的连接关系
        const baseStroke = (e.data as { baseStroke?: string } | undefined)?.baseStroke;
        next.push({
          ...base,
          animated: true,
          style: {
            ...base.style,
            strokeWidth: (data?.baseStrokeWidth ?? 1.5) + 1,
            opacity: 1,
            filter: baseStroke
              ? `drop-shadow(0 0 6px ${baseStroke}80)`
              : base.style?.filter,
          },
        });
      } else {
        // 非相邻边大幅降低存在感，让焦点更集中
        next.push({
          ...base,
          animated: false,
          style: { ...base.style, opacity: 0.1 },
        });
      }
    }
    return next;
  }, [edges, hoveredNodeId, selectedElementKey, hideWeak, edgePathType]);

  const handleSelectionChange = useCallback(
    (params: OnSelectionChangeParams) => {
      let newKey: string | null = null;
      if (params.nodes.length > 0) {
        const picked = params.nodes[0];
        newKey = picked?.id ?? null;
      }
      if (newKey === lastSyncedKey.current) return;
      lastSyncedKey.current = newKey;
      if (newKey) {
        const element = params.nodes[0]?.data?.element as CanvasElement | undefined;
        if (element) onSelectRef.current(element);
      } else {
        onSelectRef.current(null);
      }
    },
    []
  );

  const handlePaneClick = useCallback(() => {
    if (lastSyncedKey.current === null) return;
    lastSyncedKey.current = null;
    onSelectRef.current(null);
    // 点击空白处关闭右键菜单
    setContextMenu(null);
    // 点击空白处关闭筛选面板
    setFilterPanelOpen(false);
  }, []);

  const handleFitView = useCallback(() => {
    rf.fitView({ padding: 0.2, duration: 300 });
  }, [rf]);

  const handleZoomIn = useCallback(() => {
    rf.zoomIn({ duration: 200 });
  }, [rf]);

  const handleZoomOut = useCallback(() => {
    rf.zoomOut({ duration: 200 });
  }, [rf]);

  const handleResetLayout = useCallback(() => {
    resetPositions();
    setTimeout(() => rf.fitView({ padding: 0.2, duration: 300 }), 50);
  }, [resetPositions, rf]);

  const handleAutoLayout = useCallback(() => {
    // autoLayout 现为 async（ELK 懒加载），fitView 须等布局写回后再执行
    void autoLayout(layoutAlgorithm).then(() => {
      rf.fitView({ padding: 0.2, duration: 300 });
    });
  }, [autoLayout, rf, layoutAlgorithm]);

  // 画布裸键快捷键：=/-/0/Shift+R 触发缩放/适应/重置（非编辑态、无修饰键时生效）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // 编辑态不触发（让用户正常输入）
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
      // 有修饰键则跳过（交给浏览器/其他 handler）
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // 命令面板打开时不触发，避免冲突
      if (useUIStore.getState().commandPaletteOpen) return;

      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === "-") {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === "0") {
        e.preventDefault();
        handleFitView();
      } else if (e.key === "R") {
        // Shift+R 产生大写 "R"
        e.preventDefault();
        handleResetLayout();
      } else if (e.key === "A") {
        // Shift+A 产生大写 "A"
        e.preventDefault();
        handleAutoLayout();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleZoomIn, handleZoomOut, handleFitView, handleResetLayout, handleAutoLayout]);

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const type = event.dataTransfer.getData(DRAG_DATA_KEY) as CanvasElementType;
      if (!type) return;
      // 读取拖拽携带的 node 子类型（如 "event"/"action"），缺省无
      const nodeSubtype = event.dataTransfer.getData(`${DRAG_DATA_KEY}-subtype`) || undefined;
      const position = rf.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      // 根据类型适配偏移量
      const offset = getDropOffset(type);
      position.x += offset.x;
      position.y += offset.y;
      onCreateElementAtRef.current?.(type, position, nodeSubtype);
    },
    [rf]
  );

  // ===== 右键菜单：空白处创建 / 节点操作 =====
  const handleContextMenu = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      nodeKey: null,
    });
  }, []);

  const handleNodeContextMenu = useCallback(
    (event: React.MouseEvent, node: { id: string }) => {
      event.preventDefault();
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeKey: node.id,
      });
    },
    []
  );

  // ===== 双击空白处创建节点（对齐 libtv） =====
  const handleDoubleClick = useCallback(
    (event: React.MouseEvent) => {
      // 只在空白处（pane）响应
      const target = event.target as HTMLElement;
      if (!target.classList.contains("react-flow__pane")) return;
      const position = rf.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      // 在双击位置显示创建菜单
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        nodeKey: null,
      });
      // 偏移量用默认值
      position.x -= 130;
      position.y -= 100;
      // 暂存位置，供菜单点击时使用
      pendingDoubleClickPosRef.current = position;
    },
    [rf]
  );

  const pendingDoubleClickPosRef = useRef<{ x: number; y: number } | null>(null);

  // 菜单中点击创建某类型节点（nodeSubtype 为机制节点子类型，如 "event"/"action"）
  const handleMenuCreate = useCallback(
    (type: CanvasElementType, nodeSubtype?: string) => {
      const menuPos = pendingDoubleClickPosRef.current;
      if (menuPos) {
        // 双击创建：用双击位置
        const offset = getDropOffset(type);
        onCreateElementAtRef.current?.(type, {
          x: menuPos.x + offset.x + 130,
          y: menuPos.y + offset.y + 100,
        }, nodeSubtype);
      } else if (contextMenu) {
        // 右键创建：用右键位置
        const position = rf.screenToFlowPosition({
          x: contextMenu.x,
          y: contextMenu.y,
        });
        const offset = getDropOffset(type);
        position.x += offset.x;
        position.y += offset.y;
        onCreateElementAtRef.current?.(type, position, nodeSubtype);
      }
      setContextMenu(null);
      setMechanismSubmenuOpen(false);
      pendingDoubleClickPosRef.current = null;
    },
    [contextMenu, rf]
  );

  // 菜单中复制节点
  const handleMenuCopy = useCallback(() => {
    if (!contextMenu?.nodeKey) return;
    const element = elements.find((e) => e.key === contextMenu.nodeKey);
    if (element) {
      // 复制：在原位置偏移创建同类型节点
      const pos = rf.screenToFlowPosition({
        x: contextMenu.x,
        y: contextMenu.y,
      });
      const offset = getDropOffset(element.type);
      pos.x += offset.x;
      pos.y += offset.y;
      onCreateElementAtRef.current?.(element.type, pos);
    }
    setContextMenu(null);
  }, [contextMenu, elements, rf]);

  // 菜单中删除节点
  const handleMenuDelete = useCallback(() => {
    if (!contextMenu?.nodeKey) return;
    const element = elements.find((e) => e.key === contextMenu.nodeKey);
    if (element) {
      onDeleteRef.current?.(element);
    }
    setContextMenu(null);
  }, [contextMenu, elements]);

  // 菜单中收藏/取消收藏
  const handleMenuFavorite = useCallback(() => {
    if (!contextMenu?.nodeKey) return;
    const nodeKey = contextMenu.nodeKey;
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(nodeKey)) {
        next.delete(nodeKey);
      } else {
        next.add(nodeKey);
      }
      return next;
    });
    setContextMenu(null);
  }, [contextMenu]);

  const canvasCreateRequest = useUIStore((s) => s.canvasCreateRequest);
  const consumeCanvasCreateRequest = useUIStore((s) => s.consumeCanvasCreateRequest);
  // AI 自动应用 tool_call 后递增此计数器，触发画布适应新内容
  const fitViewRequest = useUIStore((s) => s.fitViewRequest);

  useEffect(() => {
    if (!canvasCreateRequest) return;
    // 用画布容器的中心，而非整个浏览器窗口的中心
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const center = rf.screenToFlowPosition({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.top + rect.height / 2 : window.innerHeight / 2,
    });
    // 根据类型适配偏移量
    const offset = getDropOffset(canvasCreateRequest.type);
    center.x += offset.x;
    center.y += offset.y;
    onCreateElementAtRef.current?.(canvasCreateRequest.type, center, canvasCreateRequest.nodeSubtype);
    consumeCanvasCreateRequest();
  }, [canvasCreateRequest, rf, consumeCanvasCreateRequest]);

  // 监听 fitView 请求（AI 自动应用节点/边后递增），延迟触发以等 store 写入完成
  useEffect(() => {
    if (fitViewRequest === 0) return;
    const timer = setTimeout(() => {
      rf.fitView({ padding: 0.2, duration: 300 });
    }, 120);
    return () => clearTimeout(timer);
  }, [fitViewRequest, rf]);

  const { zoom: currentZoom } = useViewport();
  const isEmpty = elements.length === 0;

  // 数据加载状态：任一 store 正在加载时认为画布在加载中，
  // 避免在数据未加载完成时误显示"空画布"
  // 注意：每个 hook 必须独立调用，不能 || 短路，否则违反 rules-of-hooks
  const gameplayLoading = useGameplayStore((s) => s.loading);
  const mechanismLoading = useMechanismStore((s) => s.loading);
  const ruleLoading = useRuleStore((s) => s.loading);
  const levelLoading = useLevelStore((s) => s.loading);
  const numericLoading = useNumericStore((s) => s.loading);
  const isStoreLoading =
    gameplayLoading ||
    mechanismLoading ||
    ruleLoading ||
    levelLoading ||
    numericLoading;
  const isLoading = isEmpty && isStoreLoading;

  // 画布统计：节点数和连线数（对齐 libtv）
  const nodeCount = elements.length;
  const connectionCount = connections.length;

  // 筛选面板数据：统计当前画布上存在的维度/语义及其节点数
  const filterOptions = useMemo(() => {
    const dimMap = new Map<string, number>();
    const semMap = new Map<string, { label: string; count: number }>();
    for (const el of elements) {
      const dk = getDimensionKey(el);
      dimMap.set(dk, (dimMap.get(dk) || 0) + 1);
      const sk = getSemanticKey(el);
      const label = getSemanticLabel(el);
      const prev = semMap.get(sk);
      semMap.set(sk, { label, count: (prev?.count || 0) + 1 });
    }
    return {
      dims: [...dimMap.entries()].map(([key, count]) => ({
        key,
        label: DIMENSION_LABELS[key] || key,
        count,
      })),
      sems: [...semMap.entries()].map(([key, { label, count }]) => ({
        key,
        label,
        count,
      })),
    };
  }, [elements]);

  // 当前隐藏的筛选数（用于按钮角标显示）
  const hiddenCount = iconMode === "dimension"
    ? hiddenDimensions.size
    : hiddenSemantics.size;

  const miniMapNodeColor = useCallback(
    (node: { data?: { element?: { color?: string } } }) =>
      node.data?.element?.color ?? "#3B82F6",
    []
  );

  // 获取右键菜单关联的元素（用于判断是否已收藏）
  const contextMenuElement = contextMenu?.nodeKey
    ? elements.find((e) => e.key === contextMenu.nodeKey)
    : null;
  const isFavorited = contextMenu?.nodeKey
    ? favorites.has(contextMenu.nodeKey)
    : false;

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-canvas"
      onContextMenu={handleContextMenu}
      onDoubleClick={handleDoubleClick}
    >
      <ErrorBoundary>
        <ReactFlow
          nodes={decoratedNodes}
          edges={decoratedEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onSelectionChange={handleSelectionChange}
          onPaneClick={handlePaneClick}
          onNodeContextMenu={handleNodeContextMenu}
          onNodeMouseEnter={(_e, node) => setHoveredNodeId(node.id)}
          onNodeMouseLeave={() => setHoveredNodeId(null)}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          connectionMode={ConnectionMode.Loose}
          minZoom={0.1}
          maxZoom={4}
          defaultViewport={{ x: 0, y: 0, zoom: 1 }}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          panOnDrag
          selectionOnDrag={false}
          zoomOnScroll
          zoomOnPinch
          zoomOnDoubleClick={false}
          panOnScroll={false}
          elevateNodesOnSelect
          nodesConnectable
          edgesFocusable
          proOptions={{ hideAttribution: true }}
          className="canvas-ambient"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1.5}
            color="rgba(163,230,53,0.06)"
          />
          <MiniMap
            pannable
            zoomable
            nodeColor={miniMapNodeColor}
            nodeStrokeColor="transparent"
            maskColor="rgba(10,15,28,0.6)"
            className="!bg-canvas-sunken !border-line-subtle !rounded-lg"
            style={{ width: 140, height: 100 }}
          />
        </ReactFlow>
      </ErrorBoundary>

      {isEmpty && (
        <div
          className={cn(
            "absolute pointer-events-none flex flex-col items-center justify-center z-10",
            "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
          )}
        >
          {isLoading ? (
            <>
              <div className="text-2xl text-ink-muted mb-2">加载中…</div>
              <div className="text-sm text-ink-secondary">
                正在读取项目数据
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl text-ink-muted mb-2">空画布</div>
              <div className="text-sm text-ink-secondary">
                双击或右键创建新节点
              </div>
            </>
          )}
        </div>
      )}

      {/* 画布统计与控制：左下角（对齐 libtv） */}
      <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <div className="text-2xs text-ink-muted frosted px-2.5 py-1 rounded-md shadow-layered pointer-events-none">
            共 {nodeCount} 个节点、{connectionCount} 条连线
          </div>
          <button
            type="button"
            onClick={() => setHideWeak((v) => !v)}
            title="隐藏弱连接（strength=weak），减少视觉噪声"
            className={cn(
              "text-2xs px-2.5 py-1 rounded-md border transition-colors frosted shadow-layered",
              hideWeak
                ? "border-accent/50 text-accent"
                : "border-line-subtle text-ink-muted hover:text-ink-secondary"
            )}
          >
            {hideWeak ? "弱连接已折叠" : "折叠弱连接"}
          </button>
          {/* 筛选按钮：勾选隐藏/显示对应维度或语义节点 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setFilterPanelOpen((v) => !v)}
              title={`按${iconMode === "dimension" ? "维度" : "语义"}筛选节点`}
              className={cn(
                "text-2xs px-2.5 py-1 rounded-md border transition-colors frosted shadow-layered flex items-center gap-1",
                filterPanelOpen || hiddenCount > 0
                  ? "border-accent/50 text-accent"
                  : "border-line-subtle text-ink-muted hover:text-ink-secondary"
              )}
            >
              <Filter className="w-3 h-3" />
              {iconMode === "dimension" ? "维度筛选" : "语义筛选"}
              {hiddenCount > 0 && (
                <span className="ml-0.5 px-1 rounded-full bg-accent/20 text-accent text-3xs leading-none">
                  {hiddenCount}
                </span>
              )}
            </button>
            {filterPanelOpen && (
              <div
                className="absolute bottom-full mb-2 left-0 w-56 rounded-xl border border-line-subtle frosted-panel shadow-layered-lg p-2 z-50"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-1 pb-2 mb-1 border-b border-line-subtle/50">
                  <span className="text-2xs font-semibold text-ink-primary">
                    {iconMode === "dimension" ? "维度筛选" : "语义筛选"}
                    <span className="ml-1 text-ink-muted font-normal">
                      （点击隐藏/显示）
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    {hiddenCount > 0 && (
                      <button
                        type="button"
                        onClick={clearHiddenFilters}
                        className="text-3xs text-ink-muted hover:text-accent transition-colors"
                        title="清空所有筛选"
                      >
                        清空
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setFilterPanelOpen(false)}
                      className="text-ink-muted hover:text-ink-primary transition-colors"
                      title="关闭"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div className="flex flex-col gap-0.5 max-h-64 overflow-y-auto">
                  {(iconMode === "dimension" ? filterOptions.dims : filterOptions.sems).map((opt) => {
                    const isHidden = iconMode === "dimension"
                      ? hiddenDimensions.has(opt.key)
                      : hiddenSemantics.has(opt.key);
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() =>
                          iconMode === "dimension"
                            ? toggleHiddenDimension(opt.key)
                            : toggleHiddenSemantic(opt.key)
                        }
                        className={cn(
                          "flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left",
                          isHidden
                            ? "bg-canvas-sunken/40 text-ink-muted"
                            : "hover:bg-canvas-sunken/60 text-ink-primary"
                        )}
                      >
                        {isHidden ? (
                          <EyeOff className="w-3 h-3 flex-shrink-0 opacity-50" />
                        ) : (
                          <Eye className="w-3 h-3 flex-shrink-0 text-accent" />
                        )}
                        <span className="text-2xs flex-1 truncate">{opt.label}</span>
                        <span className="text-3xs text-ink-muted">{opt.count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
        {/* 连线形态切换：折线 / 曲线 / 直线 */}
        <div className="flex items-center rounded-lg border border-line-subtle overflow-hidden w-fit frosted shadow-layered">
          {([
            { key: "smoothstep", label: "折线" },
            { key: "bezier", label: "曲线" },
            { key: "straight", label: "直线" },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setEdgePathType(opt.key)}
              title={`连线形态：${opt.label}`}
              className={cn(
                "text-2xs px-2 py-1 transition-colors",
                edgePathType === opt.key
                  ? "bg-accent/20 text-accent"
                  : "bg-canvas-sunken/80 text-ink-muted hover:text-ink-secondary"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* 布局算法切换：点击后自动触发对应算法的自动布局 */}
        <div className="flex items-center rounded-lg border border-line-subtle overflow-hidden w-fit frosted shadow-layered">
          {([
            { key: "stress", label: "应力", title: "应力布局：稠密多对多图首选，节点按图距离均匀分散" },
            { key: "layered", label: "分层", title: "分层布局：有向流程图，交叉最少" },
            { key: "force", label: "力导向", title: "力导向：无层级网络图，节点互斥+边吸引" },
            { key: "radial", label: "径向", title: "径向布局：根节点居中环状展开" },
            { key: "mrtree", label: "树", title: "树状布局：适合树形结构" },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => {
                setLayoutAlgorithm(opt.key);
                // 切换算法后自动触发布局
                void autoLayout(opt.key).then(() => {
                  rf.fitView({ padding: 0.2, duration: 300 });
                });
              }}
              title={opt.title}
              className={cn(
                "text-2xs px-2 py-1 transition-colors",
                layoutAlgorithm === opt.key
                  ? "bg-accent/20 text-accent"
                  : "bg-canvas-sunken/80 text-ink-muted hover:text-ink-secondary"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <CanvasToolbar
        zoom={currentZoom}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitView={handleFitView}
        onResetLayout={handleResetLayout}
        onAutoLayout={handleAutoLayout}
      />

      {/* 右键菜单 / 双击创建菜单 */}
      {contextMenu && (
        <>
          {/* 透明遮罩：点击外部关闭菜单 */}
          <div
            className="fixed inset-0 z-20"
            onClick={() => {
              setContextMenu(null);
              setMechanismSubmenuOpen(false);
              pendingDoubleClickPosRef.current = null;
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
              setMechanismSubmenuOpen(false);
              pendingDoubleClickPosRef.current = null;
            }}
          />
          <div
            role="menu"
            aria-label="画布操作菜单"
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setContextMenu(null);
                setMechanismSubmenuOpen(false);
                pendingDoubleClickPosRef.current = null;
              }
            }}
            className="fixed z-30 min-w-[200px] max-h-[80vh] overflow-y-auto rounded-lg border border-line-subtle bg-canvas-elevated shadow-card py-1"
            style={{
              left: Math.min(contextMenu.x, window.innerWidth - 160),
              top: Math.min(contextMenu.y, window.innerHeight - 200),
            }}
          >
            {contextMenu.nodeKey && contextMenuElement ? (
              <>
                {/* 节点右键菜单：复制、删除、收藏 */}
                <div className="px-2 py-1 text-2xs text-ink-muted border-b border-line-subtle/50 mb-1 truncate">
                  {contextMenuElement.type}
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleMenuCopy}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-ink-primary hover:bg-canvas-sunken/60 transition-colors text-left"
                >
                  <Copy className="w-3.5 h-3.5 text-ink-muted" />
                  复制
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleMenuFavorite}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-ink-primary hover:bg-canvas-sunken/60 transition-colors text-left"
                >
                  <Star
                    className={cn(
                      "w-3.5 h-3.5",
                      isFavorited ? "text-amber-400 fill-amber-400" : "text-ink-muted"
                    )}
                  />
                  {isFavorited ? "取消收藏" : "收藏"}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleMenuDelete}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs text-red-400 hover:bg-canvas-sunken/60 transition-colors text-left"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  删除
                </button>
              </>
            ) : (
              <>
                {/* 空白处右键菜单：创建节点子菜单 */}
                <div className="px-2 py-1 text-2xs text-ink-muted border-b border-line-subtle/50 mb-1 flex items-center gap-1">
                  <Plus className="w-3 h-3" />
                  创建新节点
                </div>
                {ALL_NODE_TYPES.map((item) => {
                  // "机制节点"展开为 40 种子类型二级菜单（按 NODE_LIBRARY 维度分组）
                  if (item.type === "node") {
                    return (
                      <div key={item.type}>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => setMechanismSubmenuOpen((v) => !v)}
                          className="w-full flex items-center gap-1 px-2.5 py-1.5 text-xs text-ink-primary hover:bg-canvas-sunken/60 hover:text-accent transition-colors text-left"
                        >
                          <span className="flex-1">{item.label}</span>
                          <ChevronRight
                            className={cn(
                              "w-3 h-3 text-ink-muted transition-transform",
                              mechanismSubmenuOpen && "rotate-90"
                            )}
                          />
                        </button>
                        {mechanismSubmenuOpen && (
                          <div className="border-l border-line-subtle/40 ml-2 my-0.5">
                            {NODE_LIBRARY.map((group) => (
                              <div key={group.categoryKey} className="py-0.5">
                                {/* 维度分组标题 */}
                                <div className="px-2 py-0.5 text-3xs font-semibold uppercase tracking-wider text-ink-muted">
                                  {group.category}
                                </div>
                                {group.types.map((meta) => {
                                  const Icon = getNodeIcon(meta.type);
                                  return (
                                    <button
                                      key={meta.type}
                                      type="button"
                                      role="menuitem"
                                      onClick={() => handleMenuCreate("node", meta.type)}
                                      className="w-full flex items-center gap-1.5 px-2.5 py-1 text-2xs text-ink-primary hover:bg-canvas-sunken/60 hover:text-accent transition-colors text-left"
                                    >
                                      <Icon
                                        className="w-3 h-3 flex-shrink-0"
                                        style={{ color: meta.color }}
                                      />
                                      <span>{meta.label}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }
                  // 其余顶层类型直接创建
                  return (
                    <button
                      key={item.type}
                      type="button"
                      role="menuitem"
                      onClick={() => handleMenuCreate(item.type)}
                      className="w-full flex items-center px-2.5 py-1.5 text-xs text-ink-primary hover:bg-canvas-sunken/60 hover:text-accent transition-colors text-left"
                    >
                      {item.label}
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export { DRAG_DATA_KEY };
