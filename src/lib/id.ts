import { nanoid } from "nanoid";

export function generateId(prefix?: string): string {
  const id = nanoid(12);
  return prefix ? `${prefix}_${id}` : id;
}

export function generateNodeId(): string {
  return `node_${nanoid(10)}`;
}

export function generateEdgeId(): string {
  return `edge_${nanoid(10)}`;
}

export function generateGroupId(): string {
  return `group_${nanoid(10)}`;
}

export function generateSnapshotId(): string {
  return `snap_${nanoid(12)}`;
}

export function generateConversationId(): string {
  return `conv_${nanoid(12)}`;
}

export function generateMessageId(): string {
  return `msg_${nanoid(12)}`;
}
