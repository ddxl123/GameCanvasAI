import { useEffect, useRef, type ReactNode } from "react";

export type FlashType = "success" | "error";
export type FeedbackTrigger = FlashType | "shake" | null;

/* ============================================================
 * 全局触发函数：在 body 上添加一次性全屏闪光层
 * ============================================================ */

const FLASH_LAYER_ID = "__design_feedback_flash__";
const FLASH_TIMEOUT_MS = 600;

/**
 * 触发一次全屏闪光反馈。
 * - success: 青柠色（#A3E635）柔和闪光，用于设计里程碑确认
 * - error:   红色（#F87171）闪光，用于警示
 *
 * 闪光层为 fixed 全屏，pointer-events: none，0.6s 后自动移除。
 * 同一时刻只保留一个闪光层，重复触发会替换前一个。
 */
export function triggerFlash(type: FlashType): void {
  if (typeof document === "undefined") return;

  // 移除已有闪光层，避免叠加
  const existing = document.getElementById(FLASH_LAYER_ID);
  if (existing) existing.remove();

  const layer = document.createElement("div");
  layer.id = FLASH_LAYER_ID;
  layer.setAttribute("data-design-feedback", "flash");
  layer.style.position = "fixed";
  layer.style.inset = "0";
  layer.style.pointerEvents = "none";
  layer.style.zIndex = "9999";
  layer.style.backgroundColor = "transparent";

  const cls = type === "success" ? "fx-flash-success" : "fx-flash-error";
  layer.classList.add(cls);

  document.body.appendChild(layer);

  const cleanup = () => {
    layer.removeEventListener("animationend", onEnd);
    layer.remove();
  };
  const onEnd = () => cleanup();
  layer.addEventListener("animationend", onEnd, { once: true });

  // 兜底：动画事件未触发时也保证清理
  window.setTimeout(cleanup, FLASH_TIMEOUT_MS + 50);
}

/**
 * 给指定元素添加一次性 shake 反馈。
 * 添加 `fx-shake` class，0.3s 后或 animationend 时移除。
 */
export function triggerShake(element: HTMLElement): void {
  const cls = "fx-shake";
  const onEnd = () => {
    element.classList.remove(cls);
    element.removeEventListener("animationend", onEnd);
  };
  element.addEventListener("animationend", onEnd, { once: true });
  // 强制重排以重启动画
  element.classList.remove(cls);
  void element.offsetWidth;
  element.classList.add(cls);
  window.setTimeout(() => {
    element.classList.remove(cls);
  }, 350);
}

/* ============================================================
 * FeedbackWrapper: 在子元素上添加一次性反馈动画
 * ============================================================ */

interface FeedbackWrapperProps {
  children: ReactNode;
  /** 反馈类型，传 null 表示无反馈；变化为非 null 时触发一次 */
  trigger: FeedbackTrigger;
  /** 动画完成回调 */
  onDone?: () => void;
}

const TRIGGER_TO_CLASS: Record<Exclude<FeedbackTrigger, null>, string> = {
  success: "fx-flash-success",
  error: "fx-flash-error",
  shake: "fx-shake",
};

const TRIGGER_TO_DURATION: Record<Exclude<FeedbackTrigger, null>, number> = {
  success: 600,
  error: 500,
  shake: 300,
};

export function FeedbackWrapper({
  children,
  trigger,
  onDone,
}: FeedbackWrapperProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (!trigger) return;

    const el = wrapperRef.current;
    if (!el) return;

    const cls = TRIGGER_TO_CLASS[trigger];
    const duration = TRIGGER_TO_DURATION[trigger];

    const apply = () => {
      el.classList.remove(cls);
      void el.offsetWidth; // 强制重排以重启动画
      el.classList.add(cls);
    };

    const finish = () => {
      el.classList.remove(cls);
      el.removeEventListener("animationend", finish);
      onDoneRef.current?.();
    };

    el.addEventListener("animationend", finish, { once: true });
    apply();

    // 兜底：确保动画结束后必定清理并回调
    const timer = window.setTimeout(() => {
      el.classList.remove(cls);
      el.removeEventListener("animationend", finish);
      onDoneRef.current?.();
    }, duration + 50);

    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("animationend", finish);
      el.classList.remove(cls);
    };
  }, [trigger]);

  return (
    <div ref={wrapperRef} className="inline-block">
      {children}
    </div>
  );
}

export default FeedbackWrapper;
