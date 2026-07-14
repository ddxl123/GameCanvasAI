import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { importProject } from "@/lib/projectExport";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";

/**
 * 导入项目按钮。
 * 点击后触发隐藏 file input，选择 JSON 文件后调用 importProject；
 * 成功后刷新项目列表并 toast 提示。
 */
export default function ImportProjectButton() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const loadProjects = useProjectStore((s) => s.loadProjects);
  const addToast = useUIStore((s) => s.addToast);

  const handleClick = () => {
    // 重置 value 允许重复选择同一文件
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const newId = await importProject(file);
      await loadProjects();
      addToast({
        title: "导入成功",
        description: "项目已导入，可在列表中查看",
        variant: "success",
      });
      void newId;
    } catch (err) {
      addToast({
        title: "导入失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={importing}
        className="btn-secondary"
        title="从 JSON 文件导入项目"
      >
        <Upload className="w-4 h-4" strokeWidth={2.2} />
        <span className="font-medium">
          {importing ? "导入中..." : "导入项目"}
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        onChange={handleFileChange}
        className="hidden"
      />
    </>
  );
}
