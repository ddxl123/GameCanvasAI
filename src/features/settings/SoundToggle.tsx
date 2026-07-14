import { useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { sound } from "@/lib/sound";

// 音效开关 + 音量滑块，自包含组件，可嵌入顶部栏。
// 点击图标切换启用/禁用；悬停展开音量滑块（0-100%）；状态持久化到 localStorage。
export default function SoundToggle() {
  const [enabled, setEnabled] = useState<boolean>(() => sound.isEnabled());
  const [volume, setVolume] = useState<number>(() => sound.getVolume());
  const [expanded, setExpanded] = useState(false);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    sound.setEnabled(next);
    // 切换为开启时给一个轻反馈音，确认设置生效
    if (next) {
      sound.click();
    }
  };

  const handleVolume = (v: number) => {
    const clamped = Math.max(0, Math.min(1, v));
    setVolume(clamped);
    sound.setVolume(clamped);
    // 拖动时给轻微咔哒反馈，但静音/禁用时不响
    if (sound.isEnabled() && clamped > 0) {
      sound.tick();
    }
  };

  const pct = Math.round(volume * 100);

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <button
        onClick={handleToggle}
        className={cn(
          "btn-ghost h-8 w-8 p-0 flex items-center justify-center",
          !enabled && "text-ink-muted"
        )}
        title={enabled ? "音效已开启" : "音效已关闭"}
        aria-label={enabled ? "关闭音效" : "开启音效"}
        aria-pressed={enabled}
      >
        {enabled ? (
          <Volume2 className="w-3.5 h-3.5" />
        ) : (
          <VolumeX className="w-3.5 h-3.5" />
        )}
      </button>

      {/* 悬停展开音量滑块 */}
      <div
        className={cn(
          "absolute right-0 top-full mt-1 z-50 flex items-center gap-2 px-2.5 py-1.5 rounded-md border border-line-subtle bg-canvas-elevated shadow-pop transition-all duration-150 origin-top-right",
          expanded
            ? "opacity-100 scale-100 pointer-events-auto"
            : "opacity-0 scale-95 pointer-events-none"
        )}
      >
        <VolumeX className="w-3 h-3 text-ink-muted flex-shrink-0" />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={pct}
          onChange={(e) => handleVolume(Number(e.target.value) / 100)}
          className="w-24 accent-accent cursor-pointer"
          aria-label="音量"
        />
        <Volume2 className="w-3 h-3 text-ink-muted flex-shrink-0" />
        <span className="text-2xs font-mono text-ink-muted w-7 text-right tabular-nums">
          {pct}
        </span>
      </div>
    </div>
  );
}
