# DSH Session Log 可视化工具 — 需求文档

> 项目代号: `dsh-session-viz`
> 创建日期: 2026-08-20
> 状态: 需求草案 v2

---

## 一、背景

DSH (DeepSeek Harness) 在每次会话中会记录完整的执行日志，存储为 `session.jsonl.zstd` 文件（zstd 压缩的 JSONL 格式）。这些日志记录了智能体从接收用户指令到完成任务的全过程，包括：

- 推理过程（reasoning）
- 工具调用与结果（tool call / result）
- 多轮对话流程（turn / step）
- 审批请求与决策（approval）
- 任务清单更新（todo）
- 文本流式输出（chunks）

**痛点**：原始日志是压缩的 JSONL 文本，单个会话可达 16000 行 JSON 对象，完全不可读。用户无法快速了解：
- 智能体做了什么
- 调用了哪些工具、顺序如何
- 每个步骤耗时多少
- 推理过程的关键转折点在哪里
- 哪里被审批拦截、哪里出了错

**目标**：将这些结构化日志可视化，用颜色区分不同事件类型，让执行流程一目了然。

---

## 二、数据结构分析

### 2.1 文件位置与解压

**原始文件位置（zstd 压缩）：**
```
C:\Users\23074\.dsh\sessions\<工作目录编码>\<session-id>\session.jsonl.zstd
```

工作目录编码规则：将路径中的 `\` 和 `:` 替换为 `-`，例如 `D:\dsh-recommend` → `--D-dsh-recommend--`。

**解压输出位置（D 盘）：**
```
D:\dsh-session-viz\decoded-sessions\<工作目录编码>\<session-id>\session.json
```

> 已将全部 14 个会话解压至 `D:\dsh-session-viz\decoded-sessions\`，共计约 30 MB JSONL 数据。

### 2.2 文件格式

- **压缩格式**：zstd（magic bytes: `28 B5 2F FD`）
- **解压后格式**：JSONL（每行一个 JSON 对象）
- **数据规模**：

| 维度 | 范围 |
|------|------|
| 会话数量 | 14 个 |
| 单会话事件数 | 5 ~ 16552 行 |
| 压缩大小 | 0.4 KB ~ 11 MB |
| 解压大小 | 0.4 KB ~ 11 MB |
| 事件类型 | 27 种 |

### 2.3 通用字段结构

每个 JSON 对象的核心字段：

| 字段 | 类型 | 说明 | 出现频率 |
|------|------|------|----------|
| `type` | string | 事件类型 | 所有事件 |
| `seq` | int | 全局递增序列号 | 大部分事件 |
| `time` | int | 毫秒级 Unix 时间戳 | 大部分事件 |
| `data` | object | 事件载荷，结构因 type 而异 | 大部分事件 |
| `seq0` | int | 起始序列号（流式分片用） | chunks 类事件 |
| `time0` | int | 起始时间戳（流式分片用） | chunks 类事件 |
| `sourceEventSeqs` | int[] | 关联的源事件 seq 列表 | message/result 类 |
| `surfaceOp` | string | UI 操作类型（append/replace） | message/result 类 |

### 2.4 全部 27 种事件类型 — 完整字段清单与颜色方案

按功能分组，每组分配一个颜色系，用于前端可视化区分。

---

#### 组 1: 会话生命周期（紫色系 `#9C27B0`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `session` | 14 | `version`, `id`, `createdAt`, `cwd`, `delegationDepth`, `agentPreset` | 会话元信息：工作目录、创建时间、智能体预设 |
| `session/title` | 13 | `data.title`, `data.messageSeqs`, `data.source` | 会话标题（由 LLM 自动生成） |
| `session/title-llm-request` | 7 | `data.titleProvider`, `data.messageSeqs`, `data.route`, `data.system`, `data.messages`, `data.maxTokens` | 标题生成的 LLM 请求详情 |
| `session/end-seed` | 14 | `data`(空) | 会话结束种子标记 |

**颜色**：`#9C27B0`（深紫），背景 `#F3E5F5`（浅紫）

---

#### 组 2: 配置与权限（灰色系 `#607D8B`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `permission/preset` | 15 | `data.preset` | 权限预设（如 `workspace-write`、`danger-full-access`） |
| `sandbox/mode` | 15 | `data.mode` | 沙盒模式（如 `workspace-write`） |
| `approval/policy` | 15 | `data.policy` | 审批策略（如 `ask`） |
| `request/header` | 18 | `data.header`, `data.reason` | 请求头：含 config、adapterDefaults、system prompt、tools |
| `request/context` | 9 | `data.provider`, `data.model`, `data.contextWindow` | 请求上下文：模型名、provider、上下文窗口大小 |
| `agent-preset/selected` | 1 | `data.agentPreset` | 智能体预设选择（如 `cordis`、`standard`） |

**颜色**：`#607D8B`（蓝灰），背景 `#ECEFF1`（浅灰）

---

#### 组 3: 对话轮次生命周期（蓝色系 `#2196F3`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `turn/start` | 48 | `data.turn` | 对话轮次开始，标明第几轮 |
| `turn/end` | 46 | `data.turn`, `data.reason` | 轮次结束，reason 含 `kind`（completed/error）和可选 `error` |

**颜色**：`#2196F3`（蓝色），背景 `#E3F2FD`（浅蓝）

---

#### 组 4: 执行步骤生命周期（青色系 `#00BCD4`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `step/start` | 746 | `data.turn`, `data.step` | 步骤开始，定位到具体 turn 和 step 编号 |
| `step/end` | 744 | `data.turn`, `data.step` | 步骤结束 |

**颜色**：`#00BCD4`（青色），背景 `#E0F7FA`（浅青）

---

#### 组 5: 用户输入（绿色系 `#4CAF50`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `user/message` | 65 | `data.content[]`, `data.source`, `data.role`, `data.id` | 用户发送的完整消息，content 含文本/图片等 |
| `agent/inbox/spliced` | 97 | `data.target`, `data.start`, `data.inserted[]`, `data.removedCount` | 消息注入到 inbox，inserted 含完整消息对象 |

**颜色**：`#4CAF50`（绿色），背景 `#E8F5E9`（浅绿）

---

#### 组 6: 助手输出（橙色系 `#FF9800`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `assistant/message` | 740 | `data.turn`, `data.step`, `data.message`, `data.usage` | 完整助手消息，含 role/content/source/id；usage 含 token 统计 |
| `assistant/chunk` | 9003 | `data.turn`, `data.step`, `data.chunk` | 流式输出分片，chunk 含 type/reason 等 |

**`data.usage` 子字段（token 统计）：**
- `inputTokens`：输入 token 数
- `outputTokens`：输出 token 数
- `cacheReadTokens`：缓存读取 token 数
- `reasoningTokens`：推理 token 数

**颜色**：`#FF9800`（橙色），背景 `#FFF3E0`（浅橙）

---

#### 组 7: 推理过程（琥珀色系 `#FFC107`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `reasoning-chunks` | 23015 | `data.turn`, `data.step`, `data.index`, `data.dt[]`, `data.texts[]` | 推理流式分片，dt 为每个分片的时间增量(ms)，texts 为文本片段 |

**字段说明：**
- `data.index`：分片批次序号（同一 step 内递增）
- `data.dt[]`：每个文本片段的时间间隔（毫秒），反映推理速度
- `data.texts[]`：文本片段数组，拼接后为完整推理文本

> 这是数据量最大的事件类型，需合并分片后展示。

**颜色**：`#FFC107`（琥珀），背景 `#FFF8E1`（浅黄）

---

#### 组 8: 通用文本输出（青绿系 `#009688`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `text-chunks` | 1986 | `data.turn`, `data.step`, `data.index`, `data.dt[]`, `data.texts[]` | 通用文本流式分片，结构同 reasoning-chunks |

**颜色**：`#009688`（青绿），背景 `#E0F2F1`（浅青绿）

---

#### 组 9: 工具调用（红色系 `#F44336`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `tool-call-chunks` | 9045 | `data.turn`, `data.step`, `data.index`, `data.id`, `data.name`, `data.args[]`, `data.dt[]` | 工具调用参数的流式分片，含工具名和参数片段 |
| `tool/call` | 963 | `data.turn`, `data.step`, `data.callId`, `data.name`, `data.arguments` | 完整工具调用，arguments 为 JSON 字符串 |
| `tool/result` | 962 | `data.turn`, `data.step`, `data.message`, `data.meta`, `data.error` | 工具返回结果，含 message（source+content）和可选 meta/error |

**`tool/result.data` 子字段：**
- `message.source`：结果来源（`{kind: "tool", callId: "..."}`）
- `message.content[]`：结果内容数组，每个元素含 `type`（tool-result/text）和 `content`
- `meta`：可选元信息（如 `path`, `offset`, `lines`, `totalLines`, `lang`）
- `error`：错误信息（仅失败时出现）

**颜色**：`#F44336`（红色），背景 `#FFEBEE`（浅红），错误 `#D32F2F`（深红）

---

#### 组 10: 审批流程（粉红色系 `#E91E63`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `approval/asked` | 214 | `data.id`, `data.toolName`, `data.callId`, `data.reason` | 审批请求：哪个工具需要审批、原因说明 |
| `approval/decided` | 214 | `data.id`, `data.outcome` | 审批决策：outcome 为 `allowed-once`/`allowed-always`/`denied` |

**配对关系**：`approval/asked.data.id` == `approval/decided.data.id`

**颜色**：`#E91E63`（粉红），背景 `#FCE4EC`（浅粉），拒绝 `#C62828`（深红）

---

#### 组 11: 任务清单（靛蓝色系 `#3F51B5`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `todo/write` | 16 | `data.todos[]` | 任务清单更新快照 |

**`data.todos[]` 子字段：**
- `content`：任务描述文本
- `status`：任务状态（`pending` / `in_progress` / `completed`）

**颜色**：`#3F51B5`（靛蓝），背景 `#E8EAF6`（浅靛蓝）

---

#### 组 12: LLM 重试（深橙色系 `#FF5722`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `llm/retry` | 1 | `data.retryId`, `data.turn`, `data.step`, `data.provider`, `data.mode`, `data.policyKey`, `data.retry`, `data.maxRetries`, `data.delayMs`, `data.failure` | LLM 重试事件：含重试次数、延迟、失败原因 |
| `llm/retry-started` | 1 | `data.retryId`, `data.turn`, `data.step`, `data.retry` | 重试开始标记 |

**颜色**：`#FF5722`（深橙），背景 `#FBE9E7`（浅深橙）

---

#### 组 13: 命令执行（棕色系 `#795548`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `command/run` | 1 | `data.commandId`, `data.name`, `data.args`, `data.source` | 命令执行：名称、参数、来源 |
| `command/done` | 1 | `data.commandId`, `data.kind`, `data.text` | 命令完成：结果类型（success/error）、输出文本 |

**颜色**：`#795548`（棕色），背景 `#EFEBE9`（浅棕）

---

#### 组 14: Web 搜索（紫罗兰系 `#673AB7`）

| type | 数量 | 字段 | 说明 |
|------|------|------|------|
| `web/deepseek-search-llm-request` | 3 | `data.endpoint`, `data.apiVersion`, `data.body` | DeepSeek 搜索的 LLM 请求详情 |

**颜色**：`#673AB7`（紫罗兰），背景 `#EDE7F6`（浅紫罗兰）

---

### 2.5 颜色方案汇总

| 组 | 事件类型 | 前景色 | 背景色 | 边框色 |
|----|----------|--------|--------|--------|
| 会话生命周期 | session, session/title, session/* | `#9C27B0` | `#F3E5F5` | `#7B1FA2` |
| 配置与权限 | permission/*, sandbox/*, request/* | `#607D8B` | `#ECEFF1` | `#455A64` |
| 对话轮次 | turn/start, turn/end | `#2196F3` | `#E3F2FD` | `#1565C0` |
| 执行步骤 | step/start, step/end | `#00BCD4` | `#E0F7FA` | `#00838F` |
| 用户输入 | user/message, agent/inbox/* | `#4CAF50` | `#E8F5E9` | `#2E7D32` |
| 助手输出 | assistant/message, assistant/chunk | `#FF9800` | `#FFF3E0` | `#E65100` |
| 推理过程 | reasoning-chunks | `#FFC107` | `#FFF8E1` | `#F57F17` |
| 通用文本 | text-chunks | `#009688` | `#E0F2F1` | `#00695C` |
| 工具调用 | tool-call-chunks, tool/call, tool/result | `#F44336` | `#FFEBEE` | `#C62828` |
| 审批流程 | approval/asked, approval/decided | `#E91E63` | `#FCE4EC` | `#AD1457` |
| 任务清单 | todo/write | `#3F51B5` | `#E8EAF6` | `#283593` |
| LLM 重试 | llm/retry, llm/retry-started | `#FF5722` | `#FBE9E7` | `#BF360C` |
| 命令执行 | command/run, command/done | `#795548` | `#EFEBE9` | `#4E342E` |
| Web 搜索 | web/* | `#673AB7` | `#EDE7F6` | `#4527A0` |

---

## 三、功能需求

### 3.1 核心功能

#### F1: 会话列表浏览
- 扫描 `D:\dsh-session-viz\decoded-sessions\` 下所有已解压会话
- 展示：会话 ID、工作目录、创建时间、文件大小、事件总数
- 支持按时间排序、按目录筛选
- 点击进入会话详情

#### F2: 执行时间线（Timeline）
- 横轴为时间，纵轴为事件流
- 可视化 turn → step → tool call 的层级关系
- 每个 step 显示为色块，**按 2.5 节颜色方案着色**
- 鼠标悬停显示耗时、事件类型摘要
- 点击 step 展开详情

#### F3: 工具调用流程图（Flow Diagram）
- 按执行顺序展示所有 `tool/call` → `tool/result` 对
- 每个节点显示：工具名称、参数摘要、结果摘要、耗时
- 用连线表示调用顺序
- 支持展开查看完整参数和完整结果
- 失败的工具调用用深红色 `#D32F2F` 标记

#### F4: 推理过程展示（Reasoning View）
- 将 `reasoning-chunks` 的 `texts[]` 分片合并为完整文本
- 按 step 分段展示，使用琥珀色 `#FFC107` 标注
- 显示 `dt[]` 数据反映推理速度（可选：速度曲线图）
- 关键转折点高亮（如 "Let me check"、"I need to" 等推理转折）
- 支持折叠/展开

#### F5: 任务清单追踪（Todo Tracker）
- 展示每次 `todo/write` 的快照
- 可视化任务状态变化（pending → in_progress → completed）
- 用靛蓝色 `#3F51B5` 标注任务卡片
- 时间线标注任务状态变化点

#### F6: 审批流程展示（Approval Flow）
- 展示 `approval/asked` → `approval/decided` 配对（通过 `data.id` 关联）
- 显示：请求内容（toolName + reason）、决策结果（outcome）、等待耗时
- 允许的审批用粉红色 `#E91E63` 标注
- 被拒绝的审批用深红色 `#C62828` 标注

#### F7: Token 用量统计
- 从 `assistant/message.data.usage` 提取 token 统计
- 展示：每轮 inputTokens / outputTokens / reasoningTokens / cacheReadTokens
- 汇总：总会话 token 消耗
- 可选：token 用量趋势图

### 3.2 交互功能

#### F8: 事件搜索与筛选
- 按 type 筛选（只看 tool/call、只看 reasoning 等），**筛选按钮使用对应组颜色**
- 全文搜索（在 reasoning 文本、tool arguments、tool result 中搜索）
- 时间范围筛选

#### F9: 原始数据查看
- 提供 JSONL 原始视图（只读）
- 支持按 seq 跳转
- 当前选中事件在原始视图中高亮，**高亮色使用该事件所属组的背景色**

### 3.3 数据导出

#### F10: 导出报告
- 导出为 HTML 报告（静态可分享）
- 包含：会话摘要、工具调用表、耗时统计、关键推理片段、token 用量
- 报告中使用完整颜色方案

---

## 四、非功能需求

| 维度 | 要求 |
|------|------|
| 输入格式 | zstd 压缩 JSONL，解压至 `D:\dsh-session-viz\decoded-sessions\` |
| 数据量 | 14 个会话，单会话 5 ~ 16552 事件，解压后 0.4 KB ~ 11 MB |
| 响应速度 | 加载会话 < 3 秒，渲染时间线 < 1 秒 |
| 运行环境 | 本地 Web 应用，浏览器访问 |
| 技术栈 | Python（后端解析）+ HTML/CSS/JS（前端可视化） |
| 依赖 | pyzstd（解压，已安装）、标准库（json/pathlib） |

---

## 五、技术方案建议

### 5.1 架构

```
[D:\dsh-session-viz]
├── REQUIREMENTS.md              # 本文档
├── analyze.py                   # 数据分析脚本（已完成）
├── decoded-sessions/            # 已解压的会话数据（D 盘）
│   └── <工作目录编码>/
│       └── <session-id>/
│           └── session.json     # JSONL 格式
├── app.py                       # FastAPI 后端
├── static/
│   ├── index.html               # 主页面
│   ├── app.js                   # 前端逻辑
│   └── style.css                # 样式（含 14 组颜色方案）
├── lib/
│   ├── parser.py                # JSONL 解析器
│   ├── decompressor.py          # zstd 解压（源 → D 盘）
│   └── models.py                # 数据模型
└── tests/
    └── test_parser.py           # 单元测试
```

### 5.2 后端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/sessions` | GET | 列出所有会话（扫描 decoded-sessions） |
| `/api/sessions/{id}` | GET | 获取会话详情（解析后的结构化数据） |
| `/api/sessions/{id}/events` | GET | 获取事件列表（支持 type 筛选、分页） |
| `/api/sessions/{id}/timeline` | GET | 获取时间线数据（聚合后的 turn/step/tool） |
| `/api/sessions/{id}/tools` | GET | 获取工具调用列表（含 call+result 配对） |
| `/api/sessions/{id}/reasoning` | GET | 获取合并后的推理文本（按 step 分段） |
| `/api/sessions/{id}/tokens` | GET | 获取 token 用量统计 |
| `/api/sessions/{id}/export` | GET | 导出 HTML 报告 |

### 5.3 前端可视化

- **时间线**：使用 CSS Grid + 颜色色块，或轻量 SVG
- **流程图**：使用 SVG 连线 + 节点
- **推理文本**：可折叠段落，琥珀色背景
- **任务追踪**：卡片列表 + 状态色标
- **颜色变量**：CSS 变量定义 14 组颜色方案，全局复用

---

## 六、优先级与里程碑

| 里程碑 | 内容 | 优先级 |
|--------|------|--------|
| M1 | zstd 解压（→D 盘）+ JSONL 解析 + 会话列表 | P0 ✅ 已完成解压 |
| M2 | 执行时间线可视化（14 组颜色色块） | P0 |
| M3 | 工具调用流程图 | P1 |
| M4 | 推理过程展示（分片合并 + 速度曲线） | P1 |
| M5 | 任务清单追踪 + 审批流程 | P2 |
| M6 | Token 用量统计 | P2 |
| M7 | 搜索筛选 + 原始数据查看 | P2 |
| M8 | 导出 HTML 报告 | P3 |
