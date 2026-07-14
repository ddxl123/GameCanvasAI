import { useEffect } from "react";
import { sound } from "@/lib/sound";

// 在组件挂载时把 localStorage 中的偏好同步进音效引擎单例，
// 之后任何地方直接调用 sound.click() / sound.success() 等方法即可。
export function useSound() {
  useEffect(() => {
    const sync = () => {
      const enabled = localStorage.getItem("sound_enabled") !== "false";
      const volume = parseFloat(localStorage.getItem("sound_volume") || "0.3");
      sound.setEnabled(enabled);
      sound.setVolume(volume);
    };
    sync();
    // 监听 localStorage 变化（跨标签页 / 其他代码写入），重新同步配置
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
    };
  }, []);

  return sound;
}
