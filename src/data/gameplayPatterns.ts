import type { NodeType, EdgeType, AttributeType } from "@/types";

/**
 * 玩法积木库 —— 预制经典玩法模式
 *
 * 每个积木 = 一组已连好的节点 + 预设数值 + 玩家体验描述。
 * 用户一键拖入画布改参数，而非从零搭建。
 *
 * 节点 position 为相对坐标（积木内部布局，基准 0,0），
 * x 范围 0–400，y 范围 0–300；插入时由调用方叠加放置点偏移。
 * edges 中的 source/target 为 nodes 数组的索引。
 */

export interface GameplayPatternNode {
  type: NodeType;
  label: string; // 游戏化命名（如"宝箱"而非"resource"）
  description?: string; // 这个节点在玩法中的作用
  position: { x: number; y: number };
  data?: Record<string, unknown>;
}

export interface GameplayPatternEdge {
  source: number; // 索引到 nodes 数组
  target: number;
  type: EdgeType;
  label?: string;
}

export interface GameplayPatternAttribute {
  name: string;
  type: AttributeType;
  value: string;
  description?: string;
}

export interface GameplayPatternFormula {
  attributeName: string;
  expression: string;
  description?: string;
}

export type PatternCategory =
  | "combat" // 战斗
  | "progression" // 成长
  | "economy" // 经济
  | "exploration" // 探索
  | "narrative" // 叙事
  | "social" // 社交
  | "roguelike" // Roguelike
  | "strategy"; // 策略

export interface GameplayPattern {
  id: string;
  name: string; // 玩法名（如"击杀奖励循环"）
  category: PatternCategory;
  icon: string; // lucide 图标名
  description: string; // 一句话描述这个玩法
  playerExperience: string; // 玩家会怎么感受
  difficulty: "easy" | "medium" | "hard"; // 搭建难度
  nodes: GameplayPatternNode[];
  edges: GameplayPatternEdge[];
  suggestedAttributes?: GameplayPatternAttribute[];
  suggestedFormulas?: GameplayPatternFormula[];
}

export const PATTERN_CATEGORY_LABEL: Record<PatternCategory, string> = {
  combat: "战斗",
  progression: "成长",
  economy: "经济",
  exploration: "探索",
  narrative: "叙事",
  social: "社交",
  roguelike: "Roguelike",
  strategy: "策略",
};

export const PATTERN_CATEGORY_COLOR: Record<PatternCategory, string> = {
  combat: "#EF4444",
  progression: "#10B981",
  economy: "#FBBF24",
  exploration: "#8B5CF6",
  narrative: "#0891B2",
  social: "#D946EF",
  roguelike: "#7E22CE",
  strategy: "#6366F1",
};

export const PATTERN_CATEGORY_ORDER: PatternCategory[] = [
  "combat",
  "progression",
  "economy",
  "exploration",
  "narrative",
  "social",
  "roguelike",
  "strategy",
];

export const GAMEPLAY_PATTERNS: GameplayPattern[] = [
  // ===== 战斗类 (combat) =====
  {
    id: "kill-reward-loop",
    name: "击杀奖励循环",
    category: "combat",
    icon: "swords",
    description: "击杀敌人触发奖励计算，产出经验与掉落并回流为成长感",
    playerExperience: "玩家击杀敌人获得经验和掉落，形成成长循环",
    difficulty: "easy",
    nodes: [
      { type: "event", label: "击杀敌人", description: "战斗胜利的触发点", position: { x: 0, y: 80 } },
      { type: "action", label: "计算奖励", description: "按等级与难度结算", position: { x: 110, y: 80 } },
      { type: "reward", label: "经验宝箱", description: "固定经验产出", position: { x: 220, y: 20 } },
      { type: "reward", label: "掉落宝物", description: "概率掉落", position: { x: 220, y: 140 } },
      { type: "feedback", label: "成长爽感", description: "正反馈回流", position: { x: 340, y: 80 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "pass", label: "经验" },
      { source: 1, target: 3, type: "pass", label: "掉落" },
      { source: 2, target: 4, type: "subscribe" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "enemy_hp", type: "number", value: "100", description: "敌人血量" },
      { name: "kill_exp", type: "number", value: "50", description: "基础击杀经验" },
      { name: "drop_rate", type: "number", value: "0.3", description: "掉落概率" },
      { name: "reward_exp", type: "number", value: "50", description: "最终经验奖励" },
    ],
    suggestedFormulas: [
      { attributeName: "reward_exp", expression: "@level * 10 + 50", description: "随等级线性成长" },
    ],
  },
  {
    id: "boss-three-phase",
    name: "Boss 战三阶段",
    category: "combat",
    icon: "crown",
    description: "Boss 血量分阶段切换行为，最后狂暴带来高潮",
    playerExperience: "Boss 随血量下降逐阶段解锁技能，最后狂暴带来紧张高潮",
    difficulty: "hard",
    nodes: [
      { type: "enemy", label: "Boss", description: "多阶段首领", position: { x: 0, y: 80 } },
      { type: "condition", label: "血量 > 60%", description: "阶段一门槛", position: { x: 100, y: 80 } },
      { type: "action", label: "阶段一·常规", description: "基础技能轮换", position: { x: 210, y: 20 } },
      { type: "condition", label: "血量 > 30%", description: "阶段二门槛", position: { x: 210, y: 100 } },
      { type: "action", label: "阶段二·技能", description: "新增范围技", position: { x: 320, y: 60 } },
      { type: "condition", label: "血量 > 0", description: "狂暴门槛", position: { x: 210, y: 180 } },
      { type: "action", label: "阶段三·狂暴", description: "攻速与伤害飙升", position: { x: 320, y: 220 } },
    ],
    edges: [
      { source: 0, target: 1, type: "subscribe" },
      { source: 1, target: 2, type: "branch" },
      { source: 1, target: 3, type: "branch" },
      { source: 3, target: 4, type: "branch" },
      { source: 3, target: 5, type: "branch" },
      { source: 5, target: 6, type: "branch" },
    ],
    suggestedAttributes: [
      { name: "boss_hp", type: "number", value: "10000", description: "Boss 当前血量" },
      { name: "boss_hp_max", type: "number", value: "10000" },
      { name: "phase2_threshold", type: "number", value: "0.6" },
      { name: "phase3_threshold", type: "number", value: "0.3" },
      { name: "enrage_atk", type: "number", value: "200", description: "狂暴攻击力" },
    ],
    suggestedFormulas: [
      { attributeName: "enrage_atk", expression: "@boss_hp_max * 0.02 + 100", description: "随最大血量缩放" },
    ],
  },
  {
    id: "combo-system",
    name: "连击系统",
    category: "combat",
    icon: "zap",
    description: "连续命中累计连击，突破阈值后爆发奖励",
    playerExperience: "连续命中累计连击，突破阈值后爆发奖励，营造爽快节奏",
    difficulty: "medium",
    nodes: [
      { type: "event", label: "命中", position: { x: 0, y: 80 } },
      { type: "action", label: "连击 +1", description: "累计连击数", position: { x: 110, y: 80 } },
      { type: "condition", label: "连击 > 10", description: "奖励阈值", position: { x: 220, y: 80 } },
      { type: "reward", label: "连击奖励", description: "额外得分/伤害", position: { x: 330, y: 20 } },
      { type: "feedback", label: "爽快感", position: { x: 330, y: 140 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "branch" },
      { source: 2, target: 4, type: "branch" },
    ],
    suggestedAttributes: [
      { name: "combo_count", type: "number", value: "0" },
      { name: "combo_threshold", type: "number", value: "10" },
      { name: "combo_bonus", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "combo_bonus", expression: "@combo_count * 5", description: "连击越高奖励越多" },
    ],
  },
  {
    id: "elemental-reaction",
    name: "元素反应",
    category: "combat",
    icon: "flame",
    description: "不同元素组合触发反应，放大伤害产出",
    playerExperience: "元素组合触发反应放大伤害，鼓励玩家策略性搭配",
    difficulty: "medium",
    nodes: [
      { type: "action", label: "火元素", position: { x: 0, y: 20 } },
      { type: "action", label: "水元素", position: { x: 0, y: 140 } },
      { type: "converter", label: "蒸发反应", description: "元素合成", position: { x: 110, y: 80 } },
      { type: "reward", label: "2 倍伤害", description: "反应加成", position: { x: 220, y: 80 } },
      { type: "feedback", label: "策略感", position: { x: 330, y: 80 } },
    ],
    edges: [
      { source: 0, target: 2, type: "pass" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "transform" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "fire_dmg", type: "number", value: "50" },
      { name: "water_dmg", type: "number", value: "50" },
      { name: "vaporize_mult", type: "number", value: "2" },
      { name: "reaction_dmg", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "reaction_dmg", expression: "(@fire_dmg + @water_dmg) * @vaporize_mult" },
    ],
  },

  // ===== 成长类 (progression) =====
  {
    id: "level-up",
    name: "等级升级",
    category: "progression",
    icon: "trending-up",
    description: "经验填满后升级，全属性同步提升",
    playerExperience: "经验填满后升级，属性随之提升，给玩家清晰的成长反馈",
    difficulty: "easy",
    nodes: [
      { type: "event", label: "获得经验", position: { x: 0, y: 100 } },
      { type: "resource", label: "经验槽", description: "累积经验", position: { x: 100, y: 100 } },
      { type: "condition", label: "经验已满", position: { x: 200, y: 100 } },
      { type: "action", label: "升级", position: { x: 300, y: 100 } },
      { type: "level", label: "角色等级", position: { x: 400, y: 100 } },
      { type: "reward", label: "属性提升", description: "全属性强化", position: { x: 300, y: 20 } },
    ],
    edges: [
      { source: 0, target: 1, type: "produce" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "branch" },
      { source: 3, target: 4, type: "emit" },
      { source: 3, target: 5, type: "produce" },
    ],
    suggestedAttributes: [
      { name: "exp_gain", type: "number", value: "50" },
      { name: "exp_max", type: "number", value: "1000" },
      { name: "level", type: "number", value: "1" },
      { name: "stat_bonus", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "exp_max", expression: "@level * 1000", description: "升级所需经验随等级增长" },
      { attributeName: "stat_bonus", expression: "@level * 5" },
    ],
  },
  {
    id: "skill-tree-unlock",
    name: "技能树解锁",
    category: "progression",
    icon: "git-branch",
    description: "达到等级并满足前置后解锁新技能",
    playerExperience: "达到等级并满足前置后解锁新技能，拓展玩家能力边界",
    difficulty: "medium",
    nodes: [
      { type: "level", label: "等级 5", description: "解锁门槛", position: { x: 0, y: 80 } },
      { type: "condition", label: "前置技能", position: { x: 110, y: 80 } },
      { type: "action", label: "解锁技能", position: { x: 220, y: 80 } },
      { type: "skill", label: "新技能", position: { x: 330, y: 80 } },
      { type: "reward", label: "能力拓展", position: { x: 330, y: 0 } },
    ],
    edges: [
      { source: 0, target: 1, type: "subscribe" },
      { source: 1, target: 2, type: "branch" },
      { source: 2, target: 3, type: "enable" },
      { source: 2, target: 4, type: "produce" },
    ],
    suggestedAttributes: [
      { name: "req_level", type: "number", value: "5" },
      { name: "skill_points", type: "number", value: "1" },
      { name: "unlock_cost", type: "number", value: "1" },
      { name: "skill_tier", type: "number", value: "1" },
    ],
    suggestedFormulas: [
      { attributeName: "req_level", expression: "@skill_tier * 5" },
    ],
  },
  {
    id: "equipment-enhance",
    name: "装备强化",
    category: "progression",
    icon: "hammer",
    description: "消耗材料强化装备，属性跃升带来变强感",
    playerExperience: "消耗材料强化装备，属性跃升带来直接的变强满足感",
    difficulty: "medium",
    nodes: [
      { type: "resource", label: "强化石", position: { x: 0, y: 20 } },
      { type: "item", label: "待强化装备", position: { x: 0, y: 140 } },
      { type: "converter", label: "强化台", description: "材料转属性", position: { x: 110, y: 80 } },
      { type: "modifier", label: "属性 +", description: "装备加成", position: { x: 220, y: 80 } },
      { type: "feedback", label: "变强感", position: { x: 330, y: 80 } },
    ],
    edges: [
      { source: 0, target: 2, type: "consume" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "transform" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "stone_count", type: "number", value: "10" },
      { name: "enhance_level", type: "number", value: "0" },
      { name: "atk_bonus", type: "number", value: "0" },
      { name: "success_rate", type: "number", value: "0.9" },
    ],
    suggestedFormulas: [
      { attributeName: "atk_bonus", expression: "@enhance_level * 10" },
    ],
  },
  {
    id: "talent-system",
    name: "天赋系统",
    category: "progression",
    icon: "sparkles",
    description: "每次升级获得天赋点，在分支间抉择塑造构筑",
    playerExperience: "每次升级获得天赋点，在分支间抉择塑造独特构筑",
    difficulty: "medium",
    nodes: [
      { type: "level", label: "每次升级", position: { x: 0, y: 80 } },
      { type: "action", label: "获得天赋点", position: { x: 110, y: 80 } },
      { type: "condition", label: "选择分支", position: { x: 220, y: 80 } },
      { type: "modifier", label: "天赋加成 A", position: { x: 330, y: 20 } },
      { type: "modifier", label: "天赋加成 B", position: { x: 330, y: 140 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "branch" },
      { source: 2, target: 4, type: "branch" },
    ],
    suggestedAttributes: [
      { name: "talent_points", type: "number", value: "1" },
      { name: "talent_tier", type: "number", value: "1" },
      { name: "bonus_value", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "bonus_value", expression: "@talent_tier * 3" },
    ],
  },

  // ===== 经济类 (economy) =====
  {
    id: "gather-craft-sell",
    name: "采集-加工-出售",
    category: "economy",
    icon: "coins",
    description: "采集原料加工成商品出售获利，形成完整生产链路",
    playerExperience: "采集原料加工成商品出售获利，形成完整生产链路",
    difficulty: "easy",
    nodes: [
      { type: "resource", label: "矿石", position: { x: 0, y: 80 } },
      { type: "converter", label: "锻造台", position: { x: 100, y: 80 } },
      { type: "item", label: "武器", position: { x: 200, y: 80 } },
      { type: "shop", label: "商店", position: { x: 300, y: 80 } },
      { type: "resource", label: "金币", position: { x: 400, y: 80 } },
    ],
    edges: [
      { source: 0, target: 1, type: "consume" },
      { source: 1, target: 2, type: "transform" },
      { source: 2, target: 3, type: "pass" },
      { source: 3, target: 4, type: "produce" },
    ],
    suggestedAttributes: [
      { name: "ore", type: "number", value: "10" },
      { name: "craft_cost", type: "number", value: "50" },
      { name: "weapon_price", type: "number", value: "200" },
      { name: "gold", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "gold", expression: "@weapon_price - @craft_cost" },
    ],
  },
  {
    id: "quest-reward-loop",
    name: "任务奖励循环",
    category: "economy",
    icon: "scroll-text",
    description: "完成任务换金币，金币换装备，构成正向循环",
    playerExperience: "完成任务换金币，金币换装备，构成正向循环",
    difficulty: "easy",
    nodes: [
      { type: "quest", label: "接取任务", position: { x: 0, y: 80 } },
      { type: "action", label: "完成条件", position: { x: 100, y: 80 } },
      { type: "reward", label: "金币奖励", position: { x: 200, y: 80 } },
      { type: "shop", label: "购买装备", position: { x: 300, y: 80 } },
      { type: "item", label: "装备", position: { x: 400, y: 80 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "produce" },
      { source: 2, target: 3, type: "consume" },
      { source: 3, target: 4, type: "transform" },
    ],
    suggestedAttributes: [
      { name: "quest_gold", type: "number", value: "100" },
      { name: "quest_difficulty", type: "number", value: "2" },
      { name: "item_price", type: "number", value: "150" },
      { name: "item_level", type: "number", value: "1" },
    ],
    suggestedFormulas: [
      { attributeName: "quest_gold", expression: "@quest_difficulty * 50" },
    ],
  },
  {
    id: "auction-bidding",
    name: "拍卖行博弈",
    category: "economy",
    icon: "gavel",
    description: "稀有物品挂拍卖，竞价博弈决定成交",
    playerExperience: "玩家在拍卖行竞价博弈，成交瞬间的得失带来紧张刺激",
    difficulty: "hard",
    nodes: [
      { type: "item", label: "稀有物品", position: { x: 0, y: 80 } },
      { type: "shop", label: "拍卖行", position: { x: 110, y: 80 } },
      { type: "condition", label: "竞价判定", position: { x: 220, y: 80 } },
      { type: "reward", label: "成交金币", position: { x: 330, y: 20 } },
      { type: "feedback", label: "博弈感", position: { x: 330, y: 140 } },
    ],
    edges: [
      { source: 0, target: 1, type: "pass" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "branch" },
      { source: 2, target: 4, type: "branch" },
    ],
    suggestedAttributes: [
      { name: "starting_price", type: "number", value: "500" },
      { name: "bid_increment", type: "number", value: "50" },
      { name: "rarity", type: "number", value: "3" },
      { name: "market_value", type: "number", value: "1000" },
    ],
    suggestedFormulas: [
      { attributeName: "market_value", expression: "@rarity * 200 + 100" },
    ],
  },
  {
    id: "economy-inflation",
    name: "资源通胀控制",
    category: "economy",
    icon: "scale",
    description: "监控产出与消耗平衡，动态调节避免经济崩溃",
    playerExperience: "系统监控产出与消耗平衡，动态调节避免经济崩溃",
    difficulty: "hard",
    nodes: [
      { type: "resource", label: "金币产出", position: { x: 0, y: 20 } },
      { type: "resource", label: "金币消耗", position: { x: 0, y: 160 } },
      { type: "condition", label: "通胀率检查", position: { x: 110, y: 90 } },
      { type: "action", label: "调整产出", position: { x: 220, y: 90 } },
      { type: "feedback", label: "经济平衡", position: { x: 330, y: 90 } },
    ],
    edges: [
      { source: 0, target: 2, type: "pass" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "branch" },
      { source: 3, target: 4, type: "subscribe" },
      { source: 3, target: 0, type: "inhibit", label: "负反馈" },
    ],
    suggestedAttributes: [
      { name: "gold_output", type: "number", value: "1000" },
      { name: "gold_sink", type: "number", value: "800" },
      { name: "inflation_rate", type: "number", value: "0.05" },
    ],
    suggestedFormulas: [
      { attributeName: "inflation_rate", expression: "(@gold_output - @gold_sink) / @gold_output" },
    ],
  },

  // ===== 探索类 (exploration) =====
  {
    id: "landmark-discovery",
    name: "地标发现",
    category: "exploration",
    icon: "map",
    description: "踏入未知区域发现地标，奖励驱动持续探索",
    playerExperience: "踏入未知区域发现地标，奖励驱动玩家持续探索",
    difficulty: "easy",
    nodes: [
      { type: "event", label: "进入新区域", position: { x: 0, y: 80 } },
      { type: "region", label: "新区域", position: { x: 100, y: 80 } },
      { type: "landmark", label: "地标", position: { x: 200, y: 80 } },
      { type: "reward", label: "发现奖励", position: { x: 300, y: 80 } },
      { type: "feedback", label: "探索欲", position: { x: 400, y: 80 } },
    ],
    edges: [
      { source: 0, target: 1, type: "pass" },
      { source: 1, target: 2, type: "compose" },
      { source: 2, target: 3, type: "produce" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "discovery_exp", type: "number", value: "30" },
      { name: "landmark_count", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "discovery_exp", expression: "@landmark_count * 10 + 20" },
    ],
  },
  {
    id: "hidden-room",
    name: "隐藏房间",
    category: "exploration",
    icon: "eye",
    description: "解开谜题揭示隐藏房间，意外收获带来惊喜",
    playerExperience: "解开谜题揭示隐藏房间，意外收获带来强烈惊喜",
    difficulty: "medium",
    nodes: [
      { type: "region", label: "普通房间", position: { x: 0, y: 80 } },
      { type: "condition", label: "解谜判定", position: { x: 110, y: 80 } },
      { type: "landmark", label: "隐藏房间", position: { x: 220, y: 80 } },
      { type: "reward", label: "稀有奖励", position: { x: 330, y: 80 } },
      { type: "feedback", label: "惊喜感", position: { x: 330, y: 0 } },
    ],
    edges: [
      { source: 0, target: 1, type: "pass" },
      { source: 1, target: 2, type: "branch" },
      { source: 2, target: 3, type: "produce" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "puzzle_solved", type: "number", value: "0" },
      { name: "hidden_chance", type: "number", value: "0.5" },
      { name: "rare_reward", type: "number", value: "1" },
    ],
    suggestedFormulas: [
      { attributeName: "hidden_chance", expression: "@puzzle_solved * 0.2 + 0.1" },
    ],
  },
  {
    id: "teleport-network",
    name: "传送网络",
    category: "exploration",
    icon: "route",
    description: "解锁传送点连成网络，快速旅行让探索更便捷",
    playerExperience: "解锁传送点连成网络，快速旅行让世界探索更便捷",
    difficulty: "easy",
    nodes: [
      { type: "landmark", label: "传送点 A", position: { x: 0, y: 40 } },
      { type: "landmark", label: "传送点 B", position: { x: 0, y: 160 } },
      { type: "path", label: "传送通路", position: { x: 110, y: 100 } },
      { type: "action", label: "快速旅行", position: { x: 220, y: 100 } },
      { type: "feedback", label: "便捷感", position: { x: 330, y: 100 } },
    ],
    edges: [
      { source: 0, target: 2, type: "compose" },
      { source: 1, target: 2, type: "compose" },
      { source: 2, target: 3, type: "pass" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "teleport_cost", type: "number", value: "10" },
      { name: "distance", type: "number", value: "20" },
      { name: "unlock_count", type: "number", value: "2" },
    ],
    suggestedFormulas: [
      { attributeName: "teleport_cost", expression: "@distance * 0.5" },
    ],
  },

  // ===== 叙事类 (narrative) =====
  {
    id: "branching-dialogue",
    name: "分支对话",
    category: "narrative",
    icon: "message-square",
    description: "对话选择导向不同分支结局，玩家感受叙事掌控",
    playerExperience: "对话选择导向不同分支结局，玩家感受叙事掌控感",
    difficulty: "medium",
    nodes: [
      { type: "dialogue", label: "NPC 对话", position: { x: 0, y: 80 } },
      { type: "condition", label: "选择分支", position: { x: 110, y: 80 } },
      { type: "action", label: "分支 A", position: { x: 220, y: 20 } },
      { type: "action", label: "分支 B", position: { x: 220, y: 160 } },
      { type: "reward", label: "不同结局", position: { x: 330, y: 90 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "branch" },
      { source: 1, target: 3, type: "branch" },
      { source: 2, target: 4, type: "produce" },
      { source: 3, target: 4, type: "produce" },
    ],
    suggestedAttributes: [
      { name: "choice_id", type: "number", value: "0" },
      { name: "affinity_a", type: "number", value: "0" },
      { name: "affinity_b", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "ending", expression: "@affinity_a > @affinity_b ? 'A' : 'B'", description: "好感度高者胜出" },
    ],
  },
  {
    id: "quest-chain-narrative",
    name: "任务链",
    category: "narrative",
    icon: "book-open",
    description: "主线章节层层推进，终章解锁带来完整剧情收束",
    playerExperience: "主线章节层层推进，终章解锁带来完整剧情收束",
    difficulty: "medium",
    nodes: [
      { type: "quest", label: "主线·启程", position: { x: 0, y: 80 } },
      { type: "action", label: "完成章节一", position: { x: 100, y: 80 } },
      { type: "quest", label: "主线·深入", position: { x: 200, y: 80 } },
      { type: "action", label: "完成章节二", position: { x: 300, y: 80 } },
      { type: "quest", label: "终章", position: { x: 400, y: 80 } },
      { type: "reward", label: "剧情解锁", position: { x: 400, y: 0 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "emit" },
      { source: 3, target: 4, type: "pass" },
      { source: 4, target: 5, type: "produce" },
    ],
    suggestedAttributes: [
      { name: "chapter", type: "number", value: "1" },
      { name: "story_progress", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "story_progress", expression: "@chapter / 3" },
    ],
  },

  // ===== 社交类 (social) =====
  {
    id: "guild-system",
    name: "公会系统",
    category: "social",
    icon: "users",
    description: "完成公会任务积累贡献，兑换公会奖励增强归属感",
    playerExperience: "完成公会任务积累贡献，兑换公会奖励增强归属感",
    difficulty: "medium",
    nodes: [
      { type: "social", label: "加入公会", position: { x: 0, y: 80 } },
      { type: "action", label: "公会任务", position: { x: 100, y: 80 } },
      { type: "reward", label: "贡献值", position: { x: 200, y: 80 } },
      { type: "condition", label: "贡献已满", position: { x: 300, y: 80 } },
      { type: "reward", label: "公会宝箱", position: { x: 400, y: 80 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "produce" },
      { source: 2, target: 3, type: "pass" },
      { source: 3, target: 4, type: "branch" },
    ],
    suggestedAttributes: [
      { name: "contribution", type: "number", value: "0" },
      { name: "contribution_max", type: "number", value: "1000" },
      { name: "guild_level", type: "number", value: "1" },
      { name: "guild_reward", type: "number", value: "1" },
    ],
    suggestedFormulas: [
      { attributeName: "contribution_max", expression: "@guild_level * 1000" },
    ],
  },
  {
    id: "pvp-arena",
    name: "PvP 竞技",
    category: "social",
    icon: "trophy",
    description: "匹配对战一决高下，段位升降牵动竞技心流",
    playerExperience: "匹配对战一决高下，段位升降牵动竞技心流",
    difficulty: "hard",
    nodes: [
      { type: "social", label: "匹配对手", position: { x: 0, y: 80 } },
      { type: "action", label: "对战", position: { x: 110, y: 80 } },
      { type: "condition", label: "胜负判定", position: { x: 220, y: 80 } },
      { type: "reward", label: "段位提升", position: { x: 330, y: 20 } },
      { type: "feedback", label: "竞技感", position: { x: 330, y: 140 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "branch" },
      { source: 2, target: 4, type: "branch" },
    ],
    suggestedAttributes: [
      { name: "match_result", type: "number", value: "0", description: "1 胜 0 负" },
      { name: "rank_points", type: "number", value: "100" },
      { name: "rank_tier", type: "number", value: "1" },
    ],
    suggestedFormulas: [
      { attributeName: "rank_points", expression: "@match_result > 0 ? 20 : -10" },
    ],
  },

  // ===== Roguelike (roguelike) =====
  {
    id: "random-room",
    name: "随机房间",
    category: "roguelike",
    icon: "dices",
    description: "每次进入房间都是随机生成，不可预测带来新鲜感",
    playerExperience: "每次进入房间都是随机生成，不可预测带来持续新鲜感",
    difficulty: "medium",
    nodes: [
      { type: "spawner", label: "房间生成器", position: { x: 0, y: 80 } },
      { type: "rng", label: "随机种子", position: { x: 100, y: 80 } },
      { type: "region", label: "房间类型", position: { x: 200, y: 80 } },
      { type: "reward", label: "随机奖励", position: { x: 300, y: 80 } },
      { type: "feedback", label: "新鲜感", position: { x: 400, y: 80 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "pass" },
      { source: 2, target: 3, type: "produce" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "seed", type: "number", value: "0" },
      { name: "room_type", type: "number", value: "0" },
      { name: "reward_rarity", type: "number", value: "1" },
    ],
    suggestedFormulas: [
      { attributeName: "room_type", expression: "@seed % 5" },
    ],
  },
  {
    id: "permadeath",
    name: "永久死亡",
    category: "roguelike",
    icon: "skull",
    description: "死亡即永久失去一切，每一次决策都重若千钧",
    playerExperience: "死亡即永久失去一切，每一次决策都重若千钧",
    difficulty: "hard",
    nodes: [
      { type: "event", label: "角色死亡", position: { x: 0, y: 80 } },
      { type: "condition", label: "永久模式", position: { x: 100, y: 80 } },
      { type: "action", label: "删除存档", position: { x: 200, y: 80 } },
      { type: "penalty", label: "全部损失", position: { x: 300, y: 80 } },
      { type: "feedback", label: "紧张感", position: { x: 400, y: 80 } },
    ],
    edges: [
      { source: 0, target: 1, type: "emit" },
      { source: 1, target: 2, type: "branch" },
      { source: 2, target: 3, type: "emit" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "is_hardcore", type: "number", value: "1" },
      { name: "death_count", type: "number", value: "0" },
      { name: "loss_percent", type: "number", value: "1" },
    ],
    suggestedFormulas: [
      { attributeName: "loss_percent", expression: "@is_hardcore > 0 ? 1 : 0.1" },
    ],
  },
  {
    id: "buff-stack-roguelike",
    name: "Buff 叠加",
    category: "roguelike",
    icon: "layers",
    description: "随机 Buff 叠加产生强力组合，build 成型瞬间的爽快爆发",
    playerExperience: "随机 Buff 叠加产生强力组合，build 成型瞬间的爽快爆发",
    difficulty: "medium",
    nodes: [
      { type: "rng", label: "随机 Buff 池", position: { x: 0, y: 80 } },
      { type: "modifier", label: "Buff·狂暴", position: { x: 100, y: 20 } },
      { type: "modifier", label: "Buff·迅捷", position: { x: 100, y: 160 } },
      { type: "action", label: "叠加触发", position: { x: 200, y: 90 } },
      { type: "reward", label: "强力组合", position: { x: 300, y: 90 } },
      { type: "feedback", label: "组合爽感", position: { x: 400, y: 90 } },
    ],
    edges: [
      { source: 0, target: 1, type: "produce" },
      { source: 0, target: 2, type: "produce" },
      { source: 1, target: 3, type: "pass" },
      { source: 2, target: 3, type: "pass" },
      { source: 3, target: 4, type: "produce" },
      { source: 4, target: 5, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "buff_count", type: "number", value: "0" },
      { name: "stack_bonus", type: "number", value: "0" },
    ],
    suggestedFormulas: [
      { attributeName: "stack_bonus", expression: "@buff_count * 15" },
    ],
  },

  // ===== 策略类 (strategy) =====
  {
    id: "tech-tree",
    name: "科技树",
    category: "strategy",
    icon: "network",
    description: "积累科研点解锁科技树，文明逐步进步带来成就感",
    playerExperience: "积累科研点解锁科技树，文明逐步进步带来成就感",
    difficulty: "medium",
    nodes: [
      { type: "resource", label: "科研点", position: { x: 0, y: 80 } },
      { type: "condition", label: "前置科技", position: { x: 100, y: 80 } },
      { type: "action", label: "研发", position: { x: 200, y: 80 } },
      { type: "reward", label: "新科技", position: { x: 300, y: 80 } },
      { type: "feedback", label: "进步感", position: { x: 400, y: 80 } },
    ],
    edges: [
      { source: 0, target: 1, type: "consume" },
      { source: 1, target: 2, type: "branch" },
      { source: 2, target: 3, type: "produce" },
      { source: 3, target: 4, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "research_points", type: "number", value: "0" },
      { name: "tech_cost", type: "number", value: "100" },
      { name: "tech_level", type: "number", value: "1" },
    ],
    suggestedFormulas: [
      { attributeName: "tech_cost", expression: "@tech_level * 100" },
    ],
  },
  {
    id: "diplomacy",
    name: "外交系统",
    category: "strategy",
    icon: "flag",
    description: "权衡与他势力关系，结盟或宣战牵动全局策略走向",
    playerExperience: "权衡与他势力关系，结盟或宣战牵动全局策略走向",
    difficulty: "hard",
    nodes: [
      { type: "social", label: "其他势力", position: { x: 0, y: 90 } },
      { type: "condition", label: "关系值判定", position: { x: 110, y: 90 } },
      { type: "action", label: "结盟", position: { x: 220, y: 20 } },
      { type: "action", label: "宣战", position: { x: 220, y: 160 } },
      { type: "reward", label: "资源/领土", position: { x: 330, y: 90 } },
      { type: "feedback", label: "策略感", position: { x: 400, y: 90 } },
    ],
    edges: [
      { source: 0, target: 1, type: "subscribe" },
      { source: 1, target: 2, type: "branch" },
      { source: 1, target: 3, type: "branch" },
      { source: 2, target: 4, type: "produce" },
      { source: 3, target: 4, type: "produce" },
      { source: 4, target: 5, type: "subscribe" },
    ],
    suggestedAttributes: [
      { name: "relation", type: "number", value: "0" },
      { name: "trade_count", type: "number", value: "0" },
      { name: "conflict_count", type: "number", value: "0" },
      { name: "alliance_bonus", type: "number", value: "50" },
    ],
    suggestedFormulas: [
      { attributeName: "relation", expression: "@trade_count * 5 - @conflict_count * 10" },
    ],
  },
];
