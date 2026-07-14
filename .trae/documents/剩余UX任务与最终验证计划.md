# 剩余 UX 任务（7.4 / 7.7 / 7.8）与最终验证计划

## 摘要

本计划覆盖前序全面深度修复中剩余的 3 个 UX 子任务 + 最终验证：
- **7.4** 命令面板焦点恢复
- **7.7** 快捷键速查表（`?` 触发）+ CanvasToolbar kbd 标签
- **7.8** 全局搜索快捷键 Cmd+P → Cmd+Shift+F
- **最终验证** `npm run check && npm run build && npm run lint` 全绿 + 关键手动验证

完成后，前序 60+ 问题全部修复收口。

---

## 当前状态分析

### 7.4 命令面板焦点恢复
- 文件：`src/features/command/CommandPalette.tsx`
- 现状：L374-382 的 `useEffect` 在 `commandPaletteOpen` 变为 true 时聚焦 input，但关闭时**未恢复**先前焦点元素，导致焦点丢失到 `<body>`。
- 焦点丢失影响：键盘用户关闭命令面板后需重新 Tab 定位，违反 WAI-ARIA 焦点管理规范。

### 7.7 快捷键速查表 + CanvasToolbar kbd
- 文件：`src/features/canvas/CanvasToolbar.tsx`、`src/features/canvas/ReactFlowCanvas.tsx`、`src/components/layout/ProjectLayout.tsx`
- 现状：
  - CanvasToolbar 4 个按钮（缩小/放大/适应视图/重置布局）**无任何键盘快捷键**。
  - ReactFlowCanvas L237-252 已有 `handleZoomIn/handleZoomOut/handleFitView/handleResetLayout` 四个回调。
  - 全局快捷键散落在 `ProjectLayout` (L115-130) 和 `useHistoryShortcuts`，用户无集中查看入口。
  - 无 `?` 键触发速查表的实现。

### 7.8 搜索快捷键冲突
- 文件：`src/components/layout/ProjectLayout.tsx`
- 现状（L115-130）：
  ```ts
  if (e.key === "k" && !e.shiftKey) { setCommandPaletteOpen(true); }      // Cmd+K → 命令面板
  if (e.key === "p" || (e.key === "k" && e.shiftKey)) { setSearchOpen(true); }  // Cmd+P 或 Cmd+Shift+K → 搜索
  ```
- 问题：`Cmd+P` 与浏览器打印快捷键冲突；`Cmd+Shift+K` 与 `Cmd+K` 语义混淆。
- 搜索按钮 title（L288）写的 `Cmd+P` 需同步更新。

### 最终验证
- 前序已完成：6.1/1/2/3/4/5/8、6.2-6.5、7.1-7.3、7.5-7.6、7.9-7.10
- 剩余：`npm run check && npm run build && npm run lint` 三连 + 手动验证清单

---

## 拟定变更

### 变更 1：7.4 命令面板焦点恢复

**文件**：`src/features/command/CommandPalette.tsx`

**改动**：
1. 新增 `const previousFocusRef = useRef<HTMLElement | null>(null);`
2. 修改 L374-382 的 `useEffect`：
   - 打开时（`commandPaletteOpen` 为 true）：先记录 `previousFocusRef.current = document.activeElement as HTMLElement | null;`，再聚焦 input
   - 关闭时（`commandPaletteOpen` 为 false）：调用 `previousFocusRef.current?.focus()`，并清空 ref
3. 用 `requestAnimationFrame` 包裹恢复焦点，确保 Modal 关闭动画完成后再 focus（Radix Dialog 卸载时机）

**伪代码**：
```tsx
const previousFocusRef = useRef<HTMLElement | null>(null);

useEffect(() => {
  if (commandPaletteOpen) {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    setQuery("");
    setSelectedIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  } else {
    // 关闭后恢复焦点
    const prev = previousFocusRef.current;
    if (prev && typeof prev.focus === "function") {
      requestAnimationFrame(() => {
        prev.focus();
        previousFocusRef.current = null;
      });
    }
  }
}, [commandPaletteOpen]);
```

**注意**：Radix Dialog 默认会尝试恢复焦点，但这里 inputRef 手动 focus 会干扰其行为。通过显式记录+恢复，保证焦点回到触发命令面板的按钮（如顶部栏 Cmd+K 按钮或其他元素）。

---

### 变更 2：7.8 搜索快捷键改 Cmd+Shift+F

**文件**：`src/components/layout/ProjectLayout.tsx`

**改动 L115-130 的 keydown handler**：
```ts
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;
    // Cmd+K → 命令面板
    if (e.key === "k" && !e.shiftKey) {
      e.preventDefault();
      setCommandPaletteOpen(true);
    }
    // Cmd+Shift+F → 全局搜索（替代原 Cmd+P / Cmd+Shift+K）
    if (e.key === "f" && e.shiftKey) {
      e.preventDefault();
      setSearchOpen(true);
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [setCommandPaletteOpen]);
```

**同步更新搜索按钮 title/aria-label（L288-289）**：
```tsx
title="全局搜索 (Cmd+Shift+F)"
aria-label="全局搜索 (Cmd+Shift+F)"
```

**移除项**：
- 删除 `e.key === "p"` 分支
- 删除 `e.key === "k" && e.shiftKey` 分支（Cmd+Shift+K 不再触发搜索，保持 Cmd+K 唯一入口）

**底部状态栏 Tip（L515）**：`"Tip: Cmd+K 打开命令面板"` 保持不变（仍准确）。

---

### 变更 3：7.7 CanvasToolbar kbd 标签 + 画布快捷键绑定

**决策**：为 4 个画布工具栏按钮分配**无修饰键**的裸键快捷键（避免与浏览器 Cmd 组合冲突），仅在非编辑态触发。这是 Figma/Whimsical 等设计工具的通行约定。

**分配**：
| 按钮 | 快捷键 | 说明 |
|------|--------|------|
| 放大 | `=` | 裸键，等同 `+`（无需 Shift） |
| 缩小 | `-` | 裸键 |
| 适应视图 | `0` | 裸键 |
| 重置布局 | `R`（Shift+R） | 大写 R，需 Shift |

#### 3a. CanvasToolbar 显示 kbd 标签

**文件**：`src/features/canvas/CanvasToolbar.tsx`

在 4 个按钮内追加 `<kbd>` 标签。按钮布局从纯图标改为图标+kbd 两行（或图标右上角小 kbd）。采用**按钮内底部小字 kbd**方案：

```tsx
const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="font-mono text-3xs text-ink-muted/70 leading-none">
    {children}
  </kbd>
);

// 每个按钮结构改为：
<button onClick={onZoomIn} className={btnClass} title="放大 (=)" aria-label="放大 (=)">
  <div className="flex flex-col items-center gap-0.5">
    <Plus className="w-4 h-4" />
    <Kbd>=</Kbd>
  </div>
</button>
```

4 个按钮分别加 `=`, `-`, `0`, `⇧R`。

#### 3b. ReactFlowCanvas 绑定裸键快捷键

**文件**：`src/features/canvas/ReactFlowCanvas.tsx`

在组件内新增 `useEffect` 绑定 window keydown，复用已有的 `handleZoomIn/handleZoomOut/handleFitView/handleResetLayout`：

```tsx
useEffect(() => {
  const handler = (e: KeyboardEvent) => {
    // 编辑态不触发（让用户正常输入）
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
    // 有修饰键则跳过（交给浏览器/其他 handler）
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // 命令面板/搜索/弹窗打开时不触发
    if (useUIStore.getState().commandPaletteOpen) return;

    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      handleZoomIn();
    } else if (e.key === "-") {
      e.preventDefault();
      handleZoomOut();
    } else if (e.key === "0") {
      e.preventDefault();
      handleFitView();
    } else if (e.key === "R" || (e.key === "r" && e.shiftKey)) {
      // Shift+R 产生 "R"
      e.preventDefault();
      handleResetLayout();
    }
  };
  window.addEventListener("keydown", handler);
  return () => window.removeEventListener("keydown", handler);
}, [handleZoomIn, handleZoomOut, handleFitView, handleResetLayout]);
```

**注意**：需 import `useUIStore`（文件内是否已 import 需核对；若无则添加）。`handleResetLayout` 是 `useCallback` 包裹的稳定引用，可安全放入依赖数组。

---

### 变更 4：7.7 新建 ShortcutCheatsheet 组件

**新文件**：`src/features/command/ShortcutCheatsheet.tsx`

基于 `Modal` 封装，分组列出全部快捷键。Props：`{ open: boolean; onOpenChange: (v: boolean) => void }`。

**内容（全局 + 画布两组）**：

```tsx
import Modal from "@/components/ui/Modal";

const SHORTCUTS = [
  {
    group: "全局",
    items: [
      { keys: "⌘K", desc: "打开命令面板" },
      { keys: "⌘⇧F", desc: "全局搜索" },
      { keys: "⌘Z", desc: "撤销" },
      { keys: "⌘⇧Z", desc: "重做" },
      { keys: "?", desc: "打开本速查表" },
      { keys: "Esc", desc: "关闭弹窗/菜单" },
    ],
  },
  {
    group: "画布",
    items: [
      { keys: "=", desc: "放大" },
      { keys: "-", desc: "缩小" },
      { keys: "0", desc: "适应视图" },
      { keys: "⇧R", desc: "重置布局" },
      { keys: "⌘滚轮", desc: "缩放（ReactFlow 内置）" },
      { keys: "Del", desc: "删除选中节点" },
      { keys: "⌘↵", desc: "编辑节点（ElementNode 内置）" },
    ],
  },
] as const;

export default function ShortcutCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="快捷键速查表" className="max-w-lg">
      <div className="space-y-4">
        {SHORTCUTS.map((section) => (
          <div key={section.group}>
            <div className="text-2xs font-medium text-ink-muted uppercase tracking-wider mb-2">
              {section.group}
            </div>
            <div className="space-y-1">
              {section.items.map((item) => (
                <div key={item.desc} className="flex items-center justify-between py-1">
                  <span className="text-sm text-ink-secondary">{item.desc}</span>
                  <kbd className="font-mono text-xs px-1.5 py-0.5 rounded border border-line bg-canvas-sunken text-ink-muted">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}
```

### 变更 5：7.7 ProjectLayout 集成速查表 + `?` 键触发

**文件**：`src/components/layout/ProjectLayout.tsx`

**改动**：
1. 新增 state：`const [cheatsheetOpen, setCheatsheetOpen] = useState(false);`
2. import `ShortcutCheatsheet`
3. 在 L115-130 的 keydown handler 中增加 `?` 键检测（需在 `mod` 判断之前，因为 `?` 无修饰键）：
   ```ts
   useEffect(() => {
     const handler = (e: KeyboardEvent) => {
       // ? 键触发速查表（Shift+/ 产生 "?"）
       if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
         const target = e.target as HTMLElement | null;
         const tag = target?.tagName?.toLowerCase();
         // 编辑态不触发
         if (tag === "input" || tag === "textarea" || target?.isContentEditable) return;
         e.preventDefault();
         setCheatsheetOpen(true);
         return;
       }
       const mod = e.metaKey || e.ctrlKey;
       if (!mod) return;
       if (e.key === "k" && !e.shiftKey) {
         e.preventDefault();
         setCommandPaletteOpen(true);
       }
       if (e.key === "f" && e.shiftKey) {
         e.preventDefault();
         setSearchOpen(true);
       }
     };
     window.addEventListener("keydown", handler);
     return () => window.removeEventListener("keydown", handler);
   }, [setCommandPaletteOpen]);
   ```
4. 在 JSX 弹窗区域（L519-542 附近）追加：
   ```tsx
   <ShortcutCheatsheet open={cheatsheetOpen} onOpenChange={setCheatsheetOpen} />
   ```

---

## 假设与决策

1. **CanvasToolbar 裸键快捷键**：采用 `=`/`-`/`0`/`⇧R` 无修饰键方案（Figma 约定），避免与浏览器 `Cmd+=/Cmd+-/Cmd+0` 冲突。仅在非编辑态、命令面板未打开时触发。
2. **`?` 键触发**：`?` 由 `Shift+/` 产生，判断 `e.key === "?"` 即可，无需额外 shiftKey 检查。
3. **焦点恢复**：用 `requestAnimationFrame` 延迟恢复，避开 Radix Dialog 卸载时序。
4. **Cmd+Shift+K 行为**：移除后不再触发任何操作（命令面板仅 Cmd+K 单一入口），符合原计划"移除 'k' + shiftKey 的搜索触发"。
5. **速查表内容范围**：全局 + 画布两组，覆盖最常用场景；不含面板切换/Tab 导航等次要项，保持精简。
6. **不重构 exportProject 签名**：子代理前序已适配 OnboardingChecklist 的导出调用，保持现状。

---

## 验证步骤

### 自动化验证
```bash
npm run check   # tsc --noEmit，确认无类型错误
npm run build   # vite build，确认构建通过
npm run lint    # eslint，确认无 lint 错误
```

### 手动验证清单
1. **7.4 焦点恢复**：在顶部栏按 Cmd+K 打开命令面板 → Esc 关闭 → 焦点应回到顶部栏（Tab 可继续向后），而非落到 body
2. **7.8 搜索快捷键**：
   - Cmd+Shift+F 打开全局搜索
   - Cmd+P 不再打开搜索（应触发浏览器打印）
   - Cmd+Shift+K 无任何反应
   - Cmd+K 仍正常打开命令面板
   - 顶部栏搜索按钮 title 显示 `Cmd+Shift+F`
3. **7.7 速查表 + kbd**：
   - 按 `?`（Shift+/）打开速查表 Modal，列出全局+画布两组快捷键
   - 速查表中 Esc 关闭
   - CanvasToolbar 4 按钮显示 `=`/`-`/`0`/`⇧R` kbd 标签
   - 画布聚焦时按 `=`/`-`/`0`/`Shift+R` 分别触发放大/缩小/适应/重置
   - 在输入框内输入上述字符不触发画布操作
4. **回归**：前序已完成的 7.1-7.3、7.5-7.6、7.9-7.10 功能不受影响（命令面板搜索/主题切换/右键菜单 Esc/ConfirmDialog/响应式布局均正常）

### 执行顺序
1. 变更 1（7.4 焦点恢复）
2. 变更 2（7.8 快捷键改键）
3. 变更 3a + 3b（CanvasToolbar kbd + 画布快捷键绑定）
4. 变更 4（新建 ShortcutCheatsheet 组件）
5. 变更 5（ProjectLayout 集成 `?` 键 + 速查表）
6. 自动化验证三连
7. 手动验证清单逐项确认
