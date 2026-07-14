import { useEffect, type RefObject } from "react";
import { gsap } from "gsap";

/**
 * 入场动画 hook（轻度）
 * - fade + 微上移
 * - 支持 stagger（对子元素）
 * - 仅在挂载时执行一次，不干扰后续交互
 *
 * @param target 容器 ref
 * @param options 配置
 */
export function useGsapEntrance<T extends HTMLElement = HTMLDivElement>(
  target: RefObject<T | null>,
  options?: {
    /** 是否对直接子元素做 stagger（默认 false，整体动画） */
    stagger?: boolean;
    /** stagger 间隔（秒） */
    staggerGap?: number;
    /** 延迟（秒） */
    delay?: number;
    /** 动画时长（秒） */
    duration?: number;
    /** y 偏移（px） */
    y?: number;
    /** 依赖项变化时重新触发 */
    deps?: unknown[];
  }
) {
  const { stagger = false, staggerGap = 0.08, delay = 0, duration = 0.5, y = 12, deps = [] } = options ?? {};

  useEffect(() => {
    const el = target.current;
    if (!el) return;

    // 设置初始状态（避免闪现）
    const items = stagger ? Array.from(el.children) as HTMLElement[] : [el];
    if (items.length === 0) return;

    gsap.set(items, { autoAlpha: 0, y });

    const ctx = gsap.context(() => {
      gsap.to(items, {
        autoAlpha: 1,
        y: 0,
        duration,
        delay,
        stagger: stagger ? staggerGap : 0,
        ease: "power2.out",
      });
    }, target);

    return () => ctx.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Hover 微交互 hook（轻度）
 * - hover 时轻微上浮 + 可选缩放
 * - 离开时回弹
 * - 支持对容器内子元素批量绑定（selector 模式）
 *
 * @param target 目标元素 ref（或容器 ref + selector）
 * @param options 配置
 */
export function useGsapHover<T extends HTMLElement = HTMLDivElement>(
  target: RefObject<T | null>,
  options?: {
    /** 上浮距离（px） */
    lift?: number;
    /** 缩放比例（1 = 不缩放） */
    scale?: number;
    /** 若提供，则对容器内匹配的子元素批量绑定 hover */
    selector?: string;
  }
) {
  const { lift = 2, scale = 1, selector } = options ?? {};

  useEffect(() => {
    const container = target.current;
    if (!container) return;

    // 选择目标元素：selector 模式批量，否则单个
    const els: HTMLElement[] = selector
      ? Array.from(container.querySelectorAll<HTMLElement>(selector))
      : [container];
    if (els.length === 0) return;

    const bindings: Array<{ el: HTMLElement; enter: () => void; leave: () => void }> = [];

    for (const el of els) {
      const enter = () => {
        gsap.to(el, {
          y: -lift,
          scale: scale > 1 ? scale : 1,
          duration: 0.25,
          ease: "power2.out",
        });
      };
      const leave = () => {
        gsap.to(el, {
          y: 0,
          scale: 1,
          duration: 0.3,
          ease: "power2.out",
        });
      };
      el.addEventListener("mouseenter", enter);
      el.addEventListener("mouseleave", leave);
      bindings.push({ el, enter, leave });
    }

    return () => {
      for (const { el, enter, leave } of bindings) {
        el.removeEventListener("mouseenter", enter);
        el.removeEventListener("mouseleave", leave);
      }
    };
  }, [target, lift, scale, selector]);
}

/**
 * 淡入切换 hook（轻度）
 * - 用于文档/标签页切换时的淡入过渡
 *
 * @param target 容器 ref
 * @param trigger 触发值（变化时执行动画）
 */
export function useGsapFadeSwitch<T extends HTMLElement = HTMLDivElement>(
  target: RefObject<T | null>,
  trigger: unknown
) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;

    gsap.fromTo(
      el,
      { autoAlpha: 0, y: 6 },
      { autoAlpha: 1, y: 0, duration: 0.35, ease: "power2.out" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

/**
 * 卡片 flip 动画 hook（中度，3D 翻转）
 * - 用于属性卡片切换/刷新时的 3D 翻转过渡
 * - 自动为父元素设置 perspective，保证 3D 效果
 *
 * @param target 容器 ref
 * @param trigger 触发值（变化时执行动画）
 */
export function useGsapFlip<T extends HTMLElement = HTMLDivElement>(
  target: RefObject<T | null>,
  trigger: unknown
) {
  useEffect(() => {
    const el = target.current;
    if (!el) return;

    // 为父元素设置 perspective，让 rotateX 有立体感
    const parent = el.parentElement;
    if (parent) {
      gsap.set(parent, { perspective: 600 });
    }
    // 设置 transform-origin 让翻转更自然
    gsap.set(el, { transformOrigin: "center top" });

    gsap.fromTo(
      el,
      { rotateX: -75, autoAlpha: 0, y: 8 },
      { rotateX: 0, autoAlpha: 1, y: 0, duration: 0.5, ease: "back.out(1.4)" }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}

export { gsap };
