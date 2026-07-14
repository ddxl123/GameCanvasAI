import type {
  NodeType,
  EdgeType,
  AttributeType,
} from "@/types";

/**
 * 经典机制案例库 —— 收录业界知名游戏的代表性机制拆解，
 * 供设计者一键导入新项目作为参考起点。
 *
 * 数据约定（与 projectTemplates.ts 保持一致）：
 * - 节点 label 在同一案例内必须唯一
 * - 边通过 sourceIndex/targetIndex 引用 nodes 数组下标
 * - 公式表达式中以 @属性名 引用其它属性（如 @强化等级*0.1+1），使用 mathjs 语法
 * - 属性 name 在同一案例内必须唯一（公式通过 attrName 引用属性）
 *
 * 案例覆盖：杀戮尖塔 / 黑暗之魂 / 缺氧 / 以撒 / 原神
 */
export interface CaseTemplate {
  id: string;
  name: string;
  category:
    | "roguelike"
    | "soulslike"
    | "deckbuilder"
    | "rpg"
    | "economy"
    | "combat";
  description: string;
  source: string; // 来源游戏名
  tags: string[];
  graphs: Array<{
    name: string;
    type: "node_graph" | "system_loop";
    nodes: Array<{
      type: NodeType;
      label: string;
      data?: Record<string, unknown>;
      position: { x: number; y: number };
    }>;
    edges: Array<{
      sourceIndex: number;
      targetIndex: number;
      type: EdgeType;
      label?: string;
    }>;
  }>;
  attributes: Array<{
    name: string;
    type: AttributeType;
    value: string;
    unit?: string;
    description?: string;
  }>;
  formulas: Array<{
    attrName: string;
    expression: string;
    description?: string;
  }>;
}

// 案例分类展示元数据
export const CASE_CATEGORY_LABEL: Record<CaseTemplate["category"], string> = {
  roguelike: "Roguelike",
  soulslike: "Soulslike",
  deckbuilder: "Deck Builder",
  rpg: "RPG",
  economy: "经济系统",
  combat: "战斗系统",
};

export const CASE_CATEGORY_COLOR: Record<CaseTemplate["category"], string> = {
  roguelike: "#EF4444",
  soulslike: "#F59E0B",
  deckbuilder: "#A78BFA",
  rpg: "#06B6D4",
  economy: "#FBBF24",
  combat: "#F43F5E",
};

// 网格布局常数：与 projectTemplates 保持一致
const STEP_X = 220;
const STEP_Y = 140;
const COLS = 4;
function grid(i: number): { x: number; y: number } {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  return { x: col * STEP_X, y: row * STEP_Y };
}

// ====== 案例 1：杀戮尖塔 · 卡牌删减曲线（deckbuilder）======
// 核心循环：商店删牌 → 牌组容量↓ → 牌组强度↑ → 战斗胜率↑ → 金币产出↑ → 回流到删牌
const slayTheSpireCase: CaseTemplate = {
  id: "sts-card-removal",
  name: "卡牌删减收益曲线",
  category: "deckbuilder",
  description:
    "拆解《杀戮尖塔》卡牌删减机制：商店支付金币删牌，牌组精简后强度非线性上升，反馈到战斗胜率与金币产出，形成「越删越强」的核心循环。重点体现删牌的边际收益曲线。",
  source: "Slay the Spire",
  tags: ["卡牌构建", "经济循环", "边际收益", "Roguelike"],
  graphs: [
    {
      name: "删牌核心循环",
      type: "system_loop",
      nodes: [
        { type: "event", label: "进入商店", position: grid(0) },
        { type: "resource", label: "金币", position: grid(1) },
        { type: "action", label: "删除卡牌", position: grid(2) },
        { type: "pool", label: "牌组容量", position: grid(3) },
        { type: "attribute", label: "牌组强度", position: grid(4) },
        { type: "modifier", label: "删减收益", position: grid(5) },
        { type: "condition", label: "牌组>15?", position: grid(6) },
        { type: "reward", label: "战斗胜率", position: grid(7) },
      ],
      edges: [
        { sourceIndex: 0, targetIndex: 1, type: "emit" },
        { sourceIndex: 1, targetIndex: 2, type: "consume", label: "支付 75 金" },
        { sourceIndex: 2, targetIndex: 3, type: "modify", label: "减少 1 张" },
        { sourceIndex: 3, targetIndex: 6, type: "pass" },
        { sourceIndex: 6, targetIndex: 4, type: "branch", label: "精简收益" },
        { sourceIndex: 5, targetIndex: 4, type: "modify" },
        { sourceIndex: 4, targetIndex: 7, type: "modify" },
        { sourceIndex: 7, targetIndex: 1, type: "produce", label: "战斗结算" },
      ],
    },
  ],
  attributes: [
    { name: "初始牌组数", type: "number", value: "10", description: "初始卡牌总数" },
    { name: "牌组上限", type: "number", value: "20", description: "牌组容量上限" },
    { name: "金币持有", type: "number", value: "200", unit: "金" },
    { name: "删牌费用", type: "number", value: "75", unit: "金" },
    { name: "已删牌数", type: "number", value: "0" },
    { name: "每张删减收益", type: "number", value: "8", description: "边际收益基准" },
    { name: "牌组强度", type: "number", value: "100" },
    { name: "战斗胜率", type: "number", value: "0.5" },
  ],
  formulas: [
    { attrName: "每张删减收益", expression: "8 + sqrt(@已删牌数) * 4", description: "删牌越多，单次收益越高（边际递增）" },
    { attrName: "牌组强度", expression: "100 + @已删牌数 * @每张删减收益", description: "强度 = 基准 + 删牌数 × 边际收益" },
    { attrName: "战斗胜率", expression: "min(0.95, 0.5 + (@牌组强度 - 100) * 0.005)", description: "封顶 95%，避免滚雪球失控" },
    { attrName: "金币持有", expression: "200 - @已删牌数 * @删牌费用", description: "初始 200 金，每次删牌扣 75" },
  ],
};

// ====== 案例 2：黑暗之魂 · 武器强化（soulslike）======
// 核心循环：强化石→铁匠铺→强化等级→强化倍率→物理伤害；体现 +0~+15 的线性伤害曲线
const darkSoulsCase: CaseTemplate = {
  id: "ds-weapon-reinforce",
  name: "武器强化伤害曲线",
  category: "soulslike",
  description:
    "拆解《黑暗之魂》武器强化机制：+0 至 +15 等级线性成长，每级 +10% 物理伤害与力量补正。强调强化石的阶梯消耗与伤害收益的对照关系。",
  source: "Dark Souls",
  tags: ["武器强化", "伤害公式", "线性成长", "Soulslike"],
  graphs: [
    {
      name: "武器强化流程",
      type: "node_graph",
      nodes: [
        { type: "item", label: "直剑", position: grid(0) },
        { type: "resource", label: "强化石", position: grid(1) },
        { type: "converter", label: "铁匠铺", position: grid(2) },
        { type: "level", label: "强化等级", position: grid(3) },
        { type: "attribute", label: "基础伤害", position: grid(4) },
        { type: "modifier", label: "强化倍率", position: grid(5) },
        { type: "attribute", label: "最终伤害", position: grid(6) },
      ],
      edges: [
        { sourceIndex: 1, targetIndex: 2, type: "consume", label: "消耗楔形石" },
        { sourceIndex: 0, targetIndex: 2, type: "belong" },
        { sourceIndex: 2, targetIndex: 3, type: "produce", label: "+1 等级" },
        { sourceIndex: 3, targetIndex: 5, type: "enable", label: "解锁倍率" },
        { sourceIndex: 5, targetIndex: 6, type: "modify", label: "倍率加成" },
        { sourceIndex: 4, targetIndex: 6, type: "transform", label: "计算最终值" },
      ],
    },
  ],
  attributes: [
    { name: "基础攻击", type: "number", value: "80", description: "+0 时的物理攻击" },
    { name: "力量补正", type: "number", value: "1.0", description: "力量等级系数" },
    { name: "强化上限", type: "number", value: "15", description: "最大强化等级" },
    { name: "当前强化", type: "number", value: "0", description: "+0 ~ +15" },
    { name: "强化倍率", type: "number", value: "1.0" },
    { name: "物理伤害", type: "number", value: "80" },
    { name: "强化石需求", type: "number", value: "1", description: "每级所需楔形石" },
    { name: "累计消耗", type: "number", value: "0", description: "总消耗楔形石数" },
  ],
  formulas: [
    { attrName: "强化倍率", expression: "1 + @当前强化 * 0.10", description: "每级 +10% 倍率，+15 时为 2.5" },
    { attrName: "物理伤害", expression: "floor(@基础攻击 * @强化倍率)", description: "基础攻击 × 倍率，向下取整" },
    { attrName: "力量补正", expression: "1 + @当前强化 * 0.02", description: "每级 +2% 力量补正" },
    { attrName: "累计消耗", expression: "@当前强化 * (@当前强化 + 1) / 2", description: "阶梯消耗：1+2+3+...+n" },
  ],
};

// ====== 案例 3：缺氧 · 资源转换链（economy）======
// 核心循环：煤炭→电力→氧气→复制人存活；展示多级资源转换的损耗与净产出
const oxygenCase: CaseTemplate = {
  id: "oni-resource-chain",
  name: "氧气资源转换链",
  category: "economy",
  description:
    "拆解《缺氧》核心生存链：煤炭发电→电力→电解水→氧气→复制人呼吸。展示多级资源转换中的效率损耗与净产出平衡，是工业生存类游戏的经典经济模型。",
  source: "Oxygen Not Included",
  tags: ["资源链", "转换效率", "工业生存", "经济循环"],
  graphs: [
    {
      name: "氧气生产链",
      type: "system_loop",
      nodes: [
        { type: "resource", label: "煤炭存量", position: grid(0) },
        { type: "converter", label: "煤炭发电机", position: grid(1) },
        { type: "resource", label: "电力", position: grid(2) },
        { type: "converter", label: "电解水器", position: grid(3) },
        { type: "resource", label: "氧气", position: grid(4) },
        { type: "action", label: "复制人呼吸", position: grid(5) },
        { type: "state", label: "复制人存活", position: grid(6) },
      ],
      edges: [
        { sourceIndex: 0, targetIndex: 1, type: "consume", label: "100g/s 煤炭" },
        { sourceIndex: 1, targetIndex: 2, type: "produce", label: "发电效率 90%" },
        { sourceIndex: 2, targetIndex: 3, type: "consume", label: "120W 电力" },
        { sourceIndex: 3, targetIndex: 4, type: "produce", label: "产出 100g/s 氧气" },
        { sourceIndex: 4, targetIndex: 5, type: "consume", label: "呼吸消耗" },
        { sourceIndex: 5, targetIndex: 6, type: "enable", label: "维持存活" },
      ],
    },
  ],
  attributes: [
    { name: "煤炭存量", type: "number", value: "500", unit: "kg" },
    { name: "煤炭热值", type: "number", value: "100", description: "每 kg 煤炭发电量" },
    { name: "发电效率", type: "number", value: "0.9", description: "煤炭发电机效率" },
    { name: "电力产出", type: "number", value: "0", unit: "W" },
    { name: "电解耗电", type: "number", value: "120", unit: "W" },
    { name: "氧气产出", type: "number", value: "0", unit: "g/s" },
    { name: "复制人数量", type: "number", value: "3" },
    { name: "单人耗氧", type: "number", value: "100", unit: "g/s" },
  ],
  formulas: [
    { attrName: "电力产出", expression: "@煤炭存量 * @煤炭热值 * @发电效率", description: "总发电量 = 煤炭 × 热值 × 效率" },
    { attrName: "氧气产出", expression: "@电力产出 / @电解耗电 * 100", description: "每 120W 电力产出 100g/s 氧气" },
    { attrName: "每日氧气消耗", expression: "@复制人数量 * @单人耗氧", description: "3 人 × 100g/s = 300g/s" },
    { attrName: "氧气净产出", expression: "@氧气产出 - @每日氧气消耗", description: "净产出 > 0 才能持续生存" },
  ],
};

// ====== 案例 4：以撒的结合 · 房间奖励循环（roguelike）======
// 核心循环：清理房间→掉落判定→拾取道具→强度提升→下个房间；难度同步上调形成螺旋上升
const isaacCase: CaseTemplate = {
  id: "isaac-room-loop",
  name: "房间奖励强化循环",
  category: "roguelike",
  description:
    "拆解《以撒的结合》房间核心循环：清理→掉落→强化→下个房间→难度提升。体现 Roguelike 经典的「风险与收益螺旋上升」节奏，以及强度与难度的动态平衡。",
  source: "The Binding of Isaac",
  tags: ["房间循环", "掉落概率", "动态难度", "Roguelike"],
  graphs: [
    {
      name: "房间强化循环",
      type: "system_loop",
      nodes: [
        { type: "region", label: "房间", position: grid(0) },
        { type: "event", label: "清理房间", position: grid(1) },
        { type: "rng", label: "掉落判定", position: grid(2) },
        { type: "reward", label: "道具掉落", position: grid(3) },
        { type: "attribute", label: "角色强度", position: grid(4) },
        { type: "action", label: "进入下个房间", position: grid(5) },
        { type: "feedback", label: "难度提升", position: grid(6) },
      ],
      edges: [
        { sourceIndex: 0, targetIndex: 1, type: "emit" },
        { sourceIndex: 1, targetIndex: 2, type: "emit", label: "触发判定" },
        { sourceIndex: 2, targetIndex: 3, type: "branch", label: "概率掉落" },
        { sourceIndex: 3, targetIndex: 4, type: "modify", label: "拾取强化" },
        { sourceIndex: 4, targetIndex: 5, type: "enable" },
        { sourceIndex: 5, targetIndex: 6, type: "emit", label: "难度+5%" },
        { sourceIndex: 6, targetIndex: 4, type: "inhibit", label: "压制强度" },
      ],
    },
  ],
  attributes: [
    { name: "已清理房间", type: "number", value: "0", description: "本局已清理房间数" },
    { name: "掉落概率", type: "number", value: "0.4", description: "基础掉落概率" },
    { name: "道具拾取", type: "number", value: "0" },
    { name: "强度系数", type: "number", value: "0.1", description: "每件道具强度增量" },
    { name: "角色强度", type: "number", value: "0" },
    { name: "难度系数", type: "number", value: "1.0" },
    { name: "净强度", type: "number", value: "0", description: "扣除难度压制后" },
    { name: "基础掉落", type: "number", value: "0.5", description: "初始掉落概率基准" },
  ],
  formulas: [
    { attrName: "角色强度", expression: "@道具拾取 * @强度系数", description: "强度 = 道具数 × 强度系数" },
    { attrName: "难度系数", expression: "1 + @已清理房间 * 0.05", description: "每清理 1 个房间难度 +5%" },
    { attrName: "掉落概率", expression: "max(0.2, @基础掉落 - @已清理房间 * 0.005)", description: "概率随房间数递减，下限 20%" },
    { attrName: "净强度", expression: "@角色强度 - (@难度系数 - 1) * 10", description: "扣除难度压制后的有效强度" },
  ],
};

// ====== 案例 5：原神 · 元素反应（rpg）======
// 核心循环：火/水技能→元素附着→蒸发反应→反应倍率→最终伤害；体现元素精通对反应的加成曲线
const genshinCase: CaseTemplate = {
  id: "genshin-element-reaction",
  name: "元素反应伤害公式",
  category: "rpg",
  description:
    "拆解《原神》蒸发反应伤害模型：火/水技能附着→触发蒸发→反应倍率（基础 1.5x）+ 元素精通加成→最终伤害。展示动作 RPG 中元素反应的乘区设计逻辑。",
  source: "Genshin Impact",
  tags: ["元素反应", "伤害公式", "元素精通", "动作RPG"],
  graphs: [
    {
      name: "蒸发反应伤害链",
      type: "node_graph",
      nodes: [
        { type: "skill", label: "火元素技能", position: grid(0) },
        { type: "skill", label: "水元素技能", position: grid(1) },
        { type: "state", label: "火元素附着", position: grid(2) },
        { type: "state", label: "水元素附着", position: grid(3) },
        { type: "action", label: "蒸发反应", position: grid(4) },
        { type: "modifier", label: "反应倍率", position: grid(5) },
        { type: "attribute", label: "基础伤害", position: grid(6) },
        { type: "attribute", label: "最终伤害", position: grid(7) },
      ],
      edges: [
        { sourceIndex: 0, targetIndex: 2, type: "emit", label: "施加火元素" },
        { sourceIndex: 1, targetIndex: 3, type: "emit", label: "施加水元素" },
        { sourceIndex: 2, targetIndex: 4, type: "emit", label: "触发反应" },
        { sourceIndex: 3, targetIndex: 4, type: "emit", label: "消耗附着" },
        { sourceIndex: 4, targetIndex: 5, type: "produce", label: "生成倍率" },
        { sourceIndex: 5, targetIndex: 7, type: "modify", label: "乘区加成" },
        { sourceIndex: 6, targetIndex: 7, type: "transform", label: "计算最终值" },
      ],
    },
  ],
  attributes: [
    { name: "角色攻击", type: "number", value: "1500", description: "总攻击力" },
    { name: "元素精通", type: "number", value: "200", description: "提升反应伤害的属性" },
    { name: "火元素伤害", type: "number", value: "80", unit: "%", description: "火元素伤害加成" },
    { name: "水元素伤害", type: "number", value: "60", unit: "%" },
    { name: "反应加成", type: "number", value: "0", unit: "%", description: "精通带来的额外加成" },
    { name: "蒸发倍率", type: "number", value: "1.5", description: "火打水基础倍率" },
    { name: "基础伤害", type: "number", value: "0" },
    { name: "最终伤害", type: "number", value: "0" },
    { name: "暴击伤害", type: "number", value: "2.0", unit: "x" },
  ],
  formulas: [
    { attrName: "反应加成", expression: "6.6 * @元素精通 / (1150 + @元素精通) * 100", description: "精通加成公式（标准曲线）" },
    { attrName: "蒸发倍率", expression: "1.5 + @反应加成 / 100", description: "基础 1.5x + 精通加成" },
    { attrName: "基础伤害", expression: "@角色攻击 * (1 + @火元素伤害 / 100)", description: "攻击 × (1 + 元素伤害%)" },
    { attrName: "最终伤害", expression: "@基础伤害 * @蒸发倍率 * @暴击伤害", description: "三乘区：基础 × 反应 × 暴击" },
  ],
};

export const CASE_LIBRARY: CaseTemplate[] = [
  slayTheSpireCase,
  darkSoulsCase,
  oxygenCase,
  isaacCase,
  genshinCase,
];
