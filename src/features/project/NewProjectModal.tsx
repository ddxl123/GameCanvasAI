import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/ui/Modal";
import { useProjectStore } from "@/stores/projectStore";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useNumericStore } from "@/stores/numericStore";
import { useUIStore } from "@/stores/uiStore";
import { ProjectTemplate } from "@/types";
import { applyTemplate } from "@/lib/projectTemplates";
import { cn } from "@/lib/utils";
import { Folder, Swords, Coins, Scroll, Loader2 } from "lucide-react";

const templates: {
  value: ProjectTemplate;
  label: string;
  description: string;
  icon: typeof Folder;
}[] = [
  {
    value: "blank",
    label: "空白项目",
    description: "从零开始设计",
    icon: Folder,
  },
  {
    value: "combat",
    label: "战斗系统",
    description: "技能、伤害、Buff",
    icon: Swords,
  },
  {
    value: "economy",
    label: "经济系统",
    description: "产出、消耗、循环",
    icon: Coins,
  },
  {
    value: "rpg",
    label: "RPG 系统",
    description: "属性、成长、装备",
    icon: Scroll,
  },
];

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function NewProjectModal({
  open,
  onOpenChange,
}: NewProjectModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [template, setTemplate] = useState<ProjectTemplate>("blank");
  const [creating, setCreating] = useState(false);
  const createProject = useProjectStore((s) => s.createProject);
  const createGraph = useMechanismStore((s) => s.createGraph);
  const createSheet = useNumericStore((s) => s.createSheet);
  const addToast = useUIStore((s) => s.addToast);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!name.trim()) {
      addToast({
        title: "请输入项目名称",
        variant: "warning",
      });
      return;
    }
    setCreating(true);
    try {
      // 1. 创建项目
      const project = await createProject(name, description, template);
      // 2. 创建默认机制图 + 默认数值表
      const graph = await createGraph(project.id, "主机制图", "node_graph");
      const sheet = await createSheet(project.id, "主数值表");
      // 3. 应用模板预置内容（blank 为空操作）
      await applyTemplate(template, graph.id, sheet.id);

      addToast({
        title: "项目创建成功",
        description: project.name,
        variant: "success",
      });
      setName("");
      setDescription("");
      setTemplate("blank");
      onOpenChange(false);
      // 4. 跳转到项目机制页
      navigate(`/project/${project.id}/mechanism`);
    } catch (e) {
      addToast({
        title: "创建失败",
        description: e instanceof Error ? e.message : "未知错误",
        variant: "error",
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        // 生成过程中禁止关闭
        if (creating) return;
        onOpenChange(next);
      }}
      title="新建项目"
      description="选择一个模板开始你的玩法设计"
    >
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            项目名称
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：英雄战斗系统"
            className="input-field"
            autoFocus
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            项目描述（可选）
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="简单描述这个项目的目标..."
            rows={2}
            className="input-field resize-none"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-ink-secondary mb-1.5">
            选择模板
          </label>
          <div className="grid grid-cols-2 gap-2">
            {templates.map((t) => {
              const Icon = t.icon;
              const active = template === t.value;
              return (
                <button
                  key={t.value}
                  onClick={() => setTemplate(t.value)}
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
                  <p
                    className={cn(
                      "text-sm font-medium",
                      active ? "text-ink-primary" : "text-ink-primary"
                    )}
                  >
                    {t.label}
                  </p>
                  <p className="text-2xs text-ink-muted mt-0.5">
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            onClick={() => onOpenChange(false)}
            disabled={creating}
            className="btn-secondary"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={creating}
            className="btn-primary"
          >
            {creating ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                正在生成...
              </span>
            ) : (
              "创建项目"
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
