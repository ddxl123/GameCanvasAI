// 音效引擎 —— 纯 Web Audio API 合成，不依赖任何音频文件
// 定位为"设计确认反馈音"，克制、精准，类似 Figma / Procreate 的交互反馈
// 而非游戏音效。

class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled: boolean = true;
  private volume: number = 0.3;

  constructor() {
    // 从 localStorage 读取持久化状态（缺失时使用默认值）
    try {
      const enabled = localStorage.getItem("sound_enabled");
      if (enabled !== null) {
        this.enabled = enabled !== "false";
      }
      const volume = localStorage.getItem("sound_volume");
      if (volume !== null) {
        const parsed = parseFloat(volume);
        if (!Number.isNaN(parsed)) {
          this.volume = parsed;
        }
      }
    } catch {
      // localStorage 不可用时静默回退到默认值
    }
  }

  setEnabled(v: boolean) {
    this.enabled = v;
    try {
      localStorage.setItem("sound_enabled", v ? "true" : "false");
    } catch {
      // ignore
    }
  }

  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(1, v));
    try {
      localStorage.setItem("sound_volume", String(this.volume));
    } catch {
      // ignore
    }
  }

  isEnabled() {
    return this.enabled;
  }

  getVolume() {
    return this.volume;
  }

  // 懒创建 AudioContext，并在被浏览器挂起时尝试恢复
  // 首次调用发生在用户交互之后，符合浏览器自动播放策略
  private ensureCtx() {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new Ctor();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  // 播放单个音符：短促攻击 + 指数衰减包络，避免爆音
  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
    delay: number = 0,
    gain: number = 1
  ) {
    if (!this.enabled) return;
    if (this.volume <= 0) return;
    const ctx = this.ensureCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const startTime = ctx.currentTime + delay;
    const vol = this.volume * gain;
    g.gain.setValueAtTime(0, startTime);
    g.gain.linearRampToValueAtTime(vol, startTime + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(g).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }

  // 点击 / 确认：短促清脆的电子音（类似 Figma 选中音）
  click() {
    this.playTone(880, 0.04, "sine");
  }

  // 生成成功：上行琶音 C5-E5-G5-C6，递升的确认感
  success() {
    [523, 659, 784, 1047].forEach((f, i) =>
      this.playTone(f, 0.12, "triangle", i * 0.06)
    );
  }

  // 删除 / 撤销：下行短音，轻量不刺耳
  delete() {
    this.playTone(400, 0.08, "sine");
    this.playTone(300, 0.08, "sine", 0.05);
  }

  // 错误：低频短促"嗡"，提示性，不刺耳
  error() {
    this.playTone(150, 0.15, "sawtooth", 0, 0.5);
  }

  // 数值变化：轻微"咔哒"，像调参旋钮
  tick() {
    this.playTone(1200, 0.02, "square", 0, 0.3);
  }

  // 节点连接：清脆"叮"，两节点连上的确认感
  connect() {
    this.playTone(1047, 0.08, "sine");
    this.playTone(1319, 0.06, "sine", 0.04);
  }

  // 升级 / 达成：明亮大三和弦 C-E-G-C，设计里程碑感
  levelUp() {
    [523, 659, 784, 1047].forEach((f) =>
      this.playTone(f, 0.3, "triangle", 0, 0.6)
    );
  }

  // 试玩专用（更游戏化但仍克制）
  hit() {
    this.playTone(200, 0.06, "square", 0, 0.4);
  }

  reward() {
    this.playTone(880, 0.08, "triangle");
    this.playTone(1320, 0.08, "triangle", 0.06);
  }
}

export const sound = new SoundEngine();
