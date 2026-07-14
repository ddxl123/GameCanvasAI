/**
 * 经典游戏难度/成长参考曲线
 *
 * 用于「难度对标」面板，将当前项目的属性曲线与业界知名游戏的
 * 难度爬升、伤害成长、进度成本等曲线叠加对比，辅助数值调平。
 *
 * 数据为基于公开设计资料整理的近似值，x 轴含义因游戏而异
 * （关卡 / 等级 / 强化等级 / 删除卡牌数 / 时代），详见各条目 description。
 */

export interface ReferenceCurve {
  id: string;
  name: string;
  source: string; // 游戏名
  category: "difficulty" | "dps" | "progression";
  description: string;
  data: { x: number; y: number }[]; // x=等级/关卡, y=数值
  color: string;
}

// 杀戮尖塔：卡牌删减收益（0-20 张），胜率提升 %，边际递减
// 模型 y = 25 * (1 - e^(-x/8))，符合删卡前期收益显著、后期递减的体感
const slayCurve: { x: number; y: number }[] = Array.from(
  { length: 21 },
  (_, i) => ({ x: i, y: Number((25 * (1 - Math.exp(-i / 8))).toFixed(1)) })
);

// 暗黑破坏神：经验曲线（1-60 级），指数增长
// 模型 y = 500 * 1.22^(level-1)，体现刷怪经验需求的指数膨胀
const diabloCurve: { x: number; y: number }[] = Array.from(
  { length: 60 },
  (_, i) => ({ x: i + 1, y: Math.round(500 * Math.pow(1.22, i)) })
);

export const REFERENCE_CURVES: ReferenceCurve[] = [
  {
    id: "celeste-difficulty",
    name: "难度爬升",
    source: "蔚蓝 Celeste",
    category: "difficulty",
    description: "主线 8 关 A 面难度指数，随章节阶梯上升，末期陡增",
    color: "#F472B6",
    data: [
      { x: 1, y: 1.0 },
      { x: 2, y: 1.8 },
      { x: 3, y: 2.6 },
      { x: 4, y: 3.6 },
      { x: 5, y: 4.8 },
      { x: 6, y: 6.2 },
      { x: 7, y: 8.2 },
      { x: 8, y: 10.0 },
    ],
  },
  {
    id: "hollowknight-dps",
    name: "伤害成长",
    source: "空洞骑士 Hollow Knight",
    category: "dps",
    description: "1-20 级综合 DPS，含骨钉强化与法术升级的跃迁",
    color: "#22D3EE",
    data: [
      { x: 1, y: 15 },
      { x: 2, y: 18 },
      { x: 3, y: 22 },
      { x: 4, y: 26 },
      { x: 5, y: 30 },
      { x: 6, y: 36 },
      { x: 7, y: 42 },
      { x: 8, y: 48 },
      { x: 9, y: 55 },
      { x: 10, y: 62 },
      { x: 11, y: 70 },
      { x: 12, y: 78 },
      { x: 13, y: 86 },
      { x: 14, y: 94 },
      { x: 15, y: 102 },
      { x: 16, y: 112 },
      { x: 17, y: 122 },
      { x: 18, y: 132 },
      { x: 19, y: 142 },
      { x: 20, y: 152 },
    ],
  },
  {
    id: "darksouls-weapon",
    name: "武器强化",
    source: "黑暗之魂 Dark Souls",
    category: "progression",
    description: "普通武器 +0 ~ +15 伤害倍率，每级约 +10% 基础伤害",
    color: "#FBBF24",
    data: [
      { x: 0, y: 1.0 },
      { x: 1, y: 1.1 },
      { x: 2, y: 1.2 },
      { x: 3, y: 1.3 },
      { x: 4, y: 1.4 },
      { x: 5, y: 1.5 },
      { x: 6, y: 1.6 },
      { x: 7, y: 1.7 },
      { x: 8, y: 1.8 },
      { x: 9, y: 1.9 },
      { x: 10, y: 2.0 },
      { x: 11, y: 2.1 },
      { x: 12, y: 2.2 },
      { x: 13, y: 2.3 },
      { x: 14, y: 2.4 },
      { x: 15, y: 2.5 },
    ],
  },
  {
    id: "slaythespire-removal",
    name: "卡牌删减收益",
    source: "杀戮尖塔 Slay the Spire",
    category: "progression",
    description: "删卡 0-20 张的胜率提升 %，边际递减，约 25% 封顶",
    color: "#A78BFA",
    data: slayCurve,
  },
  {
    id: "diablo-xp",
    name: "经验曲线",
    source: "暗黑破坏神 Diablo",
    category: "progression",
    description: "1-60 级升级所需经验，典型指数膨胀",
    color: "#FB923C",
    data: diabloCurve,
  },
  {
    id: "civ6-tech",
    name: "科技成本",
    source: "文明6 Civilization VI",
    category: "progression",
    description: "时代 1-8 的代表性科技值成本，随时代阶梯增长",
    color: "#34D399",
    data: [
      { x: 1, y: 40 },
      { x: 2, y: 120 },
      { x: 3, y: 300 },
      { x: 4, y: 600 },
      { x: 5, y: 1200 },
      { x: 6, y: 2400 },
      { x: 7, y: 3600 },
      { x: 8, y: 5400 },
    ],
  },
];
