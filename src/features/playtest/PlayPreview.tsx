import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  X,
  Play,
  Pause,
  RotateCcw,
  Heart,
  Star,
  Trophy,
  Swords,
  Shield,
  Zap,
  ChevronRight,
  Activity,
  Ghost,
  Flag,
  Skull,
} from "lucide-react";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useUIStore } from "@/stores/uiStore";
import { useGsapEntrance, useGsapFadeSwitch } from "@/hooks/useGsap";
import { NODE_TYPE_META, getNodeIcon } from "@/features/mechanism/nodeTypes";
import { computeAllAttributes, type ComputedAttribute } from "@/lib/formula";
import { cn } from "@/lib/utils";
import type { GraphNode, GraphEdge, NodeType, Attribute } from "@/types";

// ===== 常量 =====

// 起始节点类型（事件源）
const START_TYPES: NodeType[] = ["event", "trigger_zone"];

// 速度档位：每个节点高亮时长（ms）
const SPEED_DURATION: Record<number, number> = {
  0.5: 2000,
  1: 1200,
  2: 600,
};

// 玩家状态属性关键词
const HP_KEYWORDS = ["生命", "血量", "血", "hp", "health"];
const MAX_HP_KEYWORDS = ["最大生命", "生命上限", "血量上限", "maxhp", "max hp"];
const SCORE_KEYWORDS = ["分数", "得分", "score", "积分"];
const LEVEL_KEYWORDS = ["等级", "level", "lv"];
const ATTACK_KEYWORDS = ["攻击力", "攻击", "attack", "atk"];
const DEFENSE_KEYWORDS = ["防御力", "防御", "defense", "def"];

// 玩家默认状态
const DEFAULT_PLAYER = {
  hp: 100,
  maxHp: 100,
  score: 0,
  level: 1,
  exp: 0,
  attack: 10,
  defense: 5,
};

// ===== 音效（Web Audio 内联实现）=====
// 依赖 @/lib/sound 不存在时使用的轻量实现，保证可编译且有真实反馈。
class SoundManager {
  private ctx: AudioContext | null = null;

  private ensureCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (this.ctx && this.ctx.state !== "closed") return this.ctx;
    try {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType = "sine",
    volume = 0.08
  ): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    try {
      if (ctx.state === "suspended") void ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch {
      // 忽略音频错误，不影响玩法验证
    }
  }

  tick(): void {
    this.tone(760, 0.05, "square", 0.03);
  }
  reward(): void {
    this.tone(880, 0.1, "sine", 0.07);
    window.setTimeout(() => this.tone(1320, 0.14, "sine", 0.07), 80);
  }
  hit(): void {
    this.tone(160, 0.16, "sawtooth", 0.09);
  }
  levelUp(): void {
    [523, 659, 784, 1047].forEach((f, i) =>
      window.setTimeout(() => this.tone(f, 0.12, "triangle", 0.08), i * 80)
    );
  }
  click(): void {
    this.tone(600, 0.04, "square", 0.05);
  }
  error(): void {
    this.tone(220, 0.3, "sawtooth", 0.1);
    window.setTimeout(() => this.tone(150, 0.4, "sawtooth", 0.09), 120);
  }
}

const sound = new SoundManager();

// ===== 类型 =====

interface PlayerState {
  hp: number;
  maxHp: number;
  score: number;
  level: number;
  exp: number;
  attack: number;
  defense: number;
}

interface LogEntry {
  id: number;
  text: string;
  tone: "default" | "reward" | "penalty" | "combat" | "info";
}

interface FloatingTextItem {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
  size: "sm" | "md" | "lg";
}

interface ParticleBurstItem {
  id: number;
  x: number;
  y: number;
  color: string;
  count: number;
}

interface DecisionOption {
  edge: GraphEdge;
  targetNode: GraphNode;
  branchLabel: string;
  title: string;
}

interface PendingDecision {
  node: GraphNode;
  options: DecisionOption[];
}

interface PathEntry {
  node: GraphNode;
  isDecision: boolean;
  chosenLabel?: string;
}

interface EndedState {
  reason: "complete" | "gameover";
}

// ===== 辅助函数 =====

/**
 * 从 event/trigger_zone 节点出发，沿出边 BFS 遍历，构建播放序列。
 * 每个节点只出现一次（避免死循环），未连通的节点追加在末尾。
 */
function buildTraversalSequence(
  nodes: GraphNode[],
  edges: GraphEdge[]
): GraphNode[] {
  if (nodes.length === 0) return [];

  const starts = nodes.filter((n) => START_TYPES.includes(n.type));
  const queue: GraphNode[] =
    starts.length > 0 ? [...starts] : [nodes[0]];

  const visited = new Set<string>();
  const sequence: GraphNode[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (visited.has(node.id)) continue;
    // 便签不参与演示
    if (node.type === "note") {
      visited.add(node.id);
      continue;
    }
    visited.add(node.id);
    sequence.push(node);

    const outEdges = edges.filter((e) => e.source === node.id);
    for (const edge of outEdges) {
      const target = nodes.find((n) => n.id === edge.target);
      if (target && !visited.has(target.id)) {
        queue.push(target);
      }
    }
  }

  // 追加未遍历到的节点
  for (const node of nodes) {
    if (!visited.has(node.id) && node.type !== "note") {
      visited.add(node.id);
      sequence.push(node);
    }
  }

  return sequence;
}

/**
 * 在属性集合中按关键词查找数值（大小写不敏感）。
 */
function findAttrNumber(
  computed: Map<string, ComputedAttribute>,
  attributes: Attribute[],
  keywords: string[]
): number | null {
  const lowerKeywords = keywords.map((k) => k.toLowerCase());
  for (const attr of attributes) {
    if (attr.type !== "number") continue;
    const name = attr.name.toLowerCase();
    if (lowerKeywords.some((k) => name.includes(k))) {
      const c = computed.get(attr.id);
      if (c && !c.error && typeof c.value === "number") return c.value;
    }
  }
  return null;
}

/**
 * 从数值表计算结果初始化玩家状态。
 */
function initPlayerState(
  computed: Map<string, ComputedAttribute>,
  attributes: Attribute[]
): PlayerState {
  const maxHp =
    findAttrNumber(computed, attributes, MAX_HP_KEYWORDS) ??
    findAttrNumber(computed, attributes, HP_KEYWORDS) ??
    DEFAULT_PLAYER.maxHp;
  const hp = maxHp;
  return {
    hp,
    maxHp,
    score:
      findAttrNumber(computed, attributes, SCORE_KEYWORDS) ?? DEFAULT_PLAYER.score,
    level:
      findAttrNumber(computed, attributes, LEVEL_KEYWORDS) ?? DEFAULT_PLAYER.level,
    exp: 0,
    attack:
      findAttrNumber(computed, attributes, ATTACK_KEYWORDS) ?? DEFAULT_PLAYER.attack,
    defense:
      findAttrNumber(computed, attributes, DEFENSE_KEYWORDS) ??
      DEFAULT_PLAYER.defense,
  };
}

// ===== 组件 =====

export default function PlayPreview({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const nodes = useMechanismStore((s) => s.nodes);
  const edges = useMechanismStore((s) => s.edges);
  const currentGraphId = useMechanismStore((s) => s.currentGraphId);
  const graphs = useMechanismStore((s) => s.graphs);

  const attributes = useNumericStore((s) => s.attributes);
  const formulas = useNumericStore((s) => s.formulas);

  const addToast = useUIStore((s) => s.addToast);

  // 播放状态
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [player, setPlayer] = useState<PlayerState>(DEFAULT_PLAYER);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // 决策分支
  const [pendingDecision, setPendingDecision] =
    useState<PendingDecision | null>(null);

  // 飘字 / 粒子 / 震动
  const [floatingTexts, setFloatingTexts] = useState<FloatingTextItem[]>([]);
  const [particleBursts, setParticleBursts] = useState<ParticleBurstItem[]>([]);
  const [shaking, setShaking] = useState(false);

  // 结算 / 路径回看
  const [ended, setEnded] = useState<EndedState | null>(null);
  const [pathHistory, setPathHistory] = useState<PathEntry[]>([]);
  const [combatCount, setCombatCount] = useState(0);

  // 视觉动画 key
  const [levelUpKey, setLevelUpKey] = useState(0);

  const overlayRef = useRef<HTMLDivElement>(null);
  const currentCardRef = useRef<HTMLDivElement>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const playerPanelRef = useRef<HTMLDivElement>(null);
  const logIdRef = useRef(0);
  const floatingIdRef = useRef(0);
  const particleIdRef = useRef(0);
  const shakeTimerRef = useRef<number | null>(null);
  const lastVisitedIdRef = useRef<string>("");
  const startedAtRef = useRef<number>(0);
  const endedAtRef = useRef<number>(0);
  const prevLevelRef = useRef<number>(DEFAULT_PLAYER.level);
  // 保持 player 的最新值供回调读取，避免闭包陈旧
  const playerRef = useRef<PlayerState>(player);

  // 当前图名称
  const currentGraph = graphs.find((g) => g.id === currentGraphId);

  // 数值计算结果
  const computed = useMemo(
    () => computeAllAttributes(attributes, formulas),
    [attributes, formulas]
  );

  // 播放序列（节点遍历顺序）
  const sequence = useMemo(
    () => buildTraversalSequence(nodes, edges),
    [nodes, edges]
  );

  const total = sequence.length;
  const currentNode = total > 0 ? sequence[currentIndex] : null;
  const nextNode =
    total > 0 && currentIndex + 1 < total ? sequence[currentIndex + 1] : null;

  // 当前激活的边（连接当前节点到下一节点的边）
  const activeEdgeId = useMemo(() => {
    if (!currentNode || !nextNode) return null;
    const edge = edges.find(
      (e) => e.source === currentNode.id && e.target === nextNode.id
    );
    return edge?.id ?? null;
  }, [currentNode, nextNode, edges]);

  // 入场动画
  useGsapEntrance(overlayRef, { duration: 0.4, y: 0, deps: [open] });
  // 当前节点切换的淡入动画
  useGsapFadeSwitch(currentCardRef, currentIndex);

  // 同步 player ref
  useEffect(() => {
    playerRef.current = player;
  }, [player]);

  // ===== 飘字 / 粒子 / 震动 触发器 =====
  const getPanelCenter = useCallback(() => {
    const rect = playerPanelRef.current?.getBoundingClientRect();
    if (rect) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return { x: window.innerWidth - 170, y: 220 };
  }, []);

  const triggerFloatingText = useCallback(
    (
      x: number,
      y: number,
      text: string,
      options?: { color?: string; size?: "sm" | "md" | "lg" }
    ) => {
      floatingIdRef.current += 1;
      const id = floatingIdRef.current;
      setFloatingTexts((prev) => [
        ...prev,
        {
          id,
          x,
          y,
          text,
          color: options?.color ?? "#A3E635",
          size: options?.size ?? "md",
        },
      ]);
      window.setTimeout(() => {
        setFloatingTexts((prev) => prev.filter((f) => f.id !== id));
      }, 1000);
    },
    []
  );

  const triggerParticleBurst = useCallback(
    (
      x: number,
      y: number,
      options?: { color?: string; count?: number }
    ) => {
      particleIdRef.current += 1;
      const id = particleIdRef.current;
      setParticleBursts((prev) => [
        ...prev,
        {
          id,
          x,
          y,
          color: options?.color ?? "#A3E635",
          count: options?.count ?? 12,
        },
      ]);
      window.setTimeout(() => {
        setParticleBursts((prev) => prev.filter((p) => p.id !== id));
      }, 900);
    },
    []
  );

  const triggerShake = useCallback(() => {
    setShaking(true);
    if (shakeTimerRef.current) clearTimeout(shakeTimerRef.current);
    shakeTimerRef.current = window.setTimeout(() => setShaking(false), 300);
  }, []);

  // ===== 重置 =====
  const reset = useCallback(() => {
    setPlaying(false);
    setCurrentIndex(0);
    setLogs([]);
    logIdRef.current = 0;
    const fresh = initPlayerState(computed, attributes);
    setPlayer(fresh);
    prevLevelRef.current = fresh.level;
    playerRef.current = fresh;
    setPendingDecision(null);
    setPathHistory([]);
    setEnded(null);
    setCombatCount(0);
    setFloatingTexts([]);
    setParticleBursts([]);
    setShaking(false);
    startedAtRef.current = 0;
    endedAtRef.current = 0;
    lastVisitedIdRef.current = "";
  }, [computed, attributes]);

  // ===== 打开时初始化玩家状态 =====
  useEffect(() => {
    if (!open) return;
    setPlaying(false);
    setCurrentIndex(0);
    setLogs([]);
    logIdRef.current = 0;
    const fresh = initPlayerState(computed, attributes);
    setPlayer(fresh);
    prevLevelRef.current = fresh.level;
    playerRef.current = fresh;
    setPendingDecision(null);
    setPathHistory([]);
    setEnded(null);
    setCombatCount(0);
    setFloatingTexts([]);
    setParticleBursts([]);
    setShaking(false);
    startedAtRef.current = 0;
    endedAtRef.current = 0;
    lastVisitedIdRef.current = "";
    // 生成成功：轻量粒子
    window.setTimeout(() => {
      const c = getPanelCenter();
      triggerParticleBurst(c.x, c.y, { color: "#A3E635", count: 8 });
    }, 250);
  }, [open, computed, attributes, getPanelCenter, triggerParticleBurst]);

  // ===== 日志辅助 =====
  const pushLog = useCallback(
    (text: string, tone: LogEntry["tone"] = "default") => {
      logIdRef.current += 1;
      const entry: LogEntry = { id: logIdRef.current, text, tone };
      setLogs((prev) => [...prev.slice(-80), entry]);
    },
    []
  );

  // ===== 节点效果处理：经过节点时更新玩家状态 / 日志 / 反馈 =====
  const applyNodeEffect = useCallback(
    (node: GraphNode, isCurrent: boolean) => {
      if (!isCurrent) return;
      const meta = NODE_TYPE_META[node.type];
      const label = node.label || meta?.label || node.type;
      const p = playerRef.current;

      switch (node.type) {
        case "reward": {
          // 模拟获得奖励：分数 + 经验
          const scoreGain = 50 + Math.floor(Math.random() * 100);
          const expGain = 20 + Math.floor(Math.random() * 50);
          const expThreshold = 100 * p.level;
          const newExp = p.exp + expGain;
          let newLevel = p.level;
          let remainExp = newExp;
          if (newExp >= expThreshold) {
            newLevel = p.level + 1;
            remainExp = newExp - expThreshold;
          }
          setPlayer((prev) => ({
            ...prev,
            score: prev.score + scoreGain,
            exp: remainExp,
            level: newLevel,
          }));
          const c = getPanelCenter();
          triggerFloatingText(c.x - 30, c.y, `+${scoreGain} 分`, {
            color: "#A3E635",
          });
          triggerFloatingText(c.x + 30, c.y + 8, `+${expGain} EXP`, {
            color: "#A3E635",
          });
          sound.reward();
          pushLog(
            `🎁 经过 [${label}]：获得 ${scoreGain} 分数、${expGain} 经验`,
            "reward"
          );
          break;
        }
        case "penalty": {
          // 模拟受到惩罚：扣血
          const dmg = 10 + Math.floor(Math.random() * 20);
          setPlayer((prev) => ({
            ...prev,
            hp: Math.max(0, prev.hp - dmg),
          }));
          const c = getPanelCenter();
          triggerFloatingText(c.x, c.y, `-${dmg} HP`, { color: "#F87171" });
          triggerShake();
          sound.hit();
          pushLog(
            `💀 经过 [${label}]：受到惩罚，损失 ${dmg} 生命值`,
            "penalty"
          );
          break;
        }
        case "enemy": {
          // 战斗演示：玩家攻击敌人，伤害 = 攻击力 - 防御力 * 0.5
          const enemyDef = 3 + Math.floor(Math.random() * 8);
          const damage = Math.max(1, Math.round(p.attack - enemyDef * 0.5));
          const counterDmg = Math.max(
            0,
            Math.floor(Math.random() * 12) - Math.floor(p.defense * 0.5)
          );
          setPlayer((prev) =>
            counterDmg > 0
              ? { ...prev, hp: Math.max(0, prev.hp - counterDmg) }
              : prev
          );
          const c = getPanelCenter();
          triggerFloatingText(c.x - 24, c.y, `-${damage}`, {
            color: "#FBBF24",
          });
          if (counterDmg > 0) {
            triggerFloatingText(c.x + 26, c.y - 12, `-${counterDmg} HP`, {
              color: "#F87171",
            });
            triggerShake();
          }
          sound.hit();
          setCombatCount((n) => n + 1);
          pushLog(
            `⚔️ 遭遇 [${label}]：玩家攻击造成 ${damage} 伤害` +
              (counterDmg > 0 ? `，敌人反击造成 ${counterDmg} 伤害` : ""),
            "combat"
          );
          break;
        }
        case "level": {
          sound.tick();
          pushLog(`📈 经过 [${label}]：成长节点触发`, "info");
          break;
        }
        default: {
          sound.tick();
          // 通用：记录节点经过
          if (
            node.type === "event" ||
            node.type === "trigger_zone" ||
            node.type === "action" ||
            node.type === "state" ||
            node.type === "condition"
          ) {
            pushLog(`▸ ${meta?.label ?? node.type}：${label}`, "info");
          }
          break;
        }
      }
    },
    [pushLog, getPanelCenter, triggerFloatingText, triggerShake]
  );

  // ===== 升级检测（独立副作用，避免在 setState updater 中触发副作用）=====
  useEffect(() => {
    if (player.level > prevLevelRef.current) {
      sound.levelUp();
      const c = getPanelCenter();
      triggerFloatingText(c.x, c.y - 20, "LEVEL UP!", {
        color: "#FBBF24",
        size: "lg",
      });
      triggerParticleBurst(c.x, c.y, { color: "#FBBF24", count: 16 });
      setLevelUpKey((k) => k + 1);
      pushLog(`✨ 升级！等级提升到 Lv${player.level}`, "reward");
    }
    prevLevelRef.current = player.level;
  }, [player.level, getPanelCenter, triggerFloatingText, triggerParticleBurst, pushLog]);

  // ===== Game Over 检测 =====
  useEffect(() => {
    if (!open || ended) return;
    if (player.hp <= 0 && pathHistory.length > 0) {
      setEnded({ reason: "gameover" });
      setPlaying(false);
      setPendingDecision(null);
      endedAtRef.current = Date.now();
      sound.error();
      triggerShake();
    }
  }, [player.hp, open, ended, pathHistory.length, triggerShake]);

  // ===== 步进动画：播放时自动推进 =====
  useEffect(() => {
    if (!open || !playing || total === 0 || ended) return;
    if (pendingDecision) return; // 等待用户决策
    if (currentIndex >= total) {
      setPlaying(false);
      endedAtRef.current = Date.now();
      setEnded({ reason: "complete" });
      pushLog("🏁 试玩演示结束", "info");
      addToast({ title: "试玩演示结束", variant: "success" });
      return;
    }

    const node = sequence[currentIndex];
    if (!node) return;

    if (startedAtRef.current === 0) {
      startedAtRef.current = Date.now();
    }

    // 记录路径（避免连续重复）
    const outEdges = edges.filter((e) => e.source === node.id);
    const isDecision = node.type === "condition" && outEdges.length >= 2;
    if (lastVisitedIdRef.current !== node.id) {
      lastVisitedIdRef.current = node.id;
      setPathHistory((prev) => [...prev, { node, isDecision }]);
    }

    // 应用节点效果
    applyNodeEffect(node, true);

    // 决策分支点：暂停并展示选项
    if (isDecision) {
      const options: DecisionOption[] = outEdges
        .map((edge, idx) => {
          const target = nodes.find((n) => n.id === edge.target);
          if (!target) return null;
          const tMeta = NODE_TYPE_META[target.type];
          const branchLabel =
            edge.label || (idx === 0 ? "true 分支" : "false 分支");
          const title = target.label || tMeta?.label || target.type;
          return { edge, targetNode: target, branchLabel, title };
        })
        .filter((o): o is DecisionOption => o !== null);
      if (options.length >= 2) {
        setPlaying(false);
        setPendingDecision({ node, options });
        pushLog(`🔀 抵达决策点 [${node.label || NODE_TYPE_META[node.type].label}]：等待选择`, "info");
        return; // 不自动推进
      }
    }

    const duration = SPEED_DURATION[speed] ?? 1200;
    const timer = window.setTimeout(() => {
      setCurrentIndex((i) => i + 1);
    }, duration);
    return () => clearTimeout(timer);
  }, [
    open,
    playing,
    currentIndex,
    total,
    pendingDecision,
    ended,
    speed,
    sequence,
    applyNodeEffect,
    pushLog,
    addToast,
    edges,
    nodes,
  ]);

  // ===== 日志自动滚动到底部 =====
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  // ===== Esc 退出 / 空格 播放暂停 =====
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === " ") {
        e.preventDefault();
        if (ended) {
          reset();
        } else if (total > 0) {
          setPlaying((p) => !p);
        }
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose, total, ended, reset]);

  // ===== 决策选择 =====
  const handleChooseOption = useCallback(
    (option: DecisionOption) => {
      sound.click();
      // 记录选择到路径
      setPathHistory((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].isDecision && !next[i].chosenLabel) {
            next[i] = { ...next[i], chosenLabel: option.title };
            break;
          }
        }
        return next;
      });
      // 跳转到目标节点
      const targetIdx = sequence.findIndex((n) => n.id === option.targetNode.id);
      setPendingDecision(null);
      if (targetIdx >= 0) {
        setCurrentIndex(targetIdx);
      } else {
        setCurrentIndex((i) => i + 1);
      }
      setPlaying(true);
    },
    [sequence]
  );

  // ===== 手动播放/暂停 =====
  const handlePlayPause = useCallback(() => {
    if (ended) {
      reset();
      return;
    }
    if (total === 0) {
      addToast({ title: "当前机制图为空", variant: "warning" });
      return;
    }
    if (currentIndex >= total) {
      // 已结束，重新开始
      setCurrentIndex(0);
      setLogs([]);
      logIdRef.current = 0;
      const fresh = initPlayerState(computed, attributes);
      setPlayer(fresh);
      prevLevelRef.current = fresh.level;
      playerRef.current = fresh;
      setPathHistory([]);
      setCombatCount(0);
      setEnded(null);
      startedAtRef.current = 0;
      lastVisitedIdRef.current = "";
    }
    setPlaying((p) => !p);
  }, [ended, total, currentIndex, computed, attributes, addToast, reset]);

  const handleReset = useCallback(() => {
    reset();
    addToast({ title: "已重置试玩", variant: "default" });
  }, [reset, addToast]);

  if (!open) return null;

  const progress = total > 0 ? ((currentIndex + 1) / total) * 100 : 0;
  const hpPct =
    player.maxHp > 0
      ? Math.max(0, Math.min(100, (player.hp / player.maxHp) * 100))
      : 0;
  const expThreshold = 100 * player.level;
  const expPct =
    expThreshold > 0
      ? Math.max(0, Math.min(100, (player.exp / expThreshold) * 100))
      : 0;
  const hpLow = hpPct < 30 && hpPct > 0;

  // 结算统计
  const survivalSec =
    startedAtRef.current > 0
      ? Math.max(
          0,
          Math.round(
            ((endedAtRef.current || Date.now()) - startedAtRef.current) / 1000
          )
        )
      : 0;
  const decisionCount = pathHistory.filter((e) => e.isDecision).length;

  return (
    <div
      ref={overlayRef}
      className={cn(
        "fixed inset-0 z-[90] bg-canvas-sunken flex flex-col",
        shaking && "animate-shake"
      )}
    >
      {/* ===== 顶部标题栏 ===== */}
      <header className="flex items-center gap-3 px-6 py-3 border-b border-line-subtle bg-canvas-elevated/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full bg-accent flex-shrink-0 animate-pulse-soft" />
          <span className="text-sm font-display font-semibold text-ink-primary truncate">
            机制验证沙盒
          </span>
          {currentGraph && (
            <span className="text-2xs text-ink-muted flex-shrink-0 truncate">
              · {currentGraph.name}
            </span>
          )}
        </div>

        {/* 速度调节 */}
        <div className="flex items-center gap-1 mx-auto">
          <span className="text-2xs text-ink-muted mr-1">速度</span>
          {[0.5, 1, 2].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSpeed(s)}
              className={cn(
                "px-2 py-1 rounded text-2xs font-mono border transition-colors",
                speed === s
                  ? "border-accent bg-accent-glow text-accent"
                  : "border-line text-ink-secondary hover:text-ink-primary hover:border-line-strong"
              )}
            >
              {s}x
            </button>
          ))}
        </div>

        {/* 关闭 */}
        <button
          type="button"
          onClick={onClose}
          title="退出 (Esc)"
          className="w-7 h-7 inline-flex items-center justify-center rounded-md text-ink-muted hover:text-ink-primary hover:bg-canvas-elevated transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </header>

      {/* ===== 主体内容区 ===== */}
      <main className="flex-1 min-h-0 flex">
        {/* 左侧：节点流程动画区 */}
        <section className="flex-1 min-w-0 flex flex-col border-r border-line-subtle relative overflow-hidden">
          {total === 0 ? (
            <EmptyFlow />
          ) : (
            <NodeFlowArea
              sequence={sequence}
              currentIndex={currentIndex}
              currentNode={currentNode}
              nextNode={nextNode}
              activeEdgeId={activeEdgeId}
              edges={edges}
              currentCardRef={currentCardRef}
            />
          )}

          {/* 决策面板 */}
          {pendingDecision && (
            <DecisionPanel
              decision={pendingDecision}
              onChoose={handleChooseOption}
            />
          )}
        </section>

        {/* 右侧：玩家状态 + 日志 */}
        <aside className="w-[340px] flex-shrink-0 flex flex-col bg-canvas-elevated/20">
          {/* 玩家状态面板 */}
          <div ref={playerPanelRef} className="px-4 py-3 border-b border-line-subtle">
            <div className="flex items-center gap-1.5 mb-3">
              <Activity className="w-3.5 h-3.5 text-accent" />
              <span className="text-xs font-medium text-ink-primary">玩家状态</span>
              {pendingDecision && (
                <span className="text-2xs text-warn ml-auto animate-pulse-soft">
                  决策中
                </span>
              )}
            </div>
            <div className="space-y-2.5">
              {/* 生命值 */}
              <StatusBar
                icon={<Heart className="w-3.5 h-3.5" />}
                label="生命值"
                value={player.hp}
                max={player.maxHp}
                pct={hpPct}
                color="#F87171"
                lowWarning={hpLow}
              />
              {/* 经验 */}
              <StatusBar
                icon={<Zap className="w-3.5 h-3.5" />}
                label="经验"
                value={player.exp}
                max={expThreshold}
                pct={expPct}
                color="#A3E635"
              />
              {/* 分数 */}
              <div className="flex items-center gap-2">
                <Star className="w-3.5 h-3.5 text-warn flex-shrink-0" />
                <span className="text-2xs text-ink-muted w-10 flex-shrink-0">分数</span>
                <span className="text-sm font-mono font-semibold text-ink-primary tabular-nums ml-auto">
                  {player.score}
                </span>
              </div>
              {/* 等级（升级时 bounce-in）*/}
              <div className="flex items-center gap-2">
                <Trophy className="w-3.5 h-3.5 text-accent flex-shrink-0" />
                <span className="text-2xs text-ink-muted w-10 flex-shrink-0">等级</span>
                <span
                  key={levelUpKey}
                  className="text-sm font-mono font-semibold text-ink-primary tabular-nums ml-auto inline-block animate-bounce-in"
                >
                  Lv{player.level}
                </span>
              </div>
              {/* 攻击 / 防御 */}
              <div className="flex items-center gap-3 pt-1 border-t border-line-subtle">
                <div className="flex items-center gap-1.5">
                  <Swords className="w-3 h-3 text-danger" />
                  <span className="text-2xs text-ink-muted">攻击</span>
                  <span className="text-xs font-mono text-ink-secondary tabular-nums">
                    {player.attack}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Shield className="w-3 h-3 text-accent" />
                  <span className="text-2xs text-ink-muted">防御</span>
                  <span className="text-xs font-mono text-ink-secondary tabular-nums">
                    {player.defense}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 战斗 / 事件日志 */}
          <div className="flex-1 min-h-0 flex flex-col">
            <div className="px-4 py-2 border-b border-line-subtle flex items-center gap-1.5">
              <Ghost className="w-3.5 h-3.5 text-ink-secondary" />
              <span className="text-xs font-medium text-ink-primary">事件日志</span>
              <span className="text-2xs text-ink-muted ml-auto">
                {logs.length} 条
              </span>
            </div>
            <div className="flex-1 overflow-auto px-4 py-2 space-y-1">
              {logs.length === 0 ? (
                <div className="text-2xs text-ink-muted text-center py-6">
                  点击播放开始机制验证
                </div>
              ) : (
                logs.map((log) => (
                  <div
                    key={log.id}
                    className={cn(
                      "text-2xs leading-relaxed font-mono",
                      log.tone === "reward" && "text-accent",
                      log.tone === "penalty" && "text-danger",
                      log.tone === "combat" && "text-warn",
                      log.tone === "info" && "text-ink-secondary",
                      log.tone === "default" && "text-ink-secondary"
                    )}
                  >
                    <span className="text-ink-muted mr-1">&gt;</span>
                    {log.text}
                  </div>
                ))
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        </aside>
      </main>

      {/* ===== 底部控制栏 ===== */}
      <footer className="flex items-center gap-4 px-6 py-3 border-t border-line-subtle bg-canvas-elevated/40 backdrop-blur-sm">
        {/* 播放 / 暂停 / 重置 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePlayPause}
            title={playing ? "暂停 (空格)" : "播放 (空格)"}
            className={cn(
              "w-9 h-9 inline-flex items-center justify-center rounded-md border transition-colors",
              playing
                ? "border-accent bg-accent-glow text-accent"
                : "border-line text-ink-secondary hover:text-ink-primary hover:border-line-strong"
            )}
          >
            {playing ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <button
            type="button"
            onClick={handleReset}
            title="重置"
            className="w-9 h-9 inline-flex items-center justify-center rounded-md border border-line text-ink-secondary hover:text-ink-primary hover:border-line-strong transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>

        {/* 进度条 */}
        <div className="flex-1 flex items-center gap-3">
          <span className="text-2xs text-ink-muted font-mono tabular-nums flex-shrink-0">
            {total > 0 ? `${currentIndex + 1} / ${total}` : "—"}
          </span>
          <div
            className="flex-1 h-1.5 rounded-full bg-canvas-elevated overflow-hidden cursor-pointer relative"
            onClick={(e) => {
              if (total === 0) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const pct = (e.clientX - rect.left) / rect.width;
              const idx = Math.max(0, Math.min(total - 1, Math.floor(pct * total)));
              setCurrentIndex(idx);
              setPlaying(false);
              setPendingDecision(null);
            }}
          >
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{ width: `${progress}%`, opacity: 0.85 }}
            />
          </div>
          <span className="text-2xs text-ink-muted font-mono tabular-nums flex-shrink-0 w-10 text-right">
            {Math.round(progress)}%
          </span>
        </div>

        {/* 提示 */}
        <div className="text-2xs text-ink-muted flex-shrink-0 hidden sm:block">
          空格 播放/暂停 · Esc 退出
        </div>
      </footer>

      {/* ===== 飘字层 ===== */}
      <div className="absolute inset-0 z-50 pointer-events-none overflow-hidden">
        {floatingTexts.map((ft) => (
          <div
            key={ft.id}
            className="absolute"
            style={{ left: ft.x, top: ft.y, transform: "translate(-50%, -50%)" }}
          >
            <div
              className="font-mono font-bold animate-float-up whitespace-nowrap"
              style={{
                color: ft.color,
                fontSize:
                  ft.size === "lg" ? "1.5rem" : ft.size === "sm" ? "0.75rem" : "1rem",
                textShadow: `0 0 8px ${ft.color}80`,
              }}
            >
              {ft.text}
            </div>
          </div>
        ))}
      </div>

      {/* ===== 粒子层 ===== */}
      <div className="absolute inset-0 z-40 pointer-events-none overflow-hidden">
        {particleBursts.map((pb) => (
          <div
            key={pb.id}
            className="absolute"
            style={{ left: pb.x, top: pb.y, transform: "translate(-50%, -50%)" }}
          >
            {Array.from({ length: pb.count }).map((_, i) => {
              const angle = (i / pb.count) * Math.PI * 2;
              const offset = 10;
              const ox = Math.cos(angle) * offset;
              const oy = Math.sin(angle) * offset;
              return (
                <div
                  key={i}
                  className="absolute w-1.5 h-1.5 rounded-full animate-particle-rise"
                  style={{
                    backgroundColor: pb.color,
                    left: `${ox}px`,
                    top: `${oy}px`,
                    boxShadow: `0 0 6px ${pb.color}`,
                    animationDelay: `${i * 18}ms`,
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* ===== 结算 / 路径回看 屏 ===== */}
      {ended && (
        <EndScreen
          reason={ended.reason}
          pathHistory={pathHistory}
          combatCount={combatCount}
          score={player.score}
          survivalSec={survivalSec}
          decisionCount={decisionCount}
          onReset={handleReset}
        />
      )}
    </div>
  );
}

// ===== 子组件：状态条 =====

function StatusBar({
  icon,
  label,
  value,
  max,
  pct,
  color,
  lowWarning,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  max: number;
  pct: number;
  color: string;
  lowWarning?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span style={{ color: lowWarning ? "#F87171" : color }} className="flex-shrink-0">
          {icon}
        </span>
        <span className="text-2xs text-ink-muted w-10 flex-shrink-0">{label}</span>
        <span className="text-xs font-mono text-ink-secondary tabular-nums ml-auto">
          {Math.round(value)}
          <span className="text-ink-muted"> / {Math.round(max)}</span>
        </span>
      </div>
      <div
        className={cn(
          "h-2 rounded-full bg-canvas-sunken overflow-hidden border transition-colors",
          lowWarning ? "border-danger animate-pulse-soft" : "border-line-subtle"
        )}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-300",
            lowWarning && "animate-pulse-soft"
          )}
          style={{
            width: `${pct}%`,
            backgroundColor: lowWarning ? "#F87171" : color,
          }}
        />
      </div>
    </div>
  );
}

// ===== 子组件：节点流程动画区 =====

function NodeFlowArea({
  sequence,
  currentIndex,
  currentNode,
  nextNode,
  activeEdgeId,
  edges,
  currentCardRef,
}: {
  sequence: GraphNode[];
  currentIndex: number;
  currentNode: GraphNode | null;
  nextNode: GraphNode | null;
  activeEdgeId: string | null;
  edges: GraphEdge[];
  currentCardRef: React.RefObject<HTMLDivElement>;
}) {
  // 窗口：显示当前节点附近 ±2 个节点作为上下文
  const windowStart = Math.max(0, currentIndex - 2);
  const windowEnd = Math.min(sequence.length, currentIndex + 3);
  const windowNodes = sequence.slice(windowStart, windowEnd);

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 bg-grid-game">
      {/* 顶部：序列缩略图（节点点） */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 max-w-[80%] overflow-hidden">
        {sequence.map((node, i) => {
          const meta = NODE_TYPE_META[node.type];
          const isCurrent = i === currentIndex;
          const isPast = i < currentIndex;
          return (
            <div
              key={node.id}
              title={node.label || meta?.label}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                isCurrent ? "w-6" : "w-1.5",
                isCurrent
                  ? ""
                  : isPast
                    ? "opacity-60"
                    : "opacity-30"
              )}
              style={{
                backgroundColor: isCurrent ? meta?.color ?? "#A3E635" : "#5C6678",
              }}
            />
          );
        })}
      </div>

      {/* 中央：当前节点大卡片 */}
      {currentNode && (
        <div
          ref={currentCardRef}
          key={currentNode.id}
          className="flex flex-col items-center"
        >
          <CurrentNodeCard node={currentNode} />
        </div>
      )}

      {/* 底部：上下文节点列表 + 下一节点指示 */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 max-w-[90%] overflow-x-auto">
        {windowNodes.map((node, i) => {
          const realIndex = windowStart + i;
          const meta = NODE_TYPE_META[node.type];
          const Icon = getNodeIcon(node.type);
          const isCurrent = realIndex === currentIndex;
          const isNext = realIndex === currentIndex + 1;
          const isPast = realIndex < currentIndex;
          return (
            <div key={node.id} className="flex items-center gap-2 flex-shrink-0">
              {i > 0 && (
                <ChevronRight
                  className={cn(
                    "w-3 h-3 flex-shrink-0",
                    isPast ? "text-accent" : "text-ink-muted"
                  )}
                />
              )}
              <div
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-2xs transition-all",
                  isCurrent
                    ? "border-accent bg-accent-glow scale-105"
                    : isNext
                      ? "border-line-strong bg-canvas-elevated"
                      : "border-line-subtle bg-canvas-elevated/40 opacity-60"
                )}
                style={
                  isCurrent
                    ? { borderColor: `${meta?.color ?? "#A3E635"}` }
                    : undefined
                }
              >
                {Icon && (
                  <Icon
                    className="w-3 h-3 flex-shrink-0"
                    style={{ color: meta?.color ?? "#5C6678" }}
                  />
                )}
                <span
                  className={cn(
                    "truncate max-w-[120px]",
                    isCurrent ? "text-ink-primary font-medium" : "text-ink-secondary"
                  )}
                >
                  {node.label || meta?.label || node.type}
                </span>
                {isNext && (
                  <span className="text-2xs text-accent flex-shrink-0">下一节点</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 信号流动指示（当前节点 → 下一节点） */}
      {activeEdgeId && nextNode && (
        <SignalFlowIndicator
          edge={edges.find((e) => e.id === activeEdgeId)}
          nextNode={nextNode}
        />
      )}
    </div>
  );
}

// ===== 子组件：当前节点大卡片 =====

function CurrentNodeCard({ node }: { node: GraphNode }) {
  const meta = NODE_TYPE_META[node.type];
  const Icon = getNodeIcon(node.type);
  const color = meta?.color ?? "#5C6678";
  const description =
    (node.data.description as string) || meta?.description || "";

  return (
    <div
      className="flex flex-col items-center animate-scale-in animate-glow-pulse"
      style={{
        filter: `drop-shadow(0 0 24px ${color}40)`,
      }}
    >
      {/* 节点图标 */}
      <div
        className="w-28 h-28 rounded-2xl flex items-center justify-center mb-5 animate-neon-pulse"
        style={{
          backgroundColor: `${color}1A`,
          border: `2px solid ${color}`,
        }}
      >
        {Icon && <Icon className="w-14 h-14" style={{ color }} />}
      </div>

      {/* 类型标签 */}
      <div
        className="text-2xs uppercase tracking-widest mb-2 font-mono"
        style={{ color }}
      >
        {meta?.label ?? node.type} · {meta?.category ?? ""}
      </div>

      {/* 节点名称 */}
      <h2 className="text-3xl font-display font-bold text-ink-primary mb-3 text-center leading-tight">
        {node.label || meta?.label || "未命名节点"}
      </h2>

      {/* 描述 */}
      {description && (
        <p className="text-sm text-ink-secondary leading-relaxed max-w-md text-center mb-4">
          {description}
        </p>
      )}

      {/* 数据条目 */}
      {Object.keys(node.data).length > 0 && (
        <div className="flex flex-wrap gap-2 justify-center max-w-lg">
          {Object.entries(node.data)
            .filter(([k]) => !["description", "priority", "tags", "customFields"].includes(k))
            .map(([k, v]) => (
              <span
                key={k}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-canvas-elevated border border-line-subtle text-2xs"
              >
                <span className="text-ink-muted">{k}</span>
                <span className="text-ink-secondary font-mono">
                  {typeof v === "object" ? JSON.stringify(v) : String(v)}
                </span>
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

// ===== 子组件：信号流动指示 =====

function SignalFlowIndicator({
  edge,
  nextNode,
}: {
  edge: GraphEdge | undefined;
  nextNode: GraphNode;
}) {
  if (!edge) return null;
  const meta = NODE_TYPE_META[nextNode.type];
  return (
    <div className="absolute top-1/2 right-6 -translate-y-1/2 hidden lg:flex flex-col items-center gap-1 animate-fade-in">
      <div className="text-2xs text-ink-muted font-mono">信号流动</div>
      <div
        className="w-0.5 h-16 rounded-full relative overflow-hidden"
        style={{ backgroundColor: `${meta?.color ?? "#A3E635"}33` }}
      >
        <div
          className="absolute top-0 left-0 w-full h-1/3 rounded-full animate-pulse-soft"
          style={{ backgroundColor: meta?.color ?? "#A3E635" }}
        />
      </div>
      <ChevronRight
        className="w-4 h-4"
        style={{ color: meta?.color ?? "#A3E635" }}
      />
    </div>
  );
}

// ===== 子组件：决策面板 =====

function DecisionPanel({
  decision,
  onChoose,
}: {
  decision: PendingDecision;
  onChoose: (option: DecisionOption) => void;
}) {
  const { node, options } = decision;
  const meta = NODE_TYPE_META[node.type];
  const color = meta?.color ?? "#C084FC";
  const description =
    (node.data.description as string) || meta?.description || "";

  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-canvas-sunken/60 backdrop-blur-sm animate-fade-in p-6">
      <div className="max-w-md w-full surface-card p-5 animate-scale-in shadow-pop">
        <div
          className="text-2xs uppercase tracking-widest mb-1 font-mono"
          style={{ color }}
        >
          决策点 · {meta?.label}
        </div>
        <h3 className="text-lg font-display font-bold text-ink-primary mb-2">
          {node.label || meta?.label || node.type}
        </h3>
        {description && (
          <p className="text-xs text-ink-secondary mb-4 leading-relaxed">
            {description}
          </p>
        )}
        <div className="space-y-2">
          {options.map((opt, i) => {
            const tMeta = NODE_TYPE_META[opt.targetNode.type];
            const TIcon = getNodeIcon(opt.targetNode.type);
            return (
              <button
                key={i}
                type="button"
                onClick={() => onChoose(opt)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md border border-line bg-canvas-elevated hover:border-accent hover:-translate-y-0.5 hover:shadow-glow transition-all text-left group"
              >
                {TIcon && (
                  <TIcon
                    className="w-4 h-4 flex-shrink-0"
                    style={{ color: tMeta?.color ?? "#A3E635" }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-ink-primary truncate">
                    {opt.title}
                  </div>
                  <div className="text-2xs text-ink-muted">
                    走 {opt.branchLabel}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-accent transition-colors flex-shrink-0" />
              </button>
            );
          })}
        </div>
        <div className="text-2xs text-ink-muted mt-3 text-center">
          选择一条分支继续验证
        </div>
      </div>
    </div>
  );
}

// ===== 子组件：结算 / 路径回看屏 =====

function EndScreen({
  reason,
  pathHistory,
  combatCount,
  score,
  survivalSec,
  decisionCount,
  onReset,
}: {
  reason: "complete" | "gameover";
  pathHistory: PathEntry[];
  combatCount: number;
  score: number;
  survivalSec: number;
  decisionCount: number;
  onReset: () => void;
}) {
  const isGameOver = reason === "gameover";
  const summary = isGameOver
    ? `核心循环在 ${combatCount} 次战斗后断裂，建议检查惩罚节点密度或战斗强度。`
    : `完整走通 ${pathHistory.length} 个节点，包含 ${decisionCount} 个决策点，机制闭环成立。`;

  return (
    <div className="absolute inset-0 z-[100] bg-canvas-sunken/80 backdrop-blur-sm flex items-center justify-center animate-fade-in p-6">
      <div className="max-w-lg w-full surface-card p-6 animate-scale-in shadow-pop">
        {/* 标题 */}
        <div className="flex items-center gap-2 mb-1">
          {isGameOver ? (
            <Skull className="w-5 h-5 text-danger" />
          ) : (
            <Flag className="w-5 h-5 text-accent" />
          )}
          <h2
            className={cn(
              "text-xl font-display font-bold",
              isGameOver ? "text-danger" : "text-accent"
            )}
          >
            {isGameOver ? "机制验证结束" : "路径回看"}
          </h2>
        </div>
        <p className="text-2xs text-ink-muted mb-5">
          {isGameOver
            ? "玩家生命值归零，核心循环在此处断裂"
            : "所有节点已遍历完毕"}
        </p>

        {/* 统计 */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          <StatCell label="经过节点" value={`${pathHistory.length}`} />
          <StatCell label="战斗次数" value={`${combatCount}`} />
          <StatCell label="获得分数" value={`${score}`} />
          <StatCell label="生存时间" value={`${survivalSec}s`} />
        </div>

        {/* 路径回看 - 圆点序列 */}
        <div className="mb-4">
          <div className="text-2xs text-ink-muted mb-2">路径序列</div>
          <div className="flex flex-wrap gap-1 items-center max-h-32 overflow-auto">
            {pathHistory.map((entry, i) => {
              const meta = NODE_TYPE_META[entry.node.type];
              return (
                <div key={i} className="flex items-center gap-1">
                  <div
                    title={entry.node.label || meta?.label}
                    className={cn(
                      "w-2.5 h-2.5 rounded-full flex-shrink-0",
                      entry.isDecision && "ring-2 ring-accent ring-offset-1 ring-offset-canvas-elevated"
                    )}
                    style={{ backgroundColor: meta?.color ?? "#5C6678" }}
                  />
                  {entry.isDecision && entry.chosenLabel && (
                    <span className="text-2xs text-accent truncate max-w-[80px]">
                      ↳{entry.chosenLabel}
                    </span>
                  )}
                  {i < pathHistory.length - 1 && (
                    <ChevronRight className="w-2.5 h-2.5 text-ink-muted flex-shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 总结 */}
        <p className="text-xs text-ink-secondary mb-5 italic leading-relaxed">
          {summary}
        </p>

        <button
          type="button"
          onClick={onReset}
          className="btn-primary w-full"
        >
          <RotateCcw className="w-4 h-4" />
          重新验证
        </button>
      </div>
    </div>
  );
}

// ===== 子组件：统计单元 =====

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line-subtle bg-canvas-sunken/60 px-3 py-2">
      <div className="text-2xs text-ink-muted mb-0.5">{label}</div>
      <div className="text-base font-mono font-semibold text-ink-primary tabular-nums">
        {value}
      </div>
    </div>
  );
}

// ===== 子组件：空状态 =====

function EmptyFlow() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <Activity className="w-16 h-16 text-ink-muted mx-auto mb-4" />
      <p className="text-lg text-ink-secondary mb-1">当前机制图没有节点</p>
      <p className="text-2xs text-ink-muted">添加节点后即可进行机制验证</p>
    </div>
  );
}
