import { create } from "zustand";
import { db } from "@/db";
import { generateConversationId, generateMessageId } from "@/lib/id";
import { now } from "@/lib/time";
import type { AIConversation, AIChatMessage } from "@/types";
import { useUIStore } from "./uiStore";

interface ChatState {
  conversations: AIConversation[];
  currentConversationId: string | null;
  messages: AIChatMessage[];
  loading: boolean;

  loadConversations: (projectId: string) => Promise<void>;
  createConversation: (projectId: string, title?: string) => Promise<AIConversation>;
  deleteConversation: (id: string) => Promise<void>;
  selectConversation: (id: string | null) => Promise<void>;
  renameConversation: (id: string, title: string) => Promise<void>;

  addMessage: (msg: Omit<AIChatMessage, "id" | "conversationId" | "createdAt" | "order">) => Promise<AIChatMessage>;
  updateMessage: (id: string, updates: Partial<AIChatMessage>) => Promise<void>;
  appendMessageContent: (id: string, chunk: string) => Promise<void>;
  clearMessages: () => Promise<void>;
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  currentConversationId: null,
  messages: [],
  loading: false,

  loadConversations: async (projectId) => {
    set({ loading: true });
    try {
      const conversations = await db.aiConversations
        .where("projectId")
        .equals(projectId)
        .toArray();
      conversations.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ conversations, loading: false });
    } catch (e) {
      console.error("加载对话列表失败:", e);
      set({ loading: false });
      useUIStore.getState().addToast({
        title: "加载对话列表失败",
        variant: "error",
      });
    }
  },

  createConversation: async (projectId, title) => {
    const ts = now();
    const conv: AIConversation = {
      id: generateConversationId(),
      projectId,
      title: title?.trim() || "新对话",
      createdAt: ts,
      updatedAt: ts,
    };
    await db.aiConversations.add(conv);
    set({
      conversations: [conv, ...get().conversations],
      currentConversationId: conv.id,
      messages: [],
    });
    return conv;
  },

  deleteConversation: async (id) => {
    await db.transaction("rw", [db.aiConversations, db.aiMessages], async () => {
      await db.aiMessages.where("conversationId").equals(id).delete();
      await db.aiConversations.delete(id);
    });
    set({
      conversations: get().conversations.filter((c) => c.id !== id),
      currentConversationId: get().currentConversationId === id ? null : get().currentConversationId,
      messages: get().currentConversationId === id ? [] : get().messages,
    });
  },

  selectConversation: async (id) => {
    if (!id) {
      set({ currentConversationId: null, messages: [] });
      return;
    }
    set({ currentConversationId: id, loading: true });
    try {
      const messages = await db.aiMessages
        .where("conversationId")
        .equals(id)
        .toArray();
      messages.sort((a, b) => a.order - b.order);
      set({ messages, loading: false });
    } catch (e) {
      console.error("加载对话消息失败:", e);
      set({ loading: false });
      useUIStore.getState().addToast({
        title: "加载对话消息失败",
        variant: "error",
      });
    }
  },

  renameConversation: async (id, title) => {
    await db.aiConversations.update(id, { title, updatedAt: now() });
    set({
      conversations: get().conversations.map((c) =>
        c.id === id ? { ...c, title } : c
      ),
    });
  },

  addMessage: async (msg) => {
    const conversationId = get().currentConversationId;
    if (!conversationId) throw new Error("未选择对话");
    const ts = now();
    const order = get().messages.length;
    const message: AIChatMessage = {
      ...msg,
      id: generateMessageId(),
      conversationId,
      createdAt: ts,
      order,
    };
    await db.aiMessages.add(message);
    await db.aiConversations.update(conversationId, { updatedAt: ts });
    set({ messages: [...get().messages, message] });
    return message;
  },

  updateMessage: async (id, updates) => {
    await db.aiMessages.update(id, updates);
    set({
      messages: get().messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    });
  },

  appendMessageContent: async (id, chunk) => {
    // 流式追加：只更新内存，不频繁写盘
    set({
      messages: get().messages.map((m) =>
        m.id === id ? { ...m, content: m.content + chunk } : m
      ),
    });
  },

  clearMessages: async () => {
    const conversationId = get().currentConversationId;
    if (!conversationId) return;
    await db.aiMessages.where("conversationId").equals(conversationId).delete();
    set({ messages: [] });
  },
}));
