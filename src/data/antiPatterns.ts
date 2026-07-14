/**
 * 反模式案例：常见的设计陷阱与修正建议。
 * 用于 AI 导师面板的主动匹配与提示。
 */
export interface AntiPattern {
  id: string;
  title: string;
  category: "mechanism" | "numeric" | "gdd" | "structure";
  severity: "high" | "medium" | "low";
  problem: string; // 问题描述
  why: string; // 为什么是问题
  solution: string; // 如何修正
  example?: string; // 示例
}

export const ANTI_PATTERNS: AntiPattern[] = [
  {
    id: "mechanism-too-many-no-layer",
    title: "机制图节点过多无分层",
    category: "mechanism",
    severity: "high",
    problem:
      "机制图节点数量很多，但没有按逻辑层 / 资源层 / 反馈层等维度分层，节点堆在一起难以看出玩法骨架。",
    why: "没有分层的机制图像一团乱麻，新人看不懂、维护时容易改错，也难以判断核心循环是否完整。MDA 框架要求机制有清晰的结构层次。",
    solution:
      "按维度归类节点：逻辑层（事件/行为/状态/条件）作为骨架，资源层、反馈层、成长层围绕骨架组织；用分组或子图把同类节点折叠，先看核心循环再看细节。",
    example:
      "把「击杀敌人→造成伤害→敌人死亡→掉落装备→装备强化」作为核心链，再在周围补充资源/反馈节点，而不是平铺 30 个节点。",
  },
  {
    id: "numeric-curve-too-steep-early",
    title: "数值曲线前期太陡",
    category: "numeric",
    severity: "high",
    problem:
      "前期（1-10 级）数值增长过快，例如用了高底数指数公式 pow(1.5, 等级)，几级后数值就翻几十倍。",
    why: "前期太陡会导致新手期数值失控、平衡崩盘，玩家很快进入数值膨胀，后续内容跟不上，留存断崖式下跌。",
    solution:
      "前期用线性或低底数多项式（如 等级*10+50），中后期再过渡到指数/对数；在 10/20/30 级设置拐点，让成长有节奏感而非一路陡升。",
    example:
      "前期：@等级 * 10 + 50（线性）；中期：@等级 * (@等级 + 10) * 5（多项式加速）；后期：log(@等级 + 1) * 200（边际递减）。",
  },
  {
    id: "gdd-no-core-loop",
    title: "GDD 无核心循环描述",
    category: "gdd",
    severity: "high",
    problem: "游戏设计文档缺少「核心循环（Core Loop）」章节，没有说清玩家反复执行的核心玩法闭环。",
    why: "核心循环是玩法的灵魂，没有它团队无法对齐「玩家到底在反复做什么」，容易做成功能堆砌而非有节奏的体验。",
    solution:
      "在 GDD「核心机制」章节用一句话+流程图描述核心循环：事件触发 → 行为执行 → 状态变化 → 资源/奖励产出 → 反馈影响下一次事件。每个环节对应机制图节点。",
    example:
      "核心循环：击杀敌人(事件) → 造成伤害(行为) → 敌人死亡(状态) → 掉落装备(产出) → 装备强化角色(反馈) → 挑战更强敌人(事件)。",
  },
  {
    id: "no-resource-sink",
    title: "无资源消耗机制（经济通胀）",
    category: "mechanism",
    severity: "medium",
    problem: "有资源产出节点（produce/奖励），但没有资源消耗节点（consume/池），资源只进不出。",
    why: "资源只产出不消耗会导致经济通胀，后期玩家资源堆积如山、失去追求动力，数值平衡彻底失效。",
    solution:
      "为每个产出节点配一个消耗出口：升级消耗金币、强化消耗材料、体力限制行动次数；用 pool（资源池）节点设定上限，用 consume 边显式标注消耗关系。",
    example:
      "「击杀敌人 → 产出金币 → 升级消耗金币 → 提升等级」形成资源闭环，而不是金币无限累积。",
  },
  {
    id: "reward-too-uniform",
    title: "奖励过于均匀（缺乏惊喜）",
    category: "mechanism",
    severity: "medium",
    problem: "所有奖励节点的产出固定且相近，没有稀有度差异和随机性，玩家每次行为得到一样的回报。",
    why: "均匀奖励让奖励变成「例行公事」，失去期待感和多巴胺刺激，玩家很快感到枯燥，长线留存差。",
    solution:
      "引入稀有度梯度（普通/稀有/史诗/传说）和 rng（随机数）节点，让奖励有概率波动；关键节点设置大奖作为「啊哈时刻」。",
    example:
      "击杀普通敌人：80% 概率掉落金币、15% 掉落药水、5% 掉落装备；击杀 Boss：必掉稀有装备 + 概率掉传说道具。",
  },
  {
    id: "formula-too-complex",
    title: "公式过于复杂（可读性差）",
    category: "numeric",
    severity: "low",
    problem: "单个公式嵌套层次过深、运算符过多，一眼看不懂在算什么，例如 if(if(if(...)), pow(log(...)+@a*(@b-@c), 2), ...)。",
    why: "复杂公式难以维护、难以调平衡，新人接手时无法理解设计意图，调一个参数可能引发连锁问题。",
    solution:
      "把复杂公式拆成多个中间属性：先算「基础攻击力」「加成系数」「最终攻击力」三步，每步公式简短可读；用 description 字段说明每步含义。",
    example:
      "拆分前：@攻击力 * (1 + @暴击率 * (@暴击伤害 - 1)) * if(@防御力>0, 1-@防御力/(@防御力+100), 1)；拆分后：先算「有效防御=if(@防御力>0,...)」，再算「暴击期望=1+@暴击率*(@暴击伤害-1)」，最后「伤害=@攻击力*暴击期望*有效防御」。",
  },
  {
    id: "no-failure-penalty",
    title: "无失败惩罚（缺乏紧张感）",
    category: "mechanism",
    severity: "medium",
    problem: "机制图没有任何 penalty（惩罚）节点，玩家失败没有任何损失，玩法缺少紧张感和挑战压力。",
    why: "没有惩罚的正反馈会让游戏变成「无脑刷」，玩家很快厌倦；适当的负反馈才能形成心流通道，让成功有意义。",
    solution:
      "加入 penalty 节点：死亡掉落经验/装备、失败进入冷却、连击中断惩罚；用 inhibit（抑制）边把惩罚连接到行为节点，形成负反馈回路。",
    example:
      "「玩家死亡(事件) → 扣除经验(惩罚) → 装备耐久损耗(惩罚) → 复活冷却(惩罚)」，让死亡有代价，提升紧张感。",
  },
  {
    id: "node-type-misuse",
    title: "节点类型误用（如用 resource 表示状态）",
    category: "mechanism",
    severity: "low",
    problem: "节点类型与语义不匹配，例如用 resource（资源）表示玩家的存活状态，或用 state（状态）表示可累积的金币。",
    why: "类型误用会导致后续分析、模拟、统计失真，工具按类型推断的行为会出错，团队沟通也产生歧义。",
    solution:
      "按节点语义选择正确类型：可累积的量用 resource/pool；当前情况用 state；能力维度用 attribute；临时增益用 modifier。不确定时参考节点类型说明。",
    example:
      "玩家血量应使用 attribute（属性）+ 数值表公式管理，而非 state；金币应使用 resource，当前是否持有钥匙应使用 state 而非 resource。",
  },
  {
    id: "numeric-no-cap",
    title: "数值无上限（溢出风险）",
    category: "numeric",
    severity: "medium",
    problem: "数值属性没有设置上限，公式在极端等级或叠加修饰符后可能产生极大数值，存在溢出和平衡崩盘风险。",
    why: "无上限数值在后期会指数膨胀，导致 DPS 计算失效、显示溢出、玩法失去挑战，也增加前端渲染与存储负担。",
    solution:
      "为关键属性设置上限：用 min(计算值, 上限) 包裹公式，或在 pool 节点定义容量；极端等级做边界测试，确保 30 级 / 满叠加下数值合理。",
    example:
      "攻击力公式改为 min(@等级 * 10 + 50, 999)；生命值用 pool 限制上限 9999，避免溢出。",
  },
  {
    id: "gdd-too-long-no-structure",
    title: "GDD 过于冗长无结构",
    category: "gdd",
    severity: "low",
    problem: "游戏设计文档段落很多但缺少标题分层，大段文字堆砌，找不到重点，难以快速定位某个设计点。",
    why: "无结构的 GDD 失去沟通工具的作用，团队不会读、读了也找不到信息，文档变成「写了就忘」的废纸。",
    solution:
      "用清晰的二级标题分章（游戏概述/核心机制/数值系统/玩法流程/设计风险），每段不超过 3-5 行；重要结论用列表或表格，避免长段落。",
    example:
      "用「## 核心机制」「### 玩家能做什么」「### 规则约束」分层，而非把所有内容写成 10 段连续文字。",
  },
];
