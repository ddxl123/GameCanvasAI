# 剩余工作流执行计划：工作流 7（UX 与 a11y）+ 工作流 6.2-6.5（工程收尾）

## Summary

本计划覆盖前序"全面深度修复计划"中尚未完成的两个工作流：
- **工作流 7**：UX 与 a11y（10 个子任务）
- **工作流 6.2-6.5**：工程收尾（tsconfig strict、代码分割、统一 sanitizeFileName、死代码清理）

完成后进入最终验证阶段（build + lint 全绿 + 关键功能手动验证）。

## Current State Analysis

### 工作流 7 现状

| 子任务 | 文件 | 现状 |
|--------|------|------|
| 7.1 主题统一源 | `src/hooks/useTheme.ts`、`src/stores/uiStore.ts` | `useTheme` 有独立 state，但**实际未被任何组件调用**（仅自身定义+注释）；`uiStore.theme` + `ProjectLayout` useEffect 已是实际单一源 |
| 7.2 Onboarding 轮询 | `src/features/onboarding/OnboardingChecklist.tsx` L184-191 | `setInterval(5000)` 轮询，无 `document.hidden` 暂停，`checkTasks` 无 try/catch |
| 7.3 导出任务真实化 | 同上 L228-236 | `handleExport` 仅设 localStorage 标记 + toast，未调用 `exportProject` |
| 7.4 命令面板焦点恢复 | `src/features/command/CommandPalette.tsx` L375-382 | 打开时聚焦 input，关闭时未恢复 activeElement |
| 7.5 右键菜单 ARIA | `src/features/canvas/ReactFlowCanvas.tsx` L548+ | 无 `role="menu"`/`role="menuitem"`，无 Escape 关闭 |
| 7.6 图标按钮 aria-label | `CanvasToolbar.tsx`、`ElementNode.tsx` L942-984 | 用 `title` 但无 `aria-label` |
| 7.7 快捷键可发现性 | `CanvasToolbar.tsx` | 无 kbd 标签显示 |
| 7.8 Cmd+P 冲突 | `ProjectLayout.tsx` L122 | `Cmd+P` 触发搜索，与浏览器打印冲突 |
| 7.9 confirm→Modal | 6 处：`Home.tsx`、`Settings.tsx`、`AIPanel.tsx`、`InspirationBoard.tsx`、`SnapshotPanel.tsx`(2) | 使用原生 `confirm`/`window.confirm` |
| 7.10 响应式布局 | `UnifiedWorkspace.tsx`、`ReactFlowCanvas.tsx` | 无 `matchMedia` 监听，小屏面板不折叠 |

### 工作流 6.2-6.5 现状

| 子任务 | 文件 | 现状 |
|--------|------|------|
| 6.2 tsconfig strict | `tsconfig.json` | `strict: false`、`noUnusedLocals: false`、`noUnusedParameters: false`；`include` 含不存在的 `"api"` |
| 6.3 代码分割 | `App.tsx`、`vite.config.ts` | 路由组件全部同步 import，无 lazy；vite 无 manualChunks |
| 6.4 统一 sanitizeFileName | `utils.ts` + 4 个导出文件 | 4 处各自定义：`engineExport.ts` L530、`projectExport.ts` L626、`exportImage.ts` L80、`exportMarkdown.ts` L82 |
| 6.5 死代码清理 | `historyStore.ts`、`types/index.ts`、`aiActions.ts` | historyStore.execute 已删除；`AIChatMessage.applied` 已标 deprecated；aiActions default 返回 null 是合理类型收窄，保留 |

## Assumptions & Decisions

1. **strict 策略**：一次性开启 `strict: true` + `noUnusedLocals: true` + `noUnusedParameters: true`，修复全部暴露错误。若错误数量过大（>40），允许用 `_` 前缀处理未使用参数，不回退 strict。
2. **useTheme 处理**：由于 `useTheme` 未被任何组件调用，直接删除 `src/hooks/useTheme.ts`，主题以 `uiStore.theme` 为唯一源。
3. **confirm 替换**：新建通用 `ConfirmDialog` 组件（基于现有 Modal），6 处 confirm 统一替换。不引入新依赖。
4. **响应式布局**：7.10 采用 `matchMedia('(max-width: 768px)')` 监听，小屏自动折叠左右面板为可切换抽屉（复用现有 `leftPanelCollapsed`/`rightPanelCollapsed`）。
5. **快捷键速查表**：7.7 增加 `?` 键打开速查表 Modal，CanvasToolbar 按钮显示 kbd。
6. **执行顺序**：先 6.2-6.5（工程基础）→ 7（UX）→ 最终验证。

---

## Proposed Changes

### 阶段一：工作流 6.2-6.5（工程收尾）

#### 6.2 tsconfig strict 开启

**文件**：`tsconfig.json`

**What**：开启 strict 系列选项，移除不存在的 `api` include。

**How**：
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    // ...其余不变
  },
  "include": ["src"]  // 移除 "api"
}
```

开启后运行 `npm run check`，修复全部暴露的类型错误。常见修复模式：
- 未使用变量/参数：删除或加 `_` 前缀
- `null`/`undefined` 未处理：补 `?? fallback` 或 `if (!x) return`
- 隐式 `any`：补显式类型注解
- switch 缺 default：补 `default: return` 或断言

#### 6.3 代码分割降包体

**文件**：`src/App.tsx`、`vite.config.ts`

**What**：路由级 lazy import + manualChunks 拆分大依赖。

**How**：

1. `App.tsx` 改为：
```tsx
import { lazy, Suspense } from "react";
const Home = lazy(() => import("@/pages/Home"));
const Settings = lazy(() => import("@/pages/Settings"));
const Workspace = lazy(() => import("@/pages/Workspace"));
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const ProjectLayout = lazy(() => import("@/components/layout/ProjectLayout"));

// Routes 外包 Suspense fallback={<Loading />}
```

2. `vite.config.ts` 增加：
```ts
build: {
  sourcemap: 'hidden',
  rollupOptions: {
    output: {
      manualChunks: {
        'react-vendor': ['react', 'react-dom', 'react-router-dom'],
        'flow-vendor': ['@xyflow/react'],
        'chart-vendor': ['recharts'],
        'math-vendor': ['mathjs'],
        'animation-vendor': ['framer-motion', 'gsap'],
      },
    },
  },
},
```

#### 6.4 抽取统一 sanitizeFileName

**文件**：`src/lib/utils.ts`；修改 `engineExport.ts`、`projectExport.ts`、`exportImage.ts`、`exportMarkdown.ts`

**What**：在 `utils.ts` 新增统一 `sanitizeFileName(name, fallback)`，4 处本地定义删除并改为 import。

**How**：
```ts
// utils.ts
export function sanitizeFileName(name: string, fallback = "export"): string {
  return (name || fallback)
    .replace(/[\\/:*?"<>|]/g, "_")  // 非法字符
    .replace(/[\x00-\x1f\x7f]/g, "") // 控制字符
    .replace(/\s+/g, "_")
    .slice(0, 100) || fallback;
}
```

4 个导出文件：
- 删除各自的 `function sanitizeFileName(...)` 
- 顶部 `import { sanitizeFileName } from "@/lib/utils"`
- 调用处保持不变（`ExportDialog.tsx` 已从 `engineExport` re-import，需改为从 `utils` import 或保持 re-export）

#### 6.5 死代码清理

**文件**：`src/types/index.ts`

**What**：`AIChatMessage.applied` 字段已标注 deprecated 注释，保留字段（向后兼容数据），但确认无运行时读取。

**How**：
- grep 确认 `.applied` 仅有类型定义和注释，无实际读取逻辑
- 若无读取：保留字段+注释（数据兼容），不删除
- `aiActions.ts` 的 `default: return null` 是 discriminated union 收窄的合理写法，保留
- `historyStore.execute` 已在前序删除，无需操作

---

### 阶段二：工作流 7（UX 与 a11y）

#### 7.1 主题统一源

**文件**：删除 `src/hooks/useTheme.ts`

**What**：`useTheme` 未被调用，`uiStore.theme` + `ProjectLayout` useEffect 已是唯一源。

**How**：
1. DeleteFile `src/hooks/useTheme.ts`
2. 确认无其他 import（grep `useTheme` 仅自身+注释）
3. `CommandPalette.tsx` L107 注释更新为"切换主题：更新 uiStore"

#### 7.2 OnboardingChecklist 轮询优化

**文件**：`src/features/onboarding/OnboardingChecklist.tsx`

**What**：`document.hidden` 时暂停轮询；`checkTasks` 加 try/catch。

**How**：
```ts
const checkTasks = useCallback(async () => {
  try {
    // ...现有逻辑
  } catch (e) {
    console.error("Onboarding 检查失败:", e);
  }
}, [projectId, exportKey]);

useEffect(() => {
  if (dismissed) return;
  void checkTasks();
  const id = setInterval(() => {
    if (document.hidden) return; // 页面不可见时跳过
    void checkTasks();
  }, 5000);
  return () => clearInterval(id);
}, [checkTasks, dismissed]);
```

#### 7.3 OnboardingChecklist 导出任务真实化

**文件**：同上 L228-236

**What**：`handleExport` 调用真实 `exportProject` 并触发下载。

**How**：
```ts
import { exportProject } from "@/lib/projectExport";

const handleExport = async () => {
  try {
    const data = await exportProject(projectId);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sanitizeFileName(/* project name */) }.json`;
    a.click();
    URL.revokeObjectURL(url);
    localStorage.setItem(exportKey, "true");
    addToast({ title: "项目已导出", variant: "success" });
  } catch (e) {
    addToast({ title: "导出失败", description: e instanceof Error ? e.message : "", variant: "error" });
  }
  void checkTasks();
};
```

#### 7.4 命令面板焦点恢复

**文件**：`src/features/command/CommandPalette.tsx`

**What**：打开前记录 `activeElement`，关闭后 restore focus。

**How**：
```ts
const previousFocusRef = useRef<HTMLElement | null>(null);

useEffect(() => {
  if (commandPaletteOpen) {
    previousFocusRef.current = document.activeElement as HTMLElement;
    setQuery("");
    setSelectedIndex(0);
    const t = setTimeout(() => inputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  } else {
    // 关闭时恢复焦点
    previousFocusRef.current?.focus();
  }
}, [commandPaletteOpen]);
```

#### 7.5 右键菜单 ARIA

**文件**：`src/features/canvas/ReactFlowCanvas.tsx` L548+

**What**：菜单容器加 `role="menu"`，菜单项加 `role="menuitem"`；Escape 关闭。

**How**：
- 菜单 `<div>` 加 `role="menu" aria-label="画布操作菜单"`
- 每个 `<button>` 加 `role="menuitem"`
- 菜单容器 `onKeyDown` 处理 Escape：`if (e.key === "Escape") setContextMenu(null)`
- 透明遮罩已有 onClick 关闭，补充 Escape

#### 7.6 图标按钮 aria-label

**文件**：`src/features/canvas/CanvasToolbar.tsx`、`src/features/canvas/ElementNode.tsx` L942-984

**What**：所有图标按钮补 `aria-label`（与 title 一致）。

**How**：
- `CanvasToolbar.tsx`：4 个 button 各加 `aria-label="缩小"`/`"放大"`/`"适应视图"`/`"重置布局"`
- `ElementNode.tsx`：复制/收藏/删除/展开折叠/宫格按钮各加 `aria-label`
- `ProjectLayout.tsx` 顶部栏图标按钮也补 `aria-label`（title 已有，aria-label 同步）

#### 7.7 快捷键可发现性

**文件**：`src/features/canvas/CanvasToolbar.tsx`

**What**：按钮显示 kbd 标签；增加 `?` 快捷键打开速查表。

**How**：
1. CanvasToolbar 按钮旁显示 kbd（如 `+` 旁显示 `Cmd +`）
2. 新增 `ShortcutCheatsheet` 组件（或直接用 Modal），`?` 键触发
3. 在 `ProjectLayout.tsx` 的 keydown handler 中增加：
```ts
if (e.key === "?" && !isEditable) {
  setCheatsheetOpen(true);
}
```
4. 速查表内容：列出所有快捷键（Cmd+K、Cmd+P→Cmd+Shift+F、Cmd+Z、Cmd+Shift+Z、Delete、? 等）

#### 7.8 Cmd+P 冲突

**文件**：`src/components/layout/ProjectLayout.tsx` L118-125

**What**：搜索改 `Cmd+Shift+F`，命令面板保持 `Cmd+K`。

**How**：
```ts
if (e.key === "k" && !e.shiftKey) {
  e.preventDefault();
  setCommandPaletteOpen(true);
}
if (e.key === "f" && e.shiftKey) {  // Cmd+Shift+F
  e.preventDefault();
  setSearchOpen(true);
}
// 移除 e.key === "p" 和 "k" + shiftKey 的搜索触发
```
同步更新顶部栏搜索按钮 title：`"全局搜索 (Cmd+Shift+F)"`

#### 7.9 confirm 替换为 Modal

**文件**：新建 `src/components/ui/ConfirmDialog.tsx`；修改 6 处调用方

**What**：通用 ConfirmDialog 组件，替换原生 confirm。

**How**：

1. 新建 `src/components/ui/ConfirmDialog.tsx`：
```tsx
interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}
// 基于 Modal，带确认/取消按钮，danger 时确认按钮红色
```

2. 6 处替换：
   - `Home.tsx` L160：删除项目确认（danger）
   - `Settings.tsx` L117：清空数据确认（danger）
   - `AIPanel.tsx` L268：删除对话确认（danger）
   - `InspirationBoard.tsx` L249：删除灵感确认（danger）
   - `SnapshotPanel.tsx` L72：恢复快照确认（default）
   - `SnapshotPanel.tsx` L99：删除快照确认（danger）

每处改为：
```tsx
const [confirmOpen, setConfirmOpen] = useState(false);
const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

const requestConfirm = (action: () => void) => {
  setPendingAction(() => action);
  setConfirmOpen(true);
};

// JSX
<ConfirmDialog
  open={confirmOpen}
  title="确定删除？"
  description="此操作不可撤销"
  variant="danger"
  onConfirm={() => { pendingAction?.(); setConfirmOpen(false); }}
  onCancel={() => setConfirmOpen(false)}
/>
```

#### 7.10 响应式布局

**文件**：`src/features/canvas/UnifiedWorkspace.tsx`、`src/components/layout/ProjectLayout.tsx`

**What**：小屏（≤768px）自动折叠面板为抽屉式。

**How**：
1. `ProjectLayout.tsx` 增加：
```ts
const [isMobile, setIsMobile] = useState(
  () => window.matchMedia("(max-width: 768px)").matches
);
useEffect(() => {
  const mql = window.matchMedia("(max-width: 768px)");
  const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}, []);

useEffect(() => {
  if (isMobile) {
    useUIStore.setState({ leftPanelCollapsed: true, rightPanelCollapsed: true });
  }
}, [isMobile]);
```

2. 小屏时面板改为 absolute 定位覆盖画布（抽屉式）：
```tsx
<aside className={cn(
  "border-r ... flex-shrink-0",
  isMobile && "absolute z-30 h-full w-56 bg-canvas-elevated transition-transform",
  isMobile && leftPanelCollapsed && "-translate-x-full"
)}>
```
右侧面板同理。

---

## Verification Steps

### 每阶段完成后
```bash
npm run check   # tsc 无错（6.2 后 strict 全开）
npm run build   # vite 构建成功，包体下降
npm run lint    # eslint 通过
```

### 最终验证（全部完成后）

1. **构建**：`npm run check && npm run build && npm run lint` 全绿
2. **strict 类型**：确认 `tsconfig.json` strict 系列全开，tsc 无错
3. **代码分割**：`npm run build` 后检查 `dist/assets/` 有多个 chunk（react-vendor、flow-vendor 等），主 chunk 体积下降
4. **sanitizeFileName**：grep 确认仅 `utils.ts` 有定义，4 个导出文件仅 import
5. **主题**：切换主题 → 刷新页面 → 主题保持；确认 `useTheme.ts` 已删除
6. **Onboarding**：切换到其他 Tab → 等待 10s → 回来确认无报错；点击"导出"任务 → 确认触发真实下载
7. **命令面板**：Cmd+K 打开 → Esc 关闭 → 焦点回到之前的按钮
8. **右键菜单**：画布右键 → 菜单项有 role="menuitem"；Escape 可关闭
9. **aria-label**：用屏幕阅读器或 devtools 检查图标按钮有无障碍标签
10. **快捷键**：Cmd+Shift+F 打开搜索（不再触发打印）；`?` 打开速查表
11. **confirm 替换**：删除项目/对话/灵感/快照 → 确认弹出 Modal 而非原生 confirm
12. **响应式**：浏览器窗口缩到 ≤768px → 左右面板自动折叠为抽屉；展开抽屉覆盖画布

---

## 执行顺序

1. **6.2** tsconfig strict（解锁类型严格性，可能暴露错误需修复）
2. **6.4** 统一 sanitizeFileName（独立，低风险）
3. **6.5** 死代码清理（确认，低风险）
4. **6.3** 代码分割（改 App.tsx + vite.config.ts，中等风险）
5. **7.1** 主题统一源（删除 useTheme.ts）
6. **7.2** Onboarding 轮询优化
7. **7.3** Onboarding 导出真实化
8. **7.4** 命令面板焦点恢复
9. **7.8** Cmd+P 冲突（改快捷键）
10. **7.5** 右键菜单 ARIA
11. **7.6** 图标按钮 aria-label
12. **7.7** 快捷键速查表
13. **7.9** confirm→Modal（6 处 + 新建 ConfirmDialog）
14. **7.10** 响应式布局
15. **最终验证** build + lint + 手动验证清单

建议用子代理并行处理独立任务：6.4/6.5 可并行；7.2/7.3/7.4 可并行；7.5/7.6/7.7 可并行；7.9 的 ConfirmDialog 新建与 6 处替换可分两步。
