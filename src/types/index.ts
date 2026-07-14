// 项目
export interface Project {
  id: string;
  name: string;
  description: string;
  template: ProjectTemplate;
  createdAt: number;
  updatedAt: number;
}

export type ProjectTemplate =
  | "blank"
  | "combat"
  | "economy"
  | "rpg";

// 机制图
export interface MechanismGraph {
  id: string;
  projectId: string;
  name: string;
  type: GraphType;
  createdAt: number;
  updatedAt: number;
}

export type GraphType = "node_graph" | "system_loop";

// 节点
export interface GraphNode {
  id: string;
  graphId: string;
  type: NodeType;
  label: string;
  data: Record<string, unknown>;
  position: { x: number; y: number };
  refAttributeId?: string;
  groupId?: string; // 所属分组（子图折叠用）
}

export type NodeType =
  // 逻辑层
  | "event" // 事件：玩家输入/系统触发
  | "action" // 行为：执行操作
  | "state" // 状态：当前情况
  | "condition" // 条件：分支判断
  // 资源层
  | "resource" // 资源：可累积的量
  | "pool" // 资源池：存储与限制
  | "converter" // 转换器：输入转输出
  // 成长层
  | "attribute" // 属性：角色能力维度
  | "modifier" // 修饰符：临时/永久增益
  | "level" // 等级节点：经验驱动成长
  // 反馈层
  | "reward" // 奖励：正反馈输出
  | "penalty" // 惩罚：负反馈
  | "feedback" // 反馈循环：体验感知
  // 社交/AI 层
  | "ai_behavior" // AI 行为：NPC 决策
  | "social" // 社交：玩家间互动
  // 辅助层
  | "note" // 便签：设计注解，不参与模拟
  // ===== 世界观层（World）=====
  | "region" // 区域：地图区域，如新手村、Boss房、安全区
  | "landmark" // 地标：关键地点，如传送点、NPC位置、宝箱点
  | "path" // 路径：连接区域的道路/传送网络
  | "weather" // 天气：动态环境状态，如雨天、夜晚、沙暴
  | "biome" // 生态群落：区域类型，如森林、沙漠、雪山
  // ===== 内容元素层（Content）=====
  | "character" // 角色：NPC/玩家/敌人单位
  | "item" // 道具：可携带物品，如武器、药水、钥匙
  | "skill" // 技能：主动/被动能力
  | "quest" // 任务：目标链，如主线、支线、每日
  | "dialogue" // 对话：对话树/剧情分支
  | "enemy" // 敌人：战斗单位，如小怪、精英、Boss
  | "shop" // 商店：交易场所
  // ===== 感官体验层（Sensory）=====
  | "music" // 音乐：BGM 切换/动态音乐
  | "sfx" // 音效：事件音效
  | "fx" // 特效：视觉特效，如粒子、震屏、慢动作
  | "animation" // 动画：角色动画
  | "camera" // 镜头：镜头语言
  | "ui" // UI：界面元素
  // ===== 系统机制层（System）=====
  | "timer" // 计时器：倒计时/CD/刷新
  | "rng" // 随机数：概率事件
  | "trigger_zone" // 触发区域：空间触发器
  | "spawner" // 生成器：动态生成
  | "savepoint" // 存档点：存档/复活点
  | "difficulty"; // 难度调节：动态难度

// 边
export interface GraphEdge {
  id: string;
  graphId: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
  direction?: EdgeDirection; // 方向覆盖（默认由 kind 决定）
  roles?: { source?: string; target?: string }; // 语义角色标签
  strength?: EdgeStrength; // 关系强度
}

export type EdgeDirection = "unidirectional" | "bidirectional" | "undirected";

export type EdgeStrength = "strong" | "normal" | "weak";

/**
 * 17 种语义化边类型，分 5 大类：
 * - communication（通信类）：invoke/subscribe/emit/pass —— 现代系统语义，单向
 * - dataflow（数据流类）：produce/consume/transform/modify —— 单向
 * - structure（结构类）：compose/reference/belong —— 无向
 * - control（控制类）：enable/inhibit/branch —— 单向
 * - interaction（交互类）：cooperate/interact/oppose —— 双向
 */
export type EdgeType =
  // 通信类（单向）
  | "invoke" // 调用：A 调用 B 的能力（skill→action, ui→action）
  | "subscribe" // 订阅：A 监听 B 的变化（condition→state）
  | "emit" // 发射：A 发出事件供 B 接收（event→action, trigger_zone→event）
  | "pass" // 传递：A 把数据传给 B（action→action, converter→resource）
  // 数据流类（单向）
  | "produce" // 产出：A 产出 B（action→resource, spawner→enemy）
  | "consume" // 消耗：A 消耗 B（action→pool）
  | "transform" // 转换：A 转换为 B（converter→resource）
  | "modify" // 修改：A 修改 B 的值（modifier→attribute）
  // 结构类（无向）
  | "compose" // 组合：A 由 B 组成（quest↔subquest, region↔landmark）
  | "reference" // 引用：A 引用 B 的定义（skill↔item, attribute↔modifier）
  | "belong" // 归属：A 属于 B（item↔character, enemy↔region）
  // 控制类（单向）
  | "enable" // 启用：A 解锁 B（level→skill）
  | "inhibit" // 抑制：A 压制 B（penalty→action）
  | "branch" // 分支：A 根据 B 分支（condition→action）
  // 交互类（双向）
  | "cooperate" // 协作：A 与 B 协同（character↔character）
  | "interact" // 互动：A 与 B 互动（player↔npc, player↔item）
  | "oppose"; // 对抗：A 与 B 对抗（player↔enemy, pvp）

// 数值表
export interface NumericSheet {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// 属性
export interface Attribute {
  id: string;
  sheetId: string;
  name: string;
  type: AttributeType;
  value: string;
  unit?: string;
  description?: string;
  parentId: string | null;
  order: number;
}

export type AttributeType =
  | "number"
  | "string"
  | "bool"
  | "ref";

// 公式
export interface Formula {
  id: string;
  sheetId: string;
  attributeId: string;
  expression: string;
  description?: string;
}

// GDD 文档
export interface GDDDocument {
  id: string;
  projectId: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

// 文档段落
export interface DocSection {
  id: string;
  docId: string;
  title: string;
  content: string;
  type: DocSectionType;
  embedType?: EmbedType;
  embedRefId?: string;
  order: number;
}

export type DocSectionType =
  | "heading"
  | "paragraph"
  | "embed";

export type EmbedType = "mechanism" | "numeric";

// AI 配置
export interface AIConfig {
  key: AIProvider;
  apiKey: string;
  baseUrl?: string;
  model: string;
  enabled: boolean;
}

export type AIProvider =
  | "openai"
  | "claude"
  | "qwen"
  | "deepseek";

// 用户设置
export interface UserSettings {
  defaultModel: AIProvider;
  theme: "dark" | "light";
  autoSave: boolean;
}

// AI 对话消息
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  stream?: boolean;
  signal?: AbortSignal;
}

// AI 能力结果
export interface AIReviewIssue {
  severity: "high" | "medium" | "low";
  nodeIds: string[];
  title: string;
  description: string;
  suggestion: string;
}

export interface AIBalanceIssue {
  severity: "high" | "medium" | "low";
  attributeIds: string[];
  title: string;
  description: string;
  suggestion: string;
}

export interface AIReferenceCase {
  game: string;
  mechanic: string;
  description: string;
  relevance: string;
}

// 节点类型元数据
export interface NodeTypeMeta {
  type: NodeType;
  label: string;
  category:
    | "logic"
    | "system"
    | "growth"
    | "feedback"
    | "social"
    | "aux"
    | "world"
    | "content"
    | "sensory";
  icon: string;
  color: string;
  description: string;
  ports: {
    inputs: number;
    outputs: number;
  };
}

export interface EdgeTypeMeta {
  type: EdgeType;
  label: string;
  color: string;
  dashed: boolean;
  description: string;
  category: "communication" | "dataflow" | "structure" | "control" | "interaction";
  direction: EdgeDirection; // 默认方向性
  defaultRoles?: { source: string; target: string }; // 默认角色标签
  defaultStrength?: EdgeStrength; // 默认强度
}

// ===== AI 对话持久化 =====

export interface AIConversation {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface AIChatMessage {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  action?: string; // 触发该消息的 action id
  applied?: boolean; // 设计动作是否已应用（历史保留字段，当前自动应用后不再依赖）
  createdAt: number;
  order: number;
}

// ===== 设计快照 / 版本 =====

export interface DesignSnapshot {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  createdAt: number;
  data: string; // JSON.stringify(ProjectExportData)，复用导出结构
}

// ===== 节点分组（子图折叠）=====

export interface NodeGroup {
  id: string;
  graphId: string;
  name: string;
  color: string;
  collapsed: boolean;
  createdAt: number;
}

// ===== 评论批注 =====

export type CommentTargetType = "node" | "attribute" | "section" | "graph";

export interface Comment {
  id: string;
  projectId: string;
  targetType: CommentTargetType;
  targetId: string;
  author: string;
  content: string;
  resolved: boolean;
  createdAt: number;
}

// ===== 灵感便签 =====

export type InspirationCategory =
  | "gameplay"
  | "narrative"
  | "art"
  | "music"
  | "character"
  | "level"
  | "economy"
  | "combat"
  | "other";

export type InspirationStatus =
  | "idea"
  | "drafted"
  | "in_progress"
  | "realized"
  | "archived";

export interface Inspiration {
  id: string;
  projectId: string | null; // null 表示全局灵感，未归属项目
  title: string; // 一句话想法
  content?: string; // 详细描述
  tags: string[]; // 标签：玩法/叙事/美术/音乐/角色/关卡/经济/战斗/...
  category: InspirationCategory;
  status: InspirationStatus;
  color: string; // 便签颜色
  createdAt: number;
  updatedAt: number;
}

// ===== 核心循环 =====

export interface CoreLoop {
  id: string;
  projectId: string;
  name: string;
  description: string;
  steps: LoopStep[];
  loopType: "core" | "secondary" | "meta";
  createdAt: number;
  updatedAt: number;
}

export interface LoopStep {
  id: string;
  label: string;
  playerAction: string;
  emotion: string;
  color: string;
  order: number;
}

// ===== 高光时刻 =====

export type MomentType = "story" | "combat" | "exploration" | "social" | "economy" | "custom";

export interface GameMoment {
  id: string;
  projectId: string;
  title: string;
  description: string;
  emotion: number; // 1-10 intensity
  emotionLabel: string;
  timing: number; // 0-100 percentage of game progression
  type: MomentType;
  duration: number; // estimated seconds
  notes: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

// ===== 规则卡牌 =====

export type RuleCategory = "combat" | "movement" | "economy" | "social" | "progression" | "custom";

export interface GameRule {
  id: string;
  projectId: string;
  title: string;
  condition: string;
  action: string;
  category: RuleCategory;
  priority: number; // 1-10
  enabled: boolean;
  notes: string;
  order: number;
  createdAt: number;
  updatedAt: number;
}

// ===== 元素交互矩阵 =====

export type InteractionType = "reaction" | "buff" | "debuff" | "cancel" | "custom";

export interface InteractionMatrix {
  id: string;
  projectId: string;
  name: string;
  elements: string[];
  interactions: InteractionCell[];
  createdAt: number;
  updatedAt: number;
}

export interface InteractionCell {
  elementA: string;
  elementB: string;
  result: string;
  type: InteractionType;
  description?: string;
}

// ===== 关卡流程 =====

export type LevelNodeType = "level" | "boss" | "cutscene" | "hub" | "secret" | "tutorial" | "ending";
export type LevelEdgeType = "normal" | "secret" | "locked" | "branch";

export interface LevelFlow {
  id: string;
  projectId: string;
  name: string;
  nodes: LevelNode[];
  edges: LevelEdge[];
  createdAt: number;
  updatedAt: number;
}

export interface LevelNode {
  id: string;
  label: string;
  type: LevelNodeType;
  difficulty: number; // 1-10
  duration: number; // estimated minutes
  description: string;
  position: { x: number; y: number };
  gates: string[];
}

export interface LevelEdge {
  id: string;
  source: string;
  target: string;
  type: LevelEdgeType;
  label?: string;
}

// ===== 统一画布元素（discriminated union，聚焦 6 个玩法维度）=====

export type CanvasElementType =
  | "core-loop"
  | "loop-step"
  | "moment"
  | "node"
  | "rule"
  | "level-node"
  | "attribute";

/**
 * 画布元素 = discriminated union，每个变体携带完整原始数据。
 * 通过 `type` 字段做类型收窄，访问 `data` 时类型已确定。
 * 不再包含 matrix-cell 和 doc-section —— 矩阵和文档不是玩法节点。
 */
export type CanvasElement =
  | {
      key: string;
      type: "core-loop";
      data: CoreLoop;
    }
  | {
      key: string;
      type: "loop-step";
      data: LoopStep;
      loopId: string;
      loopName: string;
    }
  | {
      key: string;
      type: "moment";
      data: GameMoment;
    }
  | {
      key: string;
      type: "node";
      data: GraphNode;
      graphName: string;
    }
  | {
      key: string;
      type: "rule";
      data: GameRule;
    }
  | {
      key: string;
      type: "level-node";
      data: LevelNode;
      flowId: string;
      flowName: string;
    }
  | {
      key: string;
      type: "attribute";
      data: Attribute;
      formula?: Formula;
    };

/** 从 CanvasElement 提取显示标题 */
export function getElementTitle(el: CanvasElement): string {
  switch (el.type) {
    case "core-loop":
      return el.data.name;
    case "loop-step":
      return el.data.label;
    case "moment":
      return el.data.title;
    case "node":
      return el.data.label;
    case "rule":
      return el.data.condition || el.data.title;
    case "level-node":
      return el.data.label;
    case "attribute":
      return el.data.name;
  }
}

/** 从 CanvasElement 提取显示副标题 */
export function getElementSubtitle(el: CanvasElement): string {
  switch (el.type) {
    case "core-loop":
      return el.data.description || `${el.data.steps.length} 个步骤`;
    case "loop-step":
      return el.data.playerAction;
    case "moment":
      return `${el.data.emotionLabel} (${el.data.emotion}/10)`;
    case "node": {
      const desc = el.data.data?.description;
      return typeof desc === "string" ? desc : "";
    }
    case "rule":
      return el.data.action;
    case "level-node":
      return `难度${el.data.difficulty} · ${el.data.duration}分钟`;
    case "attribute":
      return el.formula ? `← ${el.formula.expression}` : `= ${el.data.value}`;
  }
}

/** 从 CanvasElement 提取实体 ID */
export function getElementEntityId(el: CanvasElement): string {
  switch (el.type) {
    case "core-loop":
      return el.data.id;
    case "loop-step":
      return el.data.id;
    case "moment":
      return el.data.id;
    case "node":
      return el.data.id;
    case "rule":
      return el.data.id;
    case "level-node":
      return el.data.id;
    case "attribute":
      return el.data.id;
  }
}
