import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useUIStore } from "@/stores/uiStore";
import { useAIStore } from "@/stores/aiStore";
import { useProjectStore } from "@/stores/projectStore";
import { db } from "@/db";
import { cn } from "@/lib/utils";
import { callAI } from "@/lib/aiClient";
import {
  buildNodeFieldsGenPrompt,
  type NodeFieldsGenMode,
  type AIFieldSuggestion,
} from "@/lib/aiPrompts";
import { NODE_TYPE_META, getNodeIcon } from "./nodeTypes";
import { GraphReferenceInfo } from "./ReferencePanel";
import { useGsapFlip, useGsapHover } from "@/hooks/useGsap";
import {
  Trash2,
  Link2,
  Unlink,
  ArrowRight,
  X,
  Plus,
  Type as TypeIcon,
  Hash,
  ToggleLeft,
  List,
  Sliders,
  Palette,
  Link as LinkIcon,
  ChevronDown,
  Sparkles,
  Loader2,
  Wand2,
} from "lucide-react";
import type { Attribute, GraphNode } from "@/types";

// ===== 富字段类型系统 =====

type CustomFieldType =
  | "text"
  | "number"
  | "boolean"
  | "select"
  | "range"
  | "color"
  | "reference";

interface CustomFieldDef {
  id: string;
  key: string;
  type: CustomFieldType;
  value: unknown;
  options?: string[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  referenceType?: "attribute" | "node";
}

const FIELD_TYPES: {
  type: CustomFieldType;
  label: string;
  icon: typeof Hash;
  color: string;
}[] = [
  { type: "text", label: "文本", icon: TypeIcon, color: "#60A5FA" },
  { type: "number", label: "数值", icon: Hash, color: "#10B981" },
  { type: "boolean", label: "开关", icon: ToggleLeft, color: "#F59E0B" },
  { type: "select", label: "选择", icon: List, color: "#A855F7" },
  { type: "range", label: "范围", icon: Sliders, color: "#06B6D4" },
  { type: "color", label: "颜色", icon: Palette, color: "#EC4899" },
  { type: "reference", label: "引用", icon: LinkIcon, color: "#8B5CF6" },
];

function generateFieldId(): string {
  return `f_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

/** 旧格式兼容：把 Record<string,string> 迁移为 CustomFieldDef[] */
function migrateCustomFields(
  raw: unknown
): CustomFieldDef[] {
  if (Array.isArray(raw)) return raw as CustomFieldDef[];
  if (raw && typeof raw === "object") {
    return Object.entries(raw as Record<string, string>).map(([key, value]) => ({
      id: generateFieldId(),
      key,
      type: "text" as const,
      value,
    }));
  }
  return [];
}

// 优先级配置：4 档色块
const PRIORITY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: "low", label: "低", color: "#60A5FA" },
  { value: "medium", label: "中", color: "#FBBF24" },
  { value: "high", label: "高", color: "#FB923C" },
  { value: "critical", label: "紧急", color: "#EF4444" },
];

export default function NodePropertyPanel() {
  const { nodes, selectedNodeId, currentGraphId, updateNode, removeNode } = useMechanismStore();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const { getActiveConfig } = useAIStore();
  const currentProject = useProjectStore((s) => s.currentProject);
  const [allAttrs, setAllAttrs] = useState<Attribute[]>([]);
  const [tagInput, setTagInput] = useState("");
  // 当前展开的字段类型选择器（字段 id）
  const [addFieldTypeOpen, setAddFieldTypeOpen] = useState(false);
  // AI 生成相关状态
  const [aiGenLoading, setAiGenLoading] = useState(false);
  const [aiGenModeOpen, setAiGenModeOpen] = useState(false);
  // 单字段 AI 生成：记录正在生成的字段 id
  const [aiFieldLoadingId, setAiFieldLoadingId] = useState<string | null>(null);
  // AI 额外提示词（localStorage 持久化，跨节点/跨会话保留）
  const [aiHint, setAiHint] = useState<string>(() => {
    try {
      return localStorage.getItem("ai-fields-hint") || "";
    } catch {
      return "";
    }
  });

  const handleHintChange = (val: string) => {
    setAiHint(val);
    try {
      localStorage.setItem("ai-fields-hint", val);
    } catch {
      // 忽略 localStorage 写入失败（隐私模式等）
    }
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const rootRef = useRef<HTMLDivElement>(null);

  useGsapFlip(rootRef, selectedNodeId);
  useGsapHover(rootRef, { lift: 1, scale: 1.08, selector: "[data-priority-btn]" });

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const sheets = await db.numericSheets
          .where("projectId")
          .equals(projectId)
          .toArray();
        if (sheets.length > 0) {
          const attrs = await db.attributes
            .where("sheetId")
            .equals(sheets[0].id)
            .toArray();
          setAllAttrs(attrs);
        }
      } catch (e) {
        console.error("加载属性失败:", e);
      }
    })();
  }, [projectId]);

  if (!selectedNode) {
    return (
      <div className="text-center py-8">
        <p className="text-xs text-ink-muted">
          选中一个节点后，此处显示属性编辑
        </p>
      </div>
    );
  }

  const meta = NODE_TYPE_META[selectedNode.type];
  const Icon = getNodeIcon(selectedNode.type);
  const linkedAttr = allAttrs.find((a) => a.id === selectedNode.refAttributeId);

  const priority = (selectedNode.data.priority as string) || "medium";
  const tags = (selectedNode.data.tags as string[]) || [];
  const customFields = migrateCustomFields(selectedNode.data.customFields);

  // ===== handlers =====

  const handleLabelChange = (label: string) => {
    updateNode(selectedNode.id, { label });
  };

  const handleDescriptionChange = (description: string) => {
    updateNode(selectedNode.id, {
      data: { ...selectedNode.data, description },
    });
  };

  const handleLink = (attrId: string | null) => {
    updateNode(selectedNode.id, { refAttributeId: attrId ?? undefined });
    addToast({
      title: attrId ? "已关联数值属性" : "已取消关联",
      variant: "success",
    });
  };

  const handlePriorityChange = (newPriority: string) => {
    updateNode(selectedNode.id, {
      data: { ...selectedNode.data, priority: newPriority },
    });
  };

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (!tag) return;
    if (tags.includes(tag)) {
      setTagInput("");
      return;
    }
    updateNode(selectedNode.id, {
      data: { ...selectedNode.data, tags: [...tags, tag] },
    });
    setTagInput("");
  };

  const handleRemoveTag = (tag: string) => {
    updateNode(selectedNode.id, {
      data: { ...selectedNode.data, tags: tags.filter((t) => t !== tag) },
    });
  };

  // ===== 富字段 handlers =====

  const saveFields = (newFields: CustomFieldDef[]) => {
    updateNode(selectedNode.id, {
      data: { ...selectedNode.data, customFields: newFields },
    });
  };

  const handleAddField = (type: CustomFieldType) => {
    const defaults: Record<CustomFieldType, unknown> = {
      text: "",
      number: 0,
      boolean: false,
      select: "",
      range: 50,
      color: "#A3E635",
      reference: "",
    };
    const newField: CustomFieldDef = {
      id: generateFieldId(),
      key: `新属性 ${customFields.length + 1}`,
      type,
      value: defaults[type],
      ...(type === "select" ? { options: ["选项1", "选项2"] } : {}),
      ...(type === "number" || type === "range"
        ? { min: 0, max: 100, step: 1, unit: "" }
        : {}),
      ...(type === "reference" ? { referenceType: "attribute" } : {}),
    };
    saveFields([...customFields, newField]);
    setAddFieldTypeOpen(false);
  };

  const handleFieldUpdate = (id: string, patch: Partial<CustomFieldDef>) => {
    saveFields(
      customFields.map((f) => (f.id === id ? { ...f, ...patch } : f))
    );
  };

  const handleFieldRemove = (id: string) => {
    saveFields(customFields.filter((f) => f.id !== id));
  };

  // 选项管理（select 类型）
  const handleOptionAdd = (field: CustomFieldDef) => {
    const opts = [...(field.options || []), `选项${(field.options?.length ?? 0) + 1}`];
    handleFieldUpdate(field.id, { options: opts });
  };
  const handleOptionRemove = (field: CustomFieldDef, idx: number) => {
    const opts = (field.options || []).filter((_, i) => i !== idx);
    handleFieldUpdate(field.id, { options: opts });
  };
  const handleOptionChange = (field: CustomFieldDef, idx: number, val: string) => {
    const opts = [...(field.options || [])];
    opts[idx] = val;
    handleFieldUpdate(field.id, { options: opts });
  };

  const handleDelete = () => {
    removeNode(selectedNode.id);
  };

  // ===== AI 生成玩法属性 =====

  /** 从 AI 回复中解析 JSON 代码块 */
  const parseAIFields = (content: string): AIFieldSuggestion[] => {
    // 优先匹配 ```json ... ``` 代码块
    const codeBlockMatch = content.match(/```json\s*([\s\S]*?)```/i);
    const jsonStr = codeBlockMatch
      ? codeBlockMatch[1].trim()
      : // 退化：尝试直接找第一个 { 到最后一个 }
        content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1);
    if (!jsonStr) return [];
    const parsed = JSON.parse(jsonStr) as { fields?: AIFieldSuggestion[] };
    return Array.isArray(parsed.fields) ? parsed.fields : [];
  };

  /** 把 AI 建议转换为带 id 的 CustomFieldDef[] */
  const toCustomFields = (suggestions: AIFieldSuggestion[]): CustomFieldDef[] =>
    suggestions.map((s) => ({
      id: generateFieldId(),
      key: s.key,
      type: (s.type as CustomFieldType) || "text",
      value: s.value,
      ...(s.options ? { options: s.options } : {}),
      ...(typeof s.min === "number" ? { min: s.min } : {}),
      ...(typeof s.max === "number" ? { max: s.max } : {}),
      ...(typeof s.step === "number" ? { step: s.step } : {}),
      ...(s.unit ? { unit: s.unit } : {}),
      ...(s.type === "reference" ? { referenceType: "attribute" as const } : {}),
    }));

  /** 一键 AI 生成全部字段 */
  const handleAIGenAll = async (mode: NodeFieldsGenMode) => {
    if (!selectedNode) return;
    const config = getActiveConfig();
    if (!config) {
      addToast({
        title: "AI 未启用",
        description: "请在设置中配置 API Key",
        variant: "warning",
      });
      return;
    }
    if (!currentProject) {
      addToast({ title: "无当前项目", variant: "error" });
      return;
    }
    setAiGenLoading(true);
    setAiGenModeOpen(false);
    try {
      const messages = buildNodeFieldsGenPrompt(
        currentProject,
        selectedNode as GraphNode,
        mode,
        undefined,
        aiHint
      );
      const result = await callAI({ config, messages });
      const suggestions = parseAIFields(result.content);
      if (!suggestions.length) {
        addToast({
          title: "AI 未返回有效属性",
          description: "请重试或检查 AI 配置",
          variant: "warning",
        });
        return;
      }
      const newFields = toCustomFields(suggestions);
      saveFields(newFields);
      addToast({
        title: mode === "smart" ? "AI 已生成玩法属性建议" : "AI 已填充属性值",
        description: `共 ${newFields.length} 个属性`,
        variant: "success",
      });
    } catch (e) {
      addToast({
        title: "AI 生成失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setAiGenLoading(false);
    }
  };

  /** 单字段 AI 生成（仅填充该字段值） */
  const handleAIGenField = async (field: CustomFieldDef) => {
    if (!selectedNode) return;
    const config = getActiveConfig();
    if (!config) {
      addToast({
        title: "AI 未启用",
        description: "请在设置中配置 API Key",
        variant: "warning",
      });
      return;
    }
    if (!currentProject) {
      addToast({ title: "无当前项目", variant: "error" });
      return;
    }
    setAiFieldLoadingId(field.id);
    try {
      const messages = buildNodeFieldsGenPrompt(
        currentProject,
        selectedNode as GraphNode,
        "fill",
        field.key,
        aiHint
      );
      const result = await callAI({ config, messages });
      const suggestions = parseAIFields(result.content);
      const matched = suggestions.find((s) => s.key === field.key) || suggestions[0];
      if (!matched) {
        addToast({ title: "AI 未返回有效值", variant: "warning" });
        return;
      }
      const patch: Partial<CustomFieldDef> = { value: matched.value };
      if (matched.options) patch.options = matched.options;
      if (typeof matched.min === "number") patch.min = matched.min;
      if (typeof matched.max === "number") patch.max = matched.max;
      if (typeof matched.step === "number") patch.step = matched.step;
      if (matched.unit) patch.unit = matched.unit;
      handleFieldUpdate(field.id, patch);
      addToast({
        title: "属性值已生成",
        description: `${field.key} = ${String(matched.value)}`,
        variant: "success",
      });
    } catch (e) {
      addToast({
        title: "AI 生成失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    } finally {
      setAiFieldLoadingId(null);
    }
  };

  // ===== 富字段渲染 =====

  const renderFieldControl = (field: CustomFieldDef) => {
    switch (field.type) {
      case "text":
        return (
          <input
            type="text"
            value={(field.value as string) || ""}
            onChange={(e) => handleFieldUpdate(field.id, { value: e.target.value })}
            placeholder="输入文本..."
            className="input-field text-2xs"
          />
        );

      case "number":
        return (
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={(field.value as number) ?? 0}
              onChange={(e) => handleFieldUpdate(field.id, { value: parseFloat(e.target.value) || 0 })}
              min={field.min}
              max={field.max}
              step={field.step ?? 1}
              className="input-field text-2xs flex-1"
            />
            {field.unit && (
              <span className="text-2xs text-ink-muted flex-shrink-0">{field.unit}</span>
            )}
          </div>
        );

      case "boolean": {
        const boolVal = Boolean(field.value);
        return (
          <button
            type="button"
            onClick={() => handleFieldUpdate(field.id, { value: !boolVal })}
            className={cn(
              "relative w-11 h-6 rounded-full transition-colors flex-shrink-0",
              boolVal ? "bg-accent/60" : "bg-line"
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
                boolVal && "translate-x-5"
              )}
            />
          </button>
        );
      }

      case "select":
        return (
          <select
            value={(field.value as string) || ""}
            onChange={(e) => handleFieldUpdate(field.id, { value: e.target.value })}
            className="input-field text-2xs"
          >
            <option value="">选择...</option>
            {(field.options || []).map((opt, idx) => (
              <option key={idx} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case "range":
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <input
                type="range"
                value={(field.value as number) ?? 50}
                onChange={(e) => handleFieldUpdate(field.id, { value: parseInt(e.target.value) })}
                min={field.min ?? 0}
                max={field.max ?? 100}
                step={field.step ?? 1}
                className="flex-1 accent-accent"
              />
              <span className="text-2xs text-ink-primary font-mono min-w-[2.5rem] text-right">
                {String(field.value ?? 50)}
                {field.unit ? field.unit : ""}
              </span>
            </div>
          </div>
        );

      case "color":
        return (
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={(field.value as string) || "#A3E635"}
              onChange={(e) => handleFieldUpdate(field.id, { value: e.target.value })}
              className="w-7 h-7 rounded border border-line cursor-pointer bg-transparent"
            />
            <input
              type="text"
              value={(field.value as string) || ""}
              onChange={(e) => handleFieldUpdate(field.id, { value: e.target.value })}
              className="input-field text-2xs flex-1 font-mono"
            />
          </div>
        );

      case "reference":
        return (
          <select
            value={(field.value as string) || ""}
            onChange={(e) => handleFieldUpdate(field.id, { value: e.target.value })}
            className="input-field text-2xs"
          >
            <option value="">引用属性...</option>
            {allAttrs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.type})
              </option>
            ))}
          </select>
        );

      default:
        return null;
    }
  };

  /** 渲染字段的额外配置（展开时显示 min/max/step/options 等） */
  const renderFieldConfig = (field: CustomFieldDef) => {
    if (field.type === "number" || field.type === "range") {
      return (
        <div className="grid grid-cols-4 gap-1 mt-1">
          <input
            type="number"
            value={field.min ?? 0}
            onChange={(e) => handleFieldUpdate(field.id, { min: parseFloat(e.target.value) })}
            placeholder="min"
            className="input-field text-3xs"
            title="最小值"
          />
          <input
            type="number"
            value={field.max ?? 100}
            onChange={(e) => handleFieldUpdate(field.id, { max: parseFloat(e.target.value) })}
            placeholder="max"
            className="input-field text-3xs"
            title="最大值"
          />
          <input
            type="number"
            value={field.step ?? 1}
            onChange={(e) => handleFieldUpdate(field.id, { step: parseFloat(e.target.value) })}
            placeholder="step"
            className="input-field text-3xs"
            title="步长"
          />
          <input
            type="text"
            value={field.unit ?? ""}
            onChange={(e) => handleFieldUpdate(field.id, { unit: e.target.value })}
            placeholder="unit"
            className="input-field text-3xs"
            title="单位"
          />
        </div>
      );
    }
    if (field.type === "select") {
      return (
        <div className="space-y-1 mt-1">
          {(field.options || []).map((opt, idx) => (
            <div key={idx} className="flex items-center gap-1">
              <input
                type="text"
                value={opt}
                onChange={(e) => handleOptionChange(field, idx, e.target.value)}
                className="input-field text-3xs flex-1"
              />
              <button
                type="button"
                onClick={() => handleOptionRemove(field, idx)}
                className="text-ink-muted hover:text-danger flex-shrink-0"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => handleOptionAdd(field)}
            className="text-3xs text-ink-muted hover:text-accent flex items-center gap-0.5"
          >
            <Plus className="w-2.5 h-2.5" /> 添加选项
          </button>
        </div>
      );
    }
    return null;
  };

  return (
    <div ref={rootRef} className="space-y-4">
      {/* 节点类型信息 */}
      <div className="p-3 rounded-lg bg-canvas-sunken border border-line">
        <div className="flex items-center gap-2 mb-2">
          <div
            className="w-7 h-7 rounded-md flex items-center justify-center"
            style={{ backgroundColor: `${meta.color}20` }}
          >
            <Icon className="w-4 h-4" style={{ color: meta.color }} />
          </div>
          <div>
            <div className="text-sm font-medium text-ink-primary">
              {meta.label}
            </div>
            <div className="text-2xs text-ink-muted">
              {meta.category === "logic" ? "逻辑节点" : "系统节点"}
            </div>
          </div>
        </div>
        <p className="text-2xs text-ink-secondary">{meta.description}</p>
      </div>

      {/* 节点标签 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          节点名称
        </label>
        <input
          type="text"
          value={selectedNode.label}
          onChange={(e) => handleLabelChange(e.target.value)}
          placeholder="输入节点名称..."
          className="input-field text-sm"
        />
      </div>

      {/* 节点描述 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          描述说明
        </label>
        <textarea
          value={(selectedNode.data.description as string) || ""}
          onChange={(e) => handleDescriptionChange(e.target.value)}
          placeholder="描述这个节点的具体行为..."
          rows={3}
          className="input-field text-sm resize-none"
        />
      </div>

      {/* 引用数值属性 */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          关联数值属性
        </label>
        {linkedAttr ? (
          <div className="p-2 rounded-md bg-accent-glow border border-accent/40 space-y-2">
            <div className="flex items-center gap-2">
              <Link2 className="w-3 h-3 text-accent flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-ink-primary font-medium truncate">
                  {linkedAttr.name}
                </div>
                <div className="text-2xs text-ink-muted font-mono">
                  = {linkedAttr.value}
                </div>
              </div>
              <button
                onClick={() => handleLink(null)}
                className="text-ink-muted hover:text-danger"
                title="取消关联"
              >
                <Unlink className="w-3 h-3" />
              </button>
            </div>
            <button
              onClick={() => navigate(`/project/${projectId}/numeric`)}
              className="w-full flex items-center justify-center gap-1 text-2xs text-accent hover:text-accent-hover py-1"
            >
              查看数值表
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <select
            value=""
            onChange={(e) => e.target.value && handleLink(e.target.value)}
            className="input-field text-xs"
          >
            <option value="">选择要关联的属性...</option>
            {allAttrs
              .filter((a) => a.type === "number")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} = {a.value}
                </option>
              ))}
          </select>
        )}
        {allAttrs.length === 0 && (
          <p className="text-2xs text-ink-muted mt-1">
            先在数值设计模块创建属性
          </p>
        )}
      </div>

      <div className="border-t border-line-subtle pt-3" />

      {/* 优先级 */}
      <div className="space-y-2">
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider">
          优先级
        </label>
        <div className="flex items-center gap-1.5">
          {PRIORITY_OPTIONS.map((opt) => {
            const active = priority === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                data-priority-btn
                title={opt.label}
                onClick={() => handlePriorityChange(opt.value)}
                className={cn(
                  "flex-1 h-7 rounded-md flex items-center justify-center text-2xs font-medium transition-all border",
                  active
                    ? "text-white border-transparent shadow-sm"
                    : "text-ink-muted border-line hover:text-ink-secondary hover:border-line-strong bg-canvas-sunken"
                )}
                style={active ? { backgroundColor: opt.color } : undefined}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="border-t border-line-subtle pt-3" />

      {/* 标签管理 */}
      <div className="space-y-2">
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider">
          标签
        </label>
        {tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 bg-accent-glow text-accent text-2xs rounded-full px-2 py-0.5"
              >
                {tag}
                <button
                  type="button"
                  onClick={() => handleRemoveTag(tag)}
                  className="text-accent hover:text-danger"
                  title="删除标签"
                >
                  <X className="w-2.5 h-2.5" strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-2xs text-ink-muted">暂无标签</p>
        )}
        <input
          type="text"
          value={tagInput}
          onChange={(e) => setTagInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAddTag();
            }
          }}
          placeholder="输入标签后回车添加..."
          className="input-field text-xs"
        />
      </div>

      <div className="border-t border-line-subtle pt-3" />

      {/* ===== 富字段编辑区 ===== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider">
            玩法属性
          </label>
          {/* AI 生成按钮 + 模式选择器 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setAiGenModeOpen((v) => !v)}
              disabled={aiGenLoading}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-2xs font-medium transition-colors",
                "bg-accent/15 text-accent hover:bg-accent/25",
                aiGenLoading && "opacity-60 cursor-wait"
              )}
              title="使用 AI 生成玩法属性"
            >
              {aiGenLoading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Sparkles className="w-3 h-3" />
              )}
              AI 生成
              <ChevronDown
                className={cn("w-2.5 h-2.5 transition-transform", aiGenModeOpen && "rotate-180")}
              />
            </button>
            {aiGenModeOpen && (
              <div className="absolute top-full mt-1 right-0 w-44 rounded-md border border-line-subtle frosted-panel shadow-layered p-1 z-20">
                <button
                  type="button"
                  onClick={() => void handleAIGenAll("smart")}
                  className="w-full flex items-start gap-2 px-2 py-1.5 rounded text-left hover:bg-canvas-sunken/60 transition-colors"
                >
                  <Wand2 className="w-3 h-3 text-accent flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-2xs font-medium text-ink-primary">智能补全</div>
                    <div className="text-3xs text-ink-muted">AI 建议属性并填值</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => void handleAIGenAll("fill")}
                  disabled={customFields.length === 0}
                  className={cn(
                    "w-full flex items-start gap-2 px-2 py-1.5 rounded text-left hover:bg-canvas-sunken/60 transition-colors",
                    customFields.length === 0 && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <Sparkles className="w-3 h-3 text-accent flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-2xs font-medium text-ink-primary">仅填充值</div>
                    <div className="text-3xs text-ink-muted">保留属性定义，仅生成 value</div>
                  </div>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* AI 额外提示词（常驻，localStorage 持久化） */}
        <div className="relative">
          <Sparkles className="absolute left-2 top-2 w-2.5 h-2.5 text-accent/50 pointer-events-none" />
          <textarea
            value={aiHint}
            onChange={(e) => handleHintChange(e.target.value)}
            placeholder="AI 额外提示词（可选）：如「偏向高爆发」「数值偏低」「参考暗黑系」..."
            rows={2}
            className={cn(
              "w-full pl-6 pr-2 py-1.5 rounded-md text-2xs resize-none",
              "bg-canvas-sunken/40 border border-accent/15",
              "text-ink-primary placeholder:text-ink-muted/50",
              "focus:outline-none focus:border-accent/40 focus:bg-canvas-sunken/60",
              "transition-colors"
            )}
          />
        </div>

        {customFields.length > 0 ? (
          <div className="space-y-2">
            {customFields.map((field) => {
              const typeMeta = FIELD_TYPES.find((t) => t.type === field.type);
              const FieldIcon = typeMeta?.icon || TypeIcon;
              const isFieldLoading = aiFieldLoadingId === field.id;
              return (
                <div
                  key={field.id}
                  className="rounded-md border border-line-subtle bg-canvas-sunken/30 p-2 space-y-1.5"
                >
                  {/* 字段头：类型徽章 + key 编辑 + AI 单字段生成 + 删除 */}
                  <div className="flex items-center gap-1.5">
                    <span
                      className="flex items-center gap-0.5 px-1 py-0.5 rounded text-3xs flex-shrink-0"
                      style={{
                        backgroundColor: `${typeMeta?.color || "#60A5FA"}20`,
                        color: typeMeta?.color || "#60A5FA",
                      }}
                      title={typeMeta?.label}
                    >
                      <FieldIcon className="w-2.5 h-2.5" />
                      {typeMeta?.label}
                    </span>
                    <input
                      type="text"
                      value={field.key}
                      onChange={(e) => handleFieldUpdate(field.id, { key: e.target.value })}
                      placeholder="参数名"
                      className="input-field text-2xs flex-1 min-w-0"
                    />
                    {/* 单字段 AI 生成 */}
                    <button
                      type="button"
                      onClick={() => void handleAIGenField(field)}
                      disabled={isFieldLoading || aiGenLoading}
                      className={cn(
                        "text-ink-muted hover:text-accent flex-shrink-0 transition-colors",
                        (isFieldLoading || aiGenLoading) && "opacity-60 cursor-wait"
                      )}
                      title="AI 生成此属性值"
                    >
                      {isFieldLoading ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <Sparkles className="w-3 h-3" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleFieldRemove(field.id)}
                      className="text-ink-muted hover:text-danger flex-shrink-0"
                      title="删除属性"
                    >
                      <X className="w-3 h-3" strokeWidth={2} />
                    </button>
                  </div>
                  {/* 字段值控件 */}
                  <div>{renderFieldControl(field)}</div>
                  {/* 字段配置（min/max/step/options） */}
                  {renderFieldConfig(field)}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-2xs text-ink-muted">暂无玩法属性，点击下方按钮或使用 AI 生成添加</p>
        )}

        {/* 添加字段按钮 + 类型选择器 */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setAddFieldTypeOpen((v) => !v)}
            className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-dashed border-line text-2xs text-ink-muted hover:text-ink-secondary hover:border-line-strong transition-colors"
          >
            <Plus className="w-3 h-3" strokeWidth={2} />
            添加玩法属性
            <ChevronDown className={cn("w-2.5 h-2.5 transition-transform", addFieldTypeOpen && "rotate-180")} />
          </button>
          {addFieldTypeOpen && (
            <div className="absolute bottom-full mb-1 left-0 right-0 rounded-md border border-line-subtle frosted-panel shadow-layered p-1 z-20">
              {FIELD_TYPES.map((ft) => {
                const FIcon = ft.icon;
                return (
                  <button
                    key={ft.type}
                    type="button"
                    onClick={() => handleAddField(ft.type)}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-canvas-sunken/60 transition-colors"
                  >
                    <FIcon className="w-3 h-3 flex-shrink-0" style={{ color: ft.color }} />
                    <span className="text-2xs text-ink-primary">{ft.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 节点 ID */}
      <div>
        <label className="block text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5">
          节点 ID
        </label>
        <code className="block p-2 rounded-md bg-canvas-sunken border border-line text-2xs text-ink-muted font-mono break-all">
          {selectedNode.id}
        </code>
      </div>

      {/* 跨模块反向溯源 */}
      {currentGraphId && (
        <div className="border-t border-line-subtle pt-3">
          <GraphReferenceInfo graphId={currentGraphId} />
        </div>
      )}

      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border border-danger/40 text-danger text-sm hover:bg-danger/10 transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
        删除节点
      </button>
    </div>
  );
}
