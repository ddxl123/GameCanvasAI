import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/ui/Modal";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import { useHistoryStore } from "@/stores/historyStore";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import { cn } from "@/lib/utils";
import type {
  Project,
  ProjectTemplate,
  MechanismGraph,
  GraphNode,
  GraphEdge,
  NumericSheet,
  Attribute,
  Formula,
  GDDDocument,
  DocSection,
  NodeType,
  EdgeType,
} from "@/types";
import {
  Scroll,
  Zap,
  Crown,
  Dices,
  Coins,
  Puzzle,
  Globe,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Sparkles,
} from "lucide-react";

// ===== 类型定义 =====

interface GameTypeOption {
  value: string;
  label: string;
  description: string;
  icon: typeof Scroll;
  template: ProjectTemplate;
}

interface NodeDef {
  type: NodeType;
  label: string;
}

interface EdgeDef {
  sourceLabel: string;
  targetLabel: string;
  type: EdgeType;
}

interface AttrDef {
  name: string;
  value: string;
  unit?: string;
  description?: string;
}

interface FormulaDef {
  attrName: string;
  expression: string;
  description?: string;
}

interface Skeleton {
  nodes: NodeDef[];
  edges: EdgeDef[];
  attributes: AttrDef[];
  formulas: FormulaDef[];
}

interface GuidedCreationWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ===== 游戏类型 =====

const GAME_TYPES: GameTypeOption[] = [
  {
    value: "rpg",
    label: "RPG",
    description: "角色成长、剧情探索",
    icon: Scroll,
    template: "rpg",
  },
  {
    value: "action",
    label: "动作",
    description: "操作反应、战斗得分",
    icon: Zap,
    template: "combat",
  },
  {
    value: "strategy",
    label: "策略",
    description: "资源经营、战术决策",
    icon: Crown,
    template: "economy",
  },
  {
    value: "roguelike",
    label: "Roguelike",
    description: "随机关卡、永久死亡",
    icon: Dices,
    template: "combat",
  },
  {
    value: "management",
    label: "经营",
    description: "资产积累、收益循环",
    icon: Coins,
    template: "economy",
  },
  {
    value: "puzzle",
    label: "解谜",
    description: "逻辑推理、关卡挑战",
    icon: Puzzle,
    template: "blank",
  },
  {
    value: "simulation",
    label: "模拟",
    description: "系统演化、反馈循环",
    icon: Globe,
    template: "blank",
  },
];

const STEP_LABELS = ["游戏类型", "核心玩法", "目标与机制", "确认生成"];

const CORE_GAMEPLAY_EXAMPLES = [
  "玩家在末世收集记忆碎片解锁身世",
  "控制小球在赛道上躲避障碍抵达终点",
  "经营一座荒岛农场并吸引游客到访",
];

// ===== 类型 → 设计骨架映射 =====

const SKELETONS: Record<string, Skeleton> = {
  rpg: {
    nodes: [
      { type: "event", label: "进入战斗" },
      { type: "action", label: "攻击" },
      { type: "condition", label: "判定" },
      { type: "reward", label: "经验" },
      { type: "level", label: "升级" },
    ],
    edges: [
      { sourceLabel: "进入战斗", targetLabel: "攻击", type: "emit" },
      { sourceLabel: "攻击", targetLabel: "判定", type: "emit" },
      { sourceLabel: "判定", targetLabel: "经验", type: "branch" },
      { sourceLabel: "经验", targetLabel: "升级", type: "produce" },
      { sourceLabel: "升级", targetLabel: "攻击", type: "modify" },
    ],
    attributes: [
      { name: "生命值", value: "100", description: "角色最大生命值" },
      { name: "攻击力", value: "10", description: "基础攻击力" },
      { name: "防御力", value: "5", description: "基础防御力" },
      { name: "经验", value: "0", description: "当前已获经验" },
      { name: "等级", value: "1", description: "角色当前等级" },
      { name: "经验需求", value: "100", description: "升至下一级所需经验" },
      { name: "伤害", value: "0", description: "对敌人造成的伤害" },
    ],
    formulas: [
      {
        attrName: "经验需求",
        expression: "@等级*100",
        description: "经验需求 = 等级 * 100",
      },
      {
        attrName: "伤害",
        expression: "@攻击力-@防御力*0.5",
        description: "伤害 = 攻击力 - 防御力 * 0.5",
      },
    ],
  },
  action: {
    nodes: [
      { type: "event", label: "玩家输入" },
      { type: "action", label: "移动" },
      { type: "action", label: "攻击" },
      { type: "enemy", label: "敌人" },
      { type: "reward", label: "得分" },
    ],
    edges: [
      { sourceLabel: "玩家输入", targetLabel: "移动", type: "emit" },
      { sourceLabel: "移动", targetLabel: "攻击", type: "emit" },
      { sourceLabel: "攻击", targetLabel: "敌人", type: "interact" },
      { sourceLabel: "敌人", targetLabel: "得分", type: "produce" },
      { sourceLabel: "得分", targetLabel: "玩家输入", type: "modify" },
    ],
    attributes: [
      { name: "生命值", value: "100", description: "玩家生命值" },
      { name: "攻击力", value: "10", description: "单次攻击伤害" },
      { name: "得分", value: "0", description: "当前得分" },
      { name: "连击数", value: "0", description: "当前连击数" },
      { name: "移动速度", value: "5", unit: "m/s", description: "玩家移动速度" },
      { name: "伤害", value: "0", description: "单次造成的伤害" },
    ],
    formulas: [
      {
        attrName: "得分",
        expression: "@连击数*10",
        description: "得分 = 连击数 * 10",
      },
      {
        attrName: "伤害",
        expression: "@攻击力*2",
        description: "伤害 = 攻击力 * 2",
      },
    ],
  },
  strategy: {
    nodes: [
      { type: "resource", label: "资源" },
      { type: "converter", label: "建造" },
      { type: "action", label: "生产单位" },
      { type: "condition", label: "策略判定" },
      { type: "reward", label: "胜利" },
    ],
    edges: [
      { sourceLabel: "资源", targetLabel: "建造", type: "consume" },
      { sourceLabel: "建造", targetLabel: "生产单位", type: "produce" },
      { sourceLabel: "生产单位", targetLabel: "策略判定", type: "emit" },
      { sourceLabel: "策略判定", targetLabel: "胜利", type: "branch" },
      { sourceLabel: "胜利", targetLabel: "资源", type: "modify" },
    ],
    attributes: [
      { name: "金币", value: "100", description: "通用货币" },
      { name: "木材", value: "50", description: "建造材料" },
      { name: "人口", value: "10", description: "当前人口数" },
      { name: "军队数量", value: "5", description: "已生产单位数" },
      { name: "维护费", value: "0", description: "每回合维护消耗" },
      { name: "总产出", value: "0", description: "每回合总产出" },
    ],
    formulas: [
      {
        attrName: "维护费",
        expression: "@军队数量*5",
        description: "维护费 = 军队数量 * 5",
      },
      {
        attrName: "总产出",
        expression: "@军队数量*2+@人口",
        description: "总产出 = 军队数量 * 2 + 人口",
      },
    ],
  },
  roguelike: {
    nodes: [
      { type: "event", label: "进入房间" },
      { type: "rng", label: "随机生成" },
      { type: "enemy", label: "敌人" },
      { type: "action", label: "战斗" },
      { type: "reward", label: "掉落" },
      { type: "condition", label: "死亡判定" },
    ],
    edges: [
      { sourceLabel: "进入房间", targetLabel: "随机生成", type: "emit" },
      { sourceLabel: "随机生成", targetLabel: "敌人", type: "produce" },
      { sourceLabel: "敌人", targetLabel: "战斗", type: "emit" },
      { sourceLabel: "战斗", targetLabel: "掉落", type: "produce" },
      { sourceLabel: "战斗", targetLabel: "死亡判定", type: "emit" },
      { sourceLabel: "死亡判定", targetLabel: "进入房间", type: "branch" },
    ],
    attributes: [
      { name: "生命值", value: "100", description: "当前生命值" },
      { name: "攻击力", value: "10", description: "基础攻击力" },
      { name: "楼层", value: "1", description: "当前地下城楼层" },
      { name: "金币", value: "0", description: "持有金币" },
      { name: "实际伤害", value: "0", description: "含楼层加成的伤害" },
      { name: "暴击率", value: "0.1", description: "暴击触发概率" },
      { name: "经验需求", value: "100", description: "下一层所需经验" },
    ],
    formulas: [
      {
        attrName: "实际伤害",
        expression: "@攻击力*(1+@楼层*0.1)",
        description: "实际伤害 = 攻击力 * (1 + 楼层 * 0.1)",
      },
      {
        attrName: "经验需求",
        expression: "@楼层*100",
        description: "经验需求 = 楼层 * 100",
      },
    ],
  },
  management: {
    nodes: [
      { type: "resource", label: "资金" },
      { type: "converter", label: "投资" },
      { type: "pool", label: "资产" },
      { type: "action", label: "经营" },
      { type: "reward", label: "收益" },
    ],
    edges: [
      { sourceLabel: "资金", targetLabel: "投资", type: "consume" },
      { sourceLabel: "投资", targetLabel: "资产", type: "produce" },
      { sourceLabel: "资产", targetLabel: "经营", type: "emit" },
      { sourceLabel: "经营", targetLabel: "收益", type: "produce" },
      { sourceLabel: "收益", targetLabel: "资金", type: "produce" },
    ],
    attributes: [
      { name: "资金", value: "1000", description: "当前资金" },
      { name: "员工数", value: "10", description: "雇员数量" },
      { name: "知名度", value: "0", description: "品牌知名度" },
      { name: "客户满意度", value: "0.8", description: "满意度 0-1" },
      { name: "资产", value: "0", description: "固定资产总额" },
      { name: "收益", value: "0", description: "每周期收益" },
    ],
    formulas: [
      {
        attrName: "收益",
        expression: "@资金*0.1",
        description: "收益 = 资金 * 0.1",
      },
      {
        attrName: "知名度",
        expression: "@客户满意度*@员工数",
        description: "知名度 = 客户满意度 * 员工数",
      },
    ],
  },
  puzzle: {
    nodes: [
      { type: "event", label: "开始关卡" },
      { type: "state", label: "关卡状态" },
      { type: "condition", label: "谜题判定" },
      { type: "action", label: "操作" },
      { type: "reward", label: "解锁" },
    ],
    edges: [
      { sourceLabel: "开始关卡", targetLabel: "关卡状态", type: "emit" },
      { sourceLabel: "关卡状态", targetLabel: "谜题判定", type: "emit" },
      { sourceLabel: "谜题判定", targetLabel: "操作", type: "branch" },
      { sourceLabel: "操作", targetLabel: "解锁", type: "produce" },
    ],
    attributes: [
      { name: "步数", value: "0", unit: "步", description: "已用步数" },
      { name: "时间", value: "60", unit: "秒", description: "剩余时间" },
      { name: "得分", value: "0", description: "关卡得分" },
      { name: "关卡数", value: "1", description: "当前关卡序号" },
      { name: "星级", value: "0", description: "通关星级 0-3" },
    ],
    formulas: [
      {
        attrName: "得分",
        expression: "@关卡数*100-@步数*2",
        description: "得分 = 关卡数 * 100 - 步数 * 2",
      },
      {
        attrName: "星级",
        expression: "@得分/100",
        description: "星级 = 得分 / 100",
      },
    ],
  },
  simulation: {
    nodes: [
      { type: "event", label: "开始模拟" },
      { type: "state", label: "世界状态" },
      { type: "action", label: "系统更新" },
      { type: "feedback", label: "反馈" },
      { type: "reward", label: "系统输出" },
    ],
    edges: [
      { sourceLabel: "开始模拟", targetLabel: "世界状态", type: "emit" },
      { sourceLabel: "世界状态", targetLabel: "系统更新", type: "emit" },
      { sourceLabel: "系统更新", targetLabel: "反馈", type: "emit" },
      { sourceLabel: "反馈", targetLabel: "系统输出", type: "produce" },
    ],
    attributes: [
      { name: "时间", value: "0", unit: "秒", description: "模拟时间" },
      { name: "人口", value: "100", description: "总人口数" },
      { name: "资源", value: "500", description: "可用资源" },
      { name: "幸福度", value: "0.8", description: "幸福度 0-1" },
      { name: "科技等级", value: "1", description: "科技发展等级" },
      { name: "增长率", value: "0", description: "人口增长率" },
    ],
    formulas: [
      {
        attrName: "幸福度",
        expression: "@资源/(@人口*10)",
        description: "幸福度 = 资源 / (人口 * 10)",
      },
      {
        attrName: "增长率",
        expression: "@幸福度*0.01-0.005",
        description: "增长率 = 幸福度 * 0.01 - 0.005",
      },
    ],
  },
};

// ===== 工具函数 =====

/** 从核心玩法描述中提取关键词作为项目名称 */
function extractProjectName(coreGameplay: string): string {
  const t = coreGameplay.trim();
  if (!t) return "新游戏项目";
  // 去除常见开头词（玩家/在/游戏中/你/的），重复出现也一并清除
  const cleaned = t.replace(/^(玩家|在|游戏中|游戏里|你|的)+/, "");
  const name = cleaned.slice(0, 6);
  return name || t.slice(0, 6);
}

// ===== 主组件 =====

export default function GuidedCreationWizard({
  open,
  onOpenChange,
}: GuidedCreationWizardProps) {
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState("");
  const [coreGameplay, setCoreGameplay] = useState("");
  const [playerGoal, setPlayerGoal] = useState("");
  const [uniqueMechanic, setUniqueMechanic] = useState("");
  const [generating, setGenerating] = useState(false);

  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();

  const resetWizard = () => {
    setStep(0);
    setSelectedType("");
    setCoreGameplay("");
    setPlayerGoal("");
    setUniqueMechanic("");
  };

  const gameType = GAME_TYPES.find((g) => g.value === selectedType);
  const skeleton = selectedType ? SKELETONS[selectedType] : null;

  const canNext =
    step === 0
      ? !!selectedType
      : step === 1
        ? coreGameplay.trim().length > 0
        : true;

  const handleNext = () => {
    if (!canNext) return;
    setStep((s) => Math.min(s + 1, STEP_LABELS.length - 1));
  };

  const handlePrev = () => {
    setStep((s) => Math.max(s - 1, 0));
  };

  const handleGenerate = async () => {
    if (!gameType || !skeleton) return;
    setGenerating(true);
    try {
      const ts = now();
      const projectId = generateId("proj");
      const projectName = extractProjectName(coreGameplay);
      const gameplayText = coreGameplay.trim();
      const goalText = playerGoal.trim() || "未填写";
      const mechanicText = uniqueMechanic.trim() || "未填写";

      // 1. 项目
      const project: Project = {
        id: projectId,
        name: projectName,
        description: gameplayText,
        template: gameType.template,
        createdAt: ts,
        updatedAt: ts,
      };

      // 2. 机制图 + 节点 + 边（网格布局）
      const graphId = generateId("graph");
      const graph: MechanismGraph = {
        id: graphId,
        projectId,
        name: "主机制图",
        type: "node_graph",
        createdAt: ts,
        updatedAt: ts,
      };

      const cols = 4;
      const stepX = 220;
      const stepY = 140;
      const labelToNodeId = new Map<string, string>();
      const nodes: GraphNode[] = skeleton.nodes.map((n, i) => {
        const id = generateId("node");
        labelToNodeId.set(n.label, id);
        const col = i % cols;
        const row = Math.floor(i / cols);
        return {
          id,
          graphId,
          type: n.type,
          label: n.label,
          data: {},
          position: { x: col * stepX, y: row * stepY },
        };
      });

      const edges: GraphEdge[] = [];
      for (const e of skeleton.edges) {
        const source = labelToNodeId.get(e.sourceLabel);
        const target = labelToNodeId.get(e.targetLabel);
        if (!source || !target) continue;
        edges.push({
          id: generateId("edge"),
          graphId,
          source,
          target,
          type: e.type,
        });
      }

      // 3. 数值表 + 属性 + 公式
      const sheetId = generateId("sheet");
      const sheet: NumericSheet = {
        id: sheetId,
        projectId,
        name: "主数值表",
        createdAt: ts,
        updatedAt: ts,
      };

      const nameToAttrId = new Map<string, string>();
      const attributes: Attribute[] = skeleton.attributes.map((a, i) => {
        const id = generateId("attr");
        nameToAttrId.set(a.name, id);
        return {
          id,
          sheetId,
          name: a.name,
          type: "number",
          value: a.value,
          unit: a.unit,
          description: a.description,
          parentId: null,
          order: i,
        };
      });

      const formulas: Formula[] = [];
      for (const f of skeleton.formulas) {
        const attrId = nameToAttrId.get(f.attrName);
        if (!attrId) continue;
        formulas.push({
          id: generateId("formula"),
          sheetId,
          attributeId: attrId,
          expression: f.expression,
          description: f.description,
        });
      }

      // 4. GDD 文档 + 段落
      const docId = generateId("doc");
      const doc: GDDDocument = {
        id: docId,
        projectId,
        name: "设计文档",
        createdAt: ts,
        updatedAt: ts,
      };

      const sections: DocSection[] = [
        {
          id: generateId("section"),
          docId,
          title: projectName,
          content: "",
          type: "heading",
          order: 0,
        },
        {
          id: generateId("section"),
          docId,
          title: "核心玩法",
          content: `核心玩法：${gameplayText}`,
          type: "paragraph",
          order: 1,
        },
        {
          id: generateId("section"),
          docId,
          title: "玩家目标",
          content: `玩家目标：${goalText}`,
          type: "paragraph",
          order: 2,
        },
        {
          id: generateId("section"),
          docId,
          title: "独特机制",
          content: `独特机制：${mechanicText}`,
          type: "paragraph",
          order: 3,
        },
      ];

      // 原子写入：所有数据在一个事务内提交
      await db.transaction(
        "rw",
        [
          db.projects,
          db.mechanismGraphs,
          db.graphNodes,
          db.graphEdges,
          db.numericSheets,
          db.attributes,
          db.formulas,
          db.gddDocuments,
          db.docSections,
        ],
        async () => {
          await db.projects.add(project);
          await db.mechanismGraphs.add(graph);
          await db.graphNodes.bulkAdd(nodes);
          await db.graphEdges.bulkAdd(edges);
          await db.numericSheets.add(sheet);
          await db.attributes.bulkAdd(attributes);
          await db.formulas.bulkAdd(formulas);
          await db.gddDocuments.add(doc);
          await db.docSections.bulkAdd(sections);
        }
      );

      // 同步 store 状态 + 清空历史栈
      useProjectStore.setState((s) => ({
        projects: [project, ...s.projects],
      }));
      useHistoryStore.getState().clear();

      addToast({
        title: "设计骨架已生成",
        description: projectName,
        variant: "success",
      });
      resetWizard();
      onOpenChange(false);
      navigate(`/project/${projectId}/mechanism`);
    } catch (e) {
      addToast({
        title: "生成失败",
        description: e instanceof Error ? e.message : "未知错误",
        variant: "error",
      });
    } finally {
      setGenerating(false);
    }
  };

  // ===== 渲染 =====

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        // 生成过程中禁止关闭
        if (generating) return;
        onOpenChange(next);
      }}
      title="引导式创作"
      description="回答几个问题，自动生成设计骨架"
      className="max-w-2xl"
    >
      {/* 步骤指示器 */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {STEP_LABELS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <div
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  i === step
                    ? "bg-accent"
                    : i < step
                      ? "bg-accent/50"
                      : "bg-line-strong"
                )}
              />
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  i === step
                    ? "text-ink-primary font-medium"
                    : "text-ink-muted"
                )}
              >
                {label}
              </span>
            </div>
            {i < STEP_LABELS.length - 1 && (
              <div
                className={cn(
                  "w-6 h-px",
                  i < step ? "bg-accent/50" : "bg-line"
                )}
              />
            )}
          </div>
        ))}
      </div>

      {/* 步骤内容 */}
      <div className="min-h-[220px]">
        {/* 第 1 步：游戏类型 */}
        {step === 0 && (
          <div className="grid grid-cols-2 gap-2">
            {GAME_TYPES.map((g) => {
              const Icon = g.icon;
              const active = selectedType === g.value;
              return (
                <button
                  key={g.value}
                  onClick={() => setSelectedType(g.value)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    active
                      ? "border-accent bg-accent-glow"
                      : "border-line bg-canvas-sunken hover:border-line-strong"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 mb-1.5",
                      active ? "text-accent" : "text-ink-secondary"
                    )}
                  />
                  <p className="text-sm font-medium text-ink-primary">
                    {g.label}
                  </p>
                  <p className="text-2xs text-ink-muted mt-0.5">
                    {g.description}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* 第 2 步：核心玩法 */}
        {step === 1 && (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">
                用一句话描述核心玩法
              </label>
              <textarea
                value={coreGameplay}
                onChange={(e) => setCoreGameplay(e.target.value)}
                placeholder="例如：玩家在末世收集记忆碎片解锁身世"
                rows={3}
                className="input-field resize-none"
                autoFocus
              />
            </div>
            <div>
              <p className="text-xs text-ink-muted mb-1.5">
                没有思路？点击示例快速填充：
              </p>
              <div className="flex flex-wrap gap-1.5">
                {CORE_GAMEPLAY_EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setCoreGameplay(ex)}
                    className="px-2.5 py-1 rounded-full text-2xs text-ink-secondary border border-line bg-canvas-sunken hover:border-accent hover:text-accent transition-colors"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* 第 3 步：玩家目标 & 独特机制 */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">
                玩家目标
              </label>
              <input
                type="text"
                value={playerGoal}
                onChange={(e) => setPlayerGoal(e.target.value)}
                placeholder="如：通关主线剧情"
                className="input-field"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-secondary mb-1.5">
                独特机制
              </label>
              <input
                type="text"
                value={uniqueMechanic}
                onChange={(e) => setUniqueMechanic(e.target.value)}
                placeholder="如：时间倒流"
                className="input-field"
              />
            </div>
            <p className="text-2xs text-ink-muted">
              两项均为可选，留空将以"未填写"占位。
            </p>
          </div>
        )}

        {/* 第 4 步：确认生成 */}
        {step === 3 && (
          <div className="space-y-3">
            <SummaryRow label="游戏类型" value={gameType?.label ?? "-"} />
            <SummaryRow label="核心玩法" value={coreGameplay.trim() || "-"} />
            <SummaryRow
              label="玩家目标"
              value={playerGoal.trim() || "未填写"}
            />
            <SummaryRow
              label="独特机制"
              value={uniqueMechanic.trim() || "未填写"}
            />
            {skeleton && (
              <div className="text-2xs text-ink-muted pt-3 mt-1 border-t border-line leading-relaxed">
                将生成：1 个机制图（{skeleton.nodes.length} 节点 /{" "}
                {skeleton.edges.length} 边）· 1 个数值表（
                {skeleton.attributes.length} 属性 / {skeleton.formulas.length}{" "}
                公式）· 1 个 GDD 文档（4 段落）
              </div>
            )}
          </div>
        )}
      </div>

      {/* 底部操作 */}
      <div className="flex justify-between items-center pt-5 mt-2">
        {step > 0 ? (
          <button
            onClick={handlePrev}
            disabled={generating}
            className="btn-secondary"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            上一步
          </button>
        ) : (
          <button
            onClick={() => onOpenChange(false)}
            disabled={generating}
            className="btn-secondary"
          >
            取消
          </button>
        )}

        {step < STEP_LABELS.length - 1 ? (
          <button
            onClick={handleNext}
            disabled={!canNext || generating}
            className="btn-primary"
          >
            下一步
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="btn-primary"
          >
            {generating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在生成...
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                生成设计骨架
              </>
            )}
          </button>
        )}
      </div>
    </Modal>
  );
}

// ===== 摘要行 =====

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3 items-start">
      <span className="text-xs text-ink-muted w-16 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-ink-primary break-words flex-1">
        {value}
      </span>
    </div>
  );
}
