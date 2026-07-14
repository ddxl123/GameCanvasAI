import DOMPurify from "dompurify";

/**
 * 净化 HTML 内容，防止 XSS 攻击。
 * 允许常见的文档排版标签，过滤脚本与危险协议。
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "ul", "ol", "li", "code", "pre",
      "blockquote", "h1", "h2", "h3", "h4", "a", "img", "table",
      "thead", "tbody", "tr", "td", "th", "span", "div",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
    ALLOWED_URI_REGEXP: /^(https?:|mailto:|tel:|data:image\/|\/|#)/i,
  });
}

/**
 * 将 HTML 转为纯文本（移除所有标签）。
 */
export function htmlToText(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
