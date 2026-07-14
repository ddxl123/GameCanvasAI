import { db } from "@/db";
import type {
  Project,
  MechanismGraph,
  GraphNode,
  GraphEdge,
  NumericSheet,
  Attribute,
  Formula,
  GDDDocument,
  DocSection,
  AttributeType,
} from "@/types";

/**
 * 项目导出数据结构（与 projectExport.ts 中的 ProjectExportData 对齐）。
 * 此处重新声明，以便在不修改原文件的前提下被引擎导出模块复用。
 */
export interface ProjectExportData {
  version: number;
  exportedAt: number;
  project: Project;
  graphs: MechanismGraph[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  sheets: NumericSheet[];
  attributes: Attribute[];
  formulas: Formula[];
  documents: GDDDocument[];
  sections: DocSection[];
}

const EXPORT_VERSION = 1;

/**
 * 从数据库加载指定项目的完整导出数据。
 */
export async function loadProjectExportData(
  projectId: string
): Promise<ProjectExportData> {
  const project = await db.projects.get(projectId);
  if (!project) {
    throw new Error("项目不存在，无法导出");
  }

  // 机制图相关
  const graphs = await db.mechanismGraphs
    .where("projectId")
    .equals(projectId)
    .toArray();
  const graphIds = graphs.map((g) => g.id);
  const nodes = graphIds.length
    ? await db.graphNodes.where("graphId").anyOf(graphIds).toArray()
    : [];
  const edges = graphIds.length
    ? await db.graphEdges.where("graphId").anyOf(graphIds).toArray()
    : [];

  // 数值表相关
  const sheets = await db.numericSheets
    .where("projectId")
    .equals(projectId)
    .toArray();
  const sheetIds = sheets.map((s) => s.id);
  const attributes = sheetIds.length
    ? await db.attributes.where("sheetId").anyOf(sheetIds).toArray()
    : [];
  const formulas = sheetIds.length
    ? await db.formulas.where("sheetId").anyOf(sheetIds).toArray()
    : [];

  // 文档相关
  const documents = await db.gddDocuments
    .where("projectId")
    .equals(projectId)
    .toArray();
  const docIds = documents.map((d) => d.id);
  const sections = docIds.length
    ? await db.docSections.where("docId").anyOf(docIds).toArray()
    : [];

  return {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    project,
    graphs,
    nodes,
    edges,
    sheets,
    attributes,
    formulas,
    documents,
    sections,
  };
}

/**
 * 将名称转换为 PascalCase。
 * 按非字母数字字符分割，保留 ASCII 字符并首字母大写。
 * 若名称中无 ASCII 字符（如纯中文），回退为 "GameConfig"。
 *
 * 示例：
 *   "Combat System" → "CombatSystem"
 *   "combat-system" → "CombatSystem"
 *   "战斗系统"       → "GameConfig"（无 ASCII，回退）
 */
export function toPascalCase(name: string): string {
  if (!name) return "GameConfig";
  const parts = name.split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (parts.length === 0) {
    return "GameConfig";
  }
  const pascal = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  // C# / Godot 标识符不能以数字开头
  if (/^[0-9]/.test(pascal)) {
    return "Game" + pascal;
  }
  return pascal;
}

/**
 * 通用 JSON 导出：扁平化结构，分 graphs/numeric/documents 三大块。
 * 每个节点/属性/段落都带 id 和关系字段（graphId/sheetId/docId/parentId 等）。
 */
export function exportAsJSON(
  project: Project,
  data: ProjectExportData
): string {
  const result = {
    project: {
      id: project.id,
      name: project.name,
      description: project.description,
      template: project.template,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    graphs: data.graphs.map((g) => ({
      id: g.id,
      name: g.name,
      type: g.type,
      createdAt: g.createdAt,
      updatedAt: g.updatedAt,
      nodes: data.nodes
        .filter((n) => n.graphId === g.id)
        .map((n) => ({
          id: n.id,
          graphId: n.graphId,
          type: n.type,
          label: n.label,
          data: n.data,
          position: n.position,
          refAttributeId: n.refAttributeId ?? null,
          groupId: n.groupId ?? null,
        })),
      edges: data.edges
        .filter((e) => e.graphId === g.id)
        .map((e) => ({
          id: e.id,
          graphId: e.graphId,
          source: e.source,
          target: e.target,
          type: e.type,
          label: e.label ?? null,
          direction: e.direction ?? null,
          roles: e.roles ?? null,
          strength: e.strength ?? null,
        })),
    })),
    numeric: data.sheets.map((s) => ({
      id: s.id,
      projectId: s.projectId,
      name: s.name,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      attributes: data.attributes
        .filter((a) => a.sheetId === s.id)
        .map((a) => {
          const formula = data.formulas.find((f) => f.attributeId === a.id);
          return {
            id: a.id,
            sheetId: a.sheetId,
            name: a.name,
            type: a.type,
            value: a.value,
            unit: a.unit ?? null,
            description: a.description ?? null,
            parentId: a.parentId,
            order: a.order,
            formula: formula
              ? {
                  id: formula.id,
                  expression: formula.expression,
                  description: formula.description ?? null,
                }
              : null,
          };
        }),
    })),
    documents: data.documents.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      name: d.name,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      sections: data.sections
        .filter((sec) => sec.docId === d.id)
        .map((sec) => ({
          id: sec.id,
          docId: sec.docId,
          title: sec.title,
          content: sec.content,
          type: sec.type,
          embedType: sec.embedType ?? null,
          embedRefId: sec.embedRefId ?? null,
          order: sec.order,
        })),
    })),
  };
  return JSON.stringify(result, null, 2);
}

// ===== Unity ScriptableObject =====

const CSHARP_KEYWORDS = new Set([
  "abstract", "as", "base", "bool", "break", "byte", "case", "catch", "char",
  "checked", "class", "const", "continue", "decimal", "default", "delegate",
  "do", "double", "else", "enum", "event", "explicit", "extern", "false",
  "finally", "fixed", "float", "for", "foreach", "goto", "if", "implicit",
  "in", "int", "interface", "internal", "is", "lock", "long", "namespace",
  "new", "null", "object", "operator", "out", "override", "params", "private",
  "protected", "public", "readonly", "ref", "return", "sbyte", "sealed",
  "short", "sizeof", "stackalloc", "static", "string", "struct", "switch",
  "this", "throw", "true", "try", "typeof", "uint", "ulong", "unchecked",
  "unsafe", "ushort", "using", "virtual", "void", "volatile", "while",
  "var",
]);

/**
 * 转义 C# XML 文档注释中的特殊字符，防止注释注入。
 * 转义 & < >，将换行替换为空格，移除 </summary> 以防提前闭合注释块。
 */
function escapeXmlComment(s: string): string {
  return s
    .replace(/<\/summary>/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/[\r\n]+/g, " ");
}

/**
 * 将属性类型映射为 C# 类型。
 */
function mapToCSharpType(type: AttributeType): string {
  switch (type) {
    case "number":
      return "float";
    case "string":
      return "string";
    case "bool":
      return "bool";
    case "ref":
      return "string";
    default:
      return "string";
  }
}

/**
 * Unity ScriptableObject 导出。
 * 生成 C# 类定义代码（如 CombatConfig.cs）+ JSON 数据（ScriptableObject 格式）。
 * 类名从项目名生成（PascalCase），包含与属性对应的 public 字段。
 */
export function exportAsUnity(
  project: Project,
  data: ProjectExportData
): { className: string; csharpCode: string; jsonData: string } {
  const className = toPascalCase(project.name);

  // 统一计算字段名（C# 代码与 JSON 数据共用，保证一致）
  const usedNames = new Set<string>();
  const fields = data.attributes.map((attr, idx) => {
    const baseName = toPascalCase(attr.name);
    let fieldName = CSHARP_KEYWORDS.has(baseName)
      ? `${baseName}Value`
      : baseName;
    if (usedNames.has(fieldName)) {
      fieldName = `${baseName}${idx}`;
    }
    if (usedNames.has(fieldName)) {
      fieldName = `Field${idx}`;
    }
    usedNames.add(fieldName);

    const formula = data.formulas.find((f) => f.attributeId === attr.id);
    const comments: string[] = [];
    if (attr.description) comments.push(attr.description);
    if (attr.unit) comments.push(`单位: ${attr.unit}`);
    if (formula) comments.push(`公式: ${formula.expression}`);

    return {
      fieldName,
      csharpType: mapToCSharpType(attr.type),
      attr,
      formula,
      comments,
    };
  });

  // ===== 构建 C# 类代码 =====
  const csharpLines: string[] = [
    "using UnityEngine;",
    "",
    "/// <summary>",
    `/// ${escapeXmlComment(project.name)} - 自动生成的 ScriptableObject 配置`,
    "/// 由 GameDesign 平台导出",
    "/// </summary>",
    `[CreateAssetMenu(fileName = "${className}", menuName = "GameDesign/${className}")]`,
    `public class ${className} : ScriptableObject`,
    "{",
  ];

  if (fields.length === 0) {
    csharpLines.push("    // 暂无属性字段");
  } else {
    for (const f of fields) {
      if (f.comments.length > 0) {
        csharpLines.push("    /// <summary>");
        for (const c of f.comments) {
          csharpLines.push(`    /// ${escapeXmlComment(c)}`);
        }
        csharpLines.push("    /// </summary>");
      }
      csharpLines.push(`    public ${f.csharpType} ${f.fieldName};`);
    }
  }
  csharpLines.push("}");

  const csharpCode = csharpLines.join("\n");

  // ===== 构建 JSON 数据（ScriptableObject 序列化格式） =====
  const jsonData = JSON.stringify(
    {
      className,
      project: {
        name: project.name,
        description: project.description,
        template: project.template,
      },
      attributes: fields.map((f, idx) => ({
        name: f.fieldName,
        originalName: f.attr.name,
        type: f.csharpType,
        value: f.attr.value,
        unit: f.attr.unit ?? null,
        formula: f.formula?.expression ?? null,
        description: f.attr.description ?? null,
        order: idx,
      })),
      graphs: data.graphs.map((g) => ({
        id: g.id,
        name: g.name,
        type: g.type,
        nodeCount: data.nodes.filter((n) => n.graphId === g.id).length,
        edgeCount: data.edges.filter((e) => e.graphId === g.id).length,
      })),
      documents: data.documents.map((d) => ({
        id: d.id,
        name: d.name,
        sectionCount: data.sections.filter((s) => s.docId === d.id).length,
      })),
    },
    null,
    2
  );

  return { className, csharpCode, jsonData };
}

// ===== Godot Resource =====

/**
 * 将属性类型映射为 Godot 类型字符串。
 */
function mapToGodotType(type: AttributeType): string {
  switch (type) {
    case "number":
      return "float";
    case "string":
      return "String";
    case "bool":
      return "bool";
    case "ref":
      return "String";
    default:
      return "String";
  }
}

function escapeTres(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r");
}

function formatGodotValue(value: string, type: AttributeType): string {
  switch (type) {
    case "number": {
      const num = parseFloat(value);
      return isNaN(num) ? "0.0" : String(num);
    }
    case "bool":
      return value === "true" ? "true" : "false";
    case "string":
    case "ref":
    default:
      return `"${escapeTres(value)}"`;
  }
}

/**
 * Godot Resource 导出：.tres 资源文件格式。
 * 属性作为字段，附带项目元数据。
 */
export function exportAsGodot(
  project: Project,
  data: ProjectExportData
): string {
  const className = toPascalCase(project.name);
  const lines: string[] = [
    "; Engine configuration file.",
    `; Generated by GameDesign platform for ${project.name}`,
    "",
    `[gd_resource type="Resource" script_class="${className}" load_steps=2 format=3]`,
    "",
    `[ext_resource type="Script" path="res://${className}.gd" id="1"]`,
    "",
    "[resource]",
    'script = ExtResource("1")',
  ];

  // 添加属性作为字段
  const usedNames = new Set<string>();
  if (data.attributes.length === 0) {
    lines.push("; 暂无属性字段");
  } else {
    data.attributes.forEach((attr, idx) => {
      const baseName = toPascalCase(attr.name);
      // Godot 脚本字段惯例：首字母小写
      let fieldName =
        baseName.charAt(0).toLowerCase() + baseName.slice(1);
      if (usedNames.has(fieldName)) {
        fieldName = `${fieldName}${idx}`;
      }
      if (usedNames.has(fieldName)) {
        fieldName = `field${idx}`;
      }
      usedNames.add(fieldName);

      const godotType = mapToGodotType(attr.type);
      const value = formatGodotValue(attr.value, attr.type);
      lines.push(
        `${fieldName} = ${value}  ; type=${godotType}, name="${escapeTres(attr.name)}"`
      );
    });
  }

  // 项目元数据
  lines.push("");
  lines.push("; --- 项目元数据 ---");
  lines.push(`project_name = "${escapeTres(project.name)}"`);
  lines.push(
    `project_description = "${escapeTres(project.description || "")}"`
  );
  lines.push(`project_template = "${project.template}"`);
  lines.push(`graph_count = ${data.graphs.length}`);
  lines.push(`sheet_count = ${data.sheets.length}`);
  lines.push(`document_count = ${data.documents.length}`);
  lines.push(`attribute_count = ${data.attributes.length}`);

  return lines.join("\n");
}

// ===== CSV =====

/**
 * 转义 CSV 单元格：若包含逗号、引号或换行，用双引号包裹并转义内部引号。
 */
function escapeCSVCell(value: string): string {
  const str = String(value ?? "");
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 导出数值表为 CSV。
 * 列：名称、类型、值、公式、描述。
 */
export function exportAttributesAsCSV(
  attributes: Attribute[],
  formulas: Formula[]
): string {
  const header = ["名称", "类型", "值", "公式", "描述"];
  const rows = attributes.map((attr) => {
    const formula = formulas.find((f) => f.attributeId === attr.id);
    return [
      attr.name,
      attr.type,
      attr.value,
      formula?.expression ?? "",
      attr.description ?? "",
    ];
  });
  const allRows = [header, ...rows];
  return allRows.map((row) => row.map(escapeCSVCell).join(",")).join("\n");
}

// ===== 文件名工具 =====
// sanitizeFileName 已统一到 @/lib/utils，此处 re-export 保持兼容
export { sanitizeFileName } from "@/lib/utils";
