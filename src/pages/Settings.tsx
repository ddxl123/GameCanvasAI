import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAIStore } from "@/stores/aiStore";
import { useUIStore } from "@/stores/uiStore";
import { db } from "@/db";
import { AIProvider } from "@/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Database,
  Download,
  Trash2,
  Bot,
} from "lucide-react";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

const providerConfig: Record<
  AIProvider,
  { label: string; models: string[]; description: string }
> = {
  openai: {
    label: "OpenAI",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo"],
    description: "GPT 系列，能力全面",
  },
  claude: {
    label: "Anthropic Claude",
    models: ["claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"],
    description: "Claude 系列，长文本与推理强",
  },
  qwen: {
    label: "通义千问",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    description: "阿里云，国内访问快",
  },
  deepseek: {
    label: "DeepSeek",
    models: ["deepseek-v4-flash", "deepseek-v4-pro"],
    description: "深度求索，性价比高，支持思考模式",
  },
};

export default function Settings() {
  const navigate = useNavigate();
  const { configs, defaultModel, updateConfig, setDefaultModel } = useAIStore();
  const addToast = useUIStore((s) => s.addToast);
  const [showKeys, setShowKeys] = useState<Record<AIProvider, boolean>>({
    openai: false,
    claude: false,
    qwen: false,
    deepseek: false,
  });
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  const handleSaveKey = (provider: AIProvider, apiKey: string) => {
    updateConfig(provider, { apiKey, enabled: !!apiKey });
    addToast({
      title: `${providerConfig[provider].label} 配置已保存`,
      variant: "success",
    });
  };

  const handleSaveModel = (provider: AIProvider, model: string) => {
    updateConfig(provider, { model });
  };

  const handleSetDefault = (provider: AIProvider) => {
    if (!configs[provider].apiKey) {
      addToast({
        title: "请先配置 API Key",
        variant: "warning",
      });
      return;
    }
    setDefaultModel(provider);
    addToast({
      title: `默认模型已切换为 ${providerConfig[provider].label}`,
      variant: "success",
    });
  };

  const handleExport = async () => {
    try {
      const data = {
        projects: await db.projects.toArray(),
        mechanismGraphs: await db.mechanismGraphs.toArray(),
        graphNodes: await db.graphNodes.toArray(),
        graphEdges: await db.graphEdges.toArray(),
        numericSheets: await db.numericSheets.toArray(),
        attributes: await db.attributes.toArray(),
        formulas: await db.formulas.toArray(),
        gddDocuments: await db.gddDocuments.toArray(),
        docSections: await db.docSections.toArray(),
        exportedAt: new Date().toISOString(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `game-design-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({ title: "数据导出成功", variant: "success" });
    } catch (e) {
      addToast({
        title: "导出失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    }
  };

  const handleClearData = () => {
    setClearConfirmOpen(true);
  };

  const confirmClearData = async () => {
    setClearConfirmOpen(false);
    try {
      await db.delete();
      window.location.reload();
    } catch (e) {
      addToast({
        title: "清空失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    }
  };

  return (
    <div className="min-h-screen canvas-ambient">
      <header className="border-b border-line-subtle frosted">
        <div className="max-w-4xl mx-auto px-8 h-14 flex items-center gap-4">
          <button
            onClick={() => navigate("/")}
            className="btn-ghost"
          >
            <ArrowLeft className="w-4 h-4" />
            返回
          </button>
          <h1 className="font-display font-semibold text-ink-primary">设置</h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-8 py-8 space-y-8">
        {/* AI 模型配置 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bot className="w-4 h-4 text-accent" />
            <h2 className="font-display text-lg font-semibold text-ink-primary">
              AI 模型配置
            </h2>
          </div>
          <p className="text-sm text-ink-secondary mb-4">
            配置你的 API Key 以启用 AI 能力。所有 Key 仅存储在本地浏览器，不会上传。
            选择一个默认模型用于 AI 调用。
          </p>

          <div className="space-y-3">
            {(Object.keys(providerConfig) as AIProvider[]).map((provider) => {
              const config = configs[provider];
              const meta = providerConfig[provider];
              const isDefault = defaultModel === provider;
              return (
                <div
                  key={provider}
                  className={cn(
                    "p-4 rounded-xl frosted transition-all duration-200",
                    isDefault
                      ? "shadow-selected border-accent/50"
                      : "shadow-layered border-line-subtle hover:border-line-strong hover:shadow-hover hover:-translate-y-0.5"
                  )}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium text-ink-primary">
                          {meta.label}
                        </h3>
                        {config.apiKey && (
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-accent/10 text-accent">
                            已配置
                          </span>
                        )}
                        {isDefault && (
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-accent text-canvas-sunken font-medium">
                            默认
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-ink-muted mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                    {config.apiKey && !isDefault && (
                      <button
                        onClick={() => handleSetDefault(provider)}
                        className="btn-ghost text-xs"
                      >
                        设为默认
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-2xs text-ink-muted mb-1">
                        API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showKeys[provider] ? "text" : "password"}
                          value={config.apiKey}
                          onChange={(e) =>
                            handleSaveKey(provider, e.target.value)
                          }
                          placeholder="sk-..."
                          className="input-field pr-9 font-mono text-xs"
                        />
                        <button
                          onClick={() =>
                            setShowKeys((s) => ({
                              ...s,
                              [provider]: !s[provider],
                            }))
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-primary"
                        >
                          {showKeys[provider] ? (
                            <EyeOff className="w-3.5 h-3.5" />
                          ) : (
                            <Eye className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-2xs text-ink-muted mb-1">
                        模型
                      </label>
                      <select
                        value={config.model}
                        onChange={(e) =>
                          handleSaveModel(provider, e.target.value)
                        }
                        className="input-field text-xs"
                      >
                        {meta.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 数据管理 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Database className="w-4 h-4 text-accent" />
            <h2 className="font-display text-lg font-semibold text-ink-primary">
              数据管理
            </h2>
          </div>
          <p className="text-sm text-ink-secondary mb-4">
            所有项目数据存储在浏览器本地 IndexedDB。可导出备份或清空数据。
          </p>

          <div className="flex flex-wrap gap-2">
            <button onClick={handleExport} className="btn-secondary">
              <Download className="w-4 h-4" />
              导出全部数据
            </button>
            <button
              onClick={handleClearData}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md border border-danger/40 text-danger text-sm hover:bg-danger/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              清空所有数据
            </button>
          </div>
        </section>

        {/* 关于 */}
        <section className="pt-8 border-t border-line-subtle">
          <p className="text-xs text-ink-muted">
            玩法设计平台 · 纯前端本地优先架构 · 数据不会离开你的浏览器
          </p>
        </section>
      </main>

      <ConfirmDialog
        open={clearConfirmOpen}
        title="清空数据"
        description="确定清空所有本地数据？这将删除所有项目，且不可恢复。建议先导出备份。"
        variant="danger"
        onConfirm={() => void confirmClearData()}
        onCancel={() => setClearConfirmOpen(false)}
      />
    </div>
  );
}
