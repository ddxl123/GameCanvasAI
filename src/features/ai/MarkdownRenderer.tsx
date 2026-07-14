import { useMemo } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

/**
 * 轻量级 Markdown 渲染器（无外部依赖）。
 * 支持：标题、列表、代码块、行内代码、加粗、引用、分隔线。
 */
export default function MarkdownRenderer({ content }: { content: string }) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  return (
    <div
      className="markdown-body text-sm text-ink-primary leading-relaxed"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&#39;")
    .replace(/"/g, "&quot;");
}

function renderInline(text: string): string {
  let t = escapeHtml(text);
  // 行内代码
  t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
  // 加粗
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // 斜体
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  // 链接（协议白名单过滤）
  t = t.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_full, label, url) => {
      if (/^(https?:|mailto:|tel:|\/|#)/i.test(url)) {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
      }
      return label;
    }
  );
  return t;
}

function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let inCodeBlock = false;
  let codeLang = "";
  let codeBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listBuffer: string[] = [];

  const flushList = () => {
    if (listType && listBuffer.length > 0) {
      const items = listBuffer.map((li) => `<li>${renderInline(li)}</li>`).join("");
      out.push(`<${listType}>${items}</${listType}>`);
      listType = null;
      listBuffer = [];
    }
  };

  for (const raw of lines) {
    const line = raw;

    // 代码块
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        out.push(
          `<pre><code class="lang-${codeLang}">${escapeHtml(
            codeBuffer.join("\n")
          )}</code></pre>`
        );
        codeBuffer = [];
        codeLang = "";
        inCodeBlock = false;
      } else {
        flushList();
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      continue;
    }
    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    // 空行
    if (line.trim() === "") {
      flushList();
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,4})\s+(.*)$/);
    if (headingMatch) {
      flushList();
      const level = headingMatch[1].length;
      out.push(`<h${level}>${renderInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // 分隔线
    if (/^[-*_]{3,}$/.test(line.trim())) {
      flushList();
      out.push("<hr/>");
      continue;
    }

    // 引用
    if (line.trim().startsWith(">")) {
      flushList();
      out.push(`<blockquote>${renderInline(line.trim().slice(1).trim())}</blockquote>`);
      continue;
    }

    // 有序列表
    const olMatch = line.match(/^\s*\d+\.\s+(.*)$/);
    if (olMatch) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listBuffer.push(olMatch[1]);
      continue;
    }

    // 无序列表
    const ulMatch = line.match(/^\s*[-*+]\s+(.*)$/);
    if (ulMatch) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listBuffer.push(ulMatch[1]);
      continue;
    }

    // 普通段落
    flushList();
    out.push(`<p>${renderInline(line)}</p>`);
  }

  // 收尾
  if (inCodeBlock) {
    out.push(`<pre><code>${escapeHtml(codeBuffer.join("\n"))}</code></pre>`);
  }
  flushList();

  return out.join("\n");
}
