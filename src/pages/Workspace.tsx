import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { ReactFlowProvider } from "@xyflow/react";
import { useGameplayStore } from "@/stores/gameplayStore";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useRuleStore } from "@/stores/ruleStore";
import { useLevelStore } from "@/stores/levelStore";
import { useNumericStore } from "@/stores/numericStore";
import { useDocumentStore } from "@/stores/documentStore";
import UnifiedWorkspace from "@/features/canvas/UnifiedWorkspace";

/**
 * 统一设计工作台页面。
 *
 * 所有设计维度（核心循环、机制网络、规则系统、关卡流程、数值平衡、
 * 设计文档、高光时刻、交互矩阵）作为可拖拽模块放在同一个无限画布上，
 * 模块间画连线展示跨维度关联。
 *
 * 页面只负责一次性加载所有维度数据，渲染交给 UnifiedWorkspace。
 */
export default function Workspace() {
  const { projectId } = useParams();

  const loadLoops = useGameplayStore((s) => s.loadLoops);
  const loadMoments = useGameplayStore((s) => s.loadMoments);
  const loadGraphs = useMechanismStore((s) => s.loadGraphs);
  const loadRules = useRuleStore((s) => s.loadRules);
  const loadMatrices = useRuleStore((s) => s.loadMatrices);
  const loadFlows = useLevelStore((s) => s.loadFlows);
  const loadSheets = useNumericStore((s) => s.loadSheets);
  const loadDocuments = useDocumentStore((s) => s.loadDocuments);

  useEffect(() => {
    if (!projectId) return;
    void loadLoops(projectId);
    void loadMoments(projectId);
    void loadGraphs(projectId);
    void loadRules(projectId);
    void loadMatrices(projectId);
    void loadFlows(projectId);
    void loadSheets(projectId);
    void loadDocuments(projectId);
  }, [
    projectId,
    loadLoops,
    loadMoments,
    loadGraphs,
    loadRules,
    loadMatrices,
    loadFlows,
    loadSheets,
    loadDocuments,
  ]);

  if (!projectId) return null;

  return (
    <ReactFlowProvider>
      <UnifiedWorkspace />
    </ReactFlowProvider>
  );
}
