import { create } from "zustand";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import type { Project, ProjectTemplate } from "@/types";

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  loading: boolean;

  loadProjects: () => Promise<void>;
  createProject: (
    name: string,
    description: string,
    template: ProjectTemplate
  ) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  setCurrentProject: (project: Project | null) => void;
  updateProject: (id: string, updates: Partial<Project>) => Promise<void>;
  getProject: (id: string) => Promise<Project | undefined>;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  currentProject: null,
  loading: false,

  loadProjects: async () => {
    set({ loading: true });
    try {
      const projects = await db.projects.orderBy("updatedAt").reverse().toArray();
      set({ projects, loading: false });
    } catch (e) {
      console.error("加载项目列表失败:", e);
      set({ loading: false });
    }
  },

  createProject: async (name, description, template) => {
    const project: Project = {
      id: generateId("proj"),
      name: name.trim() || "未命名项目",
      description: description.trim(),
      template,
      createdAt: now(),
      updatedAt: now(),
    };
    await db.projects.add(project);
    set({ projects: [project, ...get().projects] });
    return project;
  },

  deleteProject: async (id) => {
    // 级联删除项目下所有数据
    await db.transaction(
      "rw",
      [
        db.projects,
        db.mechanismGraphs,
        db.graphNodes,
        db.graphEdges,
        db.numericSheets,
        db.attributes,
        db.formulas,
        db.gddDocuments,
        db.docSections,
        db.aiConversations,
        db.aiMessages,
        db.snapshots,
        db.nodeGroups,
        db.comments,
        db.inspirations,
        db.coreLoops,
        db.gameMoments,
        db.gameRules,
        db.interactionMatrices,
        db.levelFlows,
      ],
      async () => {
        // 删除机制图相关
        const graphs = await db.mechanismGraphs
          .where("projectId")
          .equals(id)
          .toArray();
        const graphIds = graphs.map((g) => g.id);
        for (const g of graphs) {
          await db.graphNodes.where("graphId").equals(g.id).delete();
          await db.graphEdges.where("graphId").equals(g.id).delete();
        }
        await db.mechanismGraphs.where("projectId").equals(id).delete();

        // 删除数值表相关
        const sheets = await db.numericSheets
          .where("projectId")
          .equals(id)
          .toArray();
        for (const s of sheets) {
          await db.attributes.where("sheetId").equals(s.id).delete();
          await db.formulas.where("sheetId").equals(s.id).delete();
        }
        await db.numericSheets.where("projectId").equals(id).delete();

        // 删除文档相关
        const docs = await db.gddDocuments.where("projectId").equals(id).toArray();
        for (const d of docs) {
          await db.docSections.where("docId").equals(d.id).delete();
        }
        await db.gddDocuments.where("projectId").equals(id).delete();

        // 先取 aiConversations 的 id 集合，供后续按 conversationId 删除 aiMessages
        const aiConvs = await db.aiConversations
          .where("projectId")
          .equals(id)
          .toArray();
        const convIds = aiConvs.map((c) => c.id);

        // 删除节点分组（按 graphId 批量）
        if (graphIds.length) {
          await db.nodeGroups.where("graphId").anyOf(graphIds).delete();
        }

        // 删除评论批注
        await db.comments.where("projectId").equals(id).delete();

        // 删除灵感便签
        await db.inspirations.where("projectId").equals(id).delete();

        // 删除玩法设计相关
        await db.coreLoops.where("projectId").equals(id).delete();
        await db.gameMoments.where("projectId").equals(id).delete();
        await db.gameRules.where("projectId").equals(id).delete();
        await db.interactionMatrices.where("projectId").equals(id).delete();
        await db.levelFlows.where("projectId").equals(id).delete();

        // 删除 AI 对话相关：先删 conversations，再按 convIds 删 messages
        await db.aiConversations.where("projectId").equals(id).delete();
        if (convIds.length) {
          await db.aiMessages
            .where("conversationId")
            .anyOf(convIds)
            .delete();
        }

        // 删除快照
        await db.snapshots.where("projectId").equals(id).delete();

        // 删除项目
        await db.projects.delete(id);
      }
    );

    set({
      projects: get().projects.filter((p) => p.id !== id),
      currentProject:
        get().currentProject?.id === id ? null : get().currentProject,
    });
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  updateProject: async (id, updates) => {
    const updated = { ...updates, updatedAt: now() };
    await db.projects.update(id, updated);
    set({
      projects: get().projects.map((p) =>
        p.id === id ? { ...p, ...updated } : p
      ),
      currentProject:
        get().currentProject?.id === id
          ? { ...get().currentProject!, ...updated }
          : get().currentProject,
    });
  },

  getProject: async (id) => {
    return db.projects.get(id);
  },
}));
