import type { NodeTypeMeta, EdgeTypeMeta, NodeType, EdgeType } from "@/types";
import {
  Zap,
  Play,
  Circle,
  GitBranch,
  Coins,
  Database,
  Shuffle,
  Sword,
  Sparkle,
  TrendingUp,
  Gift,
  Skull,
  RefreshCw,
  Bot,
  Users,
  StickyNote,
  // 世界观层
  Map as MapIcon,
  MapPin,
  Route,
  CloudSun,
  TreePine,
  // 内容元素层
  User,
  Package,
  Wand2,
  ScrollText,
  MessageSquare,
  Ghost,
  ShoppingBag,
  // 感官体验层
  Music,
  Volume2,
  Sparkles,
  Clapperboard,
  Video,
  LayoutGrid,
  // 系统机制层
  Timer,
  Dices,
  Crosshair,
  Egg,
  Save,
  Gauge,
} from "lucide-react";

/**
 * 节点类型元数据（40 种，覆盖游戏玩法设计的完整光谱）
 *
 * 10 大维度：
 * - logic（逻辑层）：事件/行为/状态/条件 —— 玩法流程骨架
 * - system（资源层）：资源/资源池/转换器 —— 经济系统
 * - growth（成长层）：属性/修饰符/等级 —— 角色成长
 * - feedback（反馈层）：奖励/惩罚/反馈循环 —— 体验设计
 * - social（社交/AI 层）：AI 行为/社交 —— 互动维度
 * - world（世界观层）：区域/地标/路径/天气/生态群落 —— 世界结构
 * - content（内容元素层）：角色/道具/技能/任务/对话/敌人/商店 —— 游戏内容
 * - sensory（感官体验层）：音乐/音效/特效/动画/镜头/UI —— 感官反馈
 * - sys（系统机制层）：计时器/随机/触发区/生成器/存档点/难度 —— 系统机制
 * - aux（辅助层）：便签 —— 设计注解
 */
export const NODE_TYPE_META: Record<NodeType, NodeTypeMeta> = {
  // ===== 逻辑层 =====
  event: {
    type: "event",
    label: "事件",
    category: "logic",
    icon: "zap",
    color: "#FB923C",
    description: "触发玩法逻辑的事件，如：玩家进入区域、击杀敌人、时间到点",
    ports: { inputs: 0, outputs: 1 },
  },
  action: {
    type: "action",
    label: "行为",
    category: "logic",
    icon: "play",
    color: "#A3E635",
    description: "执行具体操作，如：造成伤害、播放动画、生成物体",
    ports: { inputs: 1, outputs: 1 },
  },
  state: {
    type: "state",
    label: "状态",
    category: "logic",
    icon: "circle",
    color: "#60A5FA",
    description: "记录当前状态，如：玩家存活、Boss 阶段、天气",
    ports: { inputs: 1, outputs: 1 },
  },
  condition: {
    type: "condition",
    label: "条件",
    category: "logic",
    icon: "git-branch",
    color: "#C084FC",
    description: "判断分支，如：血量 > 0、等级 >= 10、拥有钥匙",
    ports: { inputs: 1, outputs: 2 },
  },

  // ===== 资源层 =====
  resource: {
    type: "resource",
    label: "资源",
    category: "system",
    icon: "coins",
    color: "#FBBF24",
    description: "可累积的资源，如：金币、经验、材料、体力",
    ports: { inputs: 1, outputs: 1 },
  },
  pool: {
    type: "pool",
    label: "资源池",
    category: "system",
    icon: "database",
    color: "#34D399",
    description: "存储与限制资源，如：背包容量、能量上限、库存",
    ports: { inputs: 2, outputs: 1 },
  },
  converter: {
    type: "converter",
    label: "转换器",
    category: "system",
    icon: "shuffle",
    color: "#F472B6",
    description: "将输入转换为输出，如：金币转经验、材料合成装备",
    ports: { inputs: 2, outputs: 1 },
  },

  // ===== 成长层 =====
  attribute: {
    type: "attribute",
    label: "属性",
    category: "growth",
    icon: "sword",
    color: "#F43F5E",
    description: "角色能力维度，如：攻击力、防御力、暴击率、移动速度",
    ports: { inputs: 1, outputs: 1 },
  },
  modifier: {
    type: "modifier",
    label: "修饰符",
    category: "growth",
    icon: "sparkle",
    color: "#8B5CF6",
    description: "临时或永久增益，如：Buff、Debuff、装备加成、天赋",
    ports: { inputs: 1, outputs: 1 },
  },
  level: {
    type: "level",
    label: "等级",
    category: "growth",
    icon: "trending-up",
    color: "#10B981",
    description: "经验驱动的成长节点，如：角色等级、技能等级、声望等级",
    ports: { inputs: 1, outputs: 1 },
  },

  // ===== 反馈层 =====
  reward: {
    type: "reward",
    label: "奖励",
    category: "feedback",
    icon: "gift",
    color: "#EAB308",
    description: "正反馈输出，如：掉落、宝箱、成就解锁、经验奖励",
    ports: { inputs: 1, outputs: 1 },
  },
  penalty: {
    type: "penalty",
    label: "惩罚",
    category: "feedback",
    icon: "skull",
    color: "#EF4444",
    description: "负反馈，如：死亡掉落、耐久损耗、冷却时间、惩罚区",
    ports: { inputs: 1, outputs: 1 },
  },
  feedback: {
    type: "feedback",
    label: "反馈循环",
    category: "feedback",
    icon: "refresh-cw",
    color: "#06B6D4",
    description: "体验感知回路，如：连击系数、难度自适应、心流调节",
    ports: { inputs: 2, outputs: 1 },
  },

  // ===== 社交 / AI 层 =====
  ai_behavior: {
    type: "ai_behavior",
    label: "AI 行为",
    category: "social",
    icon: "bot",
    color: "#6366F1",
    description: "NPC 决策行为，如：巡逻、追击、逃跑、合作、Boss 技能选择",
    ports: { inputs: 1, outputs: 1 },
  },
  social: {
    type: "social",
    label: "社交",
    category: "social",
    icon: "users",
    color: "#D946EF",
    description: "玩家间互动，如：组队、交易、PvP、排行榜、公会",
    ports: { inputs: 1, outputs: 1 },
  },

  // ===== 世界观层 =====
  region: {
    type: "region",
    label: "区域",
    category: "world",
    icon: "map",
    color: "#059669", // 深翠绿
    description: "地图区域，如：新手村、Boss 房、安全区、副本、主城",
    ports: { inputs: 1, outputs: 1 },
  },
  landmark: {
    type: "landmark",
    label: "地标",
    category: "world",
    icon: "map-pin",
    color: "#DC2626", // 深红
    description: "关键地点，如：传送点、NPC 位置、宝箱点、隐藏地点",
    ports: { inputs: 1, outputs: 1 },
  },
  path: {
    type: "path",
    label: "路径",
    category: "world",
    icon: "route",
    color: "#7C3AED", // 深紫
    description: "连接区域的道路/传送网络，如：山路、传送门、飞行路线",
    ports: { inputs: 2, outputs: 1 },
  },
  weather: {
    type: "weather",
    label: "天气",
    category: "world",
    icon: "cloud-sun",
    color: "#0EA5E9", // 天空蓝
    description: "动态环境状态，如：雨天、夜晚、沙暴、雷雨、四季",
    ports: { inputs: 1, outputs: 1 },
  },
  biome: {
    type: "biome",
    label: "生态群落",
    category: "world",
    icon: "tree-pine",
    color: "#65A30D", // 草绿
    description: "区域类型，如：森林、沙漠、雪山、海洋、洞穴、火山",
    ports: { inputs: 1, outputs: 1 },
  },

  // ===== 内容元素层 =====
  character: {
    type: "character",
    label: "角色",
    category: "content",
    icon: "user",
    color: "#EC4899", // 粉红
    description: "NPC/玩家/敌人单位，如：商人、任务 NPC、宠物、雇佣兵",
    ports: { inputs: 1, outputs: 1 },
  },
  item: {
    type: "item",
    label: "道具",
    category: "content",
    icon: "package",
    color: "#F59E0B", // 琥珀
    description: "可携带物品，如：武器、药水、钥匙、任务物品、材料",
    ports: { inputs: 1, outputs: 1 },
  },
  skill: {
    type: "skill",
    label: "技能",
    category: "content",
    icon: "wand-2",
    color: "#9333EA", // 紫罗兰
    description: "主动/被动能力，如：火球术、闪避、被动天赋、终极技能",
    ports: { inputs: 1, outputs: 1 },
  },
  quest: {
    type: "quest",
    label: "任务",
    category: "content",
    icon: "scroll-text",
    color: "#CA8A04", // 暗金
    description: "目标链，如：主线、支线、每日、周常、成就、隐藏任务",
    ports: { inputs: 1, outputs: 1 },
  },
  dialogue: {
    type: "dialogue",
    label: "对话",
    category: "content",
    icon: "message-square",
    color: "#0891B2", // 深青
    description: "对话树/剧情分支，如：NPC 对白、过场剧情、选项分支",
    ports: { inputs: 1, outputs: 2 },
  },
  enemy: {
    type: "enemy",
    label: "敌人",
    category: "content",
    icon: "ghost",
    color: "#B91C1C", // 深红
    description: "战斗单位，如：小怪、精英、Boss、minion、守卫",
    ports: { inputs: 1, outputs: 1 },
  },
  shop: {
    type: "shop",
    label: "商店",
    category: "content",
    icon: "shopping-bag",
    color: "#D97706", // 暗橙
    description: "交易场所，如：商店、拍卖行、神秘商人、限时商城",
    ports: { inputs: 1, outputs: 1 },
  },

  // ===== 感官体验层 =====
  music: {
    type: "music",
    label: "音乐",
    category: "sensory",
    icon: "music",
    color: "#A855F7", // 浅紫
    description: "BGM 切换/动态音乐，如：战斗音乐、探索音乐、Boss 主题曲",
    ports: { inputs: 1, outputs: 1 },
  },
  sfx: {
    type: "sfx",
    label: "音效",
    category: "sensory",
    icon: "volume-2",
    color: "#3B82F6", // 蓝
    description: "事件音效，如：攻击音、UI 音、环境音、脚步声",
    ports: { inputs: 1, outputs: 1 },
  },
  fx: {
    type: "fx",
    label: "特效",
    category: "sensory",
    icon: "sparkles",
    color: "#F472B6", // 粉
    description: "视觉特效，如：粒子、震屏、慢动作、闪光、命中特效",
    ports: { inputs: 1, outputs: 1 },
  },
  animation: {
    type: "animation",
    label: "动画",
    category: "sensory",
    icon: "clapperboard",
    color: "#F97316", // 橙
    description: "角色动画，如：攻击动画、待机、死亡、技能动画",
    ports: { inputs: 1, outputs: 1 },
  },
  camera: {
    type: "camera",
    label: "镜头",
    category: "sensory",
    icon: "video",
    color: "#14B8A6", // 青绿
    description: "镜头语言，如：特写、跟随、震动、转场、慢镜头",
    ports: { inputs: 1, outputs: 1 },
  },
  ui: {
    type: "ui",
    label: "UI",
    category: "sensory",
    icon: "layout-grid",
    color: "#64748B", // 石板灰
    description: "界面元素，如：HUD、菜单、提示框、小地图、伤害数字",
    ports: { inputs: 1, outputs: 1 },
  },

  // ===== 系统机制层 =====
  timer: {
    type: "timer",
    label: "计时器",
    category: "system",
    icon: "timer",
    color: "#0284C7", // 深天蓝
    description: "倒计时/CD/刷新，如：技能 CD、活动倒计时、刷新间隔",
    ports: { inputs: 1, outputs: 1 },
  },
  rng: {
    type: "rng",
    label: "随机数",
    category: "system",
    icon: "dices",
    color: "#7E22CE", // 深紫
    description: "概率事件，如：暴击概率、掉落概率、抽卡、随机事件",
    ports: { inputs: 1, outputs: 1 },
  },
  trigger_zone: {
    type: "trigger_zone",
    label: "触发区域",
    category: "system",
    icon: "crosshair",
    color: "#DB2777", // 深粉
    description: "空间触发器，如：进入区域触发剧情、离开区域触发事件",
    ports: { inputs: 0, outputs: 1 },
  },
  spawner: {
    type: "spawner",
    label: "生成器",
    category: "system",
    icon: "egg",
    color: "#15803D", // 深绿
    description: "动态生成，如：怪物刷新点、物品掉落点、NPC 召唤点",
    ports: { inputs: 1, outputs: 1 },
  },
  savepoint: {
    type: "savepoint",
    label: "存档点",
    category: "system",
    icon: "save",
    color: "#4F46E5", // 靛蓝
    description: "存档/复活点，如：篝火、检查点、复活神殿",
    ports: { inputs: 1, outputs: 1 },
  },
  difficulty: {
    type: "difficulty",
    label: "难度调节",
    category: "system",
    icon: "gauge",
    color: "#B45309", // 深琥珀
    description: "动态难度，如：DDA、难度等级、敌人强度缩放",
    ports: { inputs: 2, outputs: 1 },
  },

  // ===== 辅助层 =====
  note: {
    type: "note",
    label: "便签",
    category: "aux",
    icon: "sticky-note",
    color: "#FDE047",
    description: "设计注解，记录设计思路、待办、风险点，不参与模拟运行",
    ports: { inputs: 0, outputs: 0 },
  },
};

/**
 * 边类型元数据（17 种语义化关系，5 大类）
 *
 * - communication（通信类）：invoke/subscribe/emit/pass —— 现代系统语义，单向
 * - dataflow（数据流类）：produce/consume/transform/modify —— 单向
 * - structure（结构类）：compose/reference/belong —— 无向
 * - control（控制类）：enable/inhibit/branch —— 单向
 * - interaction（交互类）：cooperate/interact/oppose —— 双向
 */
export const EDGE_TYPE_META: Record<EdgeType, EdgeTypeMeta> = {
  // ===== 通信类（单向）=====
  invoke: {
    type: "invoke",
    label: "调用",
    color: "#A855F7",
    dashed: false,
    description: "A 调用 B 的能力（skill→action, ui→action）",
    category: "communication",
    direction: "unidirectional",
    defaultRoles: { source: "caller", target: "callee" },
    defaultStrength: "normal",
  },
  subscribe: {
    type: "subscribe",
    label: "订阅",
    color: "#22D3EE",
    dashed: false,
    description: "A 监听 B 的变化（condition→state, ai_behavior→state）",
    category: "communication",
    direction: "unidirectional",
    defaultRoles: { source: "subscriber", target: "publisher" },
    defaultStrength: "weak",
  },
  emit: {
    type: "emit",
    label: "发射",
    color: "#FB923C",
    dashed: false,
    description: "A 发出事件供 B 接收（event→action, trigger_zone→event）",
    category: "communication",
    direction: "unidirectional",
    defaultRoles: { source: "emitter", target: "listener" },
    defaultStrength: "strong",
  },
  pass: {
    type: "pass",
    label: "传递",
    color: "#60A5FA",
    dashed: false,
    description: "A 把数据/值传给 B（action→action, converter→resource）",
    category: "communication",
    direction: "unidirectional",
    defaultRoles: { source: "sender", target: "receiver" },
    defaultStrength: "normal",
  },

  // ===== 数据流类（单向）=====
  produce: {
    type: "produce",
    label: "产出",
    color: "#A3E635",
    dashed: false,
    description: "A 产出 B（action→resource, spawner→enemy）",
    category: "dataflow",
    direction: "unidirectional",
    defaultRoles: { source: "producer", target: "product" },
    defaultStrength: "strong",
  },
  consume: {
    type: "consume",
    label: "消耗",
    color: "#F97316",
    dashed: true,
    description: "A 消耗 B（action→pool）",
    category: "dataflow",
    direction: "unidirectional",
    defaultRoles: { source: "consumer", target: "resource" },
    defaultStrength: "normal",
  },
  transform: {
    type: "transform",
    label: "转换",
    color: "#F472B6",
    dashed: false,
    description: "A 转换为 B（converter→resource）",
    category: "dataflow",
    direction: "unidirectional",
    defaultRoles: { source: "input", target: "output" },
    defaultStrength: "normal",
  },
  modify: {
    type: "modify",
    label: "修改",
    color: "#A78BFA",
    dashed: false,
    description: "A 修改 B 的值（modifier→attribute）",
    category: "dataflow",
    direction: "unidirectional",
    defaultRoles: { source: "modifier", target: "target" },
    defaultStrength: "normal",
  },

  // ===== 结构类（无向）=====
  compose: {
    type: "compose",
    label: "组合",
    color: "#15803D",
    dashed: false,
    description: "A 由 B 组成（quest↔subquest, region↔landmark）",
    category: "structure",
    direction: "undirected",
    defaultRoles: { source: "whole", target: "part" },
    defaultStrength: "strong",
  },
  reference: {
    type: "reference",
    label: "引用",
    color: "#0891B2",
    dashed: true,
    description: "A 引用 B 的定义（skill↔item, attribute↔modifier）",
    category: "structure",
    direction: "undirected",
    defaultRoles: { source: "referrer", target: "referee" },
    defaultStrength: "weak",
  },
  belong: {
    type: "belong",
    label: "归属",
    color: "#65A30D",
    dashed: false,
    description: "A 属于 B（item↔character, enemy↔region）",
    category: "structure",
    direction: "undirected",
    defaultRoles: { source: "member", target: "container" },
    defaultStrength: "normal",
  },

  // ===== 控制类（单向）=====
  enable: {
    type: "enable",
    label: "启用",
    color: "#14B8A6",
    dashed: false,
    description: "A 解锁 B（level→skill）",
    category: "control",
    direction: "unidirectional",
    defaultRoles: { source: "enabler", target: "enabled" },
    defaultStrength: "strong",
  },
  inhibit: {
    type: "inhibit",
    label: "抑制",
    color: "#E11D48",
    dashed: true,
    description: "A 压制 B（penalty→action，负反馈）",
    category: "control",
    direction: "unidirectional",
    defaultRoles: { source: "inhibitor", target: "inhibited" },
    defaultStrength: "strong",
  },
  branch: {
    type: "branch",
    label: "分支",
    color: "#C084FC",
    dashed: false,
    description: "A 根据 B 分支（condition→action）",
    category: "control",
    direction: "unidirectional",
    defaultRoles: { source: "decision", target: "branch" },
    defaultStrength: "normal",
  },

  // ===== 交互类（双向）=====
  cooperate: {
    type: "cooperate",
    label: "协作",
    color: "#D946EF",
    dashed: false,
    description: "A 与 B 协同（character↔character，组队/合作）",
    category: "interaction",
    direction: "bidirectional",
    defaultRoles: { source: "ally", target: "ally" },
    defaultStrength: "strong",
  },
  interact: {
    type: "interact",
    label: "互动",
    color: "#EC4899",
    dashed: false,
    description: "A 与 B 互动（player↔npc, player↔item）",
    category: "interaction",
    direction: "bidirectional",
    defaultRoles: { source: "initiator", target: "receiver" },
    defaultStrength: "normal",
  },
  oppose: {
    type: "oppose",
    label: "对抗",
    color: "#B91C1C",
    dashed: true,
    description: "A 与 B 对抗（player↔enemy, pvp）",
    category: "interaction",
    direction: "bidirectional",
    defaultRoles: { source: "attacker", target: "defender" },
    defaultStrength: "strong",
  },
};

/**
 * 旧边类型 → 新边类型迁移映射表
 * 用于加载历史数据时自动迁移
 */
export const LEGACY_EDGE_TYPE_MIGRATION: Record<string, EdgeType> = {
  trigger: "emit",
  depend: "pass",
  convert: "transform",
  feedback: "subscribe",
  spawn: "produce",
  play: "invoke",
  teleport: "pass",
  // 保留同名的：produce/consume/modify/enable/inhibit 直接对应
  produce: "produce",
  consume: "consume",
  modify: "modify",
  enable: "enable",
  inhibit: "inhibit",
};

/**
 * 将旧边类型迁移为新边类型。已是新类型则原样返回。
 */
export function migrateEdgeType(type: string): EdgeType {
  if (type in EDGE_TYPE_META) return type as EdgeType;
  return LEGACY_EDGE_TYPE_MIGRATION[type] ?? "pass";
}

/**
 * 边类型库（按类别分组，用于 UI 选择器）
 */
export const EDGE_LIBRARY = [
  {
    category: "通信类",
    categoryKey: "communication" as const,
    types: (["invoke", "subscribe", "emit", "pass"] as EdgeType[]).map(
      (t) => EDGE_TYPE_META[t]
    ),
  },
  {
    category: "数据流类",
    categoryKey: "dataflow" as const,
    types: (["produce", "consume", "transform", "modify"] as EdgeType[]).map(
      (t) => EDGE_TYPE_META[t]
    ),
  },
  {
    category: "结构类（无向）",
    categoryKey: "structure" as const,
    types: (["compose", "reference", "belong"] as EdgeType[]).map(
      (t) => EDGE_TYPE_META[t]
    ),
  },
  {
    category: "控制类",
    categoryKey: "control" as const,
    types: (["enable", "inhibit", "branch"] as EdgeType[]).map(
      (t) => EDGE_TYPE_META[t]
    ),
  },
  {
    category: "交互类（双向）",
    categoryKey: "interaction" as const,
    types: (["cooperate", "interact", "oppose"] as EdgeType[]).map(
      (t) => EDGE_TYPE_META[t]
    ),
  },
];

// 图标映射
export const ICON_MAP = {
  zap: Zap,
  play: Play,
  circle: Circle,
  "git-branch": GitBranch,
  coins: Coins,
  database: Database,
  shuffle: Shuffle,
  sword: Sword,
  sparkle: Sparkle,
  "trending-up": TrendingUp,
  gift: Gift,
  skull: Skull,
  "refresh-cw": RefreshCw,
  bot: Bot,
  users: Users,
  "sticky-note": StickyNote,
  // 世界观层
  map: MapIcon,
  "map-pin": MapPin,
  route: Route,
  "cloud-sun": CloudSun,
  "tree-pine": TreePine,
  // 内容元素层
  user: User,
  package: Package,
  "wand-2": Wand2,
  "scroll-text": ScrollText,
  "message-square": MessageSquare,
  ghost: Ghost,
  "shopping-bag": ShoppingBag,
  // 感官体验层
  music: Music,
  "volume-2": Volume2,
  sparkles: Sparkles,
  clapperboard: Clapperboard,
  video: Video,
  "layout-grid": LayoutGrid,
  // 系统机制层
  timer: Timer,
  dices: Dices,
  crosshair: Crosshair,
  egg: Egg,
  save: Save,
  gauge: Gauge,
} as const;

export function getNodeIcon(type: NodeType) {
  const meta = NODE_TYPE_META[type];
  const Icon = ICON_MAP[meta.icon as keyof typeof ICON_MAP];
  return Icon;
}

// 按类别分组的节点类型（用于节点库）
export const NODE_LIBRARY = [
  {
    category: "逻辑层",
    categoryKey: "logic" as const,
    types: (["event", "action", "state", "condition"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "资源层",
    categoryKey: "system" as const,
    types: (
      ["resource", "pool", "converter", "timer", "rng", "trigger_zone", "spawner", "savepoint", "difficulty"] as NodeType[]
    ).map((t) => NODE_TYPE_META[t]),
  },
  {
    category: "成长层",
    categoryKey: "growth" as const,
    types: (["attribute", "modifier", "level"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "反馈层",
    categoryKey: "feedback" as const,
    types: (["reward", "penalty", "feedback"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "社交 / AI",
    categoryKey: "social" as const,
    types: (["ai_behavior", "social"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "世界观",
    categoryKey: "world" as const,
    types: (["region", "landmark", "path", "weather", "biome"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "内容元素",
    categoryKey: "content" as const,
    types: (
      ["character", "item", "skill", "quest", "dialogue", "enemy", "shop"] as NodeType[]
    ).map((t) => NODE_TYPE_META[t]),
  },
  {
    category: "感官体验",
    categoryKey: "sensory" as const,
    types: (["music", "sfx", "fx", "animation", "camera", "ui"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "辅助",
    categoryKey: "aux" as const,
    types: (["note"] as NodeType[]).map((t) => NODE_TYPE_META[t]),
  },
];

/**
 * 玩法设计师视角的节点库分组（NODE_LIBRARY_BY_GAMEPLAY）
 *
 * 按玩法设计师的思维习惯重新归类，不增删节点，仅重新分组：
 * - 战斗系统：玩法流程骨架（事件/行为/条件/状态）+ 战斗单位 + 技能 + AI/社交
 * - 成长系统：属性成长 + 修饰 + 等级 + 反馈循环（奖励/惩罚/反馈）
 * - 经济系统：资源流转（资源/池/转换器）+ 交易（商店/道具）
 * - 任务与叙事：任务链 + 对话 + 地标
 * - 关卡与探索：世界结构 + 系统机制（区域/路径/天气/群落/触发区/生成器/存档点/难度/计时器/随机）
 * - 表现层：感官反馈（音乐/音效/特效/动画/镜头/UI）
 * - 辅助：设计注解
 *
 * 说明：原分组建议中的 "npc" 在 NODE_TYPE_META 中不存在（最接近的 character 已归入战斗系统）；
 * 同时 "social"（社交：组队/PvP/交易/排行榜/公会）未被原建议覆盖，此处归入"战斗系统"，
 * 因为 PvP 与组队战斗是社交类型中最具系统性的玩法机制。由此保证 40 种节点全量覆盖。
 */
export const NODE_LIBRARY_BY_GAMEPLAY = [
  {
    category: "战斗系统",
    categoryKey: "combat" as const,
    types: (
      [
        "event",
        "action",
        "condition",
        "state",
        "enemy",
        "character",
        "skill",
        "ai_behavior",
        "social",
      ] as NodeType[]
    ).map((t) => NODE_TYPE_META[t]),
  },
  {
    category: "成长系统",
    categoryKey: "growth" as const,
    types: (
      ["attribute", "modifier", "level", "reward", "penalty", "feedback"] as NodeType[]
    ).map((t) => NODE_TYPE_META[t]),
  },
  {
    category: "经济系统",
    categoryKey: "economy" as const,
    types: (["resource", "pool", "converter", "shop", "item"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "任务与叙事",
    categoryKey: "narrative" as const,
    types: (["quest", "dialogue", "landmark"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "关卡与探索",
    categoryKey: "exploration" as const,
    types: (
      [
        "region",
        "path",
        "weather",
        "biome",
        "trigger_zone",
        "spawner",
        "savepoint",
        "difficulty",
        "timer",
        "rng",
      ] as NodeType[]
    ).map((t) => NODE_TYPE_META[t]),
  },
  {
    category: "表现层",
    categoryKey: "presentation" as const,
    types: (["music", "sfx", "fx", "animation", "camera", "ui"] as NodeType[]).map(
      (t) => NODE_TYPE_META[t]
    ),
  },
  {
    category: "辅助",
    categoryKey: "aux" as const,
    types: (["note"] as NodeType[]).map((t) => NODE_TYPE_META[t]),
  },
];
