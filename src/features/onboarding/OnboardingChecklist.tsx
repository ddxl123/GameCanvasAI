import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { db } from "@/db";
import { useUIStore } from "@/stores/uiStore";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  Circle,
  ChevronDown,
  X,
  Trophy,
  GraduationCap,
  Network,
  Calculator,
  FileText,
  Sparkles,
  Download,
  GitBranch,
  FolderPlus,
  ListChecks,
  FunctionSquare,
} from "lucide-react";

// ===== 类型定义 =====

type TaskKey =
  | "projectCreated"
  | "graphWithNode"
  | "edgeCreated"
  | "attributeCreated"
  | "formulaCreated"
  | "gddWithSection"
  | "aiConversation"
  | "exported";

interface TaskStatus {
  projectCreated: boolean;
  graphWithNode: boolean;
  edgeCreated: boolean;
  attributeCreated: boolean;
  formulaCreated: boolean;
  gddWithSection: boolean;
  aiConversation: boolean;
  exported: boolean;
}

interface TaskDef {
  key: TaskKey;
  label: string;
  description: string;
  icon: typeof Network;
  action: () => void;
}

const TASK_ORDER: TaskKey[] = [
  "projectCreated",
  "graphWithNode",
  "edgeCreated",
  "attributeCreated",
  "formulaCreated",
  "gddWithSection",
  "aiConversation",
  "exported",
];

const EMPTY_STATUS: TaskStatus = {
  projectCreated: false,
  graphWithNode: false,
  edgeCreated: false,
  attributeCreated: false,
  formulaCreated: false,
  gddWithSection: false,
  aiConversation: false,
  exported: false,
};

const CONFETTI_COLORS = [
  "#A3E635",
  "#22D3EE",
  "#A78BFA",
  "#F472B6",
  "#FBBF24",
];

// ===== 主组件 =====

export default function OnboardingChecklist({
  projectId,
}: {
  projectId: string;
}) {
  const navigate = useNavigate();
  const addToast = useUIStore((s) => s.addToast);
  const setAIPanelOpen = useUIStore((s) => s.setAIPanelOpen);

  // localStorage 键
  const dismissedKey = `onboarding_dismissed_${projectId}`;
  const collapsedKey = `onboarding_collapsed_${projectId}`;
  const exportKey = `onboarding_exported_${projectId}`;
  const celebratedKey = `onboarding_celebrated_${projectId}`;

  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(dismissedKey) === "true"
  );
  // 首次（未记录）默认展开
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(collapsedKey) === "true"
  );
  const [status, setStatus] = useState<TaskStatus>(EMPTY_STATUS);
  const [showCelebration, setShowCelebration] = useState(false);

  // ===== 检查各表数据量 =====
  const checkTasks = useCallback(async () => {
    try {
      // 1. 项目存在
      const project = await db.projects.get(projectId);
      const projectCreated = !!project;

      // 2 & 3. 机制图 + 节点 + 边
      const graphs = await db.mechanismGraphs
        .where("projectId")
        .equals(projectId)
        .toArray();
      const graphIds = graphs.map((g) => g.id);
      let nodeCount = 0;
      let edgeCount = 0;
      for (const gid of graphIds) {
        nodeCount += await db.graphNodes.where("graphId").equals(gid).count();
        edgeCount += await db.graphEdges.where("graphId").equals(gid).count();
      }
      const graphWithNode = graphs.length >= 1 && nodeCount >= 1;
      const edgeCreated = edgeCount >= 1;

      // 4 & 5. 数值表 + 属性 + 公式
      const sheets = await db.numericSheets
        .where("projectId")
        .equals(projectId)
        .toArray();
      const sheetIds = sheets.map((s) => s.id);
      let attrCount = 0;
      let formulaCount = 0;
      for (const sid of sheetIds) {
        attrCount += await db.attributes.where("sheetId").equals(sid).count();
        formulaCount += await db.formulas.where("sheetId").equals(sid).count();
      }
      const attributeCreated = attrCount >= 1;
      const formulaCreated = formulaCount >= 1;

      // 6. GDD 文档 + 段落
      const docs = await db.gddDocuments
        .where("projectId")
        .equals(projectId)
        .toArray();
      const docIds = docs.map((d) => d.id);
      let sectionCount = 0;
      for (const did of docIds) {
        sectionCount += await db.docSections.where("docId").equals(did).count();
      }
      const gddWithSection = docs.length >= 1 && sectionCount >= 1;

      // 7. AI 对话
      const aiCount = await db.aiConversations
        .where("projectId")
        .equals(projectId)
        .count();
      const aiConversation = aiCount >= 1;

      // 8. 导出（localStorage 记录是否点击过导出）
      const exported = localStorage.getItem(exportKey) === "true";

      setStatus({
        projectCreated,
        graphWithNode,
        edgeCreated,
        attributeCreated,
        formulaCreated,
        gddWithSection,
        aiConversation,
        exported,
      });
    } catch (e) {
      console.error("Onboarding 检查失败:", e);
    }
  }, [projectId, exportKey]);

  // 挂载时检查一次 + 每 5 秒轮询
  useEffect(() => {
    if (dismissed) return;
    void checkTasks();
    const id = setInterval(() => {
      if (document.hidden) return;
      void checkTasks();
    }, 5000);
    return () => clearInterval(id);
  }, [checkTasks, dismissed]);

  // ===== 完成度计算 =====
  const completedCount = useMemo(
    () => TASK_ORDER.filter((k) => status[k]).length,
    [status]
  );
  const allDone = completedCount === TASK_ORDER.length;

  // ===== 庆祝动画触发（全部完成且未庆祝过）=====
  useEffect(() => {
    if (!allDone || dismissed) return;
    const celebrated = localStorage.getItem(celebratedKey) === "true";
    if (celebrated) return;
    setShowCelebration(true);
    localStorage.setItem(celebratedKey, "true");
    const t = setTimeout(() => setShowCelebration(false), 4500);
    return () => clearTimeout(t);
  }, [allDone, dismissed, celebratedKey]);

  // ===== 操作 =====
  const handleDismiss = () => {
    localStorage.setItem(dismissedKey, "true");
    setDismissed(true);
    addToast({
      title: "新手任务已隐藏",
      description: "可在项目数据中清除对应 localStorage 后恢复",
      variant: "default",
    });
  };

  const toggleCollapse = () => {
    const next = !collapsed;
    localStorage.setItem(collapsedKey, String(next));
    setCollapsed(next);
  };

  const handleExport = async () => {
    try {
      const { exportProject } = await import("@/lib/projectExport");
      await exportProject(projectId);
      localStorage.setItem(exportKey, "true");
      addToast({ title: "项目已导出", variant: "success" });
    } catch (e) {
      addToast({
        title: "导出失败",
        description: e instanceof Error ? e.message : "",
        variant: "error",
      });
    }
    void checkTasks();
  };

  const handleAI = () => {
    navigate(`/project/${projectId}/mechanism`);
    setAIPanelOpen(true);
  };

  const tasks: TaskDef[] = [
    {
      key: "projectCreated",
      label: "创建第一个项目",
      description: "完成 createProject",
      icon: FolderPlus,
      action: () => navigate("/"),
    },
    {
      key: "graphWithNode",
      label: "画第一张机制图",
      description: "创建至少 1 个机制图，含至少 1 个节点",
      icon: Network,
      action: () => navigate(`/project/${projectId}/mechanism`),
    },
    {
      key: "edgeCreated",
      label: "连接两个节点",
      description: "创建至少 1 条边",
      icon: GitBranch,
      action: () => navigate(`/project/${projectId}/mechanism`),
    },
    {
      key: "attributeCreated",
      label: "添加数值属性",
      description: "创建至少 1 个属性",
      icon: Calculator,
      action: () => navigate(`/project/${projectId}/numeric`),
    },
    {
      key: "formulaCreated",
      label: "编写第一个公式",
      description: "创建至少 1 个公式",
      icon: FunctionSquare,
      action: () => navigate(`/project/${projectId}/numeric`),
    },
    {
      key: "gddWithSection",
      label: "生成 GDD 文档",
      description: "创建至少 1 个 GDD 文档，含至少 1 个段落",
      icon: FileText,
      action: () => navigate(`/project/${projectId}/document`),
    },
    {
      key: "aiConversation",
      label: "使用 AI 助手",
      description: "创建至少 1 个 AI 对话",
      icon: Sparkles,
      action: handleAI,
    },
    {
      key: "exported",
      label: "导出项目",
      description: "标记完成（记录是否点击过导出）",
      icon: Download,
      action: handleExport,
    },
  ];

  if (dismissed) return null;

  // ===== 折叠态：进度环小图标 =====
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (completedCount / TASK_ORDER.length) * circumference;

  return (
    <>
      {/* 庆祝弹层 */}
      <CelebrationOverlay show={showCelebration} />

      <div className="fixed bottom-6 right-6 z-40 print:hidden">
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.button
              key="collapsed"
              onClick={toggleCollapse}
              title={`新手任务 ${completedCount}/${TASK_ORDER.length}`}
              className={cn(
                "relative w-12 h-12 rounded-full bg-canvas-elevated border border-line shadow-card flex items-center justify-center hover:border-accent transition-colors group",
                !allDone && "animate-neon-pulse"
              )}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              <svg
                className="absolute inset-0 -rotate-90"
                width="48"
                height="48"
                viewBox="0 0 48 48"
              >
                <circle
                  cx="24"
                  cy="24"
                  r={radius}
                  fill="none"
                  stroke="rgb(var(--color-line))"
                  strokeWidth="3"
                />
                <circle
                  cx="24"
                  cy="24"
                  r={radius}
                  fill="none"
                  stroke="rgb(var(--color-accent))"
                  strokeWidth="3"
                  strokeDasharray={circumference}
                  strokeDashoffset={offset}
                  strokeLinecap="round"
                  className="transition-all duration-500"
                />
              </svg>
              {allDone ? (
                <GraduationCap className="w-5 h-5 text-accent relative z-10" />
              ) : (
                <span className="relative z-10 text-2xs font-bold text-ink-primary">
                  {completedCount}/{TASK_ORDER.length}
                </span>
              )}
            </motion.button>
          ) : (
            <motion.div
              key="expanded"
              className="w-80 rounded-xl border border-line bg-canvas-elevated shadow-pop overflow-hidden"
              initial={{ scale: 0.92, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
            >
              {/* 头部 */}
              <div className="flex items-center justify-between px-3.5 py-3 border-b border-line-subtle">
                <div className="flex items-center gap-2 min-w-0">
                  <ListChecks className="w-4 h-4 text-accent flex-shrink-0" />
                  <span className="text-sm font-medium text-ink-primary">
                    新手任务
                  </span>
                  {allDone && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-accent-glow text-accent text-2xs font-medium">
                      <GraduationCap className="w-3 h-3" />
                      毕业
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-2xs text-ink-muted font-mono">
                    {completedCount}/{TASK_ORDER.length}
                  </span>
                  <button
                    onClick={toggleCollapse}
                    className="btn-ghost h-6 w-6 p-0"
                    title="折叠"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 进度条 */}
              <div className="px-3.5 pt-3">
                <div className="h-1.5 rounded-full bg-canvas-sunken overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(completedCount / TASK_ORDER.length) * 100}%`,
                    }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              </div>

              {/* 任务列表 */}
              <ul className="px-2 py-2 max-h-[340px] overflow-auto">
                {tasks.map((t) => {
                  const done = status[t.key];
                  const Icon = t.icon;
                  return (
                    <li
                      key={t.key}
                      className="flex items-center gap-2.5 px-1.5 py-1.5 rounded-md hover:bg-canvas-sunken/50 transition-colors"
                    >
                      {done ? (
                        <CheckCircle2 className="w-4 h-4 text-accent flex-shrink-0" />
                      ) : (
                        <Circle className="w-4 h-4 text-ink-muted flex-shrink-0" />
                      )}
                      <Icon
                        className={cn(
                          "w-3.5 h-3.5 flex-shrink-0",
                          done ? "text-ink-muted" : "text-ink-secondary"
                        )}
                      />
                      <div className="flex-1 min-w-0" title={t.description}>
                        <p
                          className={cn(
                            "text-xs truncate",
                            done
                              ? "text-ink-muted line-through"
                              : "text-ink-primary"
                          )}
                        >
                          {t.label}
                        </p>
                      </div>
                      {!done && (
                        <button
                          onClick={t.action}
                          className="text-2xs text-accent hover:text-accent-hover transition-colors whitespace-nowrap flex-shrink-0"
                        >
                          去完成 →
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>

              {/* 底部：不再提醒 / 全部完成提示 */}
              <div className="px-3.5 py-2.5 border-t border-line-subtle flex items-center justify-between">
                {allDone ? (
                  <div className="flex items-center gap-1.5 text-2xs text-accent">
                    <Trophy className="w-3.5 h-3.5" />
                    全部任务已完成
                  </div>
                ) : (
                  <span className="text-2xs text-ink-muted">
                    完成任务解锁全部能力
                  </span>
                )}
                <button
                  onClick={handleDismiss}
                  className="text-2xs text-ink-muted hover:text-ink-secondary transition-colors inline-flex items-center gap-1"
                  title="不再提醒"
                >
                  <X className="w-3 h-3" />
                  不再提醒
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

// ===== 庆祝弹层（confetti + 毕业徽章）=====

function CelebrationOverlay({ show }: { show: boolean }) {
  const pieces = useMemo(() => {
    return Array.from({ length: 44 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 640,
      y: 320 + Math.random() * 240,
      delay: Math.random() * 0.4,
      duration: 1.6 + Math.random() * 1.4,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      rotate: Math.random() * 720 - 360,
      size: 6 + Math.random() * 8,
    }));
  }, []);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[110] flex items-center justify-center pointer-events-none"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <div className="absolute inset-0 bg-canvas-sunken/40" />
          {/* confetti */}
          {pieces.map((p) => (
            <motion.div
              key={p.id}
              className="absolute top-1/2 left-1/2"
              style={{
                width: p.size,
                height: p.size * 0.5,
                background: p.color,
                borderRadius: 2,
              }}
              initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
              animate={{
                x: p.x,
                y: p.y,
                opacity: 0,
                rotate: p.rotate,
              }}
              transition={{
                duration: p.duration,
                delay: p.delay,
                ease: "easeOut",
              }}
            />
          ))}
          {/* 徽章卡片 */}
          <motion.div
            className="relative surface-card p-8 text-center shadow-pop max-w-xs"
            initial={{ scale: 0.5, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.5, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
          >
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-accent-glow mb-3"
            >
              <GraduationCap className="w-8 h-8 text-accent" />
            </motion.div>
            <h3 className="text-lg font-display font-bold text-ink-primary mb-1">
              恭喜毕业！
            </h3>
            <p className="text-xs text-ink-secondary leading-relaxed">
              你已完成全部新手任务，正式踏上游戏设计之旅。
            </p>
            <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-accent text-canvas-sunken text-2xs font-semibold">
              <Trophy className="w-3 h-3" />
              新晋设计师
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
