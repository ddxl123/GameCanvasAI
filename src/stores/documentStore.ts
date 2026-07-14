import { create } from "zustand";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import { useHistoryStore } from "./historyStore";
import type { GDDDocument, DocSection, DocSectionType, EmbedType } from "@/types";

interface DocumentState {
  documents: GDDDocument[];
  currentDocId: string | null;
  sections: DocSection[];
  selectedSectionId: string | null;
  loading: boolean;

  loadDocuments: (projectId: string) => Promise<void>;
  createDocument: (projectId: string, name: string) => Promise<GDDDocument>;
  deleteDocument: (id: string) => Promise<void>;
  selectDocument: (id: string | null) => Promise<void>;
  renameDocument: (id: string, name: string) => Promise<void>;

  addSection: (
    type: DocSectionType,
    title?: string,
    content?: string,
    embedType?: EmbedType,
    embedRefId?: string
  ) => Promise<DocSection>;
  updateSection: (id: string, updates: Partial<DocSection>) => Promise<void>;
  removeSection: (id: string) => Promise<void>;
  moveSection: (id: string, direction: "up" | "down") => Promise<void>;

  setSelectedSection: (id: string | null) => void;
}

export const useDocumentStore = create<DocumentState>((set, get) => ({
  documents: [],
  currentDocId: null,
  sections: [],
  selectedSectionId: null,
  loading: false,

  loadDocuments: async (projectId) => {
    set({ loading: true });
    try {
      const docs = await db.gddDocuments
        .where("projectId")
        .equals(projectId)
        .toArray();
      docs.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ documents: docs, loading: false });
      // 自愈 currentDocId：若指向已不存在的文档，则回退到首个
      const current = get().currentDocId;
      if (current && !docs.find((d) => d.id === current)) {
        set({ currentDocId: docs[0]?.id ?? null });
      }
    } catch (e) {
      console.error("加载文档失败:", e);
      set({ loading: false });
    }
  },

  createDocument: async (projectId, name) => {
    const doc: GDDDocument = {
      id: generateId("doc"),
      projectId,
      name: name.trim() || "未命名文档",
      createdAt: now(),
      updatedAt: now(),
    };
    await db.gddDocuments.add(doc);
    set({ documents: [doc, ...get().documents] });
    useHistoryStore.getState().push({
      description: `创建文档 ${doc.name}`,
      undo: async () => {
        await db.gddDocuments.delete(doc.id);
        set({ documents: get().documents.filter((d) => d.id !== doc.id) });
      },
      redo: async () => {
        await db.gddDocuments.add(doc);
        set({ documents: [doc, ...get().documents] });
      },
    });
    return doc;
  },

  deleteDocument: async (id) => {
    const deletedDoc = get().documents.find((d) => d.id === id);
    if (!deletedDoc) return;
    // 保存被级联删除的 sections 快照，便于撤销恢复
    const deletedSections = await db.docSections.where("docId").equals(id).toArray();
    const prevCurrentDocId = get().currentDocId;
    const prevSections = get().sections;
    await db.transaction("rw", [db.gddDocuments, db.docSections], async () => {
      await db.docSections.where("docId").equals(id).delete();
      await db.gddDocuments.delete(id);
    });
    set({
      documents: get().documents.filter((d) => d.id !== id),
      currentDocId: get().currentDocId === id ? null : get().currentDocId,
      sections: get().currentDocId === id ? [] : get().sections,
    });
    useHistoryStore.getState().push({
      description: `删除文档 ${deletedDoc.name}`,
      undo: async () => {
        await db.transaction("rw", [db.gddDocuments, db.docSections], async () => {
          await db.gddDocuments.add(deletedDoc);
          if (deletedSections.length > 0) await db.docSections.bulkAdd(deletedSections);
        });
        // 仅当被删除的是当前文档时才恢复 currentDocId/sections，
        // 否则保留用户在删除后可能发生的导航切换
        if (prevCurrentDocId === id) {
          set({
            documents: [deletedDoc, ...get().documents.filter((d) => d.id !== id)],
            currentDocId: prevCurrentDocId,
            sections: prevSections,
          });
        } else {
          set({
            documents: [deletedDoc, ...get().documents.filter((d) => d.id !== id)],
          });
        }
      },
      redo: async () => {
        await db.transaction("rw", [db.gddDocuments, db.docSections], async () => {
          await db.docSections.where("docId").equals(id).delete();
          await db.gddDocuments.delete(id);
        });
        set({
          documents: get().documents.filter((d) => d.id !== id),
          currentDocId: get().currentDocId === id ? null : get().currentDocId,
          sections: get().currentDocId === id ? [] : get().sections,
        });
      },
    });
  },

  selectDocument: async (id) => {
    if (!id) {
      set({
        currentDocId: null,
        sections: [],
        selectedSectionId: null,
      });
      return;
    }
    set({ currentDocId: id, selectedSectionId: null, loading: true });
    try {
      const sections = await db.docSections
        .where("docId")
        .equals(id)
        .toArray();
      sections.sort((a, b) => a.order - b.order);
      set({ sections, loading: false });
    } catch (e) {
      console.error("加载文档段落失败:", e);
      set({ loading: false });
    }
  },

  renameDocument: async (id, name) => {
    const prev = get().documents.find((d) => d.id === id);
    if (!prev) return;
    await db.gddDocuments.update(id, { name, updatedAt: now() });
    set({
      documents: get().documents.map((d) =>
        d.id === id ? { ...d, name } : d
      ),
    });
    useHistoryStore.getState().push({
      description: `重命名文档 ${name}`,
      undo: async () => {
        await db.gddDocuments.update(id, prev);
        set({
          documents: get().documents.map((d) => (d.id === id ? prev : d)),
        });
      },
      redo: async () => {
        await db.gddDocuments.update(id, { name, updatedAt: now() });
        set({
          documents: get().documents.map((d) =>
            d.id === id ? { ...d, name } : d
          ),
        });
      },
    });
  },

  addSection: async (type, title, content, embedType, embedRefId) => {
    const docId = get().currentDocId;
    if (!docId) throw new Error("未选择文档");
    const order = get().sections.length;
    const section: DocSection = {
      id: generateId("sec"),
      docId,
      title: title ?? "",
      content: content ?? "",
      type,
      embedType,
      embedRefId,
      order,
    };
    await db.docSections.add(section);
    await db.gddDocuments.update(docId, { updatedAt: now() });
    set({ sections: [...get().sections, section] });
    useHistoryStore.getState().push({
      description: `添加段落 ${type === "heading" ? title : ""}`.trim(),
      undo: async () => {
        await db.docSections.delete(section.id);
        set({ sections: get().sections.filter((s) => s.id !== section.id) });
      },
      redo: async () => {
        await db.docSections.add(section);
        set({ sections: [...get().sections, section] });
      },
    });
    return section;
  },

  updateSection: async (id, updates) => {
    const prev = get().sections.find((s) => s.id === id);
    if (!prev) return;
    await db.docSections.update(id, updates);
    const docId = get().currentDocId;
    if (docId) {
      await db.gddDocuments.update(docId, { updatedAt: now() });
    }
    set({
      sections: get().sections.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    });
    useHistoryStore.getState().push({
      description: `修改段落`,
      undo: async () => {
        await db.docSections.update(id, prev);
        set({
          sections: get().sections.map((s) => (s.id === id ? prev : s)),
        });
      },
      redo: async () => {
        const merged = { ...prev, ...updates };
        await db.docSections.update(id, updates);
        set({
          sections: get().sections.map((s) => (s.id === id ? merged : s)),
        });
      },
    });
  },

  removeSection: async (id) => {
    const section = get().sections.find((s) => s.id === id);
    if (!section) return;
    await db.docSections.delete(id);
    const docId = get().currentDocId;
    if (docId) {
      await db.gddDocuments.update(docId, { updatedAt: now() });
    }
    const remaining = get()
      .sections.filter((s) => s.id !== id)
      .sort((a, b) => a.order - b.order);
    // 重排 order
    const reordered: DocSection[] = [];
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i].order !== i) {
        await db.docSections.update(remaining[i].id, { order: i });
        reordered.push({ ...remaining[i], order: i });
      } else {
        reordered.push(remaining[i]);
      }
    }
    set({
      sections: reordered,
      selectedSectionId:
        get().selectedSectionId === id ? null : get().selectedSectionId,
    });
    useHistoryStore.getState().push({
      description: `删除段落 ${section.type === "heading" ? section.title : ""}`.trim(),
      undo: async () => {
        await db.docSections.add(section);
        set({ sections: [...get().sections, section] });
      },
      redo: async () => {
        await db.docSections.delete(id);
        set({ sections: get().sections.filter((s) => s.id !== id) });
      },
    });
  },

  moveSection: async (id, direction) => {
    const sections = [...get().sections].sort((a, b) => a.order - b.order);
    const idx = sections.findIndex((s) => s.id === id);
    if (idx === -1) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sections.length) return;
    const a = sections[idx];
    const b = sections[swapIdx];
    // 保存交换前的 order 值，便于撤销恢复
    const aOldOrder = a.order;
    const bOldOrder = b.order;
    await db.docSections.update(a.id, { order: bOldOrder });
    await db.docSections.update(b.id, { order: aOldOrder });
    const newSections = sections.map((s) => {
      if (s.id === a.id) return { ...s, order: bOldOrder };
      if (s.id === b.id) return { ...s, order: aOldOrder };
      return s;
    });
    newSections.sort((x, y) => x.order - y.order);
    set({ sections: newSections });
    useHistoryStore.getState().push({
      description: direction === "up" ? `上移段落` : `下移段落`,
      undo: async () => {
        await db.docSections.update(a.id, { order: aOldOrder });
        await db.docSections.update(b.id, { order: bOldOrder });
        set({
          sections: get()
            .sections.map((s) => {
              if (s.id === a.id) return { ...s, order: aOldOrder };
              if (s.id === b.id) return { ...s, order: bOldOrder };
              return s;
            })
            .sort((x, y) => x.order - y.order),
        });
      },
      redo: async () => {
        await db.docSections.update(a.id, { order: bOldOrder });
        await db.docSections.update(b.id, { order: aOldOrder });
        set({
          sections: get()
            .sections.map((s) => {
              if (s.id === a.id) return { ...s, order: bOldOrder };
              if (s.id === b.id) return { ...s, order: aOldOrder };
              return s;
            })
            .sort((x, y) => x.order - y.order),
        });
      },
    });
  },

  setSelectedSection: (id) => set({ selectedSectionId: id }),
}));
