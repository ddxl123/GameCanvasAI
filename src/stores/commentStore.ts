import { create } from "zustand";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import type { Comment, CommentTargetType } from "@/types";

interface CommentState {
  comments: Comment[];
  loading: boolean;

  loadComments: (
    projectId: string,
    targetType?: CommentTargetType,
    targetId?: string
  ) => Promise<void>;
  addComment: (
    projectId: string,
    targetType: CommentTargetType,
    targetId: string,
    content: string,
    author?: string
  ) => Promise<string>;
  resolveComment: (id: string) => Promise<void>;
  unresolveComment: (id: string) => Promise<void>;
  deleteComment: (id: string) => Promise<void>;
  getCommentsForTarget: (
    targetType: CommentTargetType,
    targetId: string
  ) => Comment[];
}

export const useCommentStore = create<CommentState>((set, get) => ({
  comments: [],
  loading: false,

  loadComments: async (projectId, targetType, targetId) => {
    set({ loading: true });
    try {
      const list = await db.comments
        .where("projectId")
        .equals(projectId)
        .toArray();
      let filtered = list;
      if (targetType) {
        filtered = filtered.filter((c) => c.targetType === targetType);
      }
      if (targetId) {
        filtered = filtered.filter((c) => c.targetId === targetId);
      }
      // 最新在上
      filtered.sort((a, b) => b.createdAt - a.createdAt);
      set({ comments: filtered, loading: false });
    } catch (e) {
      console.error("加载评论失败:", e);
      set({ loading: false });
    }
  },

  addComment: async (projectId, targetType, targetId, content, author) => {
    const comment: Comment = {
      id: generateId("cmt"),
      projectId,
      targetType,
      targetId,
      author: (author ?? "匿名").trim() || "匿名",
      content: content.trim(),
      resolved: false,
      createdAt: now(),
    };
    await db.comments.add(comment);
    // 插入到列表头部，保持最新在上
    set({ comments: [comment, ...get().comments] });
    return comment.id;
  },

  resolveComment: async (id) => {
    await db.comments.update(id, { resolved: true });
    set({
      comments: get().comments.map((c) =>
        c.id === id ? { ...c, resolved: true } : c
      ),
    });
  },

  unresolveComment: async (id) => {
    await db.comments.update(id, { resolved: false });
    set({
      comments: get().comments.map((c) =>
        c.id === id ? { ...c, resolved: false } : c
      ),
    });
  },

  deleteComment: async (id) => {
    await db.comments.delete(id);
    set({ comments: get().comments.filter((c) => c.id !== id) });
  },

  getCommentsForTarget: (targetType, targetId) => {
    return get()
      .comments.filter(
        (c) => c.targetType === targetType && c.targetId === targetId
      )
      .sort((a, b) => b.createdAt - a.createdAt);
  },
}));
