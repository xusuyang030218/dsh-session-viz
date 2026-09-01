# DSH Session Log Visualizer

将 DSH（DeepSeek Harness）的会话日志（zstd 压缩的 JSONL）解析并可视化为
在线可浏览的网页。

> 需求文档见 [REQUIREMENTS.md](REQUIREMENTS.md)。
> 界面设计依据 [UI_IMPROVEMENT.md](UI_IMPROVEMENT.md) 与
> [PRODUCT_REDESIGN.md](PRODUCT_REDESIGN.md)（三层渐进式信息架构）。

## 插件模式（推荐，随 harness 启动）

本仓库同时是一个 **DSH web 插件**：安装后在会话头部（右上角）
「Session log」下载按钮**左侧**新增 **◈ AgentTrace（智能体轨迹）** 按钮，
点击直接在当前页面打开全屏查看器。打开后默认落在 **🏠 首页**，可切换：

| 视图 | 面向用户 | 内容 |
|------|----------|------|
| 🏠 首页 | 所有人 | **会话过程闭环总览**（默认落地页）：统计卡（轮/步/工具/审批 的闭合/进行中/失败）+「进行中的工作」高亮区 + **轮次时间线**（每轮一张卡片：左侧状态缩略环、右侧步骤明细——每步列出中文工具名胶囊与耗时，失败红/进行中琥珀脉冲）；点击任意一环直达事件树对应位置 |
| 📋 摘要 | 所有人 | 执行摘要卡片：用户需求、轮次/步骤/耗时、工具使用 Top（图标+中文名）、审批结果、**文件变更记录（可展开查看修改 diff / 新增内容）**、Token 用量，无技术术语 |
| 📖 故事线 | 管理者 | 叙事式时间线：人类语言描述（「📖 AI 读取了 REQUIREMENTS.md」「⚠️ 请求审批 → ✅ 已批准」），推理折叠为摘要，点击展开 |
| 🔬 事件树 | 开发者 | turn → step → 合并事件组 树形结构，按 14 组配色着色，搜索框 + 分组类型下拉，毫秒级/相对时间，**右侧事件详情（请求参数 JSON / 返回值 / 错误 / meta / 原始行）** |
| 🗺 会话图 | 所有人 | **SVG 闭环轮环卡片**（seelog 风格）：每个轮次一张卡片里的闭环，环上按时间把步骤切成弧段、事件节点落点；关键节点（输入/模型/工具/错误）在环外带**中文语义标签卡 + 引线**，一眼看清哪段对应哪个动作；子 Agent = 挂在父轮环右侧的迷你分叉环（分叉→执行→汇回）；闭合=绿实线、进行中=琥珀虚线脉冲、失败=红；悬停看语义、点击进检查器。作为 AgentTrace 的内部模式，首页也可一键打开 |

### 首页：会话过程闭环总览

DSH 的会话日志天然是**成对闭合**的事件流，四类「环」：

| 环 | 开始 | 结束 | 未闭合的含义 |
|----|------|------|-------------|
| 🔄 对话轮次 | `turn/start` | `turn/end` | 本轮尚未结束（进行中/异常中断） |
| 🪜 执行步骤 | `step/start` | `step/end` | 本步尚未结束 |
| 🧰 工具调用 | `tool/call` | `tool/result`（按 `callId` 配对） | 工具还没返回（如正在执行的长命令） |
| 🛡️ 审批 | `approval/asked` | `approval/decided` | 等待审批结果 |

- 顶部四张统计卡：总数 / ✓ 闭合 / ◌ 未闭合 / ✕ 失败
- **「进行中的工作（未闭合）」** 高亮区：未闭合的环列在这里，可一键跳到对应位置
- 每个 Turn 一个圆环卡片：外圈 = 该轮状态，内圈 = 各 Step 按耗时占比分段；点击展开看每步里的工具调用（失败红色、进行中琥珀脉冲）
- 闭环模型由 host 半在 `/api/tree` 响应里一并返回（`closure` 字段），前端零额外请求

### JSON 查看器（可折叠树）

事件详情的 **JSON** 标签页不再是压缩单行，而是一棵可交互的树：

- **自动缩进**：原始 JSONL 是压缩单行，进入视图先 `parse` 再按 2 空格重新缩进（同一修复也作用于「解读」标签页里的 JSON 字段）
- **缩进参考线 + 行号**：每层一条竖线，左侧行号栏可开关
- **折叠/展开**：`▼/▶` 切换，折叠态显示 `{ 30 项 }` 摘要；深度 ≥2 或子项 >24 的容器**默认折叠**，首屏只给主干
- **长字符串截断**：超过 220 字符先截断并标注字符数，点「展开」看全文
- **工具栏**：全部展开 / 全部折叠 / 自动换行 / 行号 / 复制（复制的是缩进后的完整 JSON）+ 行数与字符数统计
- **非法 JSON 兜底**：退回带语法高亮的纯文本，不丢信息
- 语法着色随 DSH 深浅色主题自动切换

**四层进度体系**（PROGRESS_AND_NAME.md）：
| 进度条 | 位置 | 内容 |
|--------|------|------|
| ① 全局进度 | 窗口底部 3px 细条 | 每个 Turn 一个彩色分段（宽度按事件数比例），白色指示器标记当前浏览位置，hover 显示「Turn N · xx%」，点击跳转到对应 Turn |
| ② Turn/Step 链 | 事件树左侧列表顶部 | Turn 色块链（当前高亮）+ 当前 Turn 内 Step 进度 + 活动类型标签 |
| ③ 单步进度 | 右侧详情面板 | 圆环（Step 在会话中的位置百分比）+ 事件类型占比横条（推理/输出/工具流/助手/事件）+ 总计与耗时 |
| ④ 加载进度 | 首次打开全屏 | 环形进度 + 线性进度双重展示，分阶段（解析事件→生成摘要→构建故事线）实时更新 |

**开发者模式（默认关闭）**：普通用户只看到「摘要 + 故事线」两层人话视图，
隐藏所有内部细节。点击顶栏 **🛠 开发者** 开关后额外显示：
- 🔬 事件树视图（turn/step/事件类型/原始 JSON/JSONL）
- 内部字段：seq、行号、callId、commandId、retryId、完整本地路径、token 明细等

| 隐藏项 | 普通用户 | 开发者模式 |
|--------|----------|-----------|
| 事件树 / 原始 JSON / JSONL | ❌ 隐藏 | ✅ 显示 |
| 文件完整路径 | 仅文件名 | 完整路径 |
| seq / line / 事件类型名 | 中文分组名 | 原始值 |
| 工具参数原始 JSON | 仅人话摘要 | 可展开 |
| 会话 ID / 工作目录 | 目录短名 | 完整值 |

**UI 改进落实**（UI_IMPROVEMENT.md）：
- 筛选区精简为「搜索框 + 事件类型分组下拉」（改动 1）
- 日志列表树形折叠，同类 chunks 合并为可展开节点（改动 2 / 6）
- 毫秒级时间戳 + 相对时间（改动 3）
- 右侧默认显示会话概览卡片（改动 4）
- 按事件类型定制预览：工具→文件名、结果→行数、todo→状态统计（改动 5）

**可视化优化落实**（VISUALIZATION_OPTIMIZATION.md）：
- 侧边栏与主区之间新增品牌色箭头指示器，点击可折叠/展开侧边栏
- 概览页改为 4 个 KPI 卡片 + ECharts 环形图（事件类型分布）+ 横向条形图（分组统计，点击跳转搜索筛选）
- 时间线改为纯 SVG 树形图（Turn → Step → 合并事件组，贝塞尔连线，悬停高亮路径，折叠节点不渲染子 DOM）
- 工具流程改为 SVG 网络流程图（节点按耗时定大小、按工具类型着色、箭头表示调用顺序、点击弹详情）
- 推理过程改为 ECharts 面积图（字符/秒节奏）+ 可折叠文本
- 任务清单改为 SVG 三列状态流程图（pending → in_progress → completed，虚线表示状态流转）
- 审批流程改为 SVG 垂直时间线（✓/✕ 节点，间距按等待时长）
- Token 统计改为 ECharts 环形图 + 堆叠面积图（趋势可视化）
- 事件搜索每条结果前增加类型色块（14 组配色）
- ECharts 已本地化到 `static/vendor/echarts.min.js`（离线可用），加载失败时自动回退 CSS 条形图

安装（web profile）：

```bash
cd ~/.dsh/profiles/web
pnpm add dsh-session-viz@link:D:/dsh-session-viz
# 并把 "dsh-session-viz" 加入 package.json 的 dsh.profile.bundles
# 重启 pnpm dsh web 后生效
```

插件文件：
- `src/host/*.ts` — **TypeScript 源码**（解析器/叙述转换/web 路由，类型化重构）
- `lib/host/index.mjs` / `lib/host/web.mjs` — tsdown 构建产物（web.mjs 内联 parser+narrative）
- `lib/client.js` — 会话头部按钮 + 三层查看器（浏览器半，保持零构建）
- `tsdown.config.ts` / `tsconfig.json` — TS 构建链
- `cordis.patch.yml` — bundle 补丁（host 两半：主半 + web 半）

开发：`pnpm install` → `pnpm typecheck` → `pnpm build`（tsdown → lib/，含产物校验）。

## 独立 Web 模式（可选）

```bash
# 1. 安装依赖（fastapi / uvicorn / zstandard）
pip install -r requirements.txt

# 2.（可选）把 ~/.dsh/sessions 下最新的 zstd 日志重新解码到 decoded-sessions/
python app.py --sync

# 3. 启动服务
python app.py --port 8765
```

打开浏览器访问 **http://127.0.0.1:8765** 。

## 功能一览

| 功能 | 说明 |
|------|------|
| 三层视图 | 📋 摘要卡片（所有人）→ 📖 故事线（管理者）→ 🔬 事件树（开发者） |
| 摘要卡片 | 用户需求、轮次/步骤/耗时、工具使用 Top（图标+中文名）、审批结果、文件变更、Token |
| 故事线 | 叙事式时间线，人类语言描述工具/审批/推理，点击展开详情 |
| 事件树 | turn → step → 合并事件组 树形折叠，14 组配色，chunks 同类合并 |
| 事件搜索 | 搜索框（摘要/类型/内容高亮）+ 按功能分组的事件类型下拉 |
| 时间精度 | 毫秒级绝对时间 + 相对会话开始时间（+1.2s） |
| 右侧面板 | 未选中显示会话概览，选中显示事件详情（解读/JSON/原始行） |
| 原始数据 | JSONL 只读视图，按 seq 跳转，当前事件按分组色高亮 |

## 目录结构

```
dsh-session-viz/
├── REQUIREMENTS.md        # 需求文档（数据格式 + 14 组配色 + F1-F10）
├── UI_IMPROVEMENT.md      # UI 改版意见（6 项改动：树形/下拉/时间戳/概览/预览/合并）
├── PRODUCT_REDESIGN.md    # 产品重新定位（三层渐进式：摘要→故事线→技术详情）
├── VISUALIZATION_OPTIMIZATION.md  # 可视化优化方案（ECharts + SVG 图表化改造）
├── analyze.py             # 数据分析脚本（既有）
├── app.py                 # FastAPI 后端（独立 Web 模式）
├── package.json           # DSH 插件清单（dsh.bundle + dsh.client）
├── cordis.patch.yml       # 插件 bundle 补丁
├── lib/
│   ├── host/
│   │   ├── index.mjs      # 插件主 host 半
│   │   ├── web.mjs        # 插件同源 API 路由（/dsh-session-viz/api）
│   │   ├── parser.mjs     # Node 版解析器（多帧 zstd + JSONL + 14 组配色）
│   │   └── narrative.mjs  # 叙述转换层（摘要/故事线/事件树 + 人类语言映射）
│   ├── client.js          # 插件浏览器半（头部按钮 + 三层查看器）
│   ├── decompressor.py    # Python 解压（独立模式用）
│   ├── parser.py          # Python 解析器（独立模式用）
│   └── models.py          # Python 数据模型 + 14 组颜色方案
├── static/                # 独立 Web 模式前端
├── decoded-sessions/      # 已解压的会话数据
├── scripts/build.mjs      # 插件构建校验（零转译）
├── tests/test_parser.py   # 单元测试
└── requirements.txt
```

## 插件 API（host 半）

| 端点 | 说明 |
|------|------|
| `GET /dsh-session-viz/api/meta` | 14 组配色方案（前端主题） |
| `GET /dsh-session-viz/api/sessions?q=` | 会话列表（轻量元信息，可搜索） |
| `GET /dsh-session-viz/api/summary?sessionId=` | 执行摘要卡片（第一层） |
| `GET /dsh-session-viz/api/story?sessionId=` | 执行故事线（第二层） |
| `GET /dsh-session-viz/api/tree?sessionId=` | 技术事件树（第三层，含 typeCounts） |
| `GET /dsh-session-viz/api/log?sessionId=&from=&to=&q=` | 会话日志分页事件（q=全文搜索） |
| `GET /dsh-session-viz/api/line?sessionId=&line=` | 单行事件的完整解析 + 原始 JSON |

会话图（`./map-web` 半，依赖 `webServer` + `sessionQuery`）：

| 端点 | 说明 |
|------|------|
| `GET /dsh-session-viz/api/map/snapshot?sessionId=` | 谱系拓扑快照（主线 + 子 Agent 分叉，仅轻量语义字段） |
| `GET /dsh-session-viz/api/map/event?sessionId=&seq=` | 按需读取单个事件及其前后各 2 条原始日志 |

## API

| 端点 | 说明 |
|------|------|
| `GET /api/sessions` | 会话列表（轻量扫描） |
| `GET /api/sessions/{dir}/{id}` | 会话摘要 + 统计 |
| `GET /api/sessions/{dir}/{id}/events` | 事件列表（type/group/q/时间范围/行区间筛选，分页） |
| `GET /api/sessions/{dir}/{id}/events/{seq}` | 按 seq 取单个事件与原始行 |
| `GET /api/sessions/{dir}/{id}/timeline` | 时间线（turn/step 聚合，事件按需加载） |
| `GET /api/sessions/{dir}/{id}/tools` | 工具调用列表 |
| `GET /api/sessions/{dir}/{id}/reasoning` | 合并后的推理文本 |
| `GET /api/sessions/{dir}/{id}/tokens` | Token 用量 |
| `GET /api/sessions/{dir}/{id}/approvals` | 审批配对 |
| `GET /api/sessions/{dir}/{id}/todos` | 任务清单快照 |
| `GET /api/sessions/{dir}/{id}/raw?seq=` | 原始 JSONL（按行区间或 seq 跳转） |
| `GET /api/sessions/{dir}/{id}/export` | 静态 HTML 报告 |
| `POST /api/sync` | 重新解码 zstd 源 |
| `GET /api/meta` | 14 组配色与分组顺序（前端主题） |

## 构建与架构

host 半与 client 半现在都由 tsdown 构建：

| 产物 | 来源 | 说明 |
|------|------|------|
| `lib/host/index.mjs` | `src/host/index.ts` | 主 host 半 |
| `lib/host/web.mjs` | `src/host/web.ts` | AgentTrace 数据路由（`/dsh-session-viz/api/*`） |
| `lib/host/map-web.mjs` | `src/host/map-web.ts` | 会话图快照路由（`/dsh-session-viz/api/map/*`） |
| `lib/client.js` | `src/client/index.ts` | 单一浏览器 bundle：AgentTrace 查看器 + SVG 闭环轮环图（约 140 KB，无 Three.js） |

client 半原为**零构建手写 JS**；融合会话图后改为构建产出单一
bundle——`dsh.client` 只能声明一个 `./client` 入口，所有视图必须合并到同一个
`window.__ModuleLoader__.load` 包装里。手写查看器原样保留在
`src/client/legacy-viewer.js` 参与打包，未做大规模重写。

会话图作为 AgentTrace 的**内部模式**注入：`legacy-viewer.js` 导出
`registerExtraMode()`，`src/client/index.ts` 用它把 `SessionMapView` 注册为
🗺 模式标签页（不再占用独立的 `conversation.view` 插槽），首页也有一键打开入口。
渲染层是 **SVG 闭环轮环图**（`src/client/LoopMap.tsx` + `model.ts#loopLayout`），
取代了原先 Three.js 的横向条状执行线：每个轮次一个同心圆环、子 Agent 分叉环，
闭合/进行中/失败由颜色、虚线与脉冲动画表达；`verify-build` 会断言 bundle 中
不再包含 `WebGLRenderer`。

首页的闭环模型由 host 半 `buildClosure()`（`src/host/narrative.ts`）在
`/api/tree` 响应中随 `closure` 字段返回：轮次/步骤/工具调用/审批四类「环」的
开始-结束配对、闭合状态与嵌套关系，前端零额外请求。

`react` / `react-dom` / `@deepseek-ai/*` 一律标记 external，由 DSH 运行时注入。
`lib/` 下还存放 Python 版查看器的 `*.py`，因此两个构建配置
都必须 `clean: false`（`scripts/verify-build.mjs` 会校验它们没被清理掉）。

类型方面，本仓库不导入 `@deepseek-ai` 的类型，而是在 `src/harness-shims.d.ts`
中声明与其契约一致的最小接口，因此 `typecheck` 不依赖本地安装 harness 包，在任何
机器上都能干净通过。

```bash
pnpm install
pnpm run typecheck   # 0 error
pnpm run test        # vitest：会话图模型/语义单测
pnpm run build       # tsdown + verify-build 契约校验
```

> 安装时如果 pnpm 试图从 registry 拉 `@deepseek-ai/*` peer 并报 404，
> 说明 `auto-install-peers` 被打开了：这些 peer 由 harness 注入，仓库已通过
> `.npmrc` 与 `peerDependenciesMeta.optional` 关闭自动安装。

## 测试

```bash
pnpm run test        # vitest（会话图）
python run_tests.py  # Python 解析器测试
```

## 许可

本仓库以 **Apache-2.0** 分发。

「会话图」视图基于 [lhwu1/dsh-seelog](https://github.com/lhwu1/dsh-seelog)
（**MIT License**）融合：保留了 seelog 的数据模型、语义层与快照路由
（`src/shared/flow.ts`、`src/client/{model,semantic,styles}.ts`、
`src/client/SessionMapView.tsx`、`src/host/map-web.ts`、
`tests/{model,semantic}.spec.ts`），渲染层由 Three.js 横向执行线改为自研的
SVG 闭环轮环图（`src/client/LoopMap.tsx`）。上述保留文件均在文件头保留了 MIT
署名，完整许可文本见 [LICENSE.dsh-seelog.MIT](LICENSE.dsh-seelog.MIT)。
