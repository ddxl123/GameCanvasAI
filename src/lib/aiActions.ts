import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useDocumentStore } from "@/stores/documentStore";
import { useGameplayStore } from "@/stores/gameplayStore";
import { useRuleStore } from "@/stores/ruleStore";
import { useLevelStore } from "@/stores/levelStore";
import { layoutGraph } from "@/lib/graphLayout";
import { sanitizeHtml } from "@/lib/sanitize";
import type {
  NodeType,
  EdgeType,
  AttributeType,
  DocSectionType,
  GraphNode,
  GraphEdge,
  DocSection,
  MomentType,
  RuleCategory,
  LevelNodeType,
  LevelEdgeType,
} from "@/types";

/**
 * AI Agent 设计动作定义。
 * 使用 OpenAI 兼容的 Tool Calls（tools 参数 + tool_calls 返回）让模型调用对应工具提交结构化设计。
 * 参考：https://api-docs.deepseek.com/zh-cn/guides/tool_calls
 */

// ===== 动作数据结构 =====

export interface MechanismDesignAction {
  action: "apply_mechanism";
  nodes: Array<{
    label: string;
    type: NodeType;
    description?: string;
  }>;
  edges: Array<{
    source: string; // 节点 label
    target: string; // 节点 label
    type: EdgeType;
    label?: string;
  }>;
}

export interface NumericDesignAction {
  action: "apply_numeric";
  attributes: Array<{
    name: string;
    type: AttributeType;
    value: string;
    description?: string;
    parent?: string;
  }>;
  formulas: Array<{
    attribute: string;
    expression: string;
    description?: string;
  }>;
}

export interface GddDesignAction {
  action: "apply_gdd";
  sections: Array<{
    type: DocSectionType;
    title?: string;
    content?: string;
  }>;
}

// ===== 增量动作：在现有设计基础上做 patch 修改 =====

/**
 * 修改单个现有节点（按 label 查找）。
 */
export interface UpdateNodeAction {
  action: "update_node";
  nodeLabel: string; // 按标签查找现有节点
  updates: {
    label?: string;
    type?: NodeType;
    description?: string; // 写入 data.description
  };
}

/**
 * 按标签删除现有节点（同时清理相关边）。
 */
export interface RemoveNodeAction {
  action: "remove_node";
  nodeLabel: string;
}

/**
 * 在现有图上增量添加节点和边。
 * edges 中的 sourceLabel/targetLabel 可以是已有节点或本次新增的节点。
 */
export interface AddNodeToExistingAction {
  action: "add_node_to_existing";
  nodes: Array<{ label: string; type: NodeType; description?: string }>;
  edges: Array<{ sourceLabel: string; targetLabel: string; type: EdgeType }>;
  // sourceLabel/targetLabel 可以是现有节点或新增节点
}

/**
 * 修改现有属性的公式（按属性名查找）。
 */
export interface PatchFormulaAction {
  action: "patch_formula";
  attributeName: string; // 按名称查找现有属性
  expression?: string;
  description?: string;
}

export type DesignAction =
  | MechanismDesignAction
  | NumericDesignAction
  | GddDesignAction
  | UpdateNodeAction
  | RemoveNodeAction
  | AddNodeToExistingAction
  | PatchFormulaAction;

// ===== 撤销记录（单次 tool call 的事务回滚） =====

/**
 * 记录单次 tool call 应用后的变更，用于撤销。
 * - 创建型操作（apply_mechanism / add_node_to_existing）：记录 createdNodeIds
 * - 修改型操作（update_node / patch_formula）：记录旧值快照
 * - 删除型操作（remove_node）：记录被删的完整节点 + 边
 */
export interface UndoRecord {
  actionType: string;
  description: string;
  createdNodeIds: string[];
  // apply_mechanism / add_node_to_existing 创建的边 id（撤销时显式删除，
  // 避免两端都是已有节点时 removeNode 级联清理不到）
  createdEdgeIds: string[];
  // update_node 的旧值快照
  nodeSnapshots: Array<{
    id: string;
    label: string;
    type: NodeType;
    data: { description?: string } | Record<string, unknown>;
  }>;
  // remove_node 被删的完整对象（用于恢复）
  removedNodes: GraphNode[];
  removedEdges: GraphEdge[];
  // 数值属性
  createdAttrIds: string[];
  attrFormulaSnapshots: Array<{
    attrId: string;
    oldExpression: string;
    oldDescription: string;
  }>;
  // GDD 段落
  createdSectionIds: string[];
}

function emptyUndo(actionType: string, description: string): UndoRecord {
  return {
    actionType,
    description,
    createdNodeIds: [],
    createdEdgeIds: [],
    nodeSnapshots: [],
    removedNodes: [],
    removedEdges: [],
    createdAttrIds: [],
    attrFormulaSnapshots: [],
    createdSectionIds: [],
  };
}

// ===== 工具定义（OpenAI 兼容格式） =====

// 40 种节点类型，覆盖 10 个维度（含 note 便签）
const NODE_TYPES_ENUM = [
  // 逻辑层
  "event",
  "action",
  "state",
  "condition",
  // 资源层（含系统机制）
  "resource",
  "pool",
  "converter",
  "timer",
  "rng",
  "trigger_zone",
  "spawner",
  "savepoint",
  "difficulty",
  // 成长层
  "attribute",
  "modifier",
  "level",
  // 反馈层
  "reward",
  "penalty",
  "feedback",
  // 社交 / AI 层
  "ai_behavior",
  "social",
  // 世界观层
  "region",
  "landmark",
  "path",
  "weather",
  "biome",
  // 内容元素层
  "character",
  "item",
  "skill",
  "quest",
  "dialogue",
  "enemy",
  "shop",
  // 感官体验层
  "music",
  "sfx",
  "fx",
  "animation",
  "camera",
  "ui",
  // 辅助层
  "note",
];
// 17 种边类型，5 大类
const EDGE_TYPES_ENUM = [
  // 通信类
  "invoke",
  "subscribe",
  "emit",
  "pass",
  // 数据流类
  "produce",
  "consume",
  "transform",
  "modify",
  // 结构类
  "compose",
  "reference",
  "belong",
  // 控制类
  "enable",
  "inhibit",
  "branch",
  // 交互类
  "cooperate",
  "interact",
  "oppose",
];
const ATTR_TYPES_ENUM = ["number", "string", "bool"];

// ===== 工具参数 required 字段校验 =====

/** 轻量 required 字段校验，返回缺失字段列表（空数组表示通过） */
function checkRequired(args: Record<string, unknown>, required: string[]): string[] {
  return required.filter((k) => {
    const v = args[k];
    if (v === undefined || v === null) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (Array.isArray(v) && v.length === 0) return true;
    return false;
  });
}

/** 校验结果：成功返回 { ok: true, action }，失败返回 { ok: false, error } */
export type ToolCallParseResult =
  | { ok: true; action: DesignAction | DimensionAction }
  | { ok: false; error: string };

/** 校验工具参数 required 字段，返回错误描述（null 表示通过） */
export function validateActionArgs(
  toolName: string,
  args: Record<string, unknown>
): string | null {
  const checks: Record<string, string[]> = {
    apply_mechanism: ["nodes"],
    apply_numeric: ["attributes"],
    apply_gdd: ["sections"],
    update_node: ["nodeLabel", "updates"],
    remove_node: ["nodeLabel"],
    add_node_to_existing: ["nodes"],
    patch_formula: ["attributeName"],
    apply_loops: ["loops"],
    apply_moments: ["moments"],
    apply_rules: ["rules"],
    apply_level_flow: ["name", "nodes"],
  };
  const required = checks[toolName];
  if (!required) return null;
  const missing = checkRequired(args, required);
  if (missing.length === 0) return null;
  return `${toolName} 缺少必填字段: ${missing.join(", ")}`;
}

/**
 * 三个生成类工具的 OpenAI 兼容定义。
 * DeepSeek / OpenAI / 通义千问 都支持此格式。
 */
export const DESIGN_TOOLS_OPENAI = [
  {
    type: "function" as const,
    function: {
      name: "apply_mechanism",
      description:
        "将生成的玩法机制网络应用到当前的机制图中。这是一个关系网络（含单向/双向/无向边）。节点数和维度覆盖根据游戏类型灵活决定（休闲 8-15，中型 15-25，复杂 20-35）。必须包含至少 1 个核心玩法循环。在给出文字说明后调用此工具。注意：tool_calls 一旦返回会立即自动应用到画布（无需用户确认），所以不要在一次调用中重复创建相同节点；如需补充请用 add_node_to_existing。",
      parameters: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            description:
              "机制节点列表。节点数根据游戏类型灵活决定（休闲 8-15，中型 15-25，复杂 20-35）。必须跨越至少 3 个维度（不要只用逻辑层）。每个节点必须出现在至少一条 edge 中，不允许孤立节点。建议优先使用成长层、反馈层、社交层节点。每个节点只需 label/type/description 三个字段（不要放 id 或 customFields，会被忽略）。",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description: "节点显示名称，如：玩家攻击、击杀敌人、金币池",
                },
                type: {
                  type: "string",
                  enum: NODE_TYPES_ENUM,
                  description:
                    "节点类型（共 40 种，10 个维度）。\n" +
                    "逻辑层：event事件/action行为/state状态/condition条件\n" +
                    "资源层：resource资源/pool资源池/converter转换器\n" +
                    "系统机制：timer计时器/rng随机/trigger_zone触发区/spawner生成器/savepoint存档点/difficulty难度\n" +
                    "成长层：attribute属性/modifier修饰符/level等级\n" +
                    "反馈层：reward奖励/penalty惩罚/feedback反馈循环\n" +
                    "社交AI层：ai_behavior AI行为/social社交\n" +
                    "世界观层：region区域/landmark地标/path路径/weather天气/biome生态群落\n" +
                    "内容元素层：character角色/item道具/skill技能/quest任务/dialogue对话/enemy敌人/shop商店\n" +
                    "感官体验层：music音乐/sfx音效/fx特效/animation动画/camera镜头/ui界面\n" +
                    "辅助层：note便签（设计注解，不参与模拟）",
                },
                description: {
                  type: "string",
                  description: "节点行为说明及其在玩法循环中的作用",
                },
              },
              required: ["label", "type"],
            },
          },
          edges: {
            type: "array",
            description:
              "节点间的连接关系，形成关系网络（含单向/双向/无向边）。边数约 nodes.length * 1.3 ~ 1.8。至少包含 1 个闭环（核心循环）。根据机制语义自然选择边类型。",
            items: {
              type: "object",
              properties: {
                source: {
                  type: "string",
                  description: "源节点的 label（必须存在于 nodes 中）",
                },
                target: {
                  type: "string",
                  description: "目标节点的 label（必须存在于 nodes 中）",
                },
                type: {
                  type: "string",
                  enum: EDGE_TYPES_ENUM,
                  description:
                    "连接类型（共 17 种，5 大类）。\n" +
                    "通信类：invoke调用/subscribe订阅/emit发射/pass传递\n" +
                    "数据流类：produce产出/consume消耗/transform转换/modify修改\n" +
                    "结构类（无向）：compose组合/reference引用/belong归属\n" +
                    "控制类：enable启用/inhibit抑制/branch分支\n" +
                    "交互类（双向）：cooperate协作/interact互动/oppose对抗",
                },
                label: {
                  type: "string",
                  description: "连线标签（可选，说明连接原因）",
                },
              },
              required: ["source", "target", "type"],
            },
          },
        },
        required: ["nodes", "edges"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_numeric",
      description:
        "将生成的数值设计方案（属性体系与公式）应用到当前数值表。属性应覆盖 4 层：基础属性（等级/经验/生命值）、战斗属性（攻击力/防御力/暴击率）、成长属性（力量/敏捷/智力）、经济属性（金币/体力/声望）。公式用 @属性名 引用其他属性，支持 pow/log/sqrt/min/max/abs。在给出文字说明后调用此工具。",
      parameters: {
        type: "object",
        properties: {
          attributes: {
            type: "array",
            description:
              "属性列表（至少 6 个，覆盖 4 个层次：基础/战斗/成长/经济）。用 parent 字段建立层级关系。",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "属性名，如：攻击力、等级、金币" },
                type: {
                  type: "string",
                  enum: ATTR_TYPES_ENUM,
                  description: "属性类型：number数值/string字符串/bool布尔",
                },
                value: {
                  type: "string",
                  description: "初始值（字符串形式），如：100、0、true",
                },
                description: {
                  type: "string",
                  description: "属性说明（可选，含设计意图）",
                },
                parent: {
                  type: "string",
                  description: "父属性名（可选，用于建立 4 层结构）",
                },
              },
              required: ["name", "type", "value"],
            },
          },
          formulas: {
            type: "array",
            description:
              "公式列表（至少 3 个），用 @属性名 引用其他属性。支持四则运算 + pow/log/sqrt/min/max/abs。线性/指数/对数/多项式曲线均可。",
            items: {
              type: "object",
              properties: {
                attribute: {
                  type: "string",
                  description: "应用公式的属性名（必须在 attributes 中）",
                },
                expression: {
                  type: "string",
                  description:
                    "公式表达式，如：@等级 * 10 + 50（线性）/ pow(1.1, @等级) * 100（指数）/ log(@等级 + 1) * 100（对数）",
                },
                description: {
                  type: "string",
                  description: "公式说明（可选，含曲线特征与设计意图）",
                },
              },
              required: ["attribute", "expression"],
            },
          },
        },
        required: ["attributes", "formulas"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_gdd",
      description:
        "将生成的 GDD 段落追加到当前文档中。文档应包含完整章节结构：游戏概述、核心机制、数值系统、玩法流程、设计风险。每个章节用 heading 段落开头，后接 paragraph 段落详述。在输出文档内容后调用此工具。",
      parameters: {
        type: "object",
        properties: {
          sections: {
            type: "array",
            description:
              "文档段落列表（按顺序追加）。建议至少 5 个 heading + 10 个 paragraph，内容详实可用于团队评审。",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["heading", "paragraph"],
                  description: "段落类型：heading标题/paragraph段落",
                },
                title: {
                  type: "string",
                  description: "标题文本（type=heading 时必填，如：游戏概述、核心机制）",
                },
                content: {
                  type: "string",
                  description:
                    "段落内容（type=paragraph 时必填，纯文本或HTML）。应详实具体，包含设计理由、数据支撑、对比分析。",
                },
              },
              required: ["type"],
            },
          },
        },
        required: ["sections"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "update_node",
      description:
        "在现有机制图上修改单个节点。按 nodeLabel 查找现有节点，更新其 label / type / description。当用户要求'修改/调整/优化'某个节点时使用此工具，而非全量重建。",
      parameters: {
        type: "object",
        properties: {
          nodeLabel: {
            type: "string",
            description: "要修改的现有节点的 label（必须与现有图中的某个节点 label 完全匹配）",
          },
          updates: {
            type: "object",
            description: "要更新的字段，至少传 1 个。未传的字段保持原值",
            properties: {
              label: {
                type: "string",
                description: "新的节点显示名称（可选）",
              },
              type: {
                type: "string",
                enum: NODE_TYPES_ENUM,
                description: "新的节点类型（可选，40 种之一）",
              },
              description: {
                type: "string",
                description: "新的节点行为说明（可选，写入 data.description）",
              },
            },
          },
        },
        required: ["nodeLabel", "updates"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "remove_node",
      description:
        "按 label 删除现有机制图中的节点（同时清理与之相关的所有边）。当用户要求'删除/移除'某个节点时使用此工具。",
      parameters: {
        type: "object",
        properties: {
          nodeLabel: {
            type: "string",
            description: "要删除的节点的 label（必须与现有图中的某个节点 label 完全匹配）",
          },
        },
        required: ["nodeLabel"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "add_node_to_existing",
      description:
        "在现有机制图上增量添加节点和边。edges 中的 sourceLabel/targetLabel 可以是已有节点或本次新增的节点。当用户要求'添加/补充/扩展'节点和连接时使用此工具，而非全量重建。",
      parameters: {
        type: "object",
        properties: {
          nodes: {
            type: "array",
            description:
              "本次要新增的节点列表。不要包含图中已存在的 label（已存在的会被忽略）。",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description: "新增节点的显示名称",
                },
                type: {
                  type: "string",
                  enum: NODE_TYPES_ENUM,
                  description: "新增节点的类型（40 种之一）",
                },
                description: {
                  type: "string",
                  description: "节点行为说明（可选）",
                },
              },
              required: ["label", "type"],
            },
          },
          edges: {
            type: "array",
            description:
              "本次要新增的连接。sourceLabel/targetLabel 可以是已有节点的 label，也可以是本次新增节点的 label。",
            items: {
              type: "object",
              properties: {
                sourceLabel: {
                  type: "string",
                  description: "源节点的 label（已有或新增均可）",
                },
                targetLabel: {
                  type: "string",
                  description: "目标节点的 label（已有或新增均可）",
                },
                type: {
                  type: "string",
                  enum: EDGE_TYPES_ENUM,
                  description: "连接类型（17 种之一）",
                },
              },
              required: ["sourceLabel", "targetLabel", "type"],
            },
          },
        },
        required: ["nodes", "edges"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "patch_formula",
      description:
        "修改现有数值表中某个属性的公式。按 attributeName 查找现有属性，更新其 expression 和/或 description。当用户要求'调整/修改/优化'某个公式时使用此工具。",
      parameters: {
        type: "object",
        properties: {
          attributeName: {
            type: "string",
            description: "要修改公式的属性名（必须与现有数值表中的某个属性 name 完全匹配）",
          },
          expression: {
            type: "string",
            description:
              "新的公式表达式（可选，若不传则保留原公式）。用 @属性名 引用其他属性，支持四则运算 + pow/log/sqrt/min/max/abs。",
          },
          description: {
            type: "string",
            description: "新的公式说明（可选）",
          },
        },
        required: ["attributeName"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_loops",
      description:
        "生成核心循环 / 循环玩步并应用到当前项目。每个循环包含 3-7 个玩步（label/playerAction/emotion/color）。loopType: core 核心 / secondary 次要 / meta 元循环。当用户要求'生成循环 / 核心循环 / 玩法循环'时使用此工具。",
      parameters: {
        type: "object",
        properties: {
          loops: {
            type: "array",
            description: "循环列表（建议 1-3 个）",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "循环名称" },
                description: { type: "string", description: "循环说明" },
                loopType: {
                  type: "string",
                  enum: ["core", "secondary", "meta"],
                  description: "循环类型",
                },
                steps: {
                  type: "array",
                  description: "玩步列表（3-7 个），按顺序串联形成闭环",
                  items: {
                    type: "object",
                    properties: {
                      label: { type: "string", description: "玩步标签（有游戏感，如'遭遇敌人'）" },
                      playerAction: { type: "string", description: "玩家具体动作" },
                      emotion: { type: "string", description: "情绪" },
                      color: { type: "string", description: "颜色十六进制（红=#EF4444 战斗/橙=#F97316 行动/绿=#22C55E 收获/蓝=#3B82F6 成长/紫=#A855F7 特殊）" },
                    },
                    required: ["label", "playerAction", "emotion", "color"],
                  },
                },
              },
              required: ["name", "loopType", "steps"],
            },
          },
        },
        required: ["loops"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_moments",
      description:
        "生成高光时刻并应用到当前项目，规划玩家情绪曲线。emotion 1-10，timing 0-100（百分比时机）。当用户要求'生成高光时刻 / 情绪曲线 / Boss 战高潮'时使用此工具。",
      parameters: {
        type: "object",
        properties: {
          moments: {
            type: "array",
            description: "时刻列表（建议 3-8 个）",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "时刻标题" },
                description: { type: "string", description: "时刻描述" },
                emotion: { type: "number", description: "情绪强度 1-10" },
                emotionLabel: { type: "string", description: "情绪标签（如'紧张'/'兴奋'）" },
                timing: { type: "number", description: "时机百分比 0-100" },
                type: {
                  type: "string",
                  enum: ["story", "combat", "exploration", "social", "economy", "custom"],
                  description: "时刻类型",
                },
                duration: { type: "number", description: "持续秒数" },
                notes: { type: "string", description: "设计备注" },
              },
              required: ["title", "emotion", "timing", "type", "duration"],
            },
          },
        },
        required: ["moments"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_rules",
      description:
        "生成规则卡牌并应用到当前项目。每条规则是 IF-THEN 结构。当用户要求'生成规则 / 战斗规则 / 经济规则'时使用此工具。",
      parameters: {
        type: "object",
        properties: {
          rules: {
            type: "array",
            description: "规则列表（建议 3-10 条）",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "规则标题" },
                condition: { type: "string", description: "IF 条件" },
                action: { type: "string", description: "THEN 动作" },
                category: {
                  type: "string",
                  enum: ["combat", "movement", "economy", "social", "progression", "custom"],
                  description: "规则类别",
                },
                priority: { type: "number", description: "优先级 1-10（可选，默认 5）" },
                notes: { type: "string", description: "设计备注" },
              },
              required: ["title", "condition", "action", "category"],
            },
          },
        },
        required: ["rules"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "apply_level_flow",
      description:
        "生成关卡流程图并应用到当前项目。包含关卡节点（label/type/difficulty/duration）和连线（source/target 用 label 引用）。当用户要求'生成关卡 / 关卡流程 / 难度曲线'时使用此工具。",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "流程名称" },
          nodes: {
            type: "array",
            description: "关卡节点列表",
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "关卡名称" },
                type: {
                  type: "string",
                  enum: ["level", "boss", "cutscene", "hub", "secret", "tutorial", "ending"],
                  description: "关卡类型",
                },
                difficulty: { type: "number", description: "难度 1-10" },
                duration: { type: "number", description: "预计时长（分钟）" },
                description: { type: "string", description: "关卡说明" },
                gates: {
                  type: "array",
                  items: { type: "string" },
                  description: "进入条件（可选）",
                },
              },
              required: ["label", "type", "difficulty", "duration"],
            },
          },
          edges: {
            type: "array",
            description: "关卡连线（source/target 用 label 引用）",
            items: {
              type: "object",
              properties: {
                source: { type: "string", description: "源关卡 label" },
                target: { type: "string", description: "目标关卡 label" },
                type: {
                  type: "string",
                  enum: ["normal", "secret", "locked", "branch"],
                  description: "连线类型",
                },
              },
              required: ["source", "target", "type"],
            },
          },
        },
        required: ["name", "nodes", "edges"],
      },
    },
  },
];

/**
 * 根据当前模块返回需要的工具列表。
 * 评审类、参考类、对话类不需要工具。
 * mechanism-edit 不强制单一工具，由 AI 在 update_node/remove_node/add_node_to_existing/patch_formula 中自行选择。
 */
export function getToolsForAction(
  actionId: string
): "mechanism" | "numeric" | "gdd" | "mechanism-edit" | "dimension" | null {
  switch (actionId) {
    case "mechanism-gen":
      return "mechanism";
    case "numeric-gen":
      return "numeric";
    case "gdd-gen":
      return "gdd";
    case "mechanism-edit":
      // 增量编辑模式：暴露 4 个增量工具给 AI，由 AI 自行选择
      return "mechanism-edit";
    case "loop-gen":
    case "moment-gen":
    case "rule-gen":
    case "level-gen":
      return "dimension";
    default:
      return null;
  }
}

/**
 * 根据动作 ID 返回需要强制调用的工具名。
 * 生成类动作强制调用对应工具，确保一定会返回结构化设计。
 * mechanism-edit 由 AI 自行决定调用哪个增量工具（可能多个），不强制。
 */
export function getForceToolName(actionId: string): string | null {
  switch (actionId) {
    case "mechanism-gen":
      return "apply_mechanism";
    case "numeric-gen":
      return "apply_numeric";
    case "gdd-gen":
      return "apply_gdd";
    case "loop-gen":
      return "apply_loops";
    case "moment-gen":
      return "apply_moments";
    case "rule-gen":
      return "apply_rules";
    case "level-gen":
      return "apply_level_flow";
    // mechanism-edit 由 AI 自行决定调用哪个增量工具，不强制
    default:
      return null;
  }
}

/**
 * 从工具调用结果构造 DesignAction（7 个机制/数值/文档动作）。
 */
export function actionFromToolCall(
  toolName: string,
  args: Record<string, unknown>
): DesignAction | null {
  const error = validateActionArgs(toolName, args);
  if (error) {
    console.warn(`[actionFromToolCall] ${error}`);
    return null;
  }
  switch (toolName) {
    case "apply_mechanism":
      return {
        action: "apply_mechanism",
        nodes: (args.nodes as MechanismDesignAction["nodes"]) ?? [],
        edges: (args.edges as MechanismDesignAction["edges"]) ?? [],
      };
    case "apply_numeric":
      return {
        action: "apply_numeric",
        attributes:
          (args.attributes as NumericDesignAction["attributes"]) ?? [],
        formulas: (args.formulas as NumericDesignAction["formulas"]) ?? [],
      };
    case "apply_gdd":
      return {
        action: "apply_gdd",
        sections: (args.sections as GddDesignAction["sections"]) ?? [],
      };
    case "update_node":
      return {
        action: "update_node",
        nodeLabel: (args.nodeLabel as string) ?? "",
        updates: (args.updates as UpdateNodeAction["updates"]) ?? {},
      };
    case "remove_node":
      return {
        action: "remove_node",
        nodeLabel: (args.nodeLabel as string) ?? "",
      };
    case "add_node_to_existing":
      return {
        action: "add_node_to_existing",
        nodes:
          (args.nodes as AddNodeToExistingAction["nodes"]) ?? [],
        edges:
          (args.edges as AddNodeToExistingAction["edges"]) ?? [],
      };
    case "patch_formula":
      return {
        action: "patch_formula",
        attributeName: (args.attributeName as string) ?? "",
        expression: args.expression as string | undefined,
        description: args.description as string | undefined,
      };
    default:
      return null;
  }
}

/**
 * 从工具调用结果构造 DimensionAction（5 个玩法维度动作）。
 */
export function dimensionActionFromToolCall(
  toolName: string,
  args: Record<string, unknown>
): DimensionAction | null {
  const error = validateActionArgs(toolName, args);
  if (error) {
    console.warn(`[dimensionActionFromToolCall] ${error}`);
    return null;
  }
  switch (toolName) {
    case "apply_loops":
      return {
        action: "apply_loops",
        loops: (args.loops as LoopDesignAction["loops"]) ?? [],
      };
    case "apply_moments":
      return {
        action: "apply_moments",
        moments: (args.moments as MomentDesignAction["moments"]) ?? [],
      };
    case "apply_rules":
      return {
        action: "apply_rules",
        rules: (args.rules as RuleDesignAction["rules"]) ?? [],
      };
    case "apply_level_flow":
      return {
        action: "apply_level_flow",
        name: (args.name as string) ?? "",
        nodes: (args.nodes as LevelFlowDesignAction["nodes"]) ?? [],
        edges: (args.edges as LevelFlowDesignAction["edges"]) ?? [],
      };
    default:
      return null;
  }
}

/**
 * 统一的工具调用分发：先试 DesignAction，再试 DimensionAction。
 */
export function anyActionFromToolCall(
  toolName: string,
  args: Record<string, unknown>
): { type: "design"; action: DesignAction } | { type: "dimension"; action: DimensionAction } | null {
  const design = actionFromToolCall(toolName, args);
  if (design) return { type: "design", action: design };
  const dim = dimensionActionFromToolCall(toolName, args);
  if (dim) return { type: "dimension", action: dim };
  return null;
}

// ===== 应用函数 =====

/**
 * 应用机制设计：创建节点和边。
 *
 * 布局策略：
 * - 使用 **ELK（layered 算法 + 正交路由）** 自动布局，最小化边交叉
 * - 正确处理环（反馈回路），不会把环节点塞到最后一层
 * - 支持横向 LR / 纵向 TB 两种方向（读取 store 的 layoutDirection）
 *
 * 数据校验：
 * - 自动过滤孤立节点（没有任何连接的节点）
 * - 边的 source/target 必须在节点列表中
 */
export async function applyMechanismAction(
  action: MechanismDesignAction
): Promise<{ nodeCount: number; edgeCount: number; undo: UndoRecord }> {
  const store = useMechanismStore.getState();
  if (!store.currentGraphId) {
    throw new Error("未选择机制图，请先在左侧面板选择或创建一张图");
  }

  const undo = emptyUndo("apply_mechanism", "生成玩法网络");
  const createdNodeIds: string[] = [];
  const createdEdgeIds: string[] = [];

  // ===== 1. 数据校验：过滤孤立节点（降级策略：不过滤到空）=====
  const nodeLabels = new Set(action.nodes.map((n) => n.label));
  const connectedLabels = new Set<string>();
  for (const edge of action.edges) {
    // 严格匹配 label
    if (nodeLabels.has(edge.source)) connectedLabels.add(edge.source);
    if (nodeLabels.has(edge.target)) connectedLabels.add(edge.target);
    // 容错：AI 经常用近似名称，尝试大小写/空格不敏感匹配
    const findMatch = (label: string): string | undefined => {
      if (nodeLabels.has(label)) return label;
      const normalized = label.trim().toLowerCase();
      for (const nl of nodeLabels) {
        if (nl.trim().toLowerCase() === normalized) return nl;
      }
      return undefined;
    };
    const sm = findMatch(edge.source);
    const tm = findMatch(edge.target);
    if (sm) { edge.source = sm; connectedLabels.add(sm); }
    if (tm) { edge.target = tm; connectedLabels.add(tm); }
  }
  let validNodes = action.nodes.filter((n) => connectedLabels.has(n.label));
  const isolatedCount = action.nodes.length - validNodes.length;
  if (isolatedCount > 0) {
    console.warn(`过滤掉 ${isolatedCount} 个孤立节点`);
  }
  // 降级：如果全部被过滤，保留所有节点（不报错，让用户自己处理）
  if (validNodes.length === 0) {
    console.warn("AI 生成的节点全部孤立，降级保留所有节点（无连接）");
    validNodes = action.nodes;
  }

  // ===== 2. 先用临时位置创建节点，拿到真实 id =====
  const labelToNode = new Map(validNodes.map((n) => [n.label, n]));
  const validEdges = action.edges.filter(
    (e) => labelToNode.has(e.source) && labelToNode.has(e.target)
  );

  const labelToId = new Map<string, string>();
  // 智能体循环去重：先收集当前图已有节点的 label→id 映射。
  // AI 在多轮循环中可能重复调用 apply_mechanism 创建同名节点，此时复用已有节点而非重复创建，
  // 避免"玩家攻击"等节点在画布上出现多份。仅当 label 完全一致时复用（不做模糊匹配，避免误合并）。
  const existingLabelToId = new Map<string, string>();
  for (const n of store.nodes) {
    existingLabelToId.set(n.label, n.id);
  }
  const reusedLabels: string[] = [];
  // 临时位置，后续会被 ELK 覆盖
  for (const node of validNodes) {
    // 去重：同名节点复用已有 id，不重复创建
    const existingId = existingLabelToId.get(node.label);
    if (existingId) {
      labelToId.set(node.label, existingId);
      reusedLabels.push(node.label);
      // 若 AI 提供了新描述且已有节点描述为空，补充描述（不覆盖已有描述）
      if (node.description) {
        const existingNode = store.nodes.find((n) => n.id === existingId);
        const existingDesc = existingNode?.data?.description as string | undefined;
        if (!existingDesc) {
          await store.updateNode(existingId, {
            data: { description: node.description },
          });
        }
      }
      continue;
    }
    const id = await store.addNode(node.type, { x: 0, y: 0 }, node.label);
    if (id) {
      labelToId.set(node.label, id);
      createdNodeIds.push(id);
      if (node.description) {
        await store.updateNode(id, {
          data: { description: node.description },
        });
      }
    }
  }
  if (reusedLabels.length > 0) {
    console.warn(
      `[apply_mechanism] 检测到 ${reusedLabels.length} 个同名节点已存在，已复用而非重复创建：${reusedLabels.join(", ")}`
    );
  }

  // ===== 3. 创建所有边 =====
  let edgeCount = 0;
  for (const edge of validEdges) {
    const sourceId = labelToId.get(edge.source);
    const targetId = labelToId.get(edge.target);
    if (!sourceId || !targetId) continue;
    const edgeId = await store.addEdge({
      source: sourceId,
      target: targetId,
      type: edge.type,
      label: edge.label,
    });
    if (edgeId) createdEdgeIds.push(edgeId);
    edgeCount++;
  }

  // ===== 4. 用 ELK 自动布局（最小化边交叉）=====
  const direction = useMechanismStore.getState().layoutDirection;
  const layoutInputs = validNodes.map((n) => ({
    id: labelToId.get(n.label)!,
    type: n.type,
    description: n.description,
  }));
  const layoutEdges = validEdges
    .map((e) => ({
      source: labelToId.get(e.source),
      target: labelToId.get(e.target),
    }))
    .filter(
      (e): e is { source: string; target: string } =>
        !!e.source && !!e.target
    );

  const positions = await layoutGraph(layoutInputs, layoutEdges, {
    direction,
    nodeWidth: 220,
    nodeHeight: 110,
    rankSpacing: 110,
    nodeSpacing: 70,
  });

  await store.batchUpdateNodePositions(positions);

  undo.createdNodeIds = createdNodeIds;
  undo.createdEdgeIds = createdEdgeIds;
  undo.description = `生成玩法网络：${validNodes.length} 个节点、${edgeCount} 条连接`;
  return { nodeCount: validNodes.length, edgeCount, undo };
}

/**
 * 应用数值设计：创建属性和公式。
 */
export async function applyNumericAction(
  action: NumericDesignAction
): Promise<{ attrCount: number; formulaCount: number; undo: UndoRecord }> {
  const store = useNumericStore.getState();
  if (!store.currentSheetId) {
    throw new Error("未选择数值表，请先在左侧面板选择或创建一张数值表");
  }

  const undo = emptyUndo("apply_numeric", "生成数值方案");
  const createdAttrIds: string[] = [];

  const nameToId = new Map<string, string>();

  // 1. 创建属性（先处理无 parent 的，再处理有 parent 的）
  const noParent = action.attributes.filter((a) => !a.parent);
  const hasParent = action.attributes.filter((a) => a.parent);

  for (const attr of noParent) {
    const created = await store.addAttribute(null, attr.name, attr.type);
    nameToId.set(attr.name, created.id);
    createdAttrIds.push(created.id);
    if (attr.value !== undefined) {
      await store.updateAttribute(created.id, {
        value: attr.value,
        description: attr.description,
      });
    }
  }

  // 处理有 parent 的（可能多层，循环直到全部处理）
  let remaining = [...hasParent];
  let safety = 10;
  while (remaining.length > 0 && safety-- > 0) {
    const stillPending: typeof remaining = [];
    for (const attr of remaining) {
      const parentId = nameToId.get(attr.parent!);
      if (!parentId) {
        stillPending.push(attr);
        continue;
      }
      const created = await store.addAttribute(parentId, attr.name, attr.type);
      nameToId.set(attr.name, created.id);
      createdAttrIds.push(created.id);
      if (attr.value !== undefined) {
        await store.updateAttribute(created.id, {
          value: attr.value,
          description: attr.description,
        });
      }
    }
    if (stillPending.length === remaining.length) break;
    remaining = stillPending;
  }

  // 2. 创建公式
  let formulaCount = 0;
  for (const f of action.formulas) {
    const attrId = nameToId.get(f.attribute);
    if (!attrId) {
      console.warn(`跳过公式：找不到属性 "${f.attribute}"`);
      continue;
    }
    await store.updateFormula(attrId, f.expression, f.description);
    formulaCount++;
  }

  undo.createdAttrIds = createdAttrIds;
  undo.description = `已创建 ${action.attributes.length} 个属性、${formulaCount} 条公式`;
  return { attrCount: action.attributes.length, formulaCount, undo };
}

/**
 * 应用 GDD 设计：追加段落到当前文档。
 */
export async function applyGddAction(
  action: GddDesignAction
): Promise<{ sectionCount: number; undo: UndoRecord }> {
  const store = useDocumentStore.getState();
  if (!store.currentDocId) {
    throw new Error("未选择文档，请先在左侧面板选择或创建一份文档");
  }

  const undo = emptyUndo("apply_gdd", "生成 GDD 文档");
  const createdSectionIds: string[] = [];

  for (const section of action.sections) {
    let created: DocSection | undefined;
    if (section.type === "heading") {
      created = await store.addSection("heading", section.title || "新标题");
    } else if (section.type === "paragraph") {
      const content = section.content || "";
      const html = sanitizeHtml(content.startsWith("<") ? content : `<p>${content}</p>`);
      created = await store.addSection("paragraph", "", html);
    }
    if (created) createdSectionIds.push(created.id);
  }

  undo.createdSectionIds = createdSectionIds;
  undo.description = `已追加 ${createdSectionIds.length} 个段落`;
  return { sectionCount: createdSectionIds.length, undo };
}

// ===== 增量动作应用函数 =====

/**
 * 修改单个现有节点（按 label 查找）。
 * 找不到目标节点时抛错。
 */
export async function applyUpdateNodeAction(
  action: UpdateNodeAction
): Promise<{ undo: UndoRecord }> {
  const store = useMechanismStore.getState();
  if (!store.currentGraphId) {
    throw new Error("未选择机制图，请先在左侧面板选择或创建一张图");
  }

  const node = store.nodes.find((n) => n.label === action.nodeLabel);
  if (!node) {
    throw new Error(`未找到标签为 "${action.nodeLabel}" 的节点`);
  }

  // 构造更新对象：label / type 直接更新，description 写入 data.description
  const updates: Partial<GraphNode> = {};
  if (action.updates.label !== undefined) {
    updates.label = action.updates.label;
  }
  if (action.updates.type !== undefined) {
    updates.type = action.updates.type;
  }
  if (action.updates.description !== undefined) {
    updates.data = { ...node.data, description: action.updates.description };
  }

  if (Object.keys(updates).length === 0) {
    throw new Error("update_node 的 updates 字段为空，未提供任何修改");
  }

  // 记录旧值快照（用于撤销）
  const undo = emptyUndo("update_node", `修改节点：${action.nodeLabel}`);
  undo.nodeSnapshots = [{
    id: node.id,
    label: node.label,
    type: node.type,
    data: node.data ?? {},
  }];

  await store.updateNode(node.id, updates);
  return { undo };
}

/**
 * 按标签删除现有节点（store.removeNode 会自动清理相关边）。
 * 找不到目标节点时抛错。
 */
export async function applyRemoveNodeAction(
  action: RemoveNodeAction
): Promise<{ undo: UndoRecord }> {
  const store = useMechanismStore.getState();
  if (!store.currentGraphId) {
    throw new Error("未选择机制图，请先在左侧面板选择或创建一张图");
  }

  const node = store.nodes.find((n) => n.label === action.nodeLabel);
  if (!node) {
    throw new Error(`未找到标签为 "${action.nodeLabel}" 的节点`);
  }

  // 记录被删节点 + 关联边（用于撤销恢复）
  const undo = emptyUndo("remove_node", `删除节点：${action.nodeLabel}`);
  undo.removedNodes = [{ ...node }];
  undo.removedEdges = store.edges.filter(
    (e) => e.source === node.id || e.target === node.id
  );

  await store.removeNode(node.id);
  return { undo };
}

/**
 * 在现有图上增量添加节点和边。
 * - edges 的 sourceLabel/targetLabel 可以是已有节点或本次新增节点
 * - 过滤孤立的新增节点（没有任何边连接的）
 * - 位置用简单网格布局（参考 applyMechanismAction 的临时位置策略）
 */
export async function applyAddNodeToExistingAction(
  action: AddNodeToExistingAction
): Promise<{ nodeCount: number; edgeCount: number; undo: UndoRecord }> {
  const store = useMechanismStore.getState();
  if (!store.currentGraphId) {
    throw new Error("未选择机制图，请先在左侧面板选择或创建一张图");
  }

  const undo = emptyUndo("add_node_to_existing", "增量添加节点");
  const createdNodeIds: string[] = [];

  // 1. 构造 label→id 映射（已有节点）
  const labelToId = new Map<string, string>();
  for (const n of store.nodes) {
    labelToId.set(n.label, n.id);
  }

  // 2. 区分新节点和已有节点（按 label 查找）
  const newNodes = action.nodes.filter((n) => !labelToId.has(n.label));
  const duplicateLabels = action.nodes.filter((n) => labelToId.has(n.label));
  if (duplicateLabels.length > 0) {
    console.warn(
      `以下 label 已存在，跳过创建：${duplicateLabels
        .map((n) => n.label)
        .join(", ")}`
    );
  }

  // 3. 先用临时位置创建新节点，拿到真实 id
  //    位置用简单网格布局（基于现有节点数，避免重叠）
  const baseIndex = store.nodes.length;
  for (let i = 0; i < newNodes.length; i++) {
    const node = newNodes[i];
    const col = (baseIndex + i) % 5;
    const row = Math.floor((baseIndex + i) / 5);
    const id = await store.addNode(node.type, { x: col * 220, y: row * 110 }, node.label);
    if (id) {
      labelToId.set(node.label, id);
      createdNodeIds.push(id);
      if (node.description) {
        await store.updateNode(id, {
          data: { description: node.description },
        });
      }
    }
  }

  // 4. 过滤孤立的新增节点：新节点必须出现在至少一条 edge 中（容错匹配）
  const newLabelsSet = new Set(newNodes.map((n) => n.label));
  const connectedNewLabels = new Set<string>();
  // 容错匹配：大小写/空格不敏感
  const findNewLabel = (label: string): string | undefined => {
    if (newLabelsSet.has(label)) return label;
    const normalized = label.trim().toLowerCase();
    for (const nl of newLabelsSet) {
      if (nl.trim().toLowerCase() === normalized) return nl;
    }
    return undefined;
  };
  for (const edge of action.edges) {
    const sm = findNewLabel(edge.sourceLabel);
    const tm = findNewLabel(edge.targetLabel);
    if (sm) { edge.sourceLabel = sm; connectedNewLabels.add(sm); }
    if (tm) { edge.targetLabel = tm; connectedNewLabels.add(tm); }
  }
  const orphanNewLabels = newNodes
    .filter((n) => !connectedNewLabels.has(n.label))
    .map((n) => n.label);
  if (orphanNewLabels.length > 0) {
    console.warn(`过滤掉 ${orphanNewLabels.length} 个孤立新增节点：${orphanNewLabels.join(", ")}`);
    // 回滚：删除刚创建的孤立节点
    for (const label of orphanNewLabels) {
      const id = labelToId.get(label);
      if (id) {
        await store.removeNode(id);
        labelToId.delete(label);
        const idx = createdNodeIds.indexOf(id);
        if (idx >= 0) createdNodeIds.splice(idx, 1);
      }
    }
  }
  const validNewNodes = newNodes.filter((n) => connectedNewLabels.has(n.label));

  // 5. 创建所有边（用 label→id 映射）
  let edgeCount = 0;
  const createdEdgeIds: string[] = [];
  for (const edge of action.edges) {
    const sourceId = labelToId.get(edge.sourceLabel);
    const targetId = labelToId.get(edge.targetLabel);
    if (!sourceId || !targetId) {
      console.warn(`跳过边：找不到节点 "${edge.sourceLabel}" 或 "${edge.targetLabel}"`);
      continue;
    }
    const edgeId = await store.addEdge({
      source: sourceId,
      target: targetId,
      type: edge.type,
    });
    if (edgeId) createdEdgeIds.push(edgeId);
    edgeCount++;
  }

  undo.createdNodeIds = createdNodeIds;
  undo.createdEdgeIds = createdEdgeIds;
  undo.description = `已增量添加 ${validNewNodes.length} 个节点、${edgeCount} 条连接`;
  return { nodeCount: validNewNodes.length, edgeCount, undo };
}

/**
 * 修改现有属性的公式（按 name 查找）。
 * 找不到属性时抛错；expression 和 description 都为空时报错。
 */
export async function applyPatchFormulaAction(
  action: PatchFormulaAction
): Promise<{ undo: UndoRecord }> {
  const store = useNumericStore.getState();
  if (!store.currentSheetId) {
    throw new Error("未选择数值表，请先在左侧面板选择或创建一张数值表");
  }

  const attr = store.attributes.find((a) => a.name === action.attributeName);
  if (!attr) {
    throw new Error(`未找到名称为 "${action.attributeName}" 的属性`);
  }

  // 至少要有一个可更新的字段
  if (action.expression === undefined && action.description === undefined) {
    throw new Error("patch_formula 的 expression 和 description 都为空，未提供任何修改");
  }

  // updateFormula 必须传 expression（store 的签名要求）。若只改 description 则保留原表达式
  const existingFormula = store.formulas.find((f) => f.attributeId === attr.id);
  const expression = action.expression ?? existingFormula?.expression ?? "";

  // 记录旧公式快照（用于撤销）
  const undo = emptyUndo("patch_formula", `修改公式：${action.attributeName}`);
  undo.attrFormulaSnapshots = [{
    attrId: attr.id,
    oldExpression: existingFormula?.expression ?? "",
    oldDescription: existingFormula?.description ?? "",
  }];

  await store.updateFormula(attr.id, expression, action.description);
  return { undo };
}

/**
 * 统一入口：根据 action 类型分派到具体应用函数。
 * 返回 { summary, undo }：summary 用于 Toast，undo 用于撤销单次 tool call。
 */
export async function applyDesignAction(
  action: DesignAction
): Promise<{ summary: string; undo: UndoRecord }> {
  switch (action.action) {
    case "apply_mechanism": {
      const r = await applyMechanismAction(action);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "apply_numeric": {
      const r = await applyNumericAction(action);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "apply_gdd": {
      const r = await applyGddAction(action);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "update_node": {
      const r = await applyUpdateNodeAction(action);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "remove_node": {
      const r = await applyRemoveNodeAction(action);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "add_node_to_existing": {
      const r = await applyAddNodeToExistingAction(action);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "patch_formula": {
      const r = await applyPatchFormulaAction(action);
      return { summary: r.undo.description, undo: r.undo };
    }
    default:
      return { summary: "未知动作", undo: emptyUndo("unknown", "未知动作") };
  }
}

/**
 * 撤销单次 tool call 的应用。
 * 根据 UndoRecord 反向操作：删除创建的节点、恢复修改的快照、恢复删除的节点和边。
 */
export async function undoDesignAction(undo: UndoRecord): Promise<void> {
  const mechStore = useMechanismStore.getState();
  const numStore = useNumericStore.getState();
  const docStore = useDocumentStore.getState();

  // 0. 先删除 createdEdgeIds（在删除节点之前，避免 removeNode 级联清理造成混乱）
  //    覆盖"两端都是已有节点"的边（removeNode 级联清理不到）
  for (const id of undo.createdEdgeIds) {
    if (mechStore.edges.some((e) => e.id === id)) {
      await mechStore.removeEdge(id);
    }
  }

  // 1. 删除创建的节点（removeNode 自动清理关联边）
  for (const id of undo.createdNodeIds) {
    if (mechStore.nodes.some((n) => n.id === id)) {
      await mechStore.removeNode(id);
    }
  }

  // 2. 恢复修改的节点快照
  for (const snap of undo.nodeSnapshots) {
    if (mechStore.nodes.some((n) => n.id === snap.id)) {
      await mechStore.updateNode(snap.id, {
        label: snap.label,
        type: snap.type,
        data: snap.data,
      });
    }
  }

  // 3. 恢复被删的节点 + 边
  //    使用 restoreId 保留原 id，确保关联边能正确恢复（修复 id 不匹配导致边丢失）
  //    并建立 oldId → newId 映射，用于边的 source/target 转换
  const idMap = new Map<string, string>();
  for (const node of undo.removedNodes) {
    if (!mechStore.nodes.some((n) => n.id === node.id)) {
      const newId = await mechStore.addNode(node.type, node.position, node.label, node.id);
      if (newId) {
        idMap.set(node.id, newId);
        if (node.data && Object.keys(node.data).length > 0) {
          await mechStore.updateNode(newId, { data: node.data });
        }
      }
    } else {
      idMap.set(node.id, node.id);
    }
  }
  for (const edge of undo.removedEdges) {
    const sourceId = idMap.get(edge.source) ?? edge.source;
    const targetId = idMap.get(edge.target) ?? edge.target;
    if (
      mechStore.nodes.some((n) => n.id === sourceId) &&
      mechStore.nodes.some((n) => n.id === targetId)
    ) {
      await mechStore.addEdge({
        source: sourceId,
        target: targetId,
        type: edge.type,
        label: edge.label,
        direction: edge.direction,
        roles: edge.roles,
        strength: edge.strength,
      });
    }
  }

  // 4. 删除创建的数值属性
  for (const id of undo.createdAttrIds) {
    if (numStore.attributes.some((a) => a.id === id)) {
      await numStore.removeAttribute(id);
    }
  }

  // 5. 恢复公式快照
  for (const snap of undo.attrFormulaSnapshots) {
    if (numStore.attributes.some((a) => a.id === snap.attrId)) {
      await numStore.updateFormula(
        snap.attrId,
        snap.oldExpression,
        snap.oldDescription
      );
    }
  }

  // 6. 删除创建的文档段落
  for (const id of undo.createdSectionIds) {
    if (docStore.sections.some((s) => s.id === id)) {
      await docStore.removeSection(id);
    }
  }
}

/**
 * 获取动作的可读名称（用于按钮文案）。
 */
export function getActionLabel(action: DesignAction): string {
  switch (action.action) {
    case "apply_mechanism":
      return "应用到机制图";
    case "apply_numeric":
      return "应用到数值表";
    case "apply_gdd":
      return "追加到文档";
    case "update_node":
      return "修改节点";
    case "remove_node":
      return "删除节点";
    case "add_node_to_existing":
      return "增量添加";
    case "patch_formula":
      return "修改公式";
    default:
      return "应用";
  }
}

/**
 * 获取动作对应的目标模块（用于跳转）。
 * 增量动作也归入对应模块。
 */
export function getActionModule(
  action: DesignAction
): "mechanism" | "numeric" | "document" {
  switch (action.action) {
    case "apply_mechanism":
    case "update_node":
    case "remove_node":
    case "add_node_to_existing":
      return "mechanism";
    case "apply_numeric":
    case "patch_formula":
      return "numeric";
    case "apply_gdd":
      return "document";
  }
}

// ===== 新维度（玩法循环 / 高光时刻 / 规则 / 矩阵 / 关卡）tool calling 动作 =====
// 这些动作通过 tool calling 提交，写入 gameplay/rule/level store

export interface LoopDesignAction {
  action: "apply_loops";
  loops: Array<{
    name: string;
    description?: string;
    loopType: "core" | "secondary" | "meta";
    steps: Array<{
      label: string;
      playerAction: string;
      emotion: string;
      color: string;
    }>;
  }>;
}

export interface MomentDesignAction {
  action: "apply_moments";
  moments: Array<{
    title: string;
    description?: string;
    emotion: number;
    emotionLabel?: string;
    timing: number;
    type: MomentType;
    duration: number;
    notes?: string;
  }>;
}

export interface RuleDesignAction {
  action: "apply_rules";
  rules: Array<{
    title: string;
    condition: string;
    action: string;
    category: RuleCategory;
    priority?: number;
    notes?: string;
  }>;
}

export interface LevelFlowDesignAction {
  action: "apply_level_flow";
  name: string;
  nodes: Array<{
    label: string;
    type: LevelNodeType;
    difficulty: number;
    duration: number;
    description?: string;
    gates?: string[];
  }>;
  edges: Array<{
    source: string;
    target: string;
    type: LevelEdgeType;
  }>;
}

export type DimensionAction =
  | LoopDesignAction
  | MomentDesignAction
  | RuleDesignAction
  | LevelFlowDesignAction;

// ===== 新维度维度动作的 UndoRecord 扩展字段 =====
// 这些动作写入 gameplay/rule/level store，撤销需要记录创建的实体 ID
export interface DimensionUndoRecord {
  actionType: string;
  description: string;
  createdLoopIds: string[];
  createdMomentIds: string[];
  createdRuleIds: string[];
  createdFlowId?: string;
}

function emptyDimUndo(actionType: string, description: string): DimensionUndoRecord {
  return {
    actionType,
    description,
    createdLoopIds: [],
    createdMomentIds: [],
    createdRuleIds: [],
  };
}

/**
 * 应用核心循环设计：为每个循环调用 createLoop + addStep。
 */
export async function applyLoopsAction(
  action: LoopDesignAction,
  projectId: string
): Promise<{ count: number; undo: DimensionUndoRecord }> {
  const store = useGameplayStore.getState();
  const undo = emptyDimUndo("apply_loops", "生成核心循环");
  const createdLoopIds: string[] = [];
  let count = 0;
  for (const l of action.loops) {
    const loop = await store.createLoop(
      projectId,
      l.name || "未命名循环",
      l.loopType
    );
    createdLoopIds.push(loop.id);
    if (l.description) {
      await store.updateLoop(loop.id, { description: l.description });
    }
    for (const step of l.steps) {
      await store.addStep(loop.id, {
        label: step.label,
        playerAction: step.playerAction,
        emotion: step.emotion,
        color: step.color,
      });
    }
    count++;
  }
  // 选中最后创建的循环，便于用户查看
  if (createdLoopIds.length > 0) {
    store.selectLoop(createdLoopIds[createdLoopIds.length - 1]);
  }
  undo.createdLoopIds = createdLoopIds;
  undo.description = `已生成 ${count} 个核心循环`;
  return { count, undo };
}

/**
 * 应用高光时刻设计：为每个时刻调用 createMoment + updateMoment 补充字段。
 */
export async function applyMomentsAction(
  action: MomentDesignAction,
  projectId: string
): Promise<{ count: number; undo: DimensionUndoRecord }> {
  const store = useGameplayStore.getState();
  const undo = emptyDimUndo("apply_moments", "生成高光时刻");
  const createdMomentIds: string[] = [];
  let count = 0;
  for (const m of action.moments) {
    const moment = await store.createMoment(
      projectId,
      m.title || "未命名时刻",
      m.type
    );
    createdMomentIds.push(moment.id);
    await store.updateMoment(moment.id, {
      description: m.description ?? "",
      emotion: m.emotion,
      emotionLabel: m.emotionLabel ?? "",
      timing: m.timing,
      type: m.type,
      duration: m.duration,
      notes: m.notes ?? "",
    });
    count++;
  }
  undo.createdMomentIds = createdMomentIds;
  undo.description = `已生成 ${count} 个高光时刻`;
  return { count, undo };
}

/**
 * 应用规则卡牌设计：为每条规则调用 createRule + updateRule 补充字段。
 */
export async function applyRulesAction(
  action: RuleDesignAction,
  projectId: string
): Promise<{ count: number; undo: DimensionUndoRecord }> {
  const store = useRuleStore.getState();
  const undo = emptyDimUndo("apply_rules", "生成规则");
  const createdRuleIds: string[] = [];
  let count = 0;
  for (const r of action.rules) {
    const rule = await store.createRule(
      projectId,
      r.title || "未命名规则",
      r.category
    );
    createdRuleIds.push(rule.id);
    await store.updateRule(rule.id, {
      condition: r.condition,
      action: r.action,
      category: r.category,
      priority: r.priority ?? 5,
      notes: r.notes ?? "",
    });
    count++;
  }
  undo.createdRuleIds = createdRuleIds;
  undo.description = `已生成 ${count} 条规则`;
  return { count, undo };
}

/**
 * 应用关卡流程设计：创建流程，添加节点（网格布局）和连线。
 * edges 的 source/target 用节点 label 引用，需映射为真实 id。
 */
export async function applyLevelFlowAction(
  action: LevelFlowDesignAction,
  projectId: string
): Promise<{ nodeCount: number; edgeCount: number; undo: DimensionUndoRecord }> {
  const store = useLevelStore.getState();
  const flow = await store.createFlow(projectId, action.name || "AI 生成关卡流程");

  // label → id 映射（levelStore.addNode 已返回新节点 id，无需 hack）
  const labelToId = new Map<string, string>();
  let nodeCount = 0;
  for (let i = 0; i < action.nodes.length; i++) {
    const n = action.nodes[i];
    const col = i % 5;
    const row = Math.floor(i / 5);
    // addNode 需要 Omit<LevelNode, "id">，含 position
    const newNodeId = await store.addNode(flow.id, {
      label: n.label,
      type: n.type,
      difficulty: n.difficulty,
      duration: n.duration,
      description: n.description ?? "",
      position: { x: col * 220, y: row * 140 },
      gates: n.gates ?? [],
    });
    if (newNodeId) {
      labelToId.set(n.label, newNodeId);
      nodeCount++;
    }
  }

  // 创建连线
  let edgeCount = 0;
  for (const e of action.edges) {
    const sourceId = labelToId.get(e.source);
    const targetId = labelToId.get(e.target);
    if (!sourceId || !targetId) continue;
    await store.addEdge(flow.id, {
      source: sourceId,
      target: targetId,
      type: e.type,
    });
    edgeCount++;
  }

  // 选中新创建的流程
  store.selectFlow(flow.id);
  const undo = emptyDimUndo("apply_level_flow", `已生成关卡流程：${nodeCount} 个关卡、${edgeCount} 条连线`);
  undo.createdFlowId = flow.id;
  return { nodeCount, edgeCount, undo };
}

/**
 * 统一入口：根据 DimensionAction 类型分派到具体应用函数。
 * 返回 { summary, undo }：summary 用于 Toast，undo 用于撤销单次 tool call。
 */
export async function applyDimensionAction(
  action: DimensionAction,
  projectId: string
): Promise<{ summary: string; undo: DimensionUndoRecord }> {
  switch (action.action) {
    case "apply_loops": {
      const r = await applyLoopsAction(action, projectId);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "apply_moments": {
      const r = await applyMomentsAction(action, projectId);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "apply_rules": {
      const r = await applyRulesAction(action, projectId);
      return { summary: r.undo.description, undo: r.undo };
    }
    case "apply_level_flow": {
      const r = await applyLevelFlowAction(action, projectId);
      return { summary: r.undo.description, undo: r.undo };
    }
    default:
      return { summary: "未知动作", undo: emptyDimUndo("unknown", "未知动作") };
  }
}

/**
 * 撤销单次维度 tool call 的应用。
 */
export async function undoDimensionAction(undo: DimensionUndoRecord): Promise<void> {
  const gameplayStore = useGameplayStore.getState();
  const ruleStore = useRuleStore.getState();
  const levelStore = useLevelStore.getState();

  for (const id of undo.createdLoopIds) {
    await gameplayStore.deleteLoop(id);
  }
  for (const id of undo.createdMomentIds) {
    await gameplayStore.deleteMoment(id);
  }
  for (const id of undo.createdRuleIds) {
    await ruleStore.deleteRule(id);
  }
  if (undo.createdFlowId) {
    await levelStore.deleteFlow(undo.createdFlowId);
  }
}
