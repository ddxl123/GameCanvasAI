import { create } from "zustand";
import { db } from "@/db";
import { generateGroupId } from "@/lib/id";
import { now } from "@/lib/time";
import type { NodeGroup } from "@/types";

interface NodeGroupState {
  groups: NodeGroup[];
  loading: boolean;

  loadGroups: (graphId: string) => Promise<void>;
  createGroup: (graphId: string, name: string, color?: string) => Promise<string>;
  deleteGroup: (id: string) => Promise<void>;
  renameGroup: (id: string, name: string) => Promise<void>;
  toggleCollapse: (id: string) => Promise<void>;
  assignNodeToGroup: (nodeId: string, groupId: string | null) => Promise<void>;
}

// 分组颜色调色板
const GROUP_COLORS = [
  "#A3E635", "#22D3EE", "#A78BFA", "#F472B6",
  "#FBBF24", "#FB923C", "#34D399", "#60A5FA",
];

export const useNodeGroupStore = create<NodeGroupState>((set, get) => ({
  groups: [],
  loading: false,

  loadGroups: async (graphId) => {
    set({ loading: true });
    try {
      const groups = await db.nodeGroups.where("graphId").equals(graphId).toArray();
      groups.sort((a, b) => a.createdAt - b.createdAt);
      set({ groups, loading: false });
    } catch (e) {
      console.error("加载节点分组失败:", e);
      set({ loading: false });
    }
  },

  createGroup: async (graphId, name, color) => {
    const group: NodeGroup = {
      id: generateGroupId(),
      graphId,
      name: name.trim() || "新分组",
      color: color ?? GROUP_COLORS[get().groups.length % GROUP_COLORS.length],
      collapsed: false,
      createdAt: now(),
    };
    await db.nodeGroups.add(group);
    set({ groups: [...get().groups, group] });
    return group.id;
  },

  deleteGroup: async (id) => {
    // 解除组内节点的 groupId 绑定
    const nodes = await db.graphNodes.where("groupId").equals(id).toArray();
    await db.transaction("rw", [db.nodeGroups, db.graphNodes], async () => {
      for (const n of nodes) {
        await db.graphNodes.update(n.id, { groupId: undefined });
      }
      await db.nodeGroups.delete(id);
    });
    set({ groups: get().groups.filter((g) => g.id !== id) });
  },

  renameGroup: async (id, name) => {
    await db.nodeGroups.update(id, { name });
    set({
      groups: get().groups.map((g) => (g.id === id ? { ...g, name } : g)),
    });
  },

  toggleCollapse: async (id) => {
    const group = get().groups.find((g) => g.id === id);
    if (!group) return;
    const collapsed = !group.collapsed;
    await db.nodeGroups.update(id, { collapsed });
    set({
      groups: get().groups.map((g) => (g.id === id ? { ...g, collapsed } : g)),
    });
  },

  assignNodeToGroup: async (nodeId, groupId) => {
    await db.graphNodes.update(nodeId, { groupId: groupId ?? undefined });
  },
}));
