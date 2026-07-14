import { useNavigate } from "react-router-dom";
import { Project, ProjectTemplate } from "@/types";
import { formatRelativeTime } from "@/lib/time";
import { exportProject } from "@/lib/projectExport";
import { useUIStore } from "@/stores/uiStore";
import {
  Swords,
  Coins,
  Scroll,
  MoreVertical,
  Trash2,
  Folder,
  ChevronRight,
  Download,
} from "lucide-react";
import { useState } from "react";

// 模板配置：每个模板像游戏里的一个"职业/难度"，有独立色彩与氛围
const templateConfig: Record<
  ProjectTemplate,
  {
    label: string;
    icon: typeof Swords;
    color: string;
    gradient: string;
    glow: string;
    tagline: string;
  }
> = {
  blank: {
    label: "空白",
    icon: Folder,
    color: "#9AA5B8",
    gradient: "linear-gradient(135deg, #4B5563 0%, #1F2937 100%)",
    glow: "rgba(156,163,175,0.3)",
    tagline: "从零开始",
  },
  combat: {
    label: "战斗",
    icon: Swords,
    color: "#F43F5E",
    gradient: "linear-gradient(135deg, #F43F5E 0%, #9F1239 100%)",
    glow: "rgba(244,63,94,0.4)",
    tagline: "刀剑与魔法",
  },
  economy: {
    label: "经济",
    icon: Coins,
    color: "#FBBF24",
    gradient: "linear-gradient(135deg, #FBBF24 0%, #B45309 100%)",
    glow: "rgba(251,191,36,0.4)",
    tagline: "财富与贸易",
  },
  rpg: {
    label: "RPG",
    icon: Scroll,
    color: "#A78BFA",
    gradient: "linear-gradient(135deg, #A78BFA 0%, #6D28D9 100%)",
    glow: "rgba(167,139,250,0.4)",
    tagline: "史诗冒险",
  },
};

interface ProjectCardProps {
  project: Project;
  onDelete: (id: string) => void;
}

export default function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const addToast = useUIStore((s) => s.addToast);
  const config = templateConfig[project.template];
  const Icon = config.icon;

  const handleClick = () => {
    navigate(`/project/${project.id}/mechanism`);
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    onDelete(project.id);
  };

  // 导出当前项目为 JSON 文件
  const handleExport = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setMenuOpen(false);
    if (exporting) return;
    setExporting(true);
    try {
      await exportProject(project.id);
      addToast({
        title: "导出成功",
        description: `项目「${project.name}」已导出`,
        variant: "success",
      });
    } catch (err) {
      addToast({
        title: "导出失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "error",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="group relative rounded-xl bg-canvas-elevated border border-line overflow-hidden cursor-pointer transition-all duration-300 hover:border-line-strong hover:-translate-y-1"
      style={{
        boxShadow: `0 4px 16px rgba(0,0,0,0.3)`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = `0 8px 32px rgba(0,0,0,0.4), 0 0 24px ${config.glow}`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = `0 4px 16px rgba(0,0,0,0.3)`;
      }}
    >
      {/* 顶部视觉区 —— 像游戏存档槽 */}
      <div className="relative h-24 overflow-hidden">
        {/* 模板渐变背景 */}
        <div
          className="absolute inset-0"
          style={{ background: config.gradient }}
        />
        {/* 装饰性几何图形（六边形 + 线条） */}
        <div className="absolute inset-0 opacity-25">
          <svg width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
            <circle cx="75%" cy="30%" r="45" fill="white" opacity="0.3" />
            <circle cx="90%" cy="75%" r="28" fill="white" opacity="0.2" />
            <line x1="50%" y1="0" x2="80%" y2="100%" stroke="white" strokeWidth="0.5" opacity="0.4" />
            <line x1="70%" y1="0" x2="100%" y2="80%" stroke="white" strokeWidth="0.5" opacity="0.3" />
          </svg>
        </div>
        {/* 扫描线效果 */}
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.1) 2px, rgba(0,0,0,0.1) 3px)",
          }}
        />

        {/* 顶部信息：图标 + 模板名 */}
        <div className="absolute top-3 left-4 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center border border-white/40">
            <Icon className="w-5 h-5 text-white" strokeWidth={2.2} />
          </div>
          <div>
            <div className="text-2xs font-bold text-white uppercase tracking-widest">
              {config.label}
            </div>
            <div className="text-[10px] text-white/70 italic">
              {config.tagline}
            </div>
          </div>
        </div>

        {/* 右上角菜单 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(!menuOpen);
          }}
          className="absolute top-2 right-2 w-7 h-7 rounded-md bg-black/30 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/50 hover:text-white transition-all opacity-0 group-hover:opacity-100"
        >
          <MoreVertical className="w-3.5 h-3.5" />
        </button>

        {/* hover 时显示"进入"箭头 */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1 px-2 py-1 rounded-md bg-white/20 backdrop-blur-sm border border-white/30 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 translate-x-2 transition-all">
          <span className="text-2xs font-medium text-white">进入</span>
          <ChevronRight className="w-3 h-3 text-white" strokeWidth={2.5} />
        </div>

        {/* 下拉菜单 */}
        {menuOpen && (
          <div
            className="absolute top-12 right-2 z-10 w-32 py-1 rounded-md bg-canvas-elevated border border-line shadow-pop animate-scale-in"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={handleExport}
              disabled={exporting}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-ink-primary hover:bg-canvas-sunken transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-3.5 h-3.5" />
              {exporting ? "导出中..." : "导出项目"}
            </button>
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-danger hover:bg-danger/10 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除项目
            </button>
          </div>
        )}
      </div>

      {/* 底部内容区 —— 像游戏存档信息 */}
      <div className="p-4">
        <div className="flex items-center gap-1.5 mb-1">
          <span
            className="font-pixel text-[8px] uppercase tracking-wider"
            style={{ color: config.color }}
          >
            SAVE
          </span>
          <span className="text-2xs text-ink-muted">·</span>
          <span className="text-2xs text-ink-muted">
            {formatRelativeTime(project.updatedAt)}
          </span>
        </div>

        <h3 className="font-display font-bold text-ink-primary mb-1.5 truncate group-hover:text-accent transition-colors text-base">
          {project.name}
        </h3>

        <p className="text-xs text-ink-secondary line-clamp-2 min-h-[2rem]">
          {project.description || "暂无描述"}
        </p>

        {/* 底部色条 —— 模板标识 */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 h-1 rounded-full bg-canvas-sunken overflow-hidden">
            <div
              className="h-full rounded-full transition-all group-hover:w-full"
              style={{
                width: "60%",
                background: config.gradient,
              }}
            />
          </div>
          <span
            className="text-2xs font-medium"
            style={{ color: config.color }}
          >
            {config.label}
          </span>
        </div>
      </div>
    </div>
  );
}
