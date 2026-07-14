import type { DocSection } from "@/types";
import { htmlToText } from "@/lib/sanitize";
import { sanitizeFileName } from "@/lib/utils";

/**
 * 导出 GDD 文档为 Markdown 文件并触发下载。
 *
 * 遍历 sections：
 * - heading → `## title`
 * - paragraph → 去除 HTML 标签的纯文本
 * - embed → `[嵌入：{embedType}]` 占位
 *
 * @param sections 文档段落列表
 * @param projectName 文档/项目名称（作为一级标题）
 */

/**
 * 转义 Markdown 标题文本：移除换行和开头的 # 标记，防止标题注入。
 */
function escapeMdHeading(s: string): string {
  return s.replace(/[\r\n]+/g, " ").replace(/^#+\s/, "");
}

export async function exportGddAsMarkdown(
  sections: DocSection[],
  projectName: string
): Promise<void> {
  const lines: string[] = [];

  // 一级标题：文档名称
  lines.push(`# ${escapeMdHeading(projectName || "未命名文档")}`);
  lines.push("");

  for (const section of sections) {
    if (section.type === "heading") {
      lines.push(`## ${escapeMdHeading(section.title || "无标题")}`);
      lines.push("");
    } else if (section.type === "paragraph") {
      const text = stripHtml(section.content);
      if (text.trim()) {
        lines.push(text);
        lines.push("");
      }
    } else if (section.type === "embed") {
      // 嵌入内容导出为占位标记
      const embedLabel =
        section.embedType === "mechanism"
          ? "机制图"
          : section.embedType === "numeric"
            ? "数值表"
            : "未知";
      lines.push(`[嵌入：${embedLabel}]`);
      lines.push("");
    }
  }

  const markdown = lines.join("\n");

  // 触发下载
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = `${sanitizeFileName(projectName, "GDD文档")}.md`;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * 去除 HTML 标签，保留纯文本。
 * 使用 DOMPurify 净化，防止 XSS 与标签注入。
 */
function stripHtml(html: string): string {
  if (!html) return "";
  return htmlToText(html);
}


