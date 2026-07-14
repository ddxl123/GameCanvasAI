import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/ui/Modal";
import { useUIStore } from "@/stores/uiStore";
import {
  exportAsJSON,
  exportAsUnity,
  exportAsGodot,
  exportAttributesAsCSV,
  loadProjectExportData,
  sanitizeFileName,
  type ProjectExportData,
} from "@/lib/engineExport";
import { cn } from "@/lib/utils";
import type { Project } from "@/types";
import { Copy, Download, FileJson, Box, Boxes, Table, Loader2 } from "lucide-react";

type ExportFormat = "json" | "unity" | "godot" | "csv";
type ExportScope = "project" | "numeric";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: Project;
}

const formatOptions: {
  value: ExportFormat;
  label: string;
  description: string;
  icon: typeof FileJson;
  ext: string;
}[] = [
  {
    value: "json",
    label: "JSON",
    description: "通用结构化数据",
    icon: FileJson,
    ext: "json",
  },
  {
    value: "unity",
    label: "Unity ScriptableObject",
    description: "C# 类 + JSON 数据",
    icon: Box,
    ext: "cs",
  },
  {
    value: "godot",
    label: "Godot Resource",
    description: ".tres 资源文件",
    icon: Boxes,
    ext: "tres",
  },
  {
    value: "csv",
    label: "CSV（数值表）",
    description: "表格格式",
    icon: Table,
    ext: "csv",
  },
];

export default function ExportDialog({
  open,
  onOpenChange,
  project,
}: ExportDialogProps) {
  const [format, setFormat] = useState<ExportFormat>("json");
  const [scope, setScope] = useState<ExportScope>("project");
  const [data, setData] = useState<ProjectExportData | null>(null);
  const [loading, setLoading] = useState(false);
  const addToast = useUIStore((s) => s.addToast);

  // 弹窗打开时从数据库加载项目完整数据
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    loadProjectExportData(project.id)
      .then((d) => setData(d))
      .catch((err) => {
        addToast({
          title: "加载数据失败",
          description: err instanceof Error ? err.message : "未知错误",
          variant: "error",
        });
        setData(null);
      })
      .finally(() => setLoading(false));
  }, [open, project.id, addToast]);

  // CSV 格式仅导出数值表，强制 numeric 范围
  const effectiveScope: ExportScope =
    format === "csv" ? "numeric" : scope;

  // 根据范围过滤数据
  const effectiveData = useMemo<ProjectExportData | null>(() => {
    if (!data) return null;
    if (effectiveScope === "numeric") {
      return {
        ...data,
        graphs: [],
        nodes: [],
        edges: [],
        documents: [],
        sections: [],
      };
    }
    return data;
  }, [data, effectiveScope]);

  // 生成预览内容
  const previewContent = useMemo(() => {
    if (!effectiveData) return "";
    switch (format) {
      case "json":
        return exportAsJSON(project, effectiveData);
      case "unity": {
        const unity = exportAsUnity(project, effectiveData);
        return (
          `// ===== C# 类定义 (${unity.className}.cs) =====\n` +
          `${unity.csharpCode}\n\n` +
          `// ===== JSON 数据（ScriptableObject 序列化） =====\n` +
          `${unity.jsonData}`
        );
      }
      case "godot":
        return exportAsGodot(project, effectiveData);
      case "csv":
        return exportAttributesAsCSV(
          effectiveData.attributes,
          effectiveData.formulas
        );
      default:
        return "";
    }
  }, [format, effectiveData, project]);

  // 下载文件名：项目名_格式.扩展名
  const fileName = useMemo(() => {
    const safeName = sanitizeFileName(project.name);
    const ext =
      formatOptions.find((f) => f.value === format)?.ext ?? "txt";
    return `${safeName}_${format}.${ext}`;
  }, [project.name, format]);

  const handleCopy = async () => {
    if (!previewContent) return;
    try {
      await navigator.clipboard.writeText(previewContent);
      addToast({ title: "已复制到剪贴板", variant: "success" });
    } catch {
      addToast({
        title: "复制失败",
        description: "浏览器可能拒绝了剪贴板权限",
        variant: "error",
      });
    }
  };

  const handleDownload = () => {
    if (!previewContent) return;
    const blob = new Blob([previewContent], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    addToast({
      title: "下载已开始",
      description: fileName,
      variant: "success",
    });
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="导出项目"
      description={`选择目标引擎格式，将「${project.name}」导出为可用资源`}
      className="w-[90vw] max-w-3xl"
    >
      <div className="space-y-4">
        {/* 格式选择 */}
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            导出格式
          </label>
          <div className="grid grid-cols-2 gap-2">
            {formatOptions.map((opt) => {
              const Icon = opt.icon;
              const active = format === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => setFormat(opt.value)}
                  className={cn(
                    "p-3 rounded-lg border text-left transition-all",
                    active
                      ? "border-accent bg-accent-glow"
                      : "border-line bg-canvas-sunken hover:border-line-strong"
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 mb-1.5",
                      active ? "text-accent" : "text-ink-secondary"
                    )}
                  />
                  <p className="text-sm font-medium text-ink-primary">
                    {opt.label}
                  </p>
                  <p className="text-2xs text-ink-muted mt-0.5">
                    {opt.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 范围选择（CSV 时隐藏，因其仅导出数值表） */}
        {format !== "csv" && (
          <div>
            <label className="block text-xs font-medium text-ink-secondary mb-1.5">
              导出范围
            </label>
            <div className="flex gap-2">
              {(
                [
                  { value: "project", label: "整个项目" },
                  { value: "numeric", label: "仅数值表" },
                ] as { value: ExportScope; label: string }[]
              ).map((opt) => {
                const active = scope === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => setScope(opt.value)}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-md border text-sm transition-all",
                      active
                        ? "border-accent bg-accent-glow text-accent"
                        : "border-line bg-canvas-sunken text-ink-secondary hover:border-line-strong"
                    )}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* 预览区 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-ink-secondary">
              预览
            </label>
            <span className="text-2xs text-ink-muted font-mono">
              {fileName}
            </span>
          </div>
          <div className="relative rounded-lg border border-line bg-canvas-sunken overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center h-[280px] text-ink-muted">
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                <span className="text-sm">加载项目数据...</span>
              </div>
            ) : (
              <pre
                className="h-[280px] overflow-auto p-3 text-2xs leading-relaxed font-mono text-ink-primary whitespace-pre-wrap break-all"
              >
                {previewContent || "// 暂无数据"}
              </pre>
            )}
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={handleCopy}
            disabled={loading || !previewContent}
            className="btn-secondary"
          >
            <Copy className="w-3.5 h-3.5" />
            复制
          </button>
          <button
            onClick={handleDownload}
            disabled={loading || !previewContent}
            className="btn-primary"
          >
            <Download className="w-3.5 h-3.5" />
            下载文件
          </button>
        </div>
      </div>
    </Modal>
  );
}
