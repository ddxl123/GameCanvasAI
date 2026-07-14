import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "@/components/ui/Modal";
import { db } from "@/db";
import { generateId, generateNodeId, generateEdgeId } from "@/lib/id";
import { now } from "@/lib/time";
import { useProjectStore } from "@/stores/projectStore";
import { useUIStore } from "@/stores/uiStore";
import { useHistoryStore } from "@/stores/historyStore";
import {
  CASE_LIBRARY,
  CASE_CATEGORY_LABEL,
  CASE_CATEGORY_COLOR,
  type CaseTemplate,
} from "@/data/caseLibrary";
import type { ProjectTemplate } from "@/types";
import { cn } from "@/lib/utils";
import { Loader2, Sparkles, Tag, BookOpen, Library } from "lucide-react";

// 案例分类 → 项目模板映射（ProjectTemplate 仅支持 blank/combat/economy/rpg）
const CATEGORY_TO_TEMPLATE: Record<CaseTemplate["category"], ProjectTemplate> = {
  roguelike: "rpg",
  soulslike: "combat",
  deckbuilder: "rpg",
  rpg: "rpg",
  economy: "economy",
  combat: "combat",
};

// 顶部分类筛选项
const CATEGORY_FILTERS: Array<{
  value: "all" | CaseTemplate["category"];
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "roguelike", label: "Roguelike" },
  { value: "soulslike", label: "Soulslike" },
  { value: "deckbuilder", label: "Deck Builder" },
  { value: "rpg", label: "RPG" },
  { value: "economy", label: "经济" },
  { value: "combat", label: "战斗" },
];

interface CaseLibraryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function CaseLibraryDialog({
  open,
  onOpenChange,
}: CaseLibraryDialogProps) {
  const navigate = useNavigate();
  const createProject = useProjectStore((s) => s.createProject);
  const addToast = useUIStore((s) => s.addToast);
  const [filter, setFilter] = useState<"all" | CaseTemplate["category"]>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const filtered =
    filter === "all"
      ? CASE_LIBRARY
      : CASE_LIBRARY.filter((c) => c.category === filter);

  const selectedCase = selectedId
    ? CASE_LIBRARY.find((c) => c.id === selectedId) ?? null
    : null;

  const handleImport = async (caseTpl: CaseTemplate) => {
    setImporting(true);
    try {
      // 1. 创建项目（按案例分类映射到 ProjectTemplate）
      const template = CATEGORY_TO_TEMPLATE[caseTpl.category];
      const projectName = `${caseTpl.source}·${caseTpl.name}`;
      const project = await createProject(
        projectName,
        caseTpl.description,
        template
      );

      // 2-5. 在一个事务里导入：机制图/节点/边 + 数值表/属性/公式
      const ts = now();
      await db.transaction(
        "rw",
        [
          db.mechanismGraphs,
          db.graphNodes,
          db.graphEdges,
          db.numericSheets,
          db.attributes,
          db.formulas,
        ],
        async () => {
          // 2. 创建机制图（每个案例 1 张）
          for (const graphDef of caseTpl.graphs) {
            const graphId = generateId("graph");
            await db.mechanismGraphs.add({
              id: graphId,
              projectId: project.id,
              name: graphDef.name,
              type: graphDef.type,
              createdAt: ts,
              updatedAt: ts,
            });

            // 3. 按模板创建节点和边（sourceIndex/targetIndex → 实际 id）
            const nodeIds: string[] = [];
            for (const nodeDef of graphDef.nodes) {
              const nodeId = generateNodeId();
              nodeIds.push(nodeId);
              await db.graphNodes.add({
                id: nodeId,
                graphId,
                type: nodeDef.type,
                label: nodeDef.label,
                data: nodeDef.data ?? {},
                position: nodeDef.position,
              });
            }
            for (const edgeDef of graphDef.edges) {
              const source = nodeIds[edgeDef.sourceIndex];
              const target = nodeIds[edgeDef.targetIndex];
              if (!source || !target) continue;
              await db.graphEdges.add({
                id: generateEdgeId(),
                graphId,
                source,
                target,
                type: edgeDef.type,
                label: edgeDef.label,
              });
            }
          }

          // 4. 创建数值表
          const sheetId = generateId("sheet");
          await db.numericSheets.add({
            id: sheetId,
            projectId: project.id,
            name: "主数值表",
            createdAt: ts,
            updatedAt: ts,
          });

          // 5. 创建属性和公式（attrName 匹配属性名）
          const nameToAttrId = new Map<string, string>();
          for (let i = 0; i < caseTpl.attributes.length; i++) {
            const attrDef = caseTpl.attributes[i];
            const attrId = generateId("attr");
            nameToAttrId.set(attrDef.name, attrId);
            await db.attributes.add({
              id: attrId,
              sheetId,
              name: attrDef.name,
              type: attrDef.type,
              value: attrDef.value,
              unit: attrDef.unit,
              description: attrDef.description,
              parentId: null,
              order: i,
            });
          }
          for (const formulaDef of caseTpl.formulas) {
            const attrId = nameToAttrId.get(formulaDef.attrName);
            if (!attrId) continue;
            await db.formulas.add({
              id: generateId("formula"),
              sheetId,
              attributeId: attrId,
              expression: formulaDef.expression,
              description: formulaDef.description,
            });
          }
        }
      );

      // 清空历史栈，避免案例导入操作被逐条撤销
      useHistoryStore.getState().clear();

      addToast({
        title: "案例导入成功",
        description: projectName,
        variant: "success",
      });

      onOpenChange(false);
      setSelectedId(null);
      // 6. 跳转到新项目
      navigate(`/project/${project.id}/mechanism`);
    } catch (e) {
      addToast({
        title: "导入失败",
        description: e instanceof Error ? e.message : "未知错误",
        variant: "error",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = (next: boolean) => {
    if (importing) return;
    if (!next) setSelectedId(null);
    onOpenChange(next);
  };

  return (
    <Modal
      open={open}
      onOpenChange={handleClose}
      title="经典机制案例库"
      description="从业界知名游戏中选取机制拆解案例，一键导入为新项目"
      className="max-w-3xl"
    >
      <div className="space-y-4">
        {/* 分类筛选 */}
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_FILTERS.map((f) => {
            const active = filter === f.value;
            return (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "px-2.5 py-1 rounded-md text-2xs font-medium transition-all border",
                  active
                    ? "bg-accent-glow text-accent border-accent/40"
                    : "bg-canvas-sunken text-ink-muted hover:text-ink-primary border-transparent"
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* 案例卡片网格 */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-ink-muted">
            <Library className="w-8 h-8 mx-auto mb-2 opacity-40" />
            该分类下暂无案例
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1 -mr-1">
            {filtered.map((c) => {
              const color = CASE_CATEGORY_COLOR[c.category];
              const active = selectedId === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(active ? null : c.id)}
                  className={cn(
                    "group text-left p-3 rounded-lg border bg-canvas-elevated transition-all",
                    active
                      ? "border-accent"
                      : "border-line hover:border-line-strong"
                  )}
                  style={
                    active
                      ? { boxShadow: `0 0 0 1px ${color}40, 0 4px 16px ${color}20` }
                      : undefined
                  }
                >
                  {/* 顶部：分类标签 + 来源 */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded text-2xs font-medium"
                      style={{
                        color,
                        backgroundColor: `${color}15`,
                        border: `1px solid ${color}33`,
                      }}
                    >
                      {CASE_CATEGORY_LABEL[c.category]}
                    </span>
                    <span className="text-2xs text-ink-muted">·</span>
                    <span className="text-2xs text-ink-muted truncate">
                      {c.source}
                    </span>
                  </div>

                  {/* 案例名称 */}
                  <h4
                    className={cn(
                      "text-sm font-semibold truncate mb-1",
                      active
                        ? "text-accent"
                        : "text-ink-primary group-hover:text-accent"
                    )}
                  >
                    {c.name}
                  </h4>

                  {/* 描述 */}
                  <p className="text-xs text-ink-secondary line-clamp-3 min-h-[3rem]">
                    {c.description}
                  </p>

                  {/* 标签 */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.tags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-2xs text-ink-muted bg-canvas-sunken"
                      >
                        <Tag className="w-2.5 h-2.5" />
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* 案例规模信息 */}
                  <div className="flex items-center gap-2 mt-2 pt-2 border-t border-line-subtle text-2xs text-ink-muted">
                    <span className="flex items-center gap-0.5">
                      <BookOpen className="w-2.5 h-2.5" />
                      {c.graphs[0]?.nodes.length ?? 0} 节点
                    </span>
                    <span>·</span>
                    <span>{c.attributes.length} 属性</span>
                    <span>·</span>
                    <span>{c.formulas.length} 公式</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* 选中案例的操作栏 */}
        {selectedCase && (
          <div className="flex items-center justify-between gap-3 pt-3 border-t border-line">
            <div className="flex-1 min-w-0">
              <div className="text-2xs text-ink-muted">已选案例</div>
              <div className="text-sm font-medium text-ink-primary truncate">
                {selectedCase.source}·{selectedCase.name}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setSelectedId(null)}
                disabled={importing}
                className="btn-secondary"
              >
                取消
              </button>
              <button
                onClick={() => handleImport(selectedCase)}
                disabled={importing}
                className="btn-primary"
                style={{
                  background: `linear-gradient(135deg, ${CASE_CATEGORY_COLOR[selectedCase.category]}, ${CASE_CATEGORY_COLOR[selectedCase.category]}CC)`,
                }}
              >
                {importing ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    正在导入...
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    确认导入
                  </span>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
