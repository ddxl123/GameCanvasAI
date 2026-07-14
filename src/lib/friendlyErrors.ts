import type { Attribute, Formula, GraphNode, GraphEdge } from "@/types";
import {
  detectCycles,
  computeAllAttributes,
  extractDependencies,
} from "@/lib/formula";

/**
 * 友好错误信息：把技术错误转成新人能看懂的提示。
 */
export interface FriendlyError {
  level: "error" | "warning" | "info";
  title: string; // 简短标题
  message: string; // 详细解释（新人能懂）
  suggestion?: string; // 修复建议
}

/**
 * 检测公式错误（循环引用、未定义属性、语法错误、除零风险）。
 */
export function analyzeFormulaErrors(
  attributes: Attribute[],
  formulas: Formula[]
): FriendlyError[] {
  const errors: FriendlyError[] = [];
  if (formulas.length === 0) return errors;

  const nameToAttr = new Map<string, Attribute>();
  const idToAttr = new Map<string, Attribute>();
  for (const a of attributes) {
    nameToAttr.set(a.name, a);
    idToAttr.set(a.id, a);
  }

  // 1. 循环引用
  const cycle = detectCycles(attributes, formulas);
  if (cycle && cycle.length > 0) {
    const cycleNames = cycle
      .map((id) => idToAttr.get(id)?.name ?? id)
      .join(" → ");
    errors.push({
      level: "error",
      title: "公式互相依赖了",
      message: `你的公式互相依赖了：${cycleNames}。这样计算机会陷入"先有鸡还是先有蛋"的死循环，无法算出结果。`,
      suggestion: "建议把其中一个公式改为固定数值（不再引用另一个属性），打破循环。",
    });
  }

  // 2. 逐公式检查：未定义属性、除零风险
  for (const formula of formulas) {
    const attr = idToAttr.get(formula.attributeId);
    const attrName = attr?.name;
    const expr = formula.expression?.trim();
    if (!expr) continue;

    // 未定义属性
    const deps = extractDependencies(expr);
    const undefinedDeps = deps.filter((d) => !nameToAttr.has(d));
    if (undefinedDeps.length > 0) {
      const list = undefinedDeps.map((d) => `「${d}」`).join("、");
      errors.push({
        level: "error",
        title: "公式引用了不存在的属性",
        message: `公式里用了 ${list}，但数值表里没有这个属性。${
          attrName ? `（出现在属性「${attrName}」的公式中）` : ""
        }`,
        suggestion:
          "是不是拼错了？或者需要先在数值表里创建这个属性？属性名要和 @ 后面的名字完全一致。",
      });
    }

    // 除零风险（除数是 @引用 或 括号表达式时，运行期可能为 0）
    if (hasDivisionByPotentialZero(expr)) {
      errors.push({
        level: "warning",
        title: "公式可能有除以 0 的风险",
        message: `公式里有除法，当除数为 0 时会出错（结果会变成无穷大或报错）。${
          attrName ? `（属性「${attrName}」）` : ""
        }`,
        suggestion:
          "建议加个保护：if(@防御力 > 0, @攻击力/@防御力, 0) —— 先判断除数是否大于 0，再决定怎么算。",
      });
    }
  }

  // 3. 语法 / 求值错误（通过引擎实际计算兜底）
  const computed = computeAllAttributes(attributes, formulas);
  for (const [attrId, result] of computed) {
    if (!result.error) continue;
    // 循环引用与无法排序已单独处理，跳过避免重复
    if (result.error.startsWith("循环引用")) continue;
    if (result.error === "无法排序") continue;
    const attr = idToAttr.get(attrId);
    errors.push(explainFormulaError(result.error, attr?.name));
  }

  return errors;
}

/**
 * 简单检测：除法且除数可能是 0（除数是 @引用 或 括号表达式）。
 */
function hasDivisionByPotentialZero(expr: string): boolean {
  return /\/\s*@/.test(expr) || /\/\s*\(/.test(expr);
}

/**
 * 解析单个公式错误，转为友好提示。
 */
export function explainFormulaError(
  error: string,
  attributeName?: string
): FriendlyError {
  const attrHint = attributeName ? `（属性「${attributeName}」）` : "";
  const lower = error.toLowerCase();

  // 循环引用
  if (error.startsWith("循环引用")) {
    return {
      level: "error",
      title: "公式互相依赖了",
      message: `${error}${attrHint}。这些属性的公式互相引用，计算机会陷入死循环。`,
      suggestion: "把其中一个公式改为固定数值，打破循环。",
    };
  }

  // 无法排序
  if (error === "无法排序") {
    return {
      level: "error",
      title: "公式依赖关系混乱",
      message: `无法确定公式的计算顺序${attrHint}。通常是依赖关系存在问题。`,
      suggestion: "检查公式之间的引用关系，确保没有互相依赖。",
    };
  }

  // 除零 / 无穷
  if (
    (lower.includes("divide") && lower.includes("zero")) ||
    lower.includes("infinity") ||
    error.includes("除以零") ||
    error.includes("Infinity")
  ) {
    return {
      level: "warning",
      title: "除以 0 了",
      message: `公式在计算时除以了 0${attrHint}，结果无效。`,
      suggestion: "加个保护：if(@除数 > 0, @被除数/@除数, 0)。",
    };
  }

  // 语法错误（mathjs）
  if (
    lower.includes("expected") ||
    lower.includes("unexpected") ||
    lower.includes("syntax") ||
    lower.includes("character") ||
    lower.includes("parenthesis") ||
    lower.includes("value expected") ||
    lower.includes("end of input")
  ) {
    return {
      level: "error",
      title: "公式语法有误",
      message: `公式语法有误${attrHint}：${error}。`,
      suggestion:
        "检查括号是否配对、运算符是否正确（如 +、-、*、/），函数名是否拼写正确（如 if、pow、log、min、max）。",
    };
  }

  // 未定义符号
  if (lower.includes("undefined") && lower.includes("symbol")) {
    return {
      level: "error",
      title: "公式里有不认识的符号",
      message: `公式里有不认识的符号${attrHint}：${error}。`,
      suggestion:
        "属性引用要用 @ 开头（如 @攻击力），函数名要写对（pow、log、sqrt、min、max、abs、if）。",
    };
  }

  // 求值失败（兜底）
  return {
    level: "error",
    title: "公式无法计算",
    message: `公式无法计算${attrHint}：${error}`,
    suggestion:
      "检查公式语法、属性引用是否正确，以及除数是否可能为 0。",
  };
}

/**
 * 检测机制图问题（孤立节点、无事件起点、无反馈节点、无反馈循环）。
 */
export function analyzeGraphIssues(
  nodes: GraphNode[],
  edges: GraphEdge[]
): FriendlyError[] {
  const issues: FriendlyError[] = [];
  if (nodes.length === 0) return issues;

  // 连接集合
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  // 1. 孤立节点
  const orphans = nodes.filter(
    (n) => n.type !== "note" && !connectedIds.has(n.id)
  );
  if (orphans.length > 0) {
    const list = orphans
      .slice(0, 3)
      .map((n) => `「${n.label || n.type}」`)
      .join("、");
    const more = orphans.length > 3 ? ` 等 ${orphans.length} 个` : "";
    issues.push({
      level: "warning",
      title: "有节点没有连接",
      message: `有节点没有连接任何其他节点（${list}${more}），它们可能是遗漏了。`,
      suggestion:
        "把这些节点连到玩法流程中，或者如果是临时想法，可以改成「便签」类型节点。",
    });
  }

  // 2. 无 event 节点
  const hasEvent = nodes.some((n) => n.type === "event");
  if (!hasEvent) {
    issues.push({
      level: "warning",
      title: "缺少「事件」起点",
      message:
        "机制图没有「事件」节点作为起点，玩法流程通常从事件开始（如：玩家进入区域、击杀敌人、按下按钮）。",
      suggestion:
        "加一个 event 节点作为流程的触发点，再用连接串起后续行为。",
    });
  }

  // 3. 无 reward / penalty
  const hasReward = nodes.some((n) => n.type === "reward");
  const hasPenalty = nodes.some((n) => n.type === "penalty");
  if (!hasReward && !hasPenalty) {
    issues.push({
      level: "warning",
      title: "缺少反馈节点",
      message:
        "机制图缺少反馈节点（奖励/惩罚），玩家没有正负反馈会失去动力。",
      suggestion:
        "加入 reward（奖励：掉落、经验、成就）或 penalty（惩罚：死亡掉落、冷却）节点，让玩家的行为有正负反馈。",
    });
  }

  // 4. 无 feedback 循环
  const hasFeedbackNode = nodes.some((n) => n.type === "feedback");
  const hasCycle = detectGraphCycle(nodes, edges);
  if (!hasFeedbackNode && !hasCycle) {
    issues.push({
      level: "info",
      title: "没有检测到反馈循环",
      message:
        "没有检测到反馈循环，当前玩法是单向流程，缺少闭环。",
      suggestion:
        "考虑加入 feedback（反馈循环）节点让玩法形成闭环，例如：连击系数、难度自适应、心流调节。",
    });
  }

  return issues;
}

/**
 * 简单的有向环检测（用于反馈循环判断）。
 * 把所有边按 source→target 当作有向边处理。
 */
function detectGraphCycle(
  nodes: GraphNode[],
  edges: GraphEdge[]
): boolean {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    if (!adj.has(e.target)) adj.set(e.target, []);
    adj.get(e.source)!.push(e.target);
  }

  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const n of nodes) color.set(n.id, WHITE);

  const dfs = (u: string): boolean => {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) return true;
      if (c === WHITE && dfs(v)) return true;
    }
    color.set(u, BLACK);
    return false;
  };

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      if (dfs(n.id)) return true;
    }
  }
  return false;
}
