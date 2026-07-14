import { evaluate } from "mathjs";
import type { Attribute, Formula } from "@/types";

// 匹配 @attrName 形式的属性引用
const ATTR_REF_PATTERN = /@([a-zA-Z_\u4e00-\u9fa5][a-zA-Z0-9_\u4e00-\u9fa5]*)/g;

// 公式表达式字符白名单：仅允许字母数字、下划线、中文、空格、算术与引用符号
const ALLOWED_PATTERN = /^[\w\u4e00-\u9fa5\s+\-*/().,@%^!_:]+$/;

/**
 * 校验公式表达式仅包含白名单字符，防止 mathjs 注入。
 */
function validateExpression(expression: string): void {
  if (!ALLOWED_PATTERN.test(expression)) {
    throw new Error("公式包含非法字符");
  }
}

export interface EvalResult {
  value: number | string;
  error?: string;
  deps: string[]; // 依赖的属性名
}

// ===== 依赖图与循环检测 =====

/**
 * 构建属性依赖图：attrId → 依赖的 attrId 集合
 */
export function buildDependencyGraph(
  attributes: Attribute[],
  formulas: Formula[]
): Map<string, Set<string>> {
  const nameToId = new Map<string, string>();
  for (const a of attributes) nameToId.set(a.name, a.id);

  const graph = new Map<string, Set<string>>();
  for (const a of attributes) graph.set(a.id, new Set());

  for (const f of formulas) {
    if (!f.expression) continue;
    const matches = f.expression.matchAll(ATTR_REF_PATTERN);
    for (const m of matches) {
      const depName = m[1];
      const depId = nameToId.get(depName);
      if (depId) {
        graph.get(f.attributeId)?.add(depId);
      }
    }
  }
  return graph;
}

/**
 * 检测循环引用（基于 DFS）
 * @returns 参与循环的属性 ID 链；无循环返回 null
 */
export function detectCycles(
  attributes: Attribute[],
  formulas: Formula[]
): string[] | null {
  const graph = buildDependencyGraph(attributes, formulas);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  for (const a of attributes) color.set(a.id, WHITE);

  const stack: string[] = [];

  const dfs = (id: string): boolean => {
    color.set(id, GRAY);
    stack.push(id);
    const deps = graph.get(id) ?? new Set<string>();
    for (const dep of deps) {
      const c = color.get(dep) ?? WHITE;
      if (c === GRAY) {
        // 找到环：截取从 dep 开始的部分
        const idx = stack.indexOf(dep);
        if (idx >= 0) {
          cycleResult = stack.slice(idx).concat(dep);
        }
        return true;
      }
      if (c === WHITE && dfs(dep)) return true;
    }
    stack.pop();
    color.set(id, BLACK);
    return false;
  };

  let cycleResult: string[] | null = null;
  for (const a of attributes) {
    if (color.get(a.id) === WHITE) {
      if (dfs(a.id)) return cycleResult;
    }
  }
  return null;
}

/**
 * 拓扑排序（Kahn 算法），返回计算顺序；若存在环返回 null
 */
export function topologicalSort(
  attributes: Attribute[],
  formulas: Formula[]
): string[] | null {
  const graph = buildDependencyGraph(attributes, formulas);
  const inDegree = new Map<string, number>();
  for (const a of attributes) inDegree.set(a.id, 0);
  for (const [, _deps] of graph) {
    // deps 是当前属性依赖的属性；被依赖的属性入度不变，依赖者的"被依赖次数"也不变
    // 这里 inDegree 表示"被多少其他属性依赖"
  }
  // 重新计算入度：被多少属性依赖
  for (const a of attributes) inDegree.set(a.id, 0);
  for (const [, deps] of graph) {
    for (const dep of deps) {
      inDegree.set(dep, (inDegree.get(dep) ?? 0) + 1);
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }
  const result: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    result.push(id);
    // 找所有依赖 id 的属性，减少其入度
    for (const [attrId, deps] of graph) {
      if (deps.has(id)) {
        const newDeg = (inDegree.get(attrId) ?? 0) - 1;
        inDegree.set(attrId, newDeg);
        if (newDeg === 0) queue.push(attrId);
      }
    }
  }
  if (result.length !== attributes.length) return null;
  return result;
}

// ===== 批量计算 =====

export interface ComputedAttribute {
  attributeId: string;
  value: number | string;
  error?: string;
  deps: string[];
  hasFormula: boolean;
}

/**
 * 批量计算所有属性的值，按拓扑顺序求值，支持公式间相互引用
 */
export function computeAllAttributes(
  attributes: Attribute[],
  formulas: Formula[]
): Map<string, ComputedAttribute> {
  const result = new Map<string, ComputedAttribute>();
  const cycle = detectCycles(attributes, formulas);
  if (cycle) {
    // 存在循环引用，所有参与循环的属性标记错误
    const cycleNames = cycle
      .map((id) => attributes.find((a) => a.id === id)?.name ?? id)
      .join(" → ");
    for (const a of attributes) {
      const formula = formulas.find((f) => f.attributeId === a.id);
      const deps: string[] = [];
      if (formula?.expression) {
        const matches = formula.expression.matchAll(ATTR_REF_PATTERN);
        for (const m of matches) deps.push(m[1]);
      }
      if (cycle.includes(a.id)) {
        result.set(a.id, {
          attributeId: a.id,
          value: 0,
          error: `循环引用: ${cycleNames}`,
          deps,
          hasFormula: !!formula?.expression,
        });
      } else {
        result.set(a.id, {
          attributeId: a.id,
          value: a.type === "number" ? parseFloat(a.value) || 0 : a.value,
          deps,
          hasFormula: !!formula?.expression,
        });
      }
    }
    return result;
  }

  const order = topologicalSort(attributes, formulas);
  if (!order) {
    for (const a of attributes) {
      result.set(a.id, {
        attributeId: a.id,
        value: a.type === "number" ? parseFloat(a.value) || 0 : a.value,
        deps: [],
        hasFormula: false,
        error: "无法排序",
      });
    }
    return result;
  }

  const nameToAttr = new Map<string, Attribute>();
  for (const a of attributes) nameToAttr.set(a.name, a);

  for (const id of order) {
    const attr = attributes.find((a) => a.id === id);
    if (!attr) continue;
    const formula = formulas.find((f) => f.attributeId === id);
    const deps: string[] = [];
    if (formula?.expression) {
      const matches = formula.expression.matchAll(ATTR_REF_PATTERN);
      for (const m of matches) deps.push(m[1]);
    }

    if (!formula?.expression) {
      const val = attr.type === "number" ? parseFloat(attr.value) || 0 : attr.value;
      result.set(id, { attributeId: id, value: val, deps, hasFormula: false });
      continue;
    }

    // 替换属性引用并求值
    try {
      validateExpression(formula.expression);
      const replaced = formula.expression.replace(ATTR_REF_PATTERN, (_match, name) => {
        const depAttr = nameToAttr.get(name);
        if (!depAttr) return "0";
        const computed = result.get(depAttr.id);
        if (computed?.error) return "0";
        const v = computed?.value;
        if (typeof v === "number") return String(v);
        if (typeof v === "string" && !isNaN(parseFloat(v))) return String(parseFloat(v));
        return "0";
      });
      const evalResult = evaluate(replaced);
      result.set(id, {
        attributeId: id,
        value: typeof evalResult === "number" ? evalResult : 0,
        deps,
        hasFormula: true,
      });
    } catch (e) {
      result.set(id, {
        attributeId: id,
        value: 0,
        error: e instanceof Error ? e.message : "求值失败",
        deps,
        hasFormula: true,
      });
    }
  }
  return result;
}

// 获取属性值（数字类型）—— 保留用于曲线预览
function getAttrValue(
  attr: Attribute,
  allAttrs: Attribute[],
  formulas: Formula[],
  visited: Set<string>
): number {
  if (visited.has(attr.id)) {
    throw new Error(`循环引用: ${attr.name}`);
  }
  visited.add(attr.id);

  if (attr.type === "number") {
    const num = parseFloat(attr.value);
    if (!isNaN(num)) return num;
  }

  const formula = formulas.find((f) => f.attributeId === attr.id);
  if (formula?.expression) {
    return evalExpression(formula.expression, allAttrs, formulas, visited);
  }

  return 0;
}

function evalExpression(
  expr: string,
  allAttrs: Attribute[],
  formulas: Formula[],
  visited: Set<string>
): number {
  // 执行前校验表达式字符白名单，防止 mathjs 注入
  validateExpression(expr);
  const replaced = expr.replace(ATTR_REF_PATTERN, (_match, name) => {
    const attr = allAttrs.find((a) => a.name === name);
    if (!attr) return "0";
    const val = getAttrValue(attr, allAttrs, formulas, new Set(visited));
    return String(val);
  });

  try {
    const result = evaluate(replaced);
    if (typeof result === "number") return result;
    return 0;
  } catch {
    return 0;
  }
}

export function evaluateAttribute(
  attribute: Attribute,
  allAttrs: Attribute[],
  formulas: Formula[]
): EvalResult {
  const formula = formulas.find((f) => f.attributeId === attribute.id);
  const deps: string[] = [];

  if (formula?.expression) {
    const matches = formula.expression.matchAll(ATTR_REF_PATTERN);
    for (const match of matches) {
      deps.push(match[1]);
    }
  }

  if (attribute.type === "number" && !formula?.expression) {
    const val = parseFloat(attribute.value);
    return { value: isNaN(val) ? 0 : val, deps };
  }

  if (formula?.expression) {
    try {
      const val = evalExpression(
        formula.expression,
        allAttrs,
        formulas,
        new Set()
      );
      return { value: val, deps };
    } catch (e) {
      return {
        value: 0,
        error: e instanceof Error ? e.message : "求值失败",
        deps,
      };
    }
  }

  return { value: attribute.value, deps };
}

// 生成曲线数据（用于曲线预览）
export function generateCurveData(
  attribute: Attribute,
  allAttrs: Attribute[],
  formulas: Formula[],
  variable: string,
  range: { start: number; end: number; step: number }
): { x: number; y: number }[] {
  const formula = formulas.find((f) => f.attributeId === attribute.id);
  if (!formula?.expression) {
    const val = parseFloat(attribute.value) || 0;
    return Array.from(
      { length: Math.floor((range.end - range.start) / range.step) + 1 },
      (_, i) => {
        const x = range.start + i * range.step;
        return { x, y: val };
      }
    );
  }

  const data: { x: number; y: number }[] = [];
  for (let x = range.start; x <= range.end; x += range.step) {
    try {
      validateExpression(formula.expression);
      let expr = formula.expression;
      expr = expr.replace(ATTR_REF_PATTERN, (_match, name) => {
        if (name === variable) return String(x);
        const attr = allAttrs.find((a) => a.name === name);
        if (!attr) return "0";
        const val = getAttrValue(attr, allAttrs, formulas, new Set());
        return String(val);
      });
      expr = expr.replace(new RegExp(`\\$${variable}`, "g"), String(x));

      const result = evaluate(expr);
      data.push({ x, y: typeof result === "number" ? result : 0 });
    } catch {
      data.push({ x, y: 0 });
    }
  }
  return data;
}

// 获取公式中引用的所有属性名
export function extractDependencies(expression: string): string[] {
  const deps: string[] = [];
  const matches = expression.matchAll(ATTR_REF_PATTERN);
  for (const match of matches) {
    if (!deps.includes(match[1])) deps.push(match[1]);
  }
  return deps;
}
