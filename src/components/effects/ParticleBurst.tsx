import { useState } from "react";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

export interface ParticleBurstOptions {
  count?: number;
  color?: string;
  duration?: number;
}

interface ParticleBurstProps {
  /** 中心 x 坐标（相对 viewport） */
  x: number;
  /** 中心 y 坐标（相对 viewport） */
  y: number;
  count?: number;
  color?: string;
  duration?: number;
}

interface Particle {
  offsetX: number;
  size: number;
  delay: number;
}

function makeParticles(count: number): Particle[] {
  return Array.from({ length: count }, () => ({
    // 水平随机散布 ±20px
    offsetX: (Math.random() - 0.5) * 40,
    // 粒子尺寸 3~6px
    size: 3 + Math.random() * 3,
    // 错开起飞时间 0~100ms，避免机械感
    delay: Math.random() * 100,
  }));
}

/**
 * 粒子爆发组件：在 (x, y) 处产生 N 个上升粒子。
 *
 * 用 fixed 定位 + CSS `particle-rise` 动画（性能友好，非逐帧 JS）。
 * 粒子从中心随机水平散布，向上飘 60px 并缩小淡出。
 * 通过 Portal 挂载到 body，动画结束后由全局触发函数自动卸载。
 */
export function ParticleBurst({
  x,
  y,
  count = 12,
  color = "#A3E635",
  duration = 800,
}: ParticleBurstProps) {
  const [particles] = useState(() => makeParticles(count));

  return createPortal(
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        pointerEvents: "none",
        zIndex: 9998,
      }}
    >
      {particles.map((p, i) => (
        <span
          key={i}
          style={{
            position: "fixed",
            // 用 left/top 偏移居中，避免与动画 transform 冲突
            left: `${x + p.offsetX - p.size / 2}px`,
            top: `${y - p.size / 2}px`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            borderRadius: "9999px",
            backgroundColor: color,
            boxShadow: `0 0 6px ${color}`,
            animation: `particle-rise ${duration}ms ease-out forwards`,
            animationDelay: `${p.delay}ms`,
          }}
        />
      ))}
    </div>,
    document.body
  );
}

/* ============================================================
 * 全局触发函数：用模块级 Map 管理实例，动画结束后自动清理
 * ============================================================ */

type BurstRoot = ReturnType<typeof createRoot>;
const burstRoots = new Map<string, { root: BurstRoot; container: HTMLDivElement }>();
let burstSeq = 0;

/**
 * 在任意位置触发一次粒子爆发。
 * 内部创建独立 React root 渲染 ParticleBurst，动画结束后自动卸载清理。
 */
export function triggerParticleBurst(
  x: number,
  y: number,
  options?: ParticleBurstOptions
): void {
  if (typeof document === "undefined") return;

  const id = `particle-burst-${++burstSeq}`;
  const container = document.createElement("div");
  container.setAttribute("data-design-feedback", "particle-burst");
  document.body.appendChild(container);

  const root = createRoot(container);
  root.render(
    <ParticleBurst
      x={x}
      y={y}
      count={options?.count}
      color={options?.color}
      duration={options?.duration}
    />
  );

  burstRoots.set(id, { root, container });

  const duration = options?.duration ?? 800;
  // 留出粒子延迟（最大 100ms）+ 缓冲
  const cleanupDelay = duration + 200;
  window.setTimeout(() => {
    const entry = burstRoots.get(id);
    if (!entry) return;
    entry.root.unmount();
    entry.container.remove();
    burstRoots.delete(id);
  }, cleanupDelay);
}

export default ParticleBurst;
