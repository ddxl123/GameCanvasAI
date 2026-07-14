import { formatDistanceToNow, format } from "date-fns";
import { zhCN } from "date-fns/locale";

export function formatRelativeTime(timestamp: number): string {
  return formatDistanceToNow(timestamp, { addSuffix: true, locale: zhCN });
}

export function formatDateTime(timestamp: number): string {
  return format(timestamp, "yyyy-MM-dd HH:mm", { locale: zhCN });
}

export function formatDate(timestamp: number): string {
  return format(timestamp, "yyyy-MM-dd", { locale: zhCN });
}

export function now(): number {
  return Date.now();
}
