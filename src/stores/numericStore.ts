import { create } from "zustand";
import { db } from "@/db";
import { generateId } from "@/lib/id";
import { now } from "@/lib/time";
import { useHistoryStore } from "./historyStore";
import type {
  NumericSheet,
  Attribute,
  Formula,
  AttributeType,
} from "@/types";

interface NumericState {
  sheets: NumericSheet[];
  currentSheetId: string | null;
  attributes: Attribute[];
  formulas: Formula[];
  selectedAttributeId: string | null;
  loading: boolean;

  loadSheets: (projectId: string) => Promise<void>;
  createSheet: (projectId: string, name: string) => Promise<NumericSheet>;
  deleteSheet: (id: string) => Promise<void>;
  selectSheet: (id: string | null) => Promise<void>;

  addAttribute: (
    parentId: string | null,
    name: string,
    type: AttributeType
  ) => Promise<Attribute>;
  updateAttribute: (id: string, updates: Partial<Attribute>) => Promise<void>;
  removeAttribute: (id: string) => Promise<void>;
  moveAttribute: (id: string, newParentId: string | null) => Promise<void>;

  updateFormula: (
    attributeId: string,
    expression: string,
    description?: string
  ) => Promise<void>;
  getFormula: (attributeId: string) => Formula | undefined;

  setSelectedAttribute: (id: string | null) => void;
  getAttribute: (id: string) => Attribute | undefined;
  getChildren: (parentId: string | null) => Attribute[];
}

export const useNumericStore = create<NumericState>((set, get) => ({
  sheets: [],
  currentSheetId: null,
  attributes: [],
  formulas: [],
  selectedAttributeId: null,
  loading: false,

  loadSheets: async (projectId) => {
    set({ loading: true });
    try {
      const sheets = await db.numericSheets
        .where("projectId")
        .equals(projectId)
        .toArray();
      sheets.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ sheets, loading: false });
      // 自愈 currentSheetId：若指向已不存在的数值表，则回退到首个
      const current = get().currentSheetId;
      if (current && !sheets.find((s) => s.id === current)) {
        set({ currentSheetId: sheets[0]?.id ?? null });
      }
    } catch (e) {
      console.error("加载数值表失败:", e);
      set({ loading: false });
    }
  },

  createSheet: async (projectId, name) => {
    const sheet: NumericSheet = {
      id: generateId("sheet"),
      projectId,
      name: name.trim() || "未命名数值表",
      createdAt: now(),
      updatedAt: now(),
    };
    await db.numericSheets.add(sheet);
    set({ sheets: [sheet, ...get().sheets] });
    useHistoryStore.getState().push({
      description: `创建数值表 ${sheet.name}`,
      undo: async () => {
        await db.numericSheets.delete(sheet.id);
        set({ sheets: get().sheets.filter((s) => s.id !== sheet.id) });
      },
      redo: async () => {
        await db.numericSheets.add(sheet);
        set({ sheets: [sheet, ...get().sheets] });
      },
    });
    return sheet;
  },

  deleteSheet: async (id) => {
    const deletedSheet = get().sheets.find((s) => s.id === id);
    if (!deletedSheet) return;
    // 保存被级联删除的 attributes 和 formulas 快照，便于撤销恢复
    const deletedAttrs = await db.attributes.where("sheetId").equals(id).toArray();
    const deletedFormulas = await db.formulas.where("sheetId").equals(id).toArray();
    const prevCurrentSheetId = get().currentSheetId;
    const prevAttributes = get().attributes;
    const prevFormulas = get().formulas;
    await db.transaction("rw", [db.numericSheets, db.attributes, db.formulas], async () => {
      await db.attributes.where("sheetId").equals(id).delete();
      await db.formulas.where("sheetId").equals(id).delete();
      await db.numericSheets.delete(id);
    });
    set({
      sheets: get().sheets.filter((s) => s.id !== id),
      currentSheetId: get().currentSheetId === id ? null : get().currentSheetId,
      attributes: get().currentSheetId === id ? [] : get().attributes,
      formulas: get().currentSheetId === id ? [] : get().formulas,
    });
    useHistoryStore.getState().push({
      description: `删除数值表 ${deletedSheet.name}`,
      undo: async () => {
        await db.transaction("rw", [db.numericSheets, db.attributes, db.formulas], async () => {
          await db.numericSheets.add(deletedSheet);
          await db.attributes.bulkAdd(deletedAttrs);
          if (deletedFormulas.length > 0) await db.formulas.bulkAdd(deletedFormulas);
        });
        // 仅当被删除的是当前数值表时才恢复 currentSheetId/attributes/formulas，
        // 否则保留用户在删除后可能发生的导航切换
        if (prevCurrentSheetId === id) {
          set({
            sheets: [deletedSheet, ...get().sheets.filter((s) => s.id !== id)],
            currentSheetId: prevCurrentSheetId,
            attributes: prevAttributes,
            formulas: prevFormulas,
          });
        } else {
          set({
            sheets: [deletedSheet, ...get().sheets.filter((s) => s.id !== id)],
          });
        }
      },
      redo: async () => {
        await db.transaction("rw", [db.numericSheets, db.attributes, db.formulas], async () => {
          await db.attributes.where("sheetId").equals(id).delete();
          await db.formulas.where("sheetId").equals(id).delete();
          await db.numericSheets.delete(id);
        });
        set({
          sheets: get().sheets.filter((s) => s.id !== id),
          currentSheetId: get().currentSheetId === id ? null : get().currentSheetId,
          attributes: get().currentSheetId === id ? [] : get().attributes,
          formulas: get().currentSheetId === id ? [] : get().formulas,
        });
      },
    });
  },

  selectSheet: async (id) => {
    if (!id) {
      set({ currentSheetId: null, attributes: [], formulas: [], selectedAttributeId: null });
      return;
    }
    set({ currentSheetId: id, selectedAttributeId: null, loading: true });
    try {
      const [attributes, formulas] = await Promise.all([
        db.attributes.where("sheetId").equals(id).toArray(),
        db.formulas.where("sheetId").equals(id).toArray(),
      ]);
      attributes.sort((a, b) => a.order - b.order);
      set({ attributes, formulas, loading: false });
    } catch (e) {
      console.error("加载数值表数据失败:", e);
      set({ loading: false });
    }
  },

  addAttribute: async (parentId, name, type) => {
    const sheetId = get().currentSheetId;
    if (!sheetId) throw new Error("未选择数值表");

    const siblings = get().attributes.filter((a) => a.parentId === parentId);
    const order = siblings.length;

    const attribute: Attribute = {
      id: generateId("attr"),
      sheetId,
      name: name.trim() || "新属性",
      type,
      value: type === "number" ? "0" : type === "bool" ? "false" : "",
      parentId,
      order,
    };

    await db.attributes.add(attribute);
    await db.numericSheets.update(sheetId, { updatedAt: now() });
    set({ attributes: [...get().attributes, attribute] });
    useHistoryStore.getState().push({
      description: `添加属性 ${attribute.name}`,
      undo: async () => {
        await db.attributes.delete(attribute.id);
        set({ attributes: get().attributes.filter((a) => a.id !== attribute.id) });
      },
      redo: async () => {
        await db.attributes.add(attribute);
        set({ attributes: [...get().attributes, attribute] });
      },
    });
    return attribute;
  },

  updateAttribute: async (id, updates) => {
    const prev = get().attributes.find((a) => a.id === id);
    if (!prev) return;
    await db.attributes.update(id, updates);
    const sheetId = get().currentSheetId;
    if (sheetId) {
      await db.numericSheets.update(sheetId, { updatedAt: now() });
    }
    set({
      attributes: get().attributes.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    });
    useHistoryStore.getState().push({
      description: `修改属性 ${prev.name}`,
      undo: async () => {
        await db.attributes.update(id, prev);
        set({
          attributes: get().attributes.map((a) => (a.id === id ? prev : a)),
        });
      },
      redo: async () => {
        const merged = { ...prev, ...updates };
        await db.attributes.update(id, updates);
        set({
          attributes: get().attributes.map((a) => (a.id === id ? merged : a)),
        });
      },
    });
  },

  removeAttribute: async (id) => {
    // 递归删除子属性
    const allAttrs = get().attributes;
    const toDelete: string[] = [id];
    const collectChildren = (parentId: string) => {
      allAttrs
        .filter((a) => a.parentId === parentId)
        .forEach((a) => {
          toDelete.push(a.id);
          collectChildren(a.id);
        });
    };
    collectChildren(id);

    // 保存删除前的快照（属性 + 公式），便于撤销
    const deletedAttrs = get().attributes.filter((a) => toDelete.includes(a.id));
    const deletedFormulas = get().formulas.filter((f) =>
      toDelete.includes(f.attributeId)
    );

    await db.transaction("rw", [db.attributes, db.formulas], async () => {
      await db.attributes.bulkDelete(toDelete);
      const formulaIds = deletedFormulas.map((f) => f.id);
      await db.formulas.bulkDelete(formulaIds);
    });

    set({
      attributes: get().attributes.filter((a) => !toDelete.includes(a.id)),
      formulas: get().formulas.filter(
        (f) => !toDelete.includes(f.attributeId)
      ),
      selectedAttributeId:
        get().selectedAttributeId === id ? null : get().selectedAttributeId,
    });
    const firstName = deletedAttrs[0]?.name ?? "属性";
    useHistoryStore.getState().push({
      description: `删除属性 ${firstName}`,
      undo: async () => {
        await db.attributes.bulkAdd(deletedAttrs);
        if (deletedFormulas.length > 0) await db.formulas.bulkAdd(deletedFormulas);
        set({
          attributes: [...get().attributes, ...deletedAttrs],
          formulas: [...get().formulas, ...deletedFormulas],
        });
      },
      redo: async () => {
        await db.attributes.bulkDelete(toDelete);
        const formulaIds = deletedFormulas.map((f) => f.id);
        await db.formulas.bulkDelete(formulaIds);
        set({
          attributes: get().attributes.filter((a) => !toDelete.includes(a.id)),
          formulas: get().formulas.filter(
            (f) => !toDelete.includes(f.attributeId)
          ),
        });
      },
    });
  },

  moveAttribute: async (id, newParentId) => {
    const prev = get().attributes.find((a) => a.id === id);
    if (!prev) return;
    const oldParentId = prev.parentId;
    await db.attributes.update(id, { parentId: newParentId });
    set({
      attributes: get().attributes.map((a) =>
        a.id === id ? { ...a, parentId: newParentId } : a
      ),
    });
    useHistoryStore.getState().push({
      description: `移动属性 ${prev.name}`,
      undo: async () => {
        await db.attributes.update(id, { parentId: oldParentId });
        set({
          attributes: get().attributes.map((a) =>
            a.id === id ? { ...a, parentId: oldParentId } : a
          ),
        });
      },
      redo: async () => {
        await db.attributes.update(id, { parentId: newParentId });
        set({
          attributes: get().attributes.map((a) =>
            a.id === id ? { ...a, parentId: newParentId } : a
          ),
        });
      },
    });
  },

  updateFormula: async (attributeId, expression, description) => {
    const sheetId = get().currentSheetId;
    if (!sheetId) return;

    const existing = get().formulas.find((f) => f.attributeId === attributeId);
    if (existing) {
      const prev = { ...existing };
      const updates: Partial<Formula> = { expression };
      if (description !== undefined) updates.description = description;
      await db.formulas.update(existing.id, updates);
      const merged = { ...existing, ...updates };
      set({
        formulas: get().formulas.map((f) =>
          f.id === existing.id ? merged : f
        ),
      });
      useHistoryStore.getState().push({
        description: `修改公式`,
        undo: async () => {
          await db.formulas.update(existing.id, prev);
          set({
            formulas: get().formulas.map((f) =>
              f.id === existing.id ? prev : f
            ),
          });
        },
        redo: async () => {
          await db.formulas.update(existing.id, updates);
          set({
            formulas: get().formulas.map((f) =>
              f.id === existing.id ? merged : f
            ),
          });
        },
      });
    } else {
      const formula: Formula = {
        id: generateId("formula"),
        sheetId,
        attributeId,
        expression,
        description,
      };
      await db.formulas.add(formula);
      set({ formulas: [...get().formulas, formula] });
      useHistoryStore.getState().push({
        description: `添加公式`,
        undo: async () => {
          await db.formulas.delete(formula.id);
          set({ formulas: get().formulas.filter((f) => f.id !== formula.id) });
        },
        redo: async () => {
          await db.formulas.add(formula);
          set({ formulas: [...get().formulas, formula] });
        },
      });
    }
  },

  getFormula: (attributeId) => {
    return get().formulas.find((f) => f.attributeId === attributeId);
  },

  setSelectedAttribute: (id) => set({ selectedAttributeId: id }),

  getAttribute: (id) => get().attributes.find((a) => a.id === id),

  getChildren: (parentId) =>
    get()
      .attributes.filter((a) => a.parentId === parentId)
      .sort((a, b) => a.order - b.order),
}));
