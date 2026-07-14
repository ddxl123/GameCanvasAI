import { useState, useEffect } from "react";
import { useNumericStore } from "@/stores/numericStore";
import { evaluateAttribute, extractDependencies } from "@/lib/formula";
import { cn } from "@/lib/utils";
import {
  Calculator,
  Hash,
  Type,
  ToggleLeft,
  Link2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import type { AttributeType } from "@/types";

const typeLabels: Record<AttributeType, string> = {
  number: "数值",
  string: "字符串",
  bool: "布尔",
  ref: "引用",
};

const typeIcons: Record<AttributeType, typeof Hash> = {
  number: Hash,
  string: Type,
  bool: ToggleLeft,
  ref: Link2,
};

export default function FormulaEditor() {
  const {
    attributes,
    formulas,
    selectedAttributeId,
    updateAttribute,
    updateFormula,
    getFormula,
  } = useNumericStore();

  const selected = attributes.find((a) => a.id === selectedAttributeId);
  const formula = selected ? getFormula(selected.id) : undefined;
  const [expression, setExpression] = useState("");

  useEffect(() => {
    setExpression(formula?.expression ?? "");
  }, [formula?.expression, selectedAttributeId]);

  if (!selected) {
    return (
      <div className="h-full flex items-center justify-center bg-canvas-sunken">
        <div className="text-center">
          <Calculator className="w-10 h-10 text-ink-muted mx-auto mb-2" />
          <p className="text-sm text-ink-secondary mb-1">未选中属性</p>
          <p className="text-2xs text-ink-muted">
            从左侧属性树选择一个属性来编辑公式
          </p>
        </div>
      </div>
    );
  }

  const Icon = typeIcons[selected.type];
  const result = evaluateAttribute(selected, attributes, formulas);
  const deps = extractDependencies(expression);

  const handleExpressionChange = (value: string) => {
    setExpression(value);
    if (value.trim()) {
      updateFormula(selected.id, value);
    }
  };

  const handleValueChange = (value: string) => {
    updateAttribute(selected.id, { value });
  };

  return (
    <div className="h-full flex flex-col bg-canvas-sunken overflow-auto">
      {/* 属性信息头 */}
      <div className="px-6 py-4 border-b border-line-subtle bg-canvas-elevated">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-4 h-4 text-accent" />
          <h2 className="font-display text-lg font-semibold text-ink-primary">
            {selected.name}
          </h2>
          <span className="text-2xs px-1.5 py-0.5 rounded bg-canvas-sunken text-ink-muted">
            {typeLabels[selected.type]}
          </span>
        </div>
        <p className="text-2xs text-ink-muted font-mono">{selected.id}</p>
      </div>

      <div className="flex-1 px-6 py-4 space-y-6 max-w-3xl">
        {/* 属性值 */}
        <section>
          <label className="block text-xs font-medium text-ink-secondary mb-2">
            属性值
          </label>
          {selected.type === "number" ? (
            <input
              type="number"
              value={selected.value}
              onChange={(e) => handleValueChange(e.target.value)}
              className="input-field font-mono"
              step="any"
            />
          ) : selected.type === "bool" ? (
            <select
              value={selected.value}
              onChange={(e) => handleValueChange(e.target.value)}
              className="input-field"
            >
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
          ) : (
            <input
              type="text"
              value={selected.value}
              onChange={(e) => handleValueChange(e.target.value)}
              className="input-field"
            />
          )}
        </section>

        {/* 公式编辑器 */}
        {selected.type === "number" && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-xs font-medium text-ink-secondary">
                公式表达式
              </label>
              {expression.trim() && (
                <span className="text-2xs text-ink-muted">
                  按 @ 引用其他属性
                </span>
              )}
            </div>
            <textarea
              value={expression}
              onChange={(e) => handleExpressionChange(e.target.value)}
              placeholder="例如：@攻击力 * 1.5 - @防御力&#10;或：@等级 * 10 + 50"
              rows={3}
              className="input-field font-mono text-sm resize-none"
            />
            <p className="text-2xs text-ink-muted mt-1">
              用 @属性名 引用其他数值属性，如 @攻击力
            </p>
          </section>
        )}

        {/* 计算结果 */}
        {selected.type === "number" && (
          <section>
            <label className="block text-xs font-medium text-ink-secondary mb-2">
              计算结果
            </label>
            <div
              className={cn(
                "p-4 rounded-lg border flex items-center gap-3",
                result.error
                  ? "border-danger/40 bg-danger/5"
                  : "border-accent/40 bg-accent-glow"
              )}
            >
              {result.error ? (
                <>
                  <AlertCircle className="w-4 h-4 text-danger" />
                  <div>
                    <div className="text-sm text-danger">{result.error}</div>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 text-accent" />
                  <div className="flex-1">
                    <div className="text-2xl font-display font-bold text-ink-primary font-mono">
                      {typeof result.value === "number"
                        ? result.value.toFixed(2)
                        : result.value}
                    </div>
                    <div className="text-2xs text-ink-muted">
                      {expression.trim() ? "由公式计算" : "直接值"}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        )}

        {/* 依赖列表 */}
        {deps.length > 0 && (
          <section>
            <label className="block text-xs font-medium text-ink-secondary mb-2">
              依赖属性
            </label>
            <div className="flex flex-wrap gap-1.5">
              {deps.map((dep) => {
                const depAttr = attributes.find((a) => a.name === dep);
                return (
                  <span
                    key={dep}
                    className={cn(
                      "text-2xs px-2 py-1 rounded border font-mono",
                      depAttr
                        ? "border-accent/40 text-accent bg-accent-glow"
                        : "border-danger/40 text-danger bg-danger/5"
                    )}
                  >
                    @{dep}
                    {depAttr && (
                      <span className="text-ink-muted ml-1">
                        = {depAttr.value}
                      </span>
                    )}
                    {!depAttr && " (未找到)"}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {/* 可用属性列表（用于参考） */}
        <section>
          <label className="block text-xs font-medium text-ink-secondary mb-2">
            可用属性（点击复制引用）
          </label>
          <div className="flex flex-wrap gap-1.5">
            {attributes
              .filter((a) => a.id !== selected.id)
              .map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    const ref = `@${a.name}`;
                    const newExpr = expression
                      ? `${expression} ${ref}`
                      : ref;
                    setExpression(newExpr);
                    updateFormula(selected.id, newExpr);
                  }}
                  className="text-2xs px-2 py-1 rounded border border-line text-ink-secondary hover:border-accent hover:text-accent hover:bg-accent-glow transition-colors font-mono"
                >
                  @{a.name}
                </button>
              ))}
          </div>
        </section>
      </div>
    </div>
  );
}
