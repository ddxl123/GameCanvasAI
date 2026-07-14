import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/ui/Modal";
import { db } from "@/db";
import { useProjectStore } from "@/stores/projectStore";
import { NODE_TYPE_META, getNodeIcon } from "@/features/mechanism/nodeTypes";
import { cn } from "@/lib/utils";
import {
  Search,
  Network,
  Calculator,
  FileText,
  Table,
  Clock,
  Loader2,
  Hash,
} from "lucide-react";
import type {
  MechanismGraph,
  GraphNode,
  NumericSheet,
  Attribute,
  AttributeType,
  GDDDocument,
  DocSection,
} from "@/types";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 数值属性类型 → 中文标签 */
const ATTR_TYPE_LABEL: Record<AttributeType, string> = {
  number: "数值",
  string: "文本",
  bool: "布尔",
  ref: "引用",
};

/** 从 IndexedDB 加载的当前项目全量可搜索数据 */
interface SearchData {
  graphs: MechanismGraph[];
  nodes: GraphNode[];
  sheets: NumericSheet[];
  attributes: Attribute[];
  documents: GDDDocument[];
  sections: DocSection[];
  graphMap: Map<string, MechanismGraph>;
  docMap: Map<string, GDDDocument>;
}

type NodeResult = { kind: "node"; node: GraphNode; graphName: string };
type AttributeResult = { kind: "attribute"; attribute: Attribute };
type SectionResult = { kind: "section"; section: DocSection; docName: string };
type GraphResult = { kind: "graph"; graph: MechanismGraph };
type SheetResult = { kind: "sheet"; sheet: NumericSheet };

interface GroupedResults {
  nodes: NodeResult[];
  attributes: AttributeResult[];
  sections: SectionResult[];
  graphs: GraphResult[];
  sheets: SheetResult[];
}

/** 去除 HTML 标签，提取纯文本用于搜索与片段展示 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** 截取文本片段 */
function snippet(text: string, max = 80): string {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + "…" : t;
}

export default function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const navigate = useNavigate();
  const { currentProject } = useProjectStore();

  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState<SearchData | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 打开时聚焦输入框并重置查询
  useEffect(() => {
    if (open) {
      setQuery("");
      setDebouncedQuery("");
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // 300ms 防抖
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  // 打开且存在当前项目时，从 IndexedDB 一次性加载本项目全量数据
  useEffect(() => {
    if (!open || !currentProject) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const projectId = currentProject.id;
      const graphs = await db.mechanismGraphs
        .where("projectId")
        .equals(projectId)
        .toArray();
      const graphIds = graphs.map((g) => g.id);
      const nodes = graphIds.length
        ? await db.graphNodes.where("graphId").anyOf(graphIds).toArray()
        : [];
      const sheets = await db.numericSheets
        .where("projectId")
        .equals(projectId)
        .toArray();
      const sheetIds = sheets.map((s) => s.id);
      const attributes = sheetIds.length
        ? await db.attributes.where("sheetId").anyOf(sheetIds).toArray()
        : [];
      const documents = await db.gddDocuments
        .where("projectId")
        .equals(projectId)
        .toArray();
      const docIds = documents.map((d) => d.id);
      const sections = docIds.length
        ? await db.docSections.where("docId").anyOf(docIds).toArray()
        : [];
      if (!cancelled) {
        setData({
          graphs,
          nodes,
          sheets,
          attributes,
          documents,
          sections,
          graphMap: new Map(graphs.map((g) => [g.id, g])),
          docMap: new Map(documents.map((d) => [d.id, d])),
        });
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentProject]);

  // 内存中过滤并分组
  const results = useMemo<GroupedResults | null>(() => {
    if (!data || !debouncedQuery) return null;
    const q = debouncedQuery.toLowerCase();

    const nodes: NodeResult[] = data.nodes
      .filter((n) => {
        const label = n.label.toLowerCase();
        const desc =
          (n.data?.description as string | undefined)?.toLowerCase() ?? "";
        return label.includes(q) || desc.includes(q);
      })
      .map((n) => ({
        kind: "node" as const,
        node: n,
        graphName: data.graphMap.get(n.graphId)?.name ?? "未知图",
      }));

    const attributes: AttributeResult[] = data.attributes
      .filter((a) => a.name.toLowerCase().includes(q))
      .map((a) => ({ kind: "attribute" as const, attribute: a }));

    const sections: SectionResult[] = data.sections
      .filter((s) => {
        const title = s.title.toLowerCase();
        const content = stripHtml(s.content).toLowerCase();
        return title.includes(q) || content.includes(q);
      })
      .map((s) => ({
        kind: "section" as const,
        section: s,
        docName: data.docMap.get(s.docId)?.name ?? "未知文档",
      }));

    const graphs: GraphResult[] = data.graphs
      .filter((g) => g.name.toLowerCase().includes(q))
      .map((g) => ({ kind: "graph" as const, graph: g }));

    const sheets: SheetResult[] = data.sheets
      .filter((s) => s.name.toLowerCase().includes(q))
      .map((s) => ({ kind: "sheet" as const, sheet: s }));

    return { nodes, attributes, sections, graphs, sheets };
  }, [data, debouncedQuery]);

  // 空搜索词时展示最近编辑的项目快捷入口
  const recent = useMemo(() => {
    if (!data) return null;
    const recentGraphs = [...data.graphs]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
    const recentSheets = [...data.sheets]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
    const recentDocs = [...data.documents]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 3);
    return { recentGraphs, recentSheets, recentDocs };
  }, [data]);

  const hasResults = results
    ? results.nodes.length +
        results.attributes.length +
        results.sections.length +
        results.graphs.length +
        results.sheets.length >
      0
    : false;

  // 跳转到对应模块
  const go = (path: "mechanism" | "numeric" | "document") => {
    if (!currentProject) return;
    navigate(`/project/${currentProject.id}/${path}`);
    onOpenChange(false);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      className="max-w-2xl p-0 overflow-hidden"
    >
      {/* 搜索输入框 */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-line-subtle pr-12">
        <Search className="w-4 h-4 text-ink-muted flex-shrink-0" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="跨模块搜索：机制节点、数值属性、GDD 段落、机制图、数值表..."
          className="flex-1 bg-transparent text-sm text-ink-primary placeholder:text-ink-muted focus:outline-none"
        />
        {loading && (
          <Loader2 className="w-3.5 h-3.5 text-ink-muted animate-spin flex-shrink-0" />
        )}
        <kbd className="text-2xs text-ink-muted px-1.5 py-0.5 rounded border border-line bg-canvas-sunken flex-shrink-0">
          ESC
        </kbd>
      </div>

      {/* 结果区域 */}
      <div className="max-h-[55vh] overflow-y-auto">
        {/* 加载中 */}
        {loading && !data && (
          <div className="px-4 py-10 text-center text-sm text-ink-muted">
            正在加载数据...
          </div>
        )}

        {/* 空搜索词：最近编辑项目快捷入口 */}
        {!loading && data && !debouncedQuery && recent && (
          <div className="py-2">
            <SectionLabel icon={<Clock className="w-3 h-3" />} title="最近编辑" />
            <RecentGroup
              icon={<Network className="w-3.5 h-3.5 text-ink-muted" />}
              label="机制图"
              items={recent.recentGraphs.map((g) => ({
                id: g.id,
                title: g.name,
                onClick: () => go("mechanism"),
              }))}
            />
            <RecentGroup
              icon={<Table className="w-3.5 h-3.5 text-ink-muted" />}
              label="数值表"
              items={recent.recentSheets.map((s) => ({
                id: s.id,
                title: s.name,
                onClick: () => go("numeric"),
              }))}
            />
            <RecentGroup
              icon={<FileText className="w-3.5 h-3.5 text-ink-muted" />}
              label="GDD 文档"
              items={recent.recentDocs.map((d) => ({
                id: d.id,
                title: d.name,
                onClick: () => go("document"),
              }))}
            />
          </div>
        )}

        {/* 搜索结果 */}
        {!loading && results && (
          hasResults ? (
            <div className="py-2">
              {results.nodes.length > 0 && (
                <>
                  <SectionLabel
                    icon={<Network className="w-3 h-3" />}
                    title={`机制节点 (${results.nodes.length})`}
                  />
                  {results.nodes.map(({ node, graphName }) => {
                    const meta = NODE_TYPE_META[node.type];
                    const Icon = getNodeIcon(node.type);
                    const desc = node.data?.description as string | undefined;
                    return (
                      <ResultItem
                        key={`node-${node.id}`}
                        onClick={() => go("mechanism")}
                        icon={
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 border"
                            style={{
                              backgroundColor: `${meta.color}18`,
                              borderColor: `${meta.color}40`,
                            }}
                          >
                            <Icon
                              className="w-3 h-3"
                              style={{ color: meta.color }}
                              strokeWidth={2.2}
                            />
                          </div>
                        }
                        title={node.label || "未命名"}
                        tags={[
                          { text: meta.label, color: meta.color },
                          { text: graphName, muted: true },
                        ]}
                        subtitle={desc ? snippet(desc) : undefined}
                      />
                    );
                  })}
                </>
              )}

              {results.attributes.length > 0 && (
                <>
                  <SectionLabel
                    icon={<Hash className="w-3 h-3" />}
                    title={`数值属性 (${results.attributes.length})`}
                  />
                  {results.attributes.map(({ attribute }) => (
                    <ResultItem
                      key={`attr-${attribute.id}`}
                      onClick={() => go("numeric")}
                      icon={
                        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-canvas-sunken border border-line">
                          <Hash className="w-3 h-3 text-ink-secondary" />
                        </div>
                      }
                      title={attribute.name}
                      tags={[
                        {
                          text: ATTR_TYPE_LABEL[attribute.type],
                          muted: true,
                        },
                      ]}
                      subtitle={
                        attribute.value
                          ? `值：${attribute.value}${
                              attribute.unit ? " " + attribute.unit : ""
                            }`
                          : undefined
                      }
                    />
                  ))}
                </>
              )}

              {results.sections.length > 0 && (
                <>
                  <SectionLabel
                    icon={<FileText className="w-3 h-3" />}
                    title={`GDD 段落 (${results.sections.length})`}
                  />
                  {results.sections.map(({ section, docName }) => (
                    <ResultItem
                      key={`sec-${section.id}`}
                      onClick={() => go("document")}
                      icon={
                        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-canvas-sunken border border-line">
                          <FileText className="w-3 h-3 text-ink-secondary" />
                        </div>
                      }
                      title={section.title || "无标题段落"}
                      tags={[{ text: docName, muted: true }]}
                      subtitle={
                        section.content
                          ? snippet(stripHtml(section.content))
                          : undefined
                      }
                    />
                  ))}
                </>
              )}

              {results.graphs.length > 0 && (
                <>
                  <SectionLabel
                    icon={<Network className="w-3 h-3" />}
                    title={`机制图 (${results.graphs.length})`}
                  />
                  {results.graphs.map(({ graph }) => (
                    <ResultItem
                      key={`graph-${graph.id}`}
                      onClick={() => go("mechanism")}
                      icon={
                        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-canvas-sunken border border-line">
                          <Network className="w-3 h-3 text-ink-secondary" />
                        </div>
                      }
                      title={graph.name}
                      tags={[
                        {
                          text: graph.type === "node_graph" ? "节点图" : "循环图",
                          muted: true,
                        },
                      ]}
                    />
                  ))}
                </>
              )}

              {results.sheets.length > 0 && (
                <>
                  <SectionLabel
                    icon={<Calculator className="w-3 h-3" />}
                    title={`数值表 (${results.sheets.length})`}
                  />
                  {results.sheets.map(({ sheet }) => (
                    <ResultItem
                      key={`sheet-${sheet.id}`}
                      onClick={() => go("numeric")}
                      icon={
                        <div className="w-6 h-6 rounded flex items-center justify-center flex-shrink-0 bg-canvas-sunken border border-line">
                          <Table className="w-3 h-3 text-ink-secondary" />
                        </div>
                      }
                      title={sheet.name}
                    />
                  ))}
                </>
              )}
            </div>
          ) : (
            <div className="px-4 py-10 text-center text-sm text-ink-muted">
              未找到匹配 “{debouncedQuery}” 的结果
            </div>
          )
        )}

        {/* 无数据时的空状态 */}
        {!loading && !data && open && (
          <div className="px-4 py-10 text-center text-sm text-ink-muted">
            暂无可搜索的数据
          </div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="flex items-center justify-between px-4 py-2 border-t border-line-subtle text-2xs text-ink-muted">
        <span>搜索范围：当前项目</span>
        <span>点击结果跳转到对应模块</span>
      </div>
    </Modal>
  );
}

/** 分组小标题 */
function SectionLabel({
  icon,
  title,
}: {
  icon: React.ReactNode;
  title: string;
}) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-2 pb-1 text-2xs font-medium text-ink-muted uppercase tracking-wider">
      {icon}
      {title}
    </div>
  );
}

/** 结果项 */
function ResultItem({
  icon,
  title,
  tags = [],
  subtitle,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  tags?: { text: string; color?: string; muted?: boolean }[];
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-canvas-sunken transition-colors"
    >
      {icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-ink-primary truncate">
            {title}
          </span>
          {tags.map((tag, i) => (
            <span
              key={i}
              className={cn(
                "text-2xs px-1 rounded flex-shrink-0",
                tag.muted
                  ? "text-ink-muted bg-canvas-sunken"
                  : "bg-canvas-sunken"
              )}
              style={
                !tag.muted && tag.color
                  ? { color: tag.color, backgroundColor: `${tag.color}1A` }
                  : undefined
              }
            >
              {tag.text}
            </span>
          ))}
        </div>
        {subtitle && (
          <div className="text-2xs text-ink-muted truncate mt-0.5">
            {subtitle}
          </div>
        )}
      </div>
    </button>
  );
}

/** 最近编辑分组 */
function RecentGroup({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: { id: string; title: string; onClick: () => void }[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="px-2 pb-1">
      <div className="flex items-center gap-1.5 px-2 py-1 text-2xs font-medium text-ink-muted">
        {icon}
        {label}
      </div>
      <div className="space-y-0.5">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs text-ink-secondary hover:text-ink-primary hover:bg-canvas-sunken transition-colors"
          >
            <span className="flex-1 truncate">{item.title}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
