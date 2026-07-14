import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 处理文件名中的非法字符，避免在文件系统层面出问题。
 * 同时控制长度，防止过长。
 */
export function sanitizeFileName(name: string, fallback = "export"): string {
  const cleaned = (name || "").replace(/[\\/:*?"<>|]/g, "_").trim();
  const trimmed = cleaned.replace(/^[\s.]+|[\s.]+$/g, "");
  const maxLen = 40;
  const result = trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  return result || fallback;
}
