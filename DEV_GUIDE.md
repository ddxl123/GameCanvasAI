# 开发文档（DEV_GUIDE）

> 本文档是本项目的开放性开发指引。内容描述当前的实现现状与设计思路，供贡献者参考。
> 项目鼓励探索与创新，技术栈、架构、约定均可随项目进化而调整。
> **本文档的更新需经项目维护者确认后方可写入。**

---

## 1. 产品定位与愿景

### 1.1 核心定位

本项目是一个**以"游戏玩法设计"为核心**的设计平台。功能、UI、数据结构、AI 能力围绕"帮助游戏设计师高效地设计、可视化、验证、迭代游戏玩法"这一目标展开。

设计思考方向：
- 平台的每一处交互、每一个模块、每一条数据可以围绕"这如何帮助设计师更好地做玩法设计"来思考
- 玩法设计是第一性原则，技术为玩法服务
- 游戏在于创新，平台欢迎探索玩法设计的新维度与新形式

### 1.2 目标用户

- **主用户**：独立游戏开发者、小型团队的游戏设计师、玩法策划
- **次用户**：游戏设计学习者、游戏开发教学场景

### 1.3 核心价值主张

1. **画布即工作台**：所有玩法元素（核心循环、机制节点、规则、关卡、数值、高光时刻）在同一个无限画布上，不分割模块
2. **可视化优先**：用节点图、宫格、曲线等视觉形式表达玩法关系，而非纯文本
3. **AI 辅助设计**：AI 作为设计师的副驾驶——生成机制网络、建议数值、分析平衡
4. **本地优先**：数据存储在浏览器 IndexedDB，离线可用，用户拥有数据主权

### 1.4 当前能力

平台已覆盖以下玩法设计能力（鼓励探索更多创新方向）：

- 玩法机制图设计（节点 + 边的网络）
- 核心循环与玩步设计
- 规则系统（IF-THEN）
- 关卡流程设计
- 数值属性与公式设计
- 高光时刻标注
- 设计快照与对比
- AI 辅助生成与分析
- 引擎导出（JSON/Unity/Godot）

游戏在于创新，平台欢迎探索——只要服务于"更好地做玩法设计"这一目标，新的玩法维度、新的表达形式、新的 AI 能力都欢迎被探索和纳入。

---

## 2. 技术架构与规范

### 2.1 技术栈选型原则

技术栈并非固定不变，而是遵循"**更适合、更强大**"的进化原则。任何技术决策都应基于当下能否最好地服务玩法设计这一目标，而非固守既有选择。

**选型思考方向**：

1. **目标导向**：技术为玩法设计服务。当出现更契合玩法设计需求的技术时，可主动评估并迁移
2. **能力优先**：选择能让平台能力更强、体验更好的技术
3. **生态成熟**：优先社区活跃、文档完善、TypeScript 友好的方案，降低维护风险
4. **渐进迁移**：技术栈升级可评估迁移成本，制定分阶段计划

**当前技术栈**（截至 2026-07，随项目进化更新）：

| 层级 | 当前技术 | 选型理由 | 可进化方向 |
|------|----------|----------|------------|
| 框架 | React 18 | 生态成熟，团队熟悉 | 视 React 19+ 稳定性评估升级 |
| 语言 | TypeScript 5+ | 强类型保障，严格模式 | 持续跟进新版本 |
| 构建 | Vite 6 | 极速 HMR，ESM 原生 | 关注 Rolldown 等新一代构建 |
| 画布 | @xyflow/react v12 | 节点图事实标准，交互体验流畅 | 关注 WebGPU/3D 画布可能性 |
| 布局 | elkjs 0.11 | stress 算法适合密集多对多机制图 | 评估更适合玩法图的新算法 |
| 状态 | Zustand 5 | 轻量、无 Provider、支持中间件 | - |
| 撤销重做 | zundo 2 | Zustand 官方时间旅行中间件 | - |
| 数据库 | Dexie 4 (IndexedDB) | 本地优先，事务化，类型友好 | 评估 OPFS/SQLite WASM 等更强本地存储 |
| 校验 | Zod 3 | 运行时校验 + TS 类型同源 | - |
| 富文本 | TipTap 2 | 可扩展，用于 GDD 文档编辑 | - |
| 样式 | Tailwind CSS 3 | 原子化，主题系统一致 | 关注 Tailwind 4 / 原子 CSS 新方案 |
| 动画 | GSAP + Framer Motion | 节点交互微动效 + 页面过渡 | - |
| 图标 | lucide-react | 统一线性图标体系 | - |
| AI | OpenAI 兼容 API | 多 Provider 支持 | 持续接入更强模型/多模态能力 |
| Token | gpt-tokenizer 2 | AI 上下文 token 计数 | - |

> 上表是当前快照，当某项技术不再是最优解时，可主动评估替换。

### 2.2 架构设计思路

#### 思路 1：本地优先（Local-First）
- 所有数据存 IndexedDB（Dexie），不依赖服务端
- 离线可用，用户拥有数据主权
- 节点位置等 UI 状态用 localStorage 持久化
- AI 调用是唯一的网络依赖，失败不阻塞本地编辑

#### 思路 2：画布即中心（Canvas-Centric）
- 所有玩法元素在统一无限画布上，不按模块分割
- 画布是第一交互界面，侧边面板是辅助
- 画布交互追求流畅自然的体验（移动、缩放、连线）

#### 思路 3：类型同源（Type-Homology）
- Zod schema 与 TypeScript 类型一一对应
- `CanvasElement` 是 discriminated union，通过 `type` 字段收窄
- 数据结构变更时同步更新 `src/types/index.ts` 和相关 Zod schema

#### 思路 4：按需加载（Lazy-Load）
- 重型库（elkjs、html-to-image、mathjs）按需动态 import
- 图标按需导入
- AI 调用流式返回，避免长等待阻塞

#### 思路 5：生态优先（Mature Ecosystem）
- 优先选择社区活跃、文档完善、TypeScript 友好的库
- 避免自造轮子（如用 elkjs 而非自研布局算法）
- 版本锁定主版本号，破坏性升级可评估迁移成本

### 2.3 目录结构参考

```
src/
├── App.tsx                  # 路由配置（含 mechanism → Workspace）
├── main.tsx                 # 入口
├── index.css                # 全局样式 + Tailwind
├── types/index.ts           # 所有类型定义（单一真相源）
├── db/index.ts              # Dexie 数据库定义（版本化迁移）
├── stores/                  # Zustand 状态管理（每领域一个 store）
│   ├── uiStore.ts           #   UI 全局状态（面板、主题、画布开关）
│   ├── mechanismStore.ts    #   机制节点图
│   ├── gameplayStore.ts     #   核心循环 + 高光时刻
│   ├── ruleStore.ts         #   规则 + 矩阵
│   ├── levelStore.ts        #   关卡流程
│   ├── numericStore.ts      #   数值属性 + 公式
│   ├── documentStore.ts     #   GDD 文档
│   ├── historyStore.ts      #   撤销重做（zundo）
│   ├── aiStore.ts           #   AI 配置
│   └── ...
├── features/                # 功能模块（按领域划分）
│   ├── canvas/              #   统一画布（React Flow 核心）
│   ├── mechanism/           #   机制节点类型定义 + 属性面板
│   ├── ai/                  #   AI 面板 + 导师
│   ├── command/             #   命令面板 + 快捷键
│   ├── search/              #   全局搜索
│   ├── snapshot/            #   设计快照
│   ├── inspiration/         #   灵感便签
│   ├── playtest/            #   可视化试玩
│   ├── presentation/        #   演示模式
│   └── ...
├── lib/                     # 纯函数库（无 React 依赖）
│   ├── aiClient.ts          #   AI 调用客户端（流式 + 非流式）
│   ├── aiPrompts.ts         #   所有 prompt 模板
│   ├── aiActions.ts         #   AI Tool Calls 工具定义
│   ├── graphLayout.ts       #   ELK 布局封装
│   ├── graphAnalysis.ts     #   图分析（环路、连通性）
│   ├── formula.ts           #   公式解析（mathjs）
│   ├── sanitize.ts          #   HTML 消毒（防 XSS）
│   ├── projectExport.ts     #   项目导出
│   ├── engineExport.ts      #   引擎导出（Unity/Godot）
│   └── ...
├── components/              # 通用 UI 组件
├── hooks/                   # 自定义 Hooks
├── pages/                   # 路由页面
└── data/                    # 静态数据（模板、案例库、参考曲线）
```

**命名习惯**：
- 文件名：PascalCase（组件）/ camelCase（工具函数）
- 组件文件：`PascalCase.tsx`
- Store 文件：`camelCaseStore.ts`（如 `mechanismStore.ts`）
- 类型文件：统一收敛到 `types/index.ts`

### 2.4 状态管理参考

#### Store 设计思路
- **每领域一个 store**：机制、玩法、规则、关卡、数值各自独立 store
- **UI 全局状态归 uiStore**：面板折叠、主题、画布开关、选中元素
- **跨 store 通信**：通过组件层组合

#### 撤销重做（zundo）
- `historyStore` 包装各领域 store 的 `temporal` 实例
- 需要撤销的操作通过 store action 修改状态
- 不通过 `setState` 直接绕过 store 的修改不进入历史栈

### 2.5 数据层参考（Dexie/IndexedDB）

#### 版本化迁移
- schema 变更递增 `db.version(n)`
- 旧版本数据通过 `.upgrade(async (tx) => {...})` 迁移
- 当前版本：v6（含 EdgeType 语义化迁移）

#### 表结构（当前 17 张表）
| 表名 | 主键 | 索引 |
|------|------|------|
| projects | id | name, updatedAt |
| mechanismGraphs | id | projectId, type |
| graphNodes | id | graphId, type, groupId |
| graphEdges | id | graphId, source, target |
| numericSheets | id | projectId |
| attributes | id | sheetId, parentId, order |
| formulas | id | sheetId, attributeId |
| gddDocuments | id | projectId |
| docSections | id | docId, order |
| aiConversations | id | projectId, updatedAt |
| aiMessages | id | conversationId, order |
| snapshots | id | projectId, createdAt |
| nodeGroups | id | graphId |
| comments | id | projectId, targetType, targetId, createdAt |
| inspirations | id | projectId, category, status, createdAt |
| coreLoops | id | projectId, loopType |
| gameMoments | id | projectId, type, order |
| gameRules | id | projectId, category, order |
| interactionMatrices | id | projectId |
| levelFlows | id | projectId |

---

## 3. 功能模块实现参考

### 3.1 统一画布（React Flow）

#### 当前画布配置

- 使用 React Flow v12（`@xyflow/react`）
- 画布交互追求流畅自然：移动、缩放、连线行为符合设计师直觉
- `connectionMode={ConnectionMode.Loose}`：允许任意 Handle 互连
- 交互参数：`panOnDrag`、`zoomOnScroll`、`zoomOnPinch`、`minZoom={0.1}`、`maxZoom={4}`、`zoomOnDoubleClick={false}`
- 包含 Background（Dots 变体）和 MiniMap
- 缩放控制由自定义 CanvasToolbar 提供（右下角），原生 `<Controls>` 已移除（避免重复按钮）
- 节点位置持久化用 localStorage

#### 自定义节点 Handle 设计
- 四向 Handle（上、下、左、右）
- 尺寸：默认 8px，hover 12px
- 默认 `opacity-0`，`group-hover:opacity-100`
- `z-index: 50`，`cursor-crosshair`

#### 节点卡片视觉设计
- **三层颜色边界**：`border-2`（节点色 55%）+ `::before` 顶部色带（4px）+ `::after` 左侧色条（3px 渐变）
- **双层图标系统**：语义图标 + 维度图标，通过 `iconMode` 切换
- **双色彩体系**：维度模式同维度节点共享色；语义模式同语义节点共享色
- **HeroBanner**：40x40 大图标块 + 维度/语义标签
- **玩法属性展示**：节点卡片内显示已设置的玩法属性，紧凑键值列表 `[类型图标] key · value`，最多 10 项，超出内部滚动

#### 工具栏布局
- **右下角**：CanvasToolbar（缩放、适应视图、自动布局、重置布局、图标模式切换、玩法属性显示开关）
- **左侧**：CreateToolbar（创建元素面板，可折叠分组 + 搜索）
- **拖拽创建**：Toolbar 项支持 `dataTransfer` 拖拽到画布放置

### 3.2 节点类型系统

#### 当前节点子类型（9 维度）

定义在 `src/features/mechanism/nodeTypes.ts` 的 `NODE_TYPE_META`：

| 维度 | 子类型 |
|------|--------|
| 逻辑层 | event, action, state, condition |
| 资源层 | resource, pool, converter |
| 成长层 | attribute, modifier, level |
| 反馈层 | reward, penalty, feedback |
| 社交/AI | ai_behavior, social |
| 世界观 | region, landmark, path, weather, biome |
| 内容元素 | character, item, skill, quest, npc, enemy |
| 感官体验 | vfx, sfx, animation, camera, ui_feedback |
| 辅助 | note |

每个节点类型元数据包含：`label`、`color`、`icon`、`description`、`ports`、`category`、`dimension`。

#### 边类型

定义在 `EDGE_TYPE_META`，覆盖交互、结构、通信三大类关系。旧版边类型通过 `migrateEdgeType()` 迁移。

#### 画布元素（CanvasElement）

```typescript
type CanvasElementType =
  | "core-loop"      // 核心循环
  | "loop-step"      // 玩步（支持宫格）
  | "moment"         // 高光时刻
  | "node"           // 机制节点（40 子类型）
  | "rule"           // 规则（IF-THEN）
  | "level-node"     // 关卡节点
  | "attribute";     // 数值属性
```

当前设计思路：矩阵单元格和文档章节不纳入画布元素——它们不是玩法节点。这一设计可随需求演进。

### 3.3 玩法属性系统（富字段）

#### 字段类型（7 种）

```typescript
type CustomFieldType =
  | "text"      // 文本
  | "number"    // 数值（含 unit/min/max/step）
  | "boolean"   // 开关
  | "select"    // 下拉（含 options）
  | "range"     // 滑块（含 min/max/step/unit）
  | "color"     // 颜色（#RRGGBB）
  | "reference" // 引用属性 ID
```

#### 玩法属性 vs 技术参数
- 玩法属性示例：伤害值、冷却时间、掉落概率、持续时间、影响范围、移动速度修正
- 技术参数示例：mesh 名、shader 路径、网络同步频率、渲染层级
- AI 生成时倾向产出玩法属性，避免技术参数

#### 旧格式兼容
`migrateCustomFields()` 函数将旧版 `Record<string, string>` 自动迁移为 `CustomFieldDef[]`。

#### AI 生成玩法属性
- **两模式**：`smart`（智能补全字段+值）/ `fill`（仅填充值）
- **单字段生成**：每行字段支持独立 AI 生成（`focusKey` 参数）
- **额外提示词**：常驻 textarea，localStorage 持久化（key: `ai-fields-hint`），非空时注入 prompt 的「## 用户额外要求」段落
- **prompt 结构**：JSON 代码块输出，约束 type/value 匹配

### 3.4 AI 集成参考

#### 架构（统一调用层）
```
aiPrompts.ts (prompt 模板：build* 函数 + 共享 SYSTEM_PROMPT)
    ↓
aiClient.ts (统一 HTTP 调用层：流式/非流式，OpenAI 兼容 + Claude 适配)
    ↓
aiActions.ts (Tool Calls 工具定义 + 应用落库 + UndoRecord)
    ↓
aiService.ts (画布元素生成服务层，委托 aiClient)
    ↓
features/ai/ (UI 面板：AIPanel + AIMentorPanel)
```

当前思路：所有 AI 调用统一经 `aiClient`（流式 `callAIStream` / 非流式 `callAI`），`aiService` 的画布元素生成也委托 `aiClient`，避免双轨实现导致能力割裂。

#### 多 Provider 支持
- OpenAI 兼容（DeepSeek、OpenAI、Qwen、本地 Ollama 等）
- Claude（独立端点与 tools 格式转换）
- 配置存 `aiStore`，支持多配置切换

#### Tool Calls 参考
- 使用 OpenAI 兼容的 `tools` 参数（DeepSeek 官方称 "Tool Calls"），工具定义在 `DESIGN_TOOLS_OPENAI`（11 个工具）
- 参考：https://api-docs.deepseek.com/zh-cn/guides/tool_calls
- 每个 action 通过白名单过滤仅暴露相关工具，降低模型选择难度
- 生成类 action 用 `tool_choice` 强制调用指定工具（DeepSeek 除外，官方不传 tool_choice）
- 智能体循环最多 8 轮（`MAX_AGENT_ROUNDS`）
- 工具参数 JSON 解析失败时回传错误让 AI 重试（而非静默失败）
- 思考模式下的 Tool Calls（DeepSeek-V3.2+）需回传 `reasoning_content`

#### Prompt 工程参考
- **SYSTEM_PROMPT 全局否定**：玩法属性 vs 技术参数的约束在系统提示层面声明，所有 build 函数继承
- **工具 schema 内联**：生成类 prompt 在文本中内联工具参数 JSON schema（字段名/类型/枚举），降低模型推断误差
- **few-shot 示例**：关键生成函数补充完整示例（机制网络、数值公式、核心循环等）
- **跨维度上下文注入**：生成类 prompt 注入关联维度摘要（如生成核心循环时注入机制节点列表），支撑跨维度一致性
- **用户额外要求**：`ai-fields-hint` 机制注入 prompt，优先级低于玩法属性原则

#### 异常处理与降级参考
- HTTP 状态码语义分类：401/403（鉴权）、402（余额）、429（限流）、500/502/503（服务端）、400（客户端）
- 429 限流退避：解析 `Retry-After`，指数退避重试（最多 2 次）
- model 级降级：同 provider 内 model 降级（如 gpt-4o → gpt-4o-mini），不跨 provider
- 思考模式降级：DeepSeek 400/空回复时关闭 thinking 重试（最多 1 次）
- 离线模板兜底：AI 调用失败且无降级可用时，返回模板数据 + 友好提示
- 友好错误映射：`explainAIError()` 将技术错误转为用户可读提示

#### 流式与并发参考
- 流式覆盖：AIPanel 动作/对话、AIMentorPanel 解释、画布节点生成、属性生成均走流式
- 流式解析：OpenAI SSE（`parseSSEStream`）+ Claude 事件流（`content_block_delta`）
- 并发去重：`generatingKeys` 前置检查，阻止同元素重复请求
- AbortController 多例：按调用来源 key 管理（panel / mentor / node），避免单例覆盖
- 全局并发上限：所有 AI 调用经并发限流（上限 3），避免突发请求
- 滑窗裁剪：长对话/agentic 多轮按 token 估算裁剪中间历史，保留 system + 最近 N 轮
- token 预算：`gpt-tokenizer` 估算 prompt 长度，超限裁剪

#### Prompt 安全建议
- 用户输入可用 `wrapUserInput()` 包裹隔离，防 prompt 注入
- AI 回复的 HTML 可 `sanitizeHtml()` 消毒后渲染
- AI 输出避免包含 `<tool_call>` 等文本格式工具调用语法

### 3.5 布局算法（elkjs）

- **首选 stress 算法**：适合密集多对多机制图
- **可选算法**：layered、force、radial、mrtree（底部左侧切换器）
- 交叉边使用 HSL 色相偏移区分
- 节点间距、高度估算参数可调

### 3.6 视觉设计系统

#### 磨砂质感（Frosted Glassmorphism）
- `backdrop-filter: blur(16-20px) saturate(140-160%)`
- 应用于：顶栏、侧边面板、弹出层、工具栏

#### 层级阴影（Three-Layer Shadow）
- 三层叠加阴影，营造深度感
- `.shadow-layered` 工具类

#### 选中柔光
- `.shadow-selected` 选中态柔光效果

#### 顶部色带
- `.color-band-top::before` 渐变色带，用于卡片顶部装饰

#### 画布氛围光
- `.canvas-ambient` 双 radial-gradient，画布背景氛围光

#### 配色体系
- 暗色主题为主（`theme: "dark"`）
- 主色 accent：`#A3E635`（柠檬绿）
- 维度色：10 个维度各自主题色（定义在 `DIMENSION_COLOR_MAP`）
- 语义色：每种子类型独立色（定义在 `SEMANTIC_COLOR_MAP`）

---

## 4. 工程实践参考

### 4.1 设计方向

以下是项目当前遵循的设计方向，供开发参考：

1. **以"游戏玩法设计"为核心**——功能思考可围绕"这如何帮助玩法设计"
2. **使用 React Flow v12**——当前节点图方案，可随技术进化评估替换
3. **画布交互流畅自然**——移动、缩放、连线行为符合设计师直觉
4. **路由含 mechanism**——`/project/:id/mechanism` 指向 Workspace
5. **AI 生成玩法属性**——倾向产出玩法属性，避免技术参数
6. **用户输入隔离**——`wrapUserInput()` 包裹，防 prompt 注入
7. **AI 输出消毒**——`sanitizeHtml()` 后渲染

### 4.2 经验参考（历史踩坑）

以下是历史开发中遇到的问题与当时采用的解决方案，供参考：

| 问题 | 现象 | 当时方案 |
|------|------|----------|
| 在 React updater 函数内 setState | 渲染被忽略 | 用 `queueMicrotask` 延迟更新 |
| 用 koa-connect 包装中间件 | ctx 泄漏 | 原生 Koa 中间件重写 |
| 保留原生 `<Controls>` 组件 | 与 CanvasToolbar 重复缩放按钮 | 移除 `<Controls>`，仅用自定义工具栏 |
| AI 边标签与节点 label 不匹配时抛错 | 阻断流程 | 大小写/空格不敏感匹配，失败则保留所有节点 + console.warn |
| 自造节点图布局算法 | 维护成本高 | 用 elkjs |
| 把矩阵/文档纳入画布元素 | 不是玩法节点 | CanvasElement 仅 7 种玩法元素 |
| 双轨 AI 实现导致能力割裂 | aiService 无超时/取消/降级 | aiService 委托 aiClient，统一调用层 |

### 4.3 性能参考

- 节点数 100+ 时画布保持 60fps（React Flow 虚拟化）
- AI 单次工具调用建议不超过 15 个节点（复杂设计分多次）
- 重型库（elkjs、html-to-image、mathjs）动态 import
- 图标按需导入
- 长对话/agentic 多轮按 token 估算滑窗裁剪中间历史，保留 system + 最近 N 轮
- AI 全局并发上限 3，避免突发请求压垮限流

### 4.4 代码风格参考

- TypeScript 严格模式（`strict: true`）
- 提交前 `tsc --noEmit` 零错误
- 函数注释用 JSDoc 格式（`/** */`）
- 组件用函数组件 + Hooks
- 状态修改通过 store action
- 文件命名：组件 PascalCase，工具 camelCase，store 加 `Store` 后缀

### 4.5 数据安全参考

- AI 回复的 HTML 经 `sanitizeHtml()` 消毒（防 XSS）
- 用户输入用 `wrapUserInput()` 包裹（防 prompt 注入）
- AI 请求体上限 200KB（`MAX_BODY_SIZE`）
- 流式请求超时 5 分钟，非流式 2 分钟
- localStorage 写入失败静默忽略（隐私模式兼容）
- HTTP 状态码语义分类处理：401/403 鉴权、402 余额、429 限流退避、500/502/503 服务端重试
- `explainAIError()` 将技术错误转为用户可读提示，避免原始错误文案暴露

### 4.6 Git 提交参考

- Commit message 用中文或英文，描述"为什么改"
- 不提交 `.env`、`credentials.json` 等敏感文件
- 按文件添加，避免误提交敏感文件
- 分支命名：`feature/xxx`、`fix/xxx`、`refactor/xxx`

---

## 5. 开发流程

### 5.1 本地启动

```bash
npm install      # 安装依赖
npm run dev      # 启动开发服务器（Vite HMR）
npm run check    # TypeScript 类型检查
npm run build    # 生产构建
npm run lint     # ESLint 检查
```

**端口冲突处理**：Vite 自动切换端口（5173 → 5174 → ...）。

### 5.2 新增节点类型流程

1. 在 `src/types/index.ts` 的 `NodeType` 联合类型添加新类型
2. 在 `src/features/mechanism/nodeTypes.ts` 的 `NODE_TYPE_META` 添加元数据
3. 在 `NODE_LIBRARY` 中归入对应维度分组
4. 在 `ICON_MAP` 中映射图标
5. 如需特殊渲染，在 `ElementNode.tsx` 的 `renderContent` 添加 case
6. 运行 `npm run check` 验证类型

### 5.3 新增 AI 功能流程

1. 在 `src/lib/aiPrompts.ts` 编写 prompt 模板函数
2. 如需 Tool Calls，在 `src/lib/aiActions.ts` 定义 action 接口
3. 在 UI 层调用 `callAI()`（非流式）或 `callAIStream()`（流式）
4. AI 回复如含 HTML，`sanitizeHtml()` 后渲染
5. 用户输入 `wrapUserInput()` 包裹

### 5.4 数据库 schema 变更流程

1. 在 `src/db/index.ts` 新增 `this.version(n+1).stores({...})`
2. 如需迁移旧数据，添加 `.upgrade(async (tx) => {...})`
3. 更新 `src/types/index.ts` 对应类型
4. 更新相关 store 的 CRUD 方法
5. 本文档 §2.5 表结构同步更新（需经维护者确认）

---

## 6. 附录

### 6.1 关键文件索引

| 文件 | 职责 |
|------|------|
| `src/types/index.ts` | 所有类型定义（单一真相源） |
| `src/db/index.ts` | Dexie 数据库（版本化迁移） |
| `src/features/canvas/ElementNode.tsx` | 节点卡片渲染（图标/颜色/属性展示） |
| `src/features/canvas/ReactFlowCanvas.tsx` | 画布主组件（拖放/创建/连线） |
| `src/features/canvas/CanvasToolbar.tsx` | 右下角工具栏 |
| `src/features/canvas/CreateToolbar.tsx` | 左侧创建面板 |
| `src/features/mechanism/nodeTypes.ts` | 40 节点类型 + 边类型元数据 |
| `src/features/mechanism/NodePropertyPanel.tsx` | 节点属性编辑面板（富字段 + AI） |
| `src/stores/uiStore.ts` | UI 全局状态 |
| `src/lib/aiPrompts.ts` | 所有 AI prompt 模板 |
| `src/lib/aiClient.ts` | AI HTTP 客户端 |
| `src/App.tsx` | 路由配置 |

### 6.2 术语表

| 术语 | 含义 |
|------|------|
| 玩法属性 | 影响玩家体验/游戏平衡/玩法策略的参数（非技术参数） |
| 维度 | 节点的分类维度（逻辑层/资源层/成长层等 9 类） |
| 语义 | 节点的具体功能语义（event/action/state 等 40 种） |
| 画布元素 | CanvasElement 的 7 种变体之一 |
| 画步 | loop-step，核心循环中的每一步，支持宫格展开 |
| 高光时刻 | moment，玩家情绪高峰标注 |

### 6.3 文档维护

- 本文档为开放性指引，不含强制约束
- 技术栈、架构、约定均可随项目进化调整
- **如有变动或更合适的内容要写入本文档，需先询问项目维护者确认后方可更新**
- 重大决策记录在 `.trae/documents/` 下的技术文档中
- 项目级约定记录在 project memory 中

---

**最后更新**：2026-07-15
**文档版本**：0.0.0（跟随 package.json）
