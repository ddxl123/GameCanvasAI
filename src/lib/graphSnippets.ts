import type { NodeType, EdgeType } from "@/types";

export interface GraphSnippet {
  id: string;
  name: string;
  description: string;
  category:
    | "combat"
    | "economy"
    | "growth"
    | "feedback"
    | "logic"
    | "world"
    | "content"
    | "sensory"
    | "system";
  nodes: Array<{
    type: NodeType;
    label: string;
    position: { x: number; y: number };
    data?: Record<string, unknown>;
  }>;
  edges: Array<{
    sourceIndex: number;
    targetIndex: number;
    type: EdgeType;
    label?: string;
  }>;
}

// 常用玩法子图片段库。
// 节点 position 为相对坐标（基准 0,0），横向间距 220，分支 y 偏移 120；
// 插入时由调用方叠加随机偏移，避免堆叠。
export const GRAPH_SNIPPETS: GraphSnippet[] = [
  // 1. 伤害流程
  {
    id: "damage-flow",
    name: "伤害流程",
    description: "攻击触发 → 计算伤害 → 扣减血量，含暴击分支",
    category: "combat",
    nodes: [
      { type: "event", label: "攻击触发", position: { x: 0, y: 0 } },
      { type: "action", label: "计算伤害", position: { x: 220, y: 0 } },
      { type: "attribute", label: "目标血量", position: { x: 440, y: 0 } },
      { type: "condition", label: "暴击判定", position: { x: 220, y: 120 } },
      { type: "action", label: "暴击伤害", position: { x: 440, y: 120 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "modify" },
      { sourceIndex: 3, targetIndex: 4, type: "emit" },
      { sourceIndex: 4, targetIndex: 2, type: "modify" },
    ],
  },

  // 2. 升级流程
  {
    id: "level-up",
    name: "升级流程",
    description: "获得经验累积 → 等级提升 → 全属性强化",
    category: "growth",
    nodes: [
      { type: "event", label: "获得经验", position: { x: 0, y: 0 } },
      { type: "resource", label: "经验值", position: { x: 220, y: 0 } },
      { type: "level", label: "角色等级", position: { x: 440, y: 0 } },
      { type: "action", label: "升级特效", position: { x: 660, y: 0 } },
      { type: "attribute", label: "全属性提升", position: { x: 880, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "produce" },
      { sourceIndex: 1, targetIndex: 2, type: "pass" },
      { sourceIndex: 2, targetIndex: 3, type: "emit" },
      { sourceIndex: 3, targetIndex: 4, type: "modify" },
    ],
  },

  // 3. 经济循环
  {
    id: "economy-loop",
    name: "经济循环",
    description: "击杀产出金币 → 商店消耗 → 装备强化",
    category: "economy",
    nodes: [
      { type: "action", label: "击杀怪物", position: { x: 0, y: 0 } },
      { type: "resource", label: "金币", position: { x: 220, y: 0 } },
      { type: "converter", label: "商店购买", position: { x: 440, y: 0 } },
      { type: "attribute", label: "装备强度", position: { x: 660, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "produce" },
      { sourceIndex: 1, targetIndex: 2, type: "consume" },
      { sourceIndex: 2, targetIndex: 3, type: "modify" },
    ],
  },

  // 4. 死亡惩罚
  {
    id: "death-penalty",
    name: "死亡惩罚",
    description: "角色死亡触发经验扣除，并进入复活冷却",
    category: "feedback",
    nodes: [
      { type: "event", label: "角色死亡", position: { x: 0, y: 0 } },
      { type: "penalty", label: "经验扣除", position: { x: 220, y: 0 } },
      { type: "resource", label: "经验值", position: { x: 440, y: 0 } },
      { type: "action", label: "复活", position: { x: 220, y: 120 } },
      { type: "state", label: "复活冷却", position: { x: 440, y: 120 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "consume" },
      { sourceIndex: 0, targetIndex: 3, type: "emit" },
      { sourceIndex: 3, targetIndex: 4, type: "pass" },
    ],
  },

  // 5. 掉落
  {
    id: "loot-drop",
    name: "掉落流程",
    description: "敌人死亡 → 掉落判定 → 宝箱产出材料",
    category: "feedback",
    nodes: [
      { type: "event", label: "敌人死亡", position: { x: 0, y: 0 } },
      { type: "condition", label: "掉落判定", position: { x: 220, y: 0 } },
      { type: "reward", label: "宝箱掉落", position: { x: 440, y: 0 } },
      { type: "resource", label: "材料", position: { x: 660, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "emit" },
      { sourceIndex: 2, targetIndex: 3, type: "produce" },
    ],
  },

  // 6. Buff 叠加
  {
    id: "buff-stack",
    name: "Buff 叠加",
    description: "施放技能产生 Buff 修饰攻击力，层数溢出有惩罚",
    category: "growth",
    nodes: [
      { type: "action", label: "施放技能", position: { x: 0, y: 0 } },
      { type: "modifier", label: "攻击 Buff", position: { x: 220, y: 0 } },
      { type: "attribute", label: "攻击力", position: { x: 440, y: 0 } },
      { type: "condition", label: "层数检查", position: { x: 220, y: 120 } },
      { type: "penalty", label: "溢出惩罚", position: { x: 440, y: 120 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "produce" },
      { sourceIndex: 1, targetIndex: 2, type: "modify" },
      { sourceIndex: 1, targetIndex: 3, type: "pass" },
      { sourceIndex: 3, targetIndex: 4, type: "emit" },
    ],
  },

  // 7. AI 巡逻
  {
    id: "ai-patrol",
    name: "AI 巡逻",
    description: "巡逻状态驱动移动，到达目标后切换巡逻点形成循环",
    category: "logic",
    nodes: [
      { type: "state", label: "巡逻状态", position: { x: 0, y: 0 } },
      { type: "ai_behavior", label: "移动到点", position: { x: 220, y: 0 } },
      { type: "condition", label: "到达目标", position: { x: 440, y: 0 } },
      { type: "action", label: "切换目标", position: { x: 660, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "pass" },
      { sourceIndex: 2, targetIndex: 3, type: "emit" },
      { sourceIndex: 3, targetIndex: 0, type: "subscribe" },
    ],
  },

  // 8. 玩家交易
  {
    id: "pvp-trade",
    name: "玩家交易",
    description: "发起交易 → 验证确认 → 交换物品 → 完成交易",
    category: "economy",
    nodes: [
      { type: "social", label: "发起交易", position: { x: 0, y: 0 } },
      { type: "action", label: "验证物品", position: { x: 220, y: 0 } },
      { type: "condition", label: "双方确认", position: { x: 440, y: 0 } },
      { type: "converter", label: "交换物品", position: { x: 660, y: 0 } },
      { type: "social", label: "完成交易", position: { x: 880, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "pass" },
      { sourceIndex: 2, targetIndex: 3, type: "transform" },
      { sourceIndex: 3, targetIndex: 4, type: "produce" },
    ],
  },

  // 9. 区域探索
  {
    id: "region-explore",
    name: "区域探索",
    description: "进入区域传送至新手村，区域关联地标与生态，天气影响区域状态",
    category: "world",
    nodes: [
      { type: "trigger_zone", label: "进入区域", position: { x: 0, y: 0 } },
      { type: "region", label: "新手村", position: { x: 220, y: 0 } },
      { type: "landmark", label: "传送点", position: { x: 440, y: 0 } },
      { type: "biome", label: "森林", position: { x: 440, y: 120 } },
      { type: "weather", label: "白天", position: { x: 220, y: 120 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "pass" },
      { sourceIndex: 1, targetIndex: 2, type: "pass" },
      { sourceIndex: 1, targetIndex: 3, type: "pass" },
      { sourceIndex: 4, targetIndex: 1, type: "modify" },
    ],
  },

  // 10. 怪物刷新
  {
    id: "enemy-spawn",
    name: "怪物刷新",
    description: "计时器触发刷新点生成怪物，数量检查反馈控制刷新节奏",
    category: "system",
    nodes: [
      { type: "timer", label: "刷新间隔", position: { x: 0, y: 0 } },
      { type: "spawner", label: "怪物刷新点", position: { x: 220, y: 0 } },
      { type: "enemy", label: "哥布林", position: { x: 440, y: 0 } },
      { type: "condition", label: "数量检查", position: { x: 660, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "produce" },
      { sourceIndex: 2, targetIndex: 3, type: "pass" },
      { sourceIndex: 3, targetIndex: 1, type: "subscribe" },
    ],
  },

  // 11. 任务链
  {
    id: "quest-chain",
    name: "任务链",
    description: "任务 NPC 触发主线任务，完成判定后对话并产出奖励",
    category: "content",
    nodes: [
      { type: "character", label: "任务 NPC", position: { x: 0, y: 0 } },
      { type: "quest", label: "主线任务", position: { x: 220, y: 0 } },
      { type: "condition", label: "完成判定", position: { x: 440, y: 0 } },
      { type: "dialogue", label: "完成对话", position: { x: 660, y: 0 } },
      { type: "reward", label: "任务奖励", position: { x: 880, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "pass" },
      { sourceIndex: 2, targetIndex: 3, type: "emit" },
      { sourceIndex: 3, targetIndex: 4, type: "produce" },
    ],
  },

  // 12. 战斗音乐切换
  {
    id: "combat-music",
    name: "战斗音乐切换",
    description: "进入战斗播放 BGM 与音效，战斗结束切换探索 BGM 与胜利音效",
    category: "sensory",
    nodes: [
      { type: "event", label: "进入战斗", position: { x: 0, y: 0 } },
      { type: "music", label: "战斗 BGM", position: { x: 220, y: 0 } },
      { type: "sfx", label: "战斗音效", position: { x: 220, y: 120 } },
      { type: "condition", label: "战斗结束", position: { x: 440, y: 0 } },
      { type: "music", label: "探索 BGM", position: { x: 660, y: 0 } },
      { type: "sfx", label: "胜利音效", position: { x: 660, y: 120 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "invoke" },
      { sourceIndex: 0, targetIndex: 2, type: "invoke" },
      { sourceIndex: 3, targetIndex: 4, type: "invoke" },
      { sourceIndex: 3, targetIndex: 5, type: "invoke" },
    ],
  },

  // 13. 商店交易
  {
    id: "shop-trade",
    name: "商店交易",
    description: "商人 NPC 触发商店，金币换道具产出药水进入背包资源池",
    category: "content",
    nodes: [
      { type: "character", label: "商人 NPC", position: { x: 0, y: 0 } },
      { type: "shop", label: "商店", position: { x: 220, y: 0 } },
      { type: "converter", label: "金币换道具", position: { x: 440, y: 0 } },
      { type: "item", label: "药水", position: { x: 660, y: 0 } },
      { type: "pool", label: "背包", position: { x: 880, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "transform" },
      { sourceIndex: 2, targetIndex: 3, type: "produce" },
      { sourceIndex: 3, targetIndex: 4, type: "produce" },
    ],
  },

  // 14. 天气效果
  {
    id: "weather-effect",
    name: "天气效果",
    description: "雨天改变生态群落，播放雨滴特效与音效，生态产出湿润增益",
    category: "world",
    nodes: [
      { type: "weather", label: "雨天", position: { x: 0, y: 0 } },
      { type: "biome", label: "森林", position: { x: 220, y: 0 } },
      { type: "fx", label: "雨滴特效", position: { x: 220, y: 120 } },
      { type: "sfx", label: "雨声音效", position: { x: 440, y: 120 } },
      { type: "modifier", label: "湿润增益", position: { x: 440, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "modify" },
      { sourceIndex: 0, targetIndex: 2, type: "invoke" },
      { sourceIndex: 0, targetIndex: 3, type: "invoke" },
      { sourceIndex: 1, targetIndex: 4, type: "produce" },
    ],
  },

  // 15. 动态难度
  {
    id: "difficulty-dda",
    name: "动态难度",
    description: "玩家表现反馈调节难度，影响怪物强度，死亡惩罚闭环回归表现",
    category: "system",
    nodes: [
      { type: "feedback", label: "玩家表现", position: { x: 0, y: 0 } },
      { type: "difficulty", label: "难度调节", position: { x: 220, y: 0 } },
      { type: "enemy", label: "怪物强度", position: { x: 440, y: 0 } },
      { type: "condition", label: "玩家死亡", position: { x: 660, y: 0 } },
      { type: "penalty", label: "死亡惩罚", position: { x: 880, y: 0 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "subscribe" },
      { sourceIndex: 1, targetIndex: 2, type: "modify" },
      { sourceIndex: 2, targetIndex: 3, type: "pass" },
      { sourceIndex: 3, targetIndex: 4, type: "emit" },
      { sourceIndex: 4, targetIndex: 0, type: "subscribe" },
    ],
  },

  // 16. 技能连招
  {
    id: "skill-combo",
    name: "技能连招",
    description: "技能 A 触发连招动作，启用技能 B 并播放特效，连招触发 CD 计时",
    category: "content",
    nodes: [
      { type: "skill", label: "技能 A", position: { x: 0, y: 0 } },
      { type: "action", label: "施放连招", position: { x: 220, y: 0 } },
      { type: "skill", label: "技能 B", position: { x: 440, y: 0 } },
      { type: "fx", label: "连招特效", position: { x: 660, y: 0 } },
      { type: "timer", label: "连招 CD", position: { x: 220, y: 120 } },
    ],
    edges: [
      { sourceIndex: 0, targetIndex: 1, type: "emit" },
      { sourceIndex: 1, targetIndex: 2, type: "enable" },
      { sourceIndex: 2, targetIndex: 3, type: "invoke" },
      { sourceIndex: 1, targetIndex: 4, type: "emit" },
    ],
  },
];
