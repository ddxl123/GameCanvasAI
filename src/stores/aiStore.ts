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
  abortController: AbortController | null;

  loadConfigs: () => void;
  updateConfig: (provider: AIProvider, updates: Partial<AIConfig>) => void;
  setDefaultModel: (provider: AIProvider) => void;
  setIsGenerating: (generating: boolean) => void;
  setLastError: (error: string | null) => void;
  getActiveConfig: () => AIConfig | null;
  setAbortController: (c: AbortController | null) => void;
  /** 中止当前正在进行的 AI 请求 */
  abortCurrent: () => void;
}

export const useAIStore = create<AIState>((set, get) => ({
  configs: loadAIConfigs(),
  defaultModel: loadSettings().defaultModel,
  isGenerating: false,
  lastError: null,
  abortController: null,

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

  setAbortController: (c) => set({ abortController: c }),

  abortCurrent: () => {
    const { abortController } = get();
    abortController?.abort();
    set({ abortController: null });
  },
}));
