import type { AIConfig, AIProvider, UserSettings } from "@/types";

const SETTINGS_KEY = "game-design:settings";
const AI_CONFIGS_KEY = "game-design:ai-configs";

const DEFAULT_SETTINGS: UserSettings = {
  defaultModel: "openai",
  theme: "dark",
  autoSave: true,
};

export function loadSettings(): UserSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: UserSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error("保存设置失败:", e);
  }
}

export function loadAIConfigs(): Record<AIProvider, AIConfig> {
  const defaultConfigs: Record<AIProvider, AIConfig> = {
    openai: {
      key: "openai",
      apiKey: "",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      enabled: false,
    },
    claude: {
      key: "claude",
      apiKey: "",
      baseUrl: "https://api.anthropic.com/v1",
      model: "claude-3-5-sonnet-20241022",
      enabled: false,
    },
    qwen: {
      key: "qwen",
      apiKey: "",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      model: "qwen-max",
      enabled: false,
    },
    deepseek: {
      key: "deepseek",
      apiKey: "",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-v4-flash",
      enabled: false,
    },
  };

  try {
    const raw = localStorage.getItem(AI_CONFIGS_KEY);
    if (!raw) return defaultConfigs;
    const parsed = JSON.parse(raw) as Record<AIProvider, AIConfig>;
    // 合并默认值，防止新增字段缺失
    return {
      openai: { ...defaultConfigs.openai, ...parsed.openai },
      claude: { ...defaultConfigs.claude, ...parsed.claude },
      qwen: { ...defaultConfigs.qwen, ...parsed.qwen },
      deepseek: { ...defaultConfigs.deepseek, ...parsed.deepseek },
    };
  } catch {
    return defaultConfigs;
  }
}

export function saveAIConfigs(configs: Record<AIProvider, AIConfig>): void {
  try {
    localStorage.setItem(AI_CONFIGS_KEY, JSON.stringify(configs));
  } catch (e) {
    console.error("保存 AI 配置失败:", e);
  }
}

export function getEnabledProviders(): AIProvider[] {
  const configs = loadAIConfigs();
  return (Object.keys(configs) as AIProvider[]).filter(
    (k) => configs[k].enabled && configs[k].apiKey
  );
}
