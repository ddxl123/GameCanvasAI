import { type ComponentType } from "react";
import {
  Flag,
  Skull,
  Film,
  MapPin,
  Lock,
  Book,
  Crown,
  type LucideProps,
} from "lucide-react";
import type { LevelNodeType } from "@/types";

// ===== 节点类型元数据（共享给编辑器/难度曲线）=====

export interface LevelNodeMeta {
  label: string;
  icon: ComponentType<LucideProps>;
  color: string; // 主色
  bg: string; // 卡片背景
  border: string; // 边框色
  size: { w: number; h: number };
  rounded: string; // 圆角样式
  description: string;
}

export const LEVEL_NODE_TYPE_META: Record<LevelNodeType, LevelNodeMeta> = {
  level: {
    label: "关卡",
    icon: Flag,
    color: "#60A5FA",
    bg: "rgba(96,165,250,0.12)",
    border: "rgba(96,165,250,0.6)",
    size: { w: 188, h: 76 },
    rounded: "rounded-lg",
    description: "标准关卡节点",
  },
  boss: {
    label: "Boss",
    icon: Skull,
    color: "#F87171",
    bg: "rgba(248,113,113,0.14)",
    border: "rgba(248,113,113,0.7)",
    size: { w: 208, h: 92 },
    rounded: "rounded-lg",
    description: "Boss 战关卡，难度高峰",
  },
  cutscene: {
    label: "过场",
    icon: Film,
    color: "#A78BFA",
    bg: "rgba(167,139,250,0.12)",
    border: "rgba(167,139,250,0.6)",
    size: { w: 156, h: 48 },
    rounded: "rounded-md",
    description: "剧情过场动画",
  },
  hub: {
    label: "枢纽",
    icon: MapPin,
    color: "#34D399",
    bg: "rgba(52,211,153,0.14)",
    border: "rgba(52,211,153,0.7)",
    size: { w: 96, h: 96 },
    rounded: "rounded-full",
    description: "枢纽区域，玩家休整",
  },
  secret: {
    label: "秘密",
    icon: Lock,
    color: "#FBBF24",
    bg: "rgba(251,191,36,0.10)",
    border: "rgba(251,191,36,0.7)",
    size: { w: 176, h: 68 },
    rounded: "rounded-lg",
    description: "隐藏/秘密关卡",
  },
  tutorial: {
    label: "教学",
    icon: Book,
    color: "#7DD3FC",
    bg: "rgba(125,211,252,0.12)",
    border: "rgba(125,211,252,0.6)",
    size: { w: 176, h: 68 },
    rounded: "rounded-lg",
    description: "教学关卡",
  },
  ending: {
    label: "结局",
    icon: Crown,
    color: "#C084FC",
    bg: "linear-gradient(135deg, rgba(192,132,252,0.18), rgba(251,191,36,0.12))",
    border: "rgba(192,132,252,0.7)",
    size: { w: 196, h: 80 },
    rounded: "rounded-lg",
    description: "结局关卡",
  },
};

export const LEVEL_NODE_TYPES: LevelNodeType[] = [
  "level",
  "boss",
  "cutscene",
  "hub",
  "secret",
  "tutorial",
  "ending",
];
