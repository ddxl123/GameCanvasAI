import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Link2, FileText, Network } from "lucide-react";
import {
  findAttributeUsageAcrossProject,
  findDocsByGraphId,
} from "@/lib/crossReference";
import { db } from "@/db";
import { useMechanismStore } from "@/stores/mechanismStore";
import { useProjectStore } from "@/stores/projectStore";
import { NODE_TYPE_META } from "./nodeTypes";
import type {
  GraphNode,
  Formula,
  DocSection,
  MechanismGraph,
  GDDDocument,
} from "@/types";

type LoadState = "loading" | "done" | "error";

interface SectionHeaderProps {
  icon: React.ReactNode;
  title: string;
  count?: number;
}

function SectionHeader({ icon, title, count }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-1.5 text-2xs font-medium text-ink-muted uppercase tracking-wider">
      {icon}
      <span>{title}</span>
      {typeof count === "number" && count > 0 && (
        <span className="text-ink-muted/70 normal-case tracking-normal">
          ({count})
        </span>
      )}
    </div>
  );
}

/**
 * 属性反向引用信息：展示某个数值属性被哪些机制节点 / 公式引用。
 * 用于数值属性面板或节点属性面板。
 */
export function AttributeReferenceInfo({
  attributeId,
}: {
  attributeId: string;
}) {
  const [state, setState] = useState<LoadState>("loading");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [formulas, setFormulas] = useState<Formula[]>([]);
  const [graphMap, setGraphMap] = useState<Map<string, MechanismGraph>>(
    new Map()
  );

  const navigate = useNavigate();
  const { currentProject } = useProjectStore();
  const selectGraph = useMechanismStore((s) => s.selectGraph);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const usage = await findAttributeUsageAcrossProject(attributeId);
        if (cancelled) return;
        // 拉取节点所属机制图名称
        const graphIds = Array.from(
          new Set(usage.nodes.map((n) => n.graphId))
        );
        const graphs = graphIds.length
          ? await db.mechanismGraphs.bulkGet(graphIds)
          : [];
        const map = new Map<string, MechanismGraph>();
        for (const g of graphs) {
          if (g) map.set(g.id, g);
        }
        if (cancelled) return;
        setNodes(usage.nodes);
        setFormulas(usage.formulas);
        setGraphMap(map);
        setState("done");
      } catch (e) {
        console.error("加载属性引用失败:", e);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attributeId]);

  const handleJumpToNode = async (node: GraphNode) => {
    if (!currentProject) return;
    // 先切换到目标机制图，再跳转机制设计页
    await selectGraph(node.graphId);
    navigate(`/project/${currentProject.id}/mechanism`);
  };

  const handleJumpToNumeric = () => {
    if (!currentProject) return;
    navigate(`/project/${currentProject.id}/numeric`);
  };

  const isEmpty = state === "done" && nodes.length === 0 && formulas.length === 0;

  return (
    <div className="space-y-2.5">
      <SectionHeader
        icon={<Link2 className="w-3 h-3" />}
        title="反向引用"
        count={state === "done" ? nodes.length + formulas.length : undefined}
      />

      {state === "loading" && (
        <p className="text-2xs text-ink-muted">加载中...</p>
      )}
      {state === "error" && (
        <p className="text-2xs text-danger">加载失败</p>
      )}
      {isEmpty && (
        <p className="text-2xs text-ink-muted">该属性暂未被引用</p>
      )}

      {state === "done" && !isEmpty && (
        <div className="space-y-2.5">
          {nodes.length > 0 && (
            <div className="space-y-1">
              <p className="text-2xs text-ink-muted">机制节点</p>
              <div className="space-y-1">
                {nodes.map((n) => {
                  const meta = NODE_TYPE_META[n.type];
                  const graph = graphMap.get(n.graphId);
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleJumpToNode(n)}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-canvas-sunken border border-line hover:border-accent/40 hover:bg-accent-glow/30 transition-colors text-left group"
                      title={`跳转到「${graph?.name ?? "未知图"}」`}
                    >
                      <Network
                        className="w-3 h-3 flex-shrink-0"
                        style={{ color: meta.color }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-2xs text-ink-primary font-medium truncate">
                          {n.label}
                        </div>
                        <div className="text-2xs text-ink-muted truncate">
                          {meta.label} · {graph?.name ?? "未知图"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {formulas.length > 0 && (
            <div className="space-y-1">
              <p className="text-2xs text-ink-muted">公式</p>
              <div className="space-y-1">
                {formulas.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={handleJumpToNumeric}
                    className="w-full flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-canvas-sunken border border-line hover:border-accent/40 hover:bg-accent-glow/30 transition-colors text-left"
                    title="跳转到数值设计页"
                  >
                    <FileText className="w-3 h-3 flex-shrink-0 text-ink-muted mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <code className="block text-2xs text-ink-secondary font-mono break-all line-clamp-2">
                        {f.expression || "(空表达式)"}
                      </code>
                      {f.description && (
                        <div className="text-2xs text-ink-muted truncate mt-0.5">
                          {f.description}
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * 机制图反向引用信息：展示某张机制图被哪些 GDD 段落嵌入。
 * 用于节点属性面板 / 机制图设置侧边栏。
 */
export function GraphReferenceInfo({ graphId }: { graphId: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [sections, setSections] = useState<DocSection[]>([]);
  const [docMap, setDocMap] = useState<Map<string, GDDDocument>>(new Map());

  const navigate = useNavigate();
  const { currentProject } = useProjectStore();

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const docs = await findDocsByGraphId(graphId);
        if (cancelled) return;
        const docIds = Array.from(new Set(docs.map((s) => s.docId)));
        const gddDocs = docIds.length
          ? await db.gddDocuments.bulkGet(docIds)
          : [];
        const map = new Map<string, GDDDocument>();
        for (const d of gddDocs) {
          if (d) map.set(d.id, d);
        }
        if (cancelled) return;
        setSections(docs);
        setDocMap(map);
        setState("done");
      } catch (e) {
        console.error("加载图引用失败:", e);
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [graphId]);

  const handleJumpToDoc = () => {
    if (!currentProject) return;
    navigate(`/project/${currentProject.id}/document`);
  };

  const isEmpty = state === "done" && sections.length === 0;

  return (
    <div className="space-y-2.5">
      <SectionHeader
        icon={<FileText className="w-3 h-3" />}
        title="文档引用"
        count={state === "done" ? sections.length : undefined}
      />

      {state === "loading" && (
        <p className="text-2xs text-ink-muted">加载中...</p>
      )}
      {state === "error" && (
        <p className="text-2xs text-danger">加载失败</p>
      )}
      {isEmpty && (
        <p className="text-2xs text-ink-muted">该图暂未被文档引用</p>
      )}

      {state === "done" && sections.length > 0 && (
        <div className="space-y-1">
          {sections.map((s) => {
            const doc = docMap.get(s.docId);
            return (
              <button
                key={s.id}
                type="button"
                onClick={handleJumpToDoc}
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md bg-canvas-sunken border border-line hover:border-accent/40 hover:bg-accent-glow/30 transition-colors text-left"
                title="跳转到 GDD 文档"
              >
                <FileText className="w-3 h-3 flex-shrink-0 text-ink-muted" />
                <div className="flex-1 min-w-0">
                  <div className="text-2xs text-ink-primary font-medium truncate">
                    {s.title || "(无标题段落)"}
                  </div>
                  <div className="text-2xs text-ink-muted truncate">
                    {doc?.name ?? "未知文档"}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
