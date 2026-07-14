import { useAIStore } from "@/stores/aiStore";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { AIProvider } from "@/types";

/**
 * 各 provider 的可选模型清单（用于在面板里快速切换）。
 * 与 Settings.tsx 中的 providerConfig 保持一致。
 */
const PROVIDER_MODELS: Record<AIProvider, { label: string; models: string[] }> = {
  openai: {
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
  },
  claude: {
    label: "Claude",
    models: [
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
    ],
  },
  qwen: {
    label: "通义千问",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
  },
  deepseek: {
    label: "DeepSeek",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
  },
};

export default function ModelSwitcher() {
  const { configs, defaultModel, updateConfig, setDefaultModel, isGenerating, abortCurrent } = useAIStore();
  const addToast = useUIStore((s) => s.addToast);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // 当前生效的 provider 与模型
  const activeProvider = defaultModel;
  const activeConfig = configs[activeProvider];
  const activeModel = activeConfig?.model ?? "";

  // 所有已配置 Key 的 provider，用于切换
  const availableProviders = (Object.keys(configs) as AIProvider[]).filter(
    (k) => configs[k].apiKey
  );

  const handleSwitchProvider = (provider: AIProvider) => {
    if (isGenerating) {
      abortCurrent();
    }
    setDefaultModel(provider);
    addToast({
      title: `已切换到 ${PROVIDER_MODELS[provider].label}`,
      variant: "success",
    });
  };

  const handleSwitchModel = (model: string) => {
    if (isGenerating) {
      abortCurrent();
    }
    updateConfig(activeProvider, { model });
    addToast({ title: `模型已切换为 ${model}`, variant: "success" });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-1 rounded border border-line bg-canvas-sunken hover:border-accent transition-colors max-w-[160px]"
        title="切换模型"
      >
        <span className="text-2xs text-ink-muted flex-shrink-0">
          {PROVIDER_MODELS[activeProvider].label}
        </span>
        <span className="text-2xs text-ink-primary font-mono truncate flex-1 text-left">
          {activeModel}
        </span>
        <ChevronDown
          className={cn(
            "w-3 h-3 text-ink-muted transition-transform flex-shrink-0",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-64 rounded-lg border border-line bg-canvas-elevated shadow-lg z-50 overflow-hidden">
          {/* Provider 切换 */}
          <div className="p-2 border-b border-line-subtle">
            <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5 px-1">
              服务商
            </div>
            <div className="space-y-0.5">
              {availableProviders.map((provider) => (
                <button
                  key={provider}
                  onClick={() => handleSwitchProvider(provider)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors",
                    provider === activeProvider
                      ? "bg-accent-glow text-ink-primary"
                      : "text-ink-secondary hover:bg-canvas-sunken"
                  )}
                >
                  <span>{PROVIDER_MODELS[provider].label}</span>
                  {provider === activeProvider && (
                    <Check className="w-3 h-3 text-accent" />
                  )}
                </button>
              ))}
              {availableProviders.length === 0 && (
                <p className="text-2xs text-ink-muted px-2 py-1">
                  请先在设置中配置 API Key
                </p>
              )}
            </div>
          </div>

          {/* 当前 provider 的模型列表 */}
          <div className="p-2">
            <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-1.5 px-1">
              模型
            </div>
            <div className="space-y-0.5 max-h-48 overflow-auto">
              {PROVIDER_MODELS[activeProvider].models.map((model) => (
                <button
                  key={model}
                  onClick={() => handleSwitchModel(model)}
                  className={cn(
                    "w-full flex items-center justify-between px-2 py-1.5 rounded text-xs font-mono transition-colors",
                    model === activeModel
                      ? "bg-accent-glow text-ink-primary"
                      : "text-ink-secondary hover:bg-canvas-sunken"
                  )}
                >
                  <span className="truncate">{model}</span>
                  {model === activeModel && (
                    <Check className="w-3 h-3 text-accent flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
