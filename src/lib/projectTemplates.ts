import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useHistoryStore } from "@/stores/historyStore";
import type {
  ProjectTemplate,
  NodeType,
  EdgeType,
  AttributeType,
} from "@/types";

/**
 * 模板内容定义：机制图（节点 + 边）与数值表（属性 + 公式）。
 *
 * 约定：
 * - 节点 label 在同一模板内必须唯一（边通过 sourceLabel/targetLabel 引用节点）
 * - 属性 name 在同一模板内必须唯一（公式通过 attributeName 引用属性）
 * - 公式表达式中以 @属性名 引用其它属性（如 @等级*20+80），使用 mathjs 语法
 *
 * 设计遵循 MDA 框架：机制（节点/边）→ 动态（数值公式）→ 美学（反馈闭环），
 * 节点之间尽量形成闭环（核心循环），降低冷启动门槛。
 */
export interface TemplateContent {
  nodes: Array<{ type: NodeType; label: string; description?: string }>;
  edges: Array<{ sourceLabel: string; targetLabel: string; type: EdgeType }>;
  attributes: Array<{
    name: string;
    type: AttributeType;
    value: string;
    description?: string;
    /** 父属性名（用于树形结构，需在列表中先于本属性出现） */
    parentName?: string;
  }>;
  formulas: Array<{
    attributeName: string;
    expression: string;
    description?: string;
  }>;
}

// ====== 战斗系统模板 ======
// 核心循环：玩家攻击 → 造成伤害 → 敌人受伤 → 判定存活 → 反击/奖励 → 经验 → 升级 → 攻击力提升 → 回流到伤害
const combatTemplate: TemplateContent = {
  nodes: [
    { type: "event", label: "玩家攻击", description: "玩家发起攻击输入" },
    { type: "action", label: "造成伤害", description: "计算并施加伤害" },
    { type: "state", label: "敌人受伤", description: "敌人血量减少" },
    { type: "condition", label: "敌人血量>0?", description: "判断敌人是否存活" },
    { type: "condition", label: "敌人血量<=0?", description: "判断敌人是否死亡" },
    { type: "action", label: "敌人反击", description: "存活则反击玩家" },
    { type: "penalty", label: "玩家受伤", description: "玩家受到反击伤害" },
    { type: "reward", label: "获得经验", description: "击杀后获得经验" },
    { type: "resource", label: "经验值", description: "经验资源累积" },
    { type: "level", label: "角色等级", description: "经验驱动的等级成长" },
    { type: "modifier", label: "攻击力提升", description: "等级带来的攻击力加成" },
  ],
  edges: [
    { sourceLabel: "玩家攻击", targetLabel: "造成伤害", type: "emit" },
    { sourceLabel: "造成伤害", targetLabel: "敌人受伤", type: "emit" },
    { sourceLabel: "敌人受伤", targetLabel: "敌人血量>0?", type: "pass" },
    { sourceLabel: "敌人受伤", targetLabel: "敌人血量<=0?", type: "pass" },
    { sourceLabel: "敌人血量>0?", targetLabel: "敌人反击", type: "emit" },
    { sourceLabel: "敌人反击", targetLabel: "玩家受伤", type: "produce" },
    { sourceLabel: "敌人血量<=0?", targetLabel: "获得经验", type: "emit" },
    { sourceLabel: "获得经验", targetLabel: "经验值", type: "produce" },
    { sourceLabel: "经验值", targetLabel: "角色等级", type: "emit" },
    { sourceLabel: "角色等级", targetLabel: "攻击力提升", type: "enable" },
    // 反馈闭环：攻击力提升回流到「造成伤害」
    { sourceLabel: "攻击力提升", targetLabel: "造成伤害", type: "modify" },
  ],
  attributes: [
    { name: "等级", type: "number", value: "1", description: "角色当前等级" },
    { name: "经验", type: "number", value: "0", description: "当前已获经验" },
    { name: "经验需求", type: "number", value: "100", description: "升至下一级所需经验" },
    { name: "生命值", type: "number", value: "100", description: "角色最大生命值" },
    { name: "攻击力", type: "number", value: "10", description: "基础攻击力" },
    { name: "防御力", type: "number", value: "5", description: "基础防御力" },
    { name: "暴击率", type: "number", value: "0.1", description: "暴击触发概率" },
  ],
  formulas: [
    { attributeName: "生命值", expression: "@等级*20+80", description: "生命值随等级线性成长" },
    { attributeName: "攻击力", expression: "@等级*2+8", description: "攻击力随等级线性成长" },
    { attributeName: "经验需求", expression: "pow(@等级,2)*100", description: "经验需求随等级平方增长" },
  ],
};

// ====== 经济系统模板 ======
// 核心循环：完成任务 → 金币 → 购买材料 → 材料 → 合成装备 → 背包 → 背包满? → 出售物品 → 金币（回流）
const economyTemplate: TemplateContent = {
  nodes: [
    { type: "event", label: "完成任务", description: "玩家完成一个任务" },
    { type: "reward", label: "金币奖励", description: "任务产出金币" },
    { type: "resource", label: "金币", description: "通用货币" },
    { type: "converter", label: "购买材料", description: "金币兑换材料" },
    { type: "resource", label: "材料", description: "合成用材料" },
    { type: "converter", label: "合成装备", description: "材料合成装备" },
    { type: "pool", label: "背包容量", description: "装备存储上限" },
    { type: "condition", label: "背包已满?", description: "判断背包是否已满" },
    { type: "penalty", label: "无法拾取", description: "背包满时无法获得新装备" },
    { type: "event", label: "出售物品", description: "玩家出售装备换金币" },
  ],
  edges: [
    { sourceLabel: "完成任务", targetLabel: "金币奖励", type: "emit" },
    { sourceLabel: "金币奖励", targetLabel: "金币", type: "produce" },
    // 金币流向转换器被消耗
    { sourceLabel: "金币", targetLabel: "购买材料", type: "consume" },
    { sourceLabel: "购买材料", targetLabel: "材料", type: "produce" },
    { sourceLabel: "材料", targetLabel: "合成装备", type: "consume" },
    { sourceLabel: "合成装备", targetLabel: "背包容量", type: "produce" },
    { sourceLabel: "背包容量", targetLabel: "背包已满?", type: "pass" },
    { sourceLabel: "背包已满?", targetLabel: "无法拾取", type: "emit" },
    // 反馈闭环：出售物品消耗背包内容、产出金币，回到金币节点
    { sourceLabel: "出售物品", targetLabel: "背包容量", type: "consume" },
    { sourceLabel: "出售物品", targetLabel: "金币", type: "produce" },
  ],
  attributes: [
    { name: "金币", type: "number", value: "0", description: "当前持有金币" },
    { name: "材料", type: "number", value: "0", description: "当前持有材料数" },
    { name: "背包容量", type: "number", value: "20", description: "背包最大格数" },
    { name: "物品价值", type: "number", value: "50", description: "单件装备平均价值" },
    { name: "材料单价", type: "number", value: "10", description: "单份材料购买价格" },
    { name: "税率", type: "number", value: "0.1", description: "交易税率" },
    { name: "利润率", type: "number", value: "0.2", description: "出售利润率" },
  ],
  formulas: [
    { attributeName: "物品价值", expression: "@材料单价*5", description: "装备价值与材料单价挂钩" },
    { attributeName: "利润率", expression: "@税率+0.1", description: "利润率随税率浮动" },
  ],
};

// ====== RPG 模板（最完整） ======
// 双分支：战斗线（战斗→AI→奖励→升级→属性→回流战斗）+ 对话线（对话→NPC关系）
// 反馈线：升级→难度自适应→影响敌人AI
const rpgTemplate: TemplateContent = {
  nodes: [
    { type: "event", label: "接受任务", description: "玩家接取任务" },
    { type: "action", label: "探索地图", description: "在地图上移动探索" },
    { type: "event", label: "遭遇敌人", description: "随机遭遇敌人" },
    { type: "condition", label: "是否战斗?", description: "选择战斗或对话" },
    { type: "action", label: "战斗", description: "进入战斗流程" },
    { type: "ai_behavior", label: "敌人AI决策", description: "敌人行为决策" },
    { type: "reward", label: "战斗奖励", description: "经验与金币奖励" },
    { type: "level", label: "角色升级", description: "经验达标后升级" },
    { type: "modifier", label: "属性提升", description: "升级带来的属性增益" },
    { type: "action", label: "对话", description: "与 NPC 交流" },
    { type: "social", label: "NPC关系", description: "NPC 好感度" },
    { type: "feedback", label: "难度自适应", description: "根据等级调整敌人强度" },
  ],
  edges: [
    { sourceLabel: "接受任务", targetLabel: "探索地图", type: "emit" },
    { sourceLabel: "探索地图", targetLabel: "遭遇敌人", type: "emit" },
    { sourceLabel: "遭遇敌人", targetLabel: "是否战斗?", type: "pass" },
    // 战斗分支
    { sourceLabel: "是否战斗?", targetLabel: "战斗", type: "emit" },
    { sourceLabel: "战斗", targetLabel: "敌人AI决策", type: "emit" },
    { sourceLabel: "敌人AI决策", targetLabel: "战斗", type: "modify" },
    { sourceLabel: "战斗", targetLabel: "战斗奖励", type: "produce" },
    { sourceLabel: "战斗奖励", targetLabel: "角色升级", type: "produce" },
    { sourceLabel: "角色升级", targetLabel: "属性提升", type: "enable" },
    // 反馈闭环：属性提升回流到战斗
    { sourceLabel: "属性提升", targetLabel: "战斗", type: "modify" },
    // 对话分支
    { sourceLabel: "是否战斗?", targetLabel: "对话", type: "emit" },
    { sourceLabel: "对话", targetLabel: "NPC关系", type: "produce" },
    // 难度自适应反馈线
    { sourceLabel: "角色升级", targetLabel: "难度自适应", type: "emit" },
    { sourceLabel: "难度自适应", targetLabel: "敌人AI决策", type: "subscribe" },
  ],
  attributes: [
    { name: "等级", type: "number", value: "1", description: "角色等级" },
    { name: "经验", type: "number", value: "0", description: "当前经验值" },
    { name: "生命", type: "number", value: "100", description: "最大生命值" },
    { name: "魔法", type: "number", value: "50", description: "最大魔法值" },
    { name: "攻击", type: "number", value: "10", description: "攻击力" },
    { name: "防御", type: "number", value: "5", description: "防御力" },
    { name: "敏捷", type: "number", value: "8", description: "敏捷度" },
    { name: "智力", type: "number", value: "8", description: "智力值" },
    { name: "暴击", type: "number", value: "0.1", description: "暴击率" },
    { name: "闪避", type: "number", value: "0.05", description: "闪避率" },
  ],
  formulas: [
    { attributeName: "生命", expression: "@等级*20+80", description: "生命随等级成长" },
    { attributeName: "魔法", expression: "@等级*10+40", description: "魔法随等级成长" },
    { attributeName: "攻击", expression: "@等级*2+8", description: "攻击随等级成长" },
    { attributeName: "防御", expression: "@等级*1+4", description: "防御随等级成长" },
    { attributeName: "暴击", expression: "@敏捷*0.005+0.05", description: "敏捷影响暴击" },
    { attributeName: "闪避", expression: "@敏捷*0.01", description: "敏捷影响闪避" },
  ],
};

// ====== 空白模板：不预置任何内容 ======
const blankTemplate: TemplateContent = {
  nodes: [],
  edges: [],
  attributes: [],
  formulas: [],
};

export const PROJECT_TEMPLATES: Record<ProjectTemplate, TemplateContent> = {
  blank: blankTemplate,
  combat: combatTemplate,
  economy: economyTemplate,
  rpg: rpgTemplate,
};

/**
 * 将模板内容应用到已创建的机制图与数值表。
 *
 * 执行顺序：
 * 1. 切换机制图上下文 → 添加全部节点（记录 label→id）→ 添加全部边（用映射解析端点）
 * 2. 切换数值表上下文 → 添加全部属性（记录 name→id，处理 parentName）→ 添加全部公式
 * 3. blank 模板直接返回
 * 4. 完成后清空历史，避免模板生成的大量操作被逐条撤销
 *
 * @param template 模板类型
 * @param graphId 已创建的机制图 ID
 * @param sheetId 已创建的数值表 ID
 */
export async function applyTemplate(
  template: ProjectTemplate,
  graphId: string,
  sheetId: string
): Promise<void> {
  // 空白模板不预置内容
  if (template === "blank") return;

  const content = PROJECT_TEMPLATES[template];
  const mechanismStore = useMechanismStore.getState();
  const numericStore = useNumericStore.getState();
  const historyStore = useHistoryStore.getState();

  // ===== 1. 机制图：节点 + 边 =====
  // 切换到目标图，使 addNode/addEdge 写入正确的 graphId
  await mechanismStore.selectGraph(graphId);

  const labelToNodeId = new Map<string, string>();
  // 网格布局：每行 4 个节点，避免初始堆叠
  const cols = 4;
  const stepX = 220;
  const stepY = 140;
  for (let i = 0; i < content.nodes.length; i++) {
    const nodeDef = content.nodes[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const nodeId = await mechanismStore.addNode(
      nodeDef.type,
      { x: col * stepX, y: row * stepY },
      nodeDef.label
    );
    if (nodeId) {
      labelToNodeId.set(nodeDef.label, nodeId);
    }
  }

  // 添加边：用 label→id 映射解析 source/target
  for (const edgeDef of content.edges) {
    const source = labelToNodeId.get(edgeDef.sourceLabel);
    const target = labelToNodeId.get(edgeDef.targetLabel);
    if (!source || !target) {
      console.warn(
        `[applyTemplate] 跳过边：找不到节点 source="${edgeDef.sourceLabel}" target="${edgeDef.targetLabel}"`
      );
      continue;
    }
    await mechanismStore.addEdge({ source, target, type: edgeDef.type });
  }

  // ===== 2. 数值表：属性 + 公式 =====
  // 切换到目标表，使 addAttribute/updateFormula 写入正确的 sheetId
  await numericStore.selectSheet(sheetId);

  const nameToAttrId = new Map<string, string>();
  // 先添加无父级的属性，再添加有父级的属性，保证 parentName 可解析
  const orderedAttributes = [
    ...content.attributes.filter((a) => !a.parentName),
    ...content.attributes.filter((a) => a.parentName),
  ];
  for (const attrDef of orderedAttributes) {
    const parentId = attrDef.parentName
      ? nameToAttrId.get(attrDef.parentName) ?? null
      : null;
    const attr = await numericStore.addAttribute(parentId, attrDef.name, attrDef.type);
    nameToAttrId.set(attrDef.name, attr.id);
    // addAttribute 默认值为 0/false/""，需覆盖为模板预置值与描述
    const updates: { value: string; description?: string } = { value: attrDef.value };
    if (attrDef.description) updates.description = attrDef.description;
    await numericStore.updateAttribute(attr.id, updates);
  }

  // 添加公式：用 name→id 映射解析 attributeName
  for (const formulaDef of content.formulas) {
    const attrId = nameToAttrId.get(formulaDef.attributeName);
    if (!attrId) {
      console.warn(
        `[applyTemplate] 跳过公式：找不到属性 "${formulaDef.attributeName}"`
      );
      continue;
    }
    await numericStore.updateFormula(
      attrId,
      formulaDef.expression,
      formulaDef.description
    );
  }

  // ===== 3. 清空历史 =====
  // 模板生成是一次性批量操作，不应被逐条撤销；进入项目页时也会再次清空
  historyStore.clear();
}
