import { toBlob } from "html-to-image";
import type { GraphNode, GraphEdge } from "@/types";
import { sanitizeFileName } from "@/lib/utils";

// 画布背景色（与机制编辑器深色画布一致）
const CANVAS_BG = "#0E1525";

// 导出时需要过滤掉的非内容元素类名（控件、小地图、面板）
const FILTER_CLASSES = [
  "react-flow__controls",
  "react-flow__minimap",
  "react-flow__panel",
  "react-flow__attribution",
];

/**
 * 导出机制图为 PNG 图片。
 * 通过 html-to-image 截图 ReactFlow 容器实现，自动过滤控件/小地图/面板。
 *
 * @param nodes 当前图的节点列表（用于空检查）
 * @param edges 当前图的边列表
 * @param fileName 导出文件名（不含扩展名）
 */
export async function exportGraphAsImage(
  nodes: GraphNode[],
  edges: GraphEdge[],
  fileName: string
): Promise<void> {
  if (nodes.length === 0 && edges.length === 0) {
    throw new Error("图为空，无法导出");
  }

  // 查找 ReactFlow 容器
  const container = document.querySelector<HTMLElement>(".react-flow");
  if (!container) {
    throw new Error("未找到机制图画布，请确保已渲染");
  }

  // 等待两帧确保 ReactFlow 渲染完成（节点/边 DOM 就绪）
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );

  // 过滤控件、小地图、面板等非内容元素
  const filter = (node: Node): boolean => {
    if (node.nodeType !== Node.ELEMENT_NODE) return true;
    const el = node as Element;
    return !FILTER_CLASSES.some((cls) => el.classList?.contains(cls));
  };

  // 动态 pixelRatio：大图降低像素比，避免内存与耗时过高
  const width = container.offsetWidth;
  const height = container.offsetHeight;
  const pixelRatio = width * height > 4000000 ? 1 : 2;

  const blob = await toBlob(container, {
    filter,
    backgroundColor: CANVAS_BG,
    cacheBust: true,
    pixelRatio,
  });

  if (!blob) {
    throw new Error("图片生成失败");
  }

  // 触发下载（用 ObjectURL 替代 dataURL，降低内存占用）
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${sanitizeFileName(fileName, "机制图")}.png`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}


