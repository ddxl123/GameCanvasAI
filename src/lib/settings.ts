import type { AIConfig, AIProvider, UserSettings } from "@/types";

const SETTINGS_KEY = "gamecanvasai:settings";
const AI_CONFIGS_KEY = "gamecanvasai:ai-configs";
// 旧版 key（项目原名 game_design），用于一次性迁移
const LEGACY_SETTINGS_KEY = "game-design:settings";
const LEGACY_AI_CONFIGS_KEY = "game-design:ai-configs";

/** 读取 localStorage，新 key 优先，回退旧 key 并迁移 */
function readWithLegacy(newKey: string, legacyKey: string): string | null {
  const v = localStorage.getItem(newKey);
  if (v) return v;
  const legacy = localStorage.getItem(legacyKey);
  if (legacy) {
    // 迁移到新 key 并清理旧 key
    try {
      localStorage.setItem(newKey, legacy);
      localStorage.removeItem(legacyKey);
    } catch {
      /* 忽略迁移失败 */
    }
  }
  return legacy;
}

const DEFAULT_SETTINGS: UserSettings = {
  defaultModel: "openai",
  theme: "dark",
  autoSave: true,
};

export function loadSettings(): UserSettings {
  try {
    const raw = readWithLegacy(SETTINGS_KEY, LEGACY_SETTINGS_KEY);
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
    const raw = readWithLegacy(AI_CONFIGS_KEY, LEGACY_AI_CONFIGS_KEY);
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
