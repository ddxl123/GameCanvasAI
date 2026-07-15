import { create } from "zustand";
import {
  loadAIConfigs,
  saveAIConfigs,
  loadSettings,
  saveSettings,
} from "@/lib/settings";
import type { AIConfig, AIProvider } from "@/types";

interface AIState {
  configs: Record<AIProvider, AIConfig>;
  defaultModel: AIProvider;
  isGenerating: boolean;
  lastError: string | null;
  abortControllers: Map<string, AbortController>;

  loadConfigs: () => void;
  updateConfig: (provider: AIProvider, updates: Partial<AIConfig>) => void;
  setDefaultModel: (provider: AIProvider) => void;
  setIsGenerating: (generating: boolean) => void;
  setLastError: (error: string | null) => void;
  getActiveConfig: () => AIConfig | null;
  setAbortController: (key: string, c: AbortController | null) => void;
  /** 按 key 中止指定调用源的 AI 请求 */
  abortByKey: (key: string) => void;
  /** 中止所有正在进行的 AI 请求 */
  abortAll: () => void;
  /** 兼容层：中止当前所有 AI 请求（映射到 abortAll） */
  abortCurrent: () => void;
}

export const useAIStore = create<AIState>((set, get) => ({
  configs: loadAIConfigs(),
  defaultModel: loadSettings().defaultModel,
  isGenerating: false,
  lastError: null,
  abortControllers: new Map(),

  loadConfigs: () => {
    set({
      configs: loadAIConfigs(),
      defaultModel: loadSettings().defaultModel,
    });
  },

  updateConfig: (provider, updates) => {
    const current = get().configs;
    const updated = {
      ...current,
      [provider]: { ...current[provider], ...updates },
    };
    saveAIConfigs(updated);
    set({ configs: updated });
  },

  setDefaultModel: (provider) => {
    const settings = loadSettings();
    const updated = { ...settings, defaultModel: provider };
    saveSettings(updated);
    set({ defaultModel: provider });
  },

  setIsGenerating: (generating) => set({ isGenerating: generating }),
  setLastError: (error) => set({ lastError: error }),

  getActiveConfig: () => {
    const { configs, defaultModel } = get();
    const config = configs[defaultModel];
    if (config?.enabled && config.apiKey) {
      return config;
    }
    // 回退到任意已启用的 provider
    for (const key of Object.keys(configs) as AIProvider[]) {
      const c = configs[key];
      if (c.enabled && c.apiKey) return c;
    }
    return null;
  },

  setAbortController: (key, c) =>
    set((s) => {
      const next = new Map(s.abortControllers);
      if (c === null) next.delete(key);
      else next.set(key, c);
      return { abortControllers: next };
    }),

  abortByKey: (key) => {
    const c = get().abortControllers.get(key);
    c?.abort();
    set((s) => {
      const next = new Map(s.abortControllers);
      next.delete(key);
      return { abortControllers: next };
    });
  },

  abortAll: () => {
    get().abortControllers.forEach((c) => c.abort());
    set({ abortControllers: new Map() });
  },

  abortCurrent: () => {
    get().abortAll();
  },
}));
