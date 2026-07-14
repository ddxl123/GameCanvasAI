import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

export interface FloatingTextOptions {
  color?: string;
  duration?: number;
}

export interface FloatingTextItem {
  x: number;
  y: number;
  text: string;
  color?: string;
}

interface FloatingTextProps {
  /** 起点 x 坐标（相对 viewport） */
  x: number;
  /** 起点 y 坐标（相对 viewport） */
  y: number;
  text: string;
  color?: string;
  duration?: number;
}

/**
 * 飘字组件：在 (x, y) 处显示文字，向上飘 40px 并淡出。
 *
 * 用 fixed 定位 + CSS `float-up` 动画（性能友好，非逐帧 JS）。
 * 通过 Portal 挂载到 body，动画结束后由全局触发函数自动卸载。
 *
 * 外层 div 负责定位居中（translate(-50%, -50%)），
 * 内层 span 负责飘升动画（translateY），两者互不冲突。
 */
export function FloatingText({
  x,
  y,
  text,
  color = "#A3E635",
  duration = 1000,
}: FloatingTextProps) {
  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: `${x}px`,
        top: `${y}px`,
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        zIndex: 9998,
      }}
    >
      <span
        style={{
          display: "inline-block",
          whiteSpace: "nowrap",
          fontFamily: '"Space Grotesk", "IBM Plex Sans", sans-serif',
          fontWeight: 600,
          fontSize: "0.875rem",
          letterSpacing: "0.01em",
          color,
          textShadow: "0 1px 4px rgba(0, 0, 0, 0.6)",
          animation: `float-up ${duration}ms ease-out forwards`,
        }}
      >
        {text}
      </span>
    </div>,
    document.body
  );
}

/* ============================================================
 * 全局触发函数：用模块级 Map 管理实例，动画结束后自动清理
 * ============================================================ */

type FloatRoot = ReturnType<typeof createRoot>;
const floatRoots = new Map<
  string,
  { root: FloatRoot; container: HTMLDivElement }
>();
let floatSeq = 0;

function mountFloatingTexts(
  items: FloatingTextItem[],
  defaultDuration = 1000
): string {
  const id = `floating-text-${++floatSeq}`;
  const container = document.createElement("div");
  container.setAttribute("data-design-feedback", "floating-text");
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    <>
      {items.map((item, i) => (
        <FloatingText
          key={i}
          x={item.x}
          y={item.y}
          text={item.text}
          color={item.color}
          duration={defaultDuration}
        />
      ))}
    </>
  );

  floatRoots.set(id, { root, container });

  // 留出缓冲确保动画完成
  window.setTimeout(() => {
    const entry = floatRoots.get(id);
    if (!entry) return;
    entry.root.unmount();
    entry.container.remove();
    floatRoots.delete(id);
  }, defaultDuration + 100);

  return id;
}

/**
 * 在 (x, y) 处触发一次飘字。
 * 动画结束后自动卸载清理。
 */
export function triggerFloatingText(
  x: number,
  y: number,
  text: string,
  options?: FloatingTextOptions
): void {
  if (typeof document === "undefined") return;
  mountFloatingTexts(
    [{ x, y, text, color: options?.color }],
    options?.duration ?? 1000
  );
}

/**
 * 批量触发飘字，同时显示多个浮动文字。
 * 动画结束后统一卸载清理。
 */
export function triggerFloatingTexts(items: FloatingTextItem[]): void {
  if (typeof document === "undefined" || items.length === 0) return;
  mountFloatingTexts(items, 1000);
}

export default FloatingText;
