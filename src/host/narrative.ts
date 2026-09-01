/**
 * dsh-session-viz 叙述转换层（TypeScript 版）
 *
 * 原始事件 → 三层渐进式数据：
 *   summary: 执行摘要卡片（面向所有人，无技术术语）
 *   story:   执行故事线（面向管理者，叙事式 turn→step）
 *   tree:    技术事件树（面向开发者，turn→step→合并事件组）
 *
 * 转换规则：
 *   1. 合并 chunks：同一步内 reasoning-chunks / text-chunks / tool-call-chunks /
 *      assistant/chunk 合并为可展开节点（字段差异：texts[] / args[] / chunk 块标记）
 *   2. 配对事件：tool/call+tool/result、approval/asked+approval/decided
 *   3. 人类语言映射：read→📖读取, write→✏️写入, grep→🔍搜索, pwsh→⚙️执行命令…
 *   4. 摘要生成：推理取首句/前 100 字；工具结果提取行数/大小/成败
 *   5. 文件变更提取：从 write/edit 工具 + result meta 收集
 *   6. 审批故事化：原因简化为人类可读文本
 */

import { GROUPS, groupOf } from "./parser.js"

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface ToolStat { icon: string; verb: string; count: number }

export interface FileChange {
  path: string
  action: "created" | "modified"
  time: number | null
  lines: number | null
  error: boolean
  /** 变更内容：write 为完整新内容；edit 为 old/new 片段（前端做 diff） */
  content?: string
  oldString?: string
  newString?: string
  /** 变更是否完整可见（edit 的 old/new 完整，write 的内容可能很长） */
  preview?: string
}

export interface SummaryData {
  title: string | null
  userRequest: string | null
  turnCount: number
  stepCount: number
  durationMs: number
  startTime: number | null
  endTime: number | null
  model: string | null
  toolStats: Record<string, ToolStat>
  approvalStats: { total: number; allowed: number; denied: number; pending: number }
  files: FileChange[]
  tokens: { inputTokens: number; outputTokens: number; cacheReadTokens: number; reasoningTokens: number }
  eventCount: number
  openApprovals: number
}

export type StoryNodeKind = "user" | "reasoning" | "tool" | "assistant" | "approval"

export interface StoryNode {
  kind: StoryNodeKind
  time: number | null
  human: string
  turn: number
  step: number
  text?: string
  args?: string
  name?: string
  callId?: string
  result?: string
  resultError?: boolean
  id?: string
  toolName?: string
  outcome?: string
  outcomeHuman?: string
}

export interface StoryTurn {
  turn: number
  startTime: number | null
  nodes: StoryNode[]
  eventCount: number
}

export type TreeGroupKind = "event" | "reasoning" | "text" | "tool-call" | "assistant"

export interface TreeEvent {
  line: number
  seq: number | null
  time: number | null
  type: string
  group: string
  summary: string
  error?: boolean
  human?: string
  toolName?: string
  outcome?: string
}

export interface TreeGroup {
  kind: TreeGroupKind
  label?: string
  fg?: string
  bg?: string
  count?: number
  chars?: number
  durationMs?: number
  startLine?: number
  endLine?: number
  preview?: string
  text?: string
  events?: TreeEvent[]
}

export interface TreeStep {
  turn: number
  step: number
  startTime: number | null
  startLine: number
  endTime?: number | null
  endLine?: number
  eventCount: number
  groups: TreeGroup[]
  tools: string[]
}

export interface TreeTurn {
  turn: number
  startTime: number | null
  startLine: number
  endTime?: number | null
  endLine?: number
  eventCount: number
  steps: TreeStep[]
  groups: TreeGroup[]
}

// ---------------------------------------------------------------------------
// 闭环模型（首页「会话过程」视图）
// ---------------------------------------------------------------------------

export type ClosureKind = "turn" | "step" | "tool" | "approval"
export type ClosureStatus = "closed" | "open" | "error"

/** 一个「环」：开始事件与结束事件配对；只有开始 = 未闭合（会话进行中/异常中断）。 */
export interface ClosureRing {
  id: string
  kind: ClosureKind
  label: string          // 中文短名：第 1 轮 / 第 2 步 / read / 审批
  turn?: number
  step?: number
  status: ClosureStatus
  openLine: number
  closeLine?: number
  openTime: number | null
  closeTime?: number | null
  durationMs?: number
  detail?: string        // 工具名 / 错误码 / 审批结果
  children: ClosureRing[]  // turn 内含 step；step 内含 tool/approval
}

/** 四类环的汇总统计。 */
export interface ClosureSummary {
  turn: { total: number; closed: number; open: number; error: number }
  step: { total: number; closed: number; open: number; error: number }
  tool: { total: number; closed: number; open: number; error: number }
  approval: { total: number; closed: number; open: number; error: number }
  unclosed: ClosureRing[]  // 所有未闭合的环（顶层视角，供首页「进行中」展示）
}

export interface ClosureModel {
  rings: ClosureRing[]
  summary: ClosureSummary
}

function ringLabel(kind: ClosureKind, d: Record<string, unknown>, fallback: string): string {
  if (kind === "tool") return String(d.name ?? "工具")
  if (kind === "approval") return "审批"
  if (kind === "turn") return `第 ${String(d.turn ?? "?")} 轮`
  return `第 ${String(d.turn ?? "?")} 轮·第 ${String(d.step ?? "?")} 步`
}

function ringDuration(openTime: number | null, closeTime: number | null | undefined): number | undefined {
  if (openTime == null || closeTime == null) return undefined
  return closeTime - openTime
}

/**
 * 从原始事件序列构建闭环模型。
 *
 * 配对规则：
 *   - turn/start ↔ turn/end        （无 end = 未闭合）
 *   - step/start ↔ step/end        （无 end = 未闭合）
 *   - tool/call ↔ tool/result      按 data.callId 配对；result 带 error = 失败
 *   - approval/asked ↔ approval/decided  按出现顺序配对（approval 无稳定 id）
 *   - turn/end 的 reason.kind === "error" 记为 error 环
 *
 * 嵌套：tool/approval 归入其所在 step 的 children，step 归入 turn 的 children。
 */
export function buildClosure(objs: Array<Record<string, unknown> | null>): ClosureModel {
  const turns: ClosureRing[] = []
  const stack: ClosureRing[] = []   // 当前 open 的 turn/step（用于归属 children）
  const orphans: ClosureRing[] = [] // 无 turn 上下文时创建的环（如会话外的审批）
  let curStepRing: ClosureRing | null = null
  let curTurnRing: ClosureRing | null = null
  const toolCalls = new Map<string, ClosureRing>()
  const approvals: ClosureRing[] = []  // 按序 pending 的 approval

  function pushToParent(ring: ClosureRing): void {
    if (curStepRing) curStepRing.children.push(ring)
    else if (curTurnRing) curTurnRing.children.push(ring)
    else orphans.push(ring)
  }

  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]
    if (!o) continue
    const t = (o.type ?? "?") as string
    const d = (o.data ?? {}) as Record<string, unknown>
    const time = (o.time as number) ?? null

    if (t === "turn/start") {
      curTurnRing = {
        id: `turn-${String(d.turn ?? i)}`,
        kind: "turn",
        label: ringLabel("turn", d, "轮"),
        turn: d.turn as number,
        status: "closed",
        openLine: i,
        openTime: time,
        children: [],
      }
      turns.push(curTurnRing)
      stack.push(curTurnRing)
      curStepRing = null
      continue
    }
    if (t === "turn/end") {
      const reason = (d.reason ?? {}) as Record<string, unknown>
      if (curTurnRing) {
        curTurnRing.closeLine = i
        curTurnRing.closeTime = time
        curTurnRing.durationMs = ringDuration(curTurnRing.openTime, time)
        curTurnRing.status = reason.kind === "error" ? "error" : "closed"
        if (reason.kind === "error") curTurnRing.detail = String((reason.error as Record<string, unknown> | undefined)?.code ?? "error")
      }
      stack.pop()
      const top = stack.length ? stack[stack.length - 1] : undefined
      curTurnRing = top !== undefined && top.kind === "turn" ? top : null
      curStepRing = top !== undefined && top.kind === "step" ? top : null
      continue
    }
    if (t === "step/start") {
      const ring: ClosureRing = {
        id: `step-${String(d.turn ?? "?")}-${String(d.step ?? i)}`,
        kind: "step",
        label: ringLabel("step", d, "步"),
        turn: d.turn as number,
        step: d.step as number,
        status: "closed",
        openLine: i,
        openTime: time,
        children: [],
      }
      pushToParent(ring)
      stack.push(ring)
      curStepRing = ring
      continue
    }
    if (t === "step/end") {
      if (curStepRing) {
        curStepRing.closeLine = i
        curStepRing.closeTime = time
        curStepRing.durationMs = ringDuration(curStepRing.openTime, time)
      }
      stack.pop()
      const top = stack.length ? stack[stack.length - 1] : undefined
      curStepRing = top !== undefined && top.kind === "step" ? top : null
      continue
    }
    if (t === "tool/call") {
      const callId = String(d.callId ?? `call-${i}`)
      const rawName = String(d.name ?? "工具")
      const ring: ClosureRing = {
        id: `tool-${callId}`,
        kind: "tool",
        label: toolZh(rawName),
        turn: (curTurnRing?.turn) ?? (d.turn as number | undefined),
        step: curStepRing?.step,
        status: "open",
        openLine: i,
        openTime: time,
        detail: rawName,
        children: [],
      }
      toolCalls.set(callId, ring)
      pushToParent(ring)
      continue
    }
    if (t === "tool/result") {
      const source = (d.message as Record<string, unknown> | undefined)?.source as Record<string, unknown> | undefined
      const callId = String(source?.callId ?? d.callId ?? "")
      const ring = toolCalls.get(callId)
      if (ring) {
        ring.closeLine = i
        ring.closeTime = time
        ring.durationMs = ringDuration(ring.openTime, time)
        const hasError = d.error !== undefined
        ring.status = hasError ? "error" : "closed"
        if (hasError) ring.detail = String((d.error as Record<string, unknown> | undefined)?.code ?? "error")
      }
      continue
    }
    if (t === "approval/asked") {
      const ring: ClosureRing = {
        id: `approval-${i}`,
        kind: "approval",
        label: "审批",
        turn: curTurnRing?.turn,
        step: curStepRing?.step,
        status: "open",
        openLine: i,
        openTime: time,
        detail: String(d.toolName ?? ""),
        children: [],
      }
      approvals.push(ring)
      pushToParent(ring)
      continue
    }
    if (t === "approval/decided") {
      const ring = approvals.pop()
      if (ring) {
        ring.closeLine = i
        ring.closeTime = time
        ring.durationMs = ringDuration(ring.openTime, time)
        const outcome = String(d.outcome ?? "")
        ring.status = outcome === "denied" ? "error" : "closed"
        ring.detail = outcome === "allowed-once" ? "允许一次" : outcome === "allowed-always" ? "始终允许" : outcome === "denied" ? "已拒绝" : outcome
      }
      continue
    }
  }

  // 汇总
  const counts = { turn: { total: 0, closed: 0, open: 0, error: 0 }, step: { total: 0, closed: 0, open: 0, error: 0 }, tool: { total: 0, closed: 0, open: 0, error: 0 }, approval: { total: 0, closed: 0, open: 0, error: 0 } }
  const unclosed: ClosureRing[] = []
  function countRing(r: ClosureRing): void {
    const c = counts[r.kind]
    c.total++
    if (r.status === "closed") c.closed++
    else if (r.status === "open") { c.open++; unclosed.push(r) }
    else c.error++
    r.children.forEach(countRing)
  }
  turns.forEach(countRing)
  orphans.forEach(countRing)

  return { rings: [...turns, ...orphans], summary: { ...counts, unclosed } }
}

// ---------------------------------------------------------------------------
// 人类语言映射
// ---------------------------------------------------------------------------

const TOOL_HUMAN: Record<string, { icon: string; verb: string }> = {
  read: { icon: "📖", verb: "读取了" },
  write: { icon: "✏️", verb: "写入了" },
  edit: { icon: "✏️", verb: "编辑了" },
  glob: { icon: "🔍", verb: "搜索了文件" },
  grep: { icon: "🔍", verb: "搜索了关键词" },
  rg: { icon: "🔍", verb: "搜索了关键词" },
  pwsh: { icon: "⚙️", verb: "执行了命令" },
  bash: { icon: "⚙️", verb: "执行了命令" },
  dsh: { icon: "⚙️", verb: "执行了命令" },
  web_search: { icon: "🌐", verb: "搜索了网页" },
  todo_write: { icon: "📋", verb: "更新了任务清单" },
  skill: { icon: "📚", verb: "加载了技能" },
  subagent: { icon: "🧩", verb: "派发了子任务" },
  ask_user_question: { icon: "❓", verb: "询问了用户" },
  import_document: { icon: "📄", verb: "导入了文档" },
  recommend_plugins: { icon: "⭐", verb: "推荐了插件" },
  search_plugins: { icon: "🔎", verb: "搜索了插件" },
  rank_plugins: { icon: "🏆", verb: "查询了插件榜" },
  trend_plugins: { icon: "📈", verb: "查询了插件趋势" },
  sync_registry: { icon: "🔄", verb: "同步了插件数据" },
  sandbox_start: { icon: "🧪", verb: "启动了沙盒" },
  sandbox_list: { icon: "🧪", verb: "列出了沙盒" },
  sandbox_stop: { icon: "🧪", verb: "停止了沙盒" },
  sandbox_destroy: { icon: "🧪", verb: "销毁了沙盒" },
  sandbox_logs: { icon: "🧪", verb: "查看了沙盒日志" },
  sandbox_build: { icon: "🧪", verb: "构建了沙盒插件" },
  code_workbench: { icon: "💻", verb: "操作了代码工作台" },
}

function humanTool(name: string): { icon: string; verb: string } {
  return TOOL_HUMAN[name] ?? { icon: "🛠️", verb: `调用了 ${name}` }
}

/** 工具中文显示名（闭环模型/首页/会话图标签用）。 */
const TOOL_ZH: Record<string, string> = {
  read: "读取文件", write: "写入文件", edit: "编辑文件", glob: "搜索文件", grep: "搜索关键词", rg: "搜索关键词",
  list_files: "列出目录", search_files: "搜索文件", apply_patch: "应用补丁", exec_command: "执行命令",
  pwsh: "PowerShell", bash: "终端命令", dsh: "终端命令", dsh_web: "网页命令",
  web_search: "网页搜索", web_fetch: "网页读取", todo_write: "任务清单", skill: "技能",
  subagent: "子任务", ask_user_question: "询问用户", imagegen: "生成图片",
  sandbox_start: "启动沙盒", sandbox_list: "沙盒列表", sandbox_stop: "停止沙盒", sandbox_destroy: "销毁沙盒",
  sandbox_logs: "沙盒日志", sandbox_build: "沙盒构建", code_workbench: "代码工作台",
  import_document: "导入文档", recommend_plugins: "插件推荐", search_plugins: "插件搜索", rank_plugins: "插件榜",
  trend_plugins: "插件趋势", sync_registry: "同步插件数据",
}

function toolZh(name: string): string {
  return TOOL_ZH[name] ?? name
}

/** 工具调用 → 人类语言句子。 */
function toolSentence(toolName: string, argsObj: Record<string, unknown> | null): string {
  const h = humanTool(toolName)
  if (!argsObj || typeof argsObj !== "object") return `${h.icon} ${h.verb}`
  const file = argsObj.file_path ?? argsObj.path ?? null
  const pattern = argsObj.pattern ?? null
  const cmd = argsObj.command ?? null
  if (file) return `${h.icon} ${h.verb} ${String(file)}`
  if (pattern) return `${h.icon} ${h.verb} "${String(pattern).slice(0, 40)}"`
  if (cmd) return `${h.icon} ${h.verb}: ${String(cmd).slice(0, 60)}`
  const argName = argsObj.name ?? null
  if (argName) return `${h.icon} ${h.verb} ${String(argName)}`
  return `${h.icon} ${h.verb}`
}

/** 工具结果 → 人类语言摘要。 */
function resultSentence(name: string | null, data: Record<string, unknown> | undefined): string {
  const d = data ?? {}
  if (d.error) return `❌ 失败：${typeof d.error === "string" ? d.error.slice(0, 60) : "工具错误"}`
  const meta = (d.meta ?? {}) as Record<string, unknown>
  const parts: string[] = []
  if (meta.totalLines != null) parts.push(`${meta.totalLines} 行`)
  if (meta.path && (name === "read" || name === "write" || name === "edit")) parts.push(String(meta.path))
  if (parts.length) return `✅ ${parts.join(" · ")}`
  const message = (d.message ?? {}) as Record<string, unknown>
  const msg = (message.content ?? []) as Array<Record<string, unknown>>
  for (const p of msg) {
    if (p?.type === "text" && typeof p.text === "string") {
      const t = p.text.trim().replace(/\s+/g, " ")
      return t.length > 60 ? t.slice(0, 60) + "…" : t
    }
  }
  return "✅ 完成"
}

/** 审批原因 → 人类语言。 */
function approvalSentence(data: Record<string, unknown> | undefined): string {
  const d = data ?? {}
  const tool = (d.toolName as string) ?? "工具"
  const reason = String(d.reason ?? "").trim()
  if (!reason) return `请求调用 ${tool}`
  const r = reason.replace(/^escalate sandbox to \S+:?\s*/i, "")
  return `请求调用 ${tool}：${r.length > 80 ? r.slice(0, 80) + "…" : r}`
}

const MODEL_LABELS: Record<string, string> = {
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v3.2": "DeepSeek V3.2",
}

function modelLabel(model: unknown): string {
  return MODEL_LABELS[String(model)] ?? (model ? String(model) : "—")
}

// ---------------------------------------------------------------------------
// 技术事件树
// ---------------------------------------------------------------------------

interface ChunkGroupSpec {
  kind: "reasoning" | "text" | "tool-call" | "assistant"
  label: string
  fg: string
  bg: string
}

const CHUNK_GROUP: Record<string, ChunkGroupSpec> = {
  "reasoning-chunks": { kind: "reasoning", label: "推理过程", fg: "#FFC107", bg: "#FFF8E1" },
  "text-chunks": { kind: "text", label: "文本输出", fg: "#009688", bg: "#E0F2F1" },
  "tool-call-chunks": { kind: "tool-call", label: "工具调用流", fg: "#F44336", bg: "#FFEBEE" },
  "assistant/chunk": { kind: "assistant", label: "助手输出", fg: "#FF9800", bg: "#FFF3E0" },
}

interface AccState extends ChunkGroupSpec {
  count: number
  chars: number
  dt: number[]
  texts: string[]
  startLine: number
  endLine: number
}

/** 折叠树：turn → step → (合并组 + 独立事件)。 */
export function buildTree(lines: string[], objs: Array<Record<string, unknown> | null>): TreeTurn[] {
  const turns: TreeTurn[] = []
  let curTurn: TreeTurn | null = null
  let curStep: TreeStep | null = null
  let acc: AccState | null = null

  function closeGroup(): void {
    if (!acc) return
    if (acc.count > 0) {
      const joined = acc.texts.join("")
      const clean = joined.replace(/\s+/g, " ").trim()
      const preview = clean
        ? (clean.length > 100 ? clean.slice(0, 100) + "…" : clean)
        : (acc.kind === "assistant" ? `${acc.count} 个流式块标记`
          : acc.kind === "tool-call" ? `${acc.count} 个参数分片`
          : `${acc.count} 个分片`)
      const group: TreeGroup = {
        kind: acc.kind,
        label: acc.label,
        fg: acc.fg,
        bg: acc.bg,
        count: acc.count,
        chars: acc.chars,
        preview,
        text: joined,
        durationMs: acc.dt.reduce((a, b) => a + b, 0),
        startLine: acc.startLine,
        endLine: acc.endLine,
      }
      if (curStep) curStep.groups.push(group)
    }
    acc = null
  }

  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]
    if (!o) continue
    const t = (o.type ?? "?") as string
    const d = (o.data ?? {}) as Record<string, unknown>

    if (t === "turn/start") {
      curTurn = { turn: d.turn as number, startTime: (o.time as number) ?? null, startLine: i, eventCount: 0, steps: [], groups: [] }
      turns.push(curTurn)
      curStep = null
      continue
    }
    if (t === "turn/end") {
      if (curTurn) { curTurn.endTime = (o.time as number) ?? null; curTurn.endLine = i }
      curTurn = null
      continue
    }
    if (t === "step/start") {
      closeGroup()
      if (curTurn) {
        curStep = { turn: d.turn as number, step: d.step as number, startTime: (o.time as number) ?? null, startLine: i, eventCount: 0, groups: [], tools: [] }
        curTurn.steps.push(curStep)
      }
      continue
    }
    if (t === "step/end") {
      closeGroup()
      if (curStep) { curStep.endTime = (o.time as number) ?? null; curStep.endLine = i }
      curStep = null
      continue
    }

    const host: TreeStep | TreeTurn | null = curStep ?? curTurn
    if (!host) continue
    host.eventCount++
    if (curTurn) curTurn.eventCount++

    // chunks 合并（不同 chunk 类型字段不同）
    const cg = CHUNK_GROUP[t]
    if (cg && curStep) {
      if (!acc || acc.kind !== cg.kind) {
        closeGroup()
        acc = { ...cg, count: 0, chars: 0, dt: [], texts: [], startLine: i, endLine: i }
      }
      const texts = (d.texts ?? []) as string[]
      const dt = (d.dt ?? []) as number[]
      acc.count += 1
      acc.dt.push(...dt)
      if (t === "tool-call-chunks") {
        const argText = ((d.args ?? []) as string[]).join("")
        if (argText) { acc.texts.push(argText); acc.chars += argText.length }
      } else if (t === "assistant/chunk") {
        const chunk = (d.chunk ?? {}) as Record<string, unknown>
        const blockType = (chunk.blockType ?? chunk.type ?? "") as string
        acc.texts.push(blockType ? `[${blockType}]` : "[流式块]")
        acc.chars += blockType.length + 2
      } else {
        acc.chars += texts.reduce((a, x) => a + x.length, 0)
        acc.texts.push(...texts)
      }
      acc.endLine = i
      continue
    }

    // 独立事件（低频/重要类型）
    const item: TreeEvent = {
      line: i,
      seq: (o.seq as number) ?? (o.seq0 as number) ?? null,
      time: (o.time as number) ?? (o.time0 as number) ?? null,
      type: t,
      group: groupOf(t),
      summary: summarizeType(o),
      error: t === "tool/result" ? Boolean(d.error) : (t === "turn/end" ? ((d.reason ?? {}) as Record<string, unknown>).kind === "error" : false),
    }
    if (t === "tool/call") {
      let argsObj: Record<string, unknown> | null = null
      try { argsObj = JSON.parse(String(d.arguments ?? "{}")) } catch { argsObj = null }
      item.human = toolSentence(d.name as string, argsObj)
      item.toolName = d.name as string
      if (curStep) curStep.tools.push(d.name as string)
    }
    if (t === "tool/result") item.human = resultSentence(item.toolName ?? null, d)
    if (t === "approval/asked") item.human = approvalSentence(d)
    if (t === "approval/decided") {
      item.outcome = d.outcome as string
      item.human = d.outcome === "allowed-once" ? "✅ 允许一次"
        : d.outcome === "allowed-always" ? "✅ 始终允许"
        : d.outcome === "denied" ? "❌ 已拒绝" : `决策 ${d.outcome ?? "?"}`
    }
    if (t === "assistant/message") {
      const usage = (d.usage ?? {}) as Record<string, unknown>
      item.human = `输出 ${usage.outputTokens ?? 0} tokens · 输入 ${usage.inputTokens ?? 0}`
    }
    host.groups.push({ kind: "event", events: [item] })
  }
  closeGroup()
  return turns
}

// ---------------------------------------------------------------------------
// 执行摘要
// ---------------------------------------------------------------------------

function contentTextOf(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((p) => {
      const part = p as Record<string, unknown>
      return (part.text as string) ?? `[${part.type ?? "?"}]`
    })
    .filter(Boolean)
    .join(" ")
}

function pathFromArgs(argsStr: unknown): string | null {
  try {
    const a = JSON.parse(String(argsStr ?? "{}")) as Record<string, unknown>
    return (a.file_path as string) ?? (a.path as string) ?? null
  } catch { return null }
}

export function buildSummary(
  lines: string[],
  objs: Array<Record<string, unknown> | null>,
  meta: { title: string | null; durationMs?: number; startTime?: number | null; endTime?: number | null },
  typeCounts: Record<string, number> | null,
): SummaryData {
  const summary: SummaryData = {
    title: meta.title ?? null,
    userRequest: null,
    turnCount: 0,
    stepCount: 0,
    durationMs: meta.durationMs ?? 0,
    startTime: meta.startTime ?? null,
    endTime: meta.endTime ?? null,
    model: null,
    toolStats: {},
    approvalStats: { total: 0, allowed: 0, denied: 0, pending: 0 },
    files: [],
    tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0 },
    eventCount: typeCounts ? Object.values(typeCounts).reduce((a, b) => a + b, 0) : objs.length,
    openApprovals: 0,
  }

  const pendingApproval = new Map<string, { toolName: unknown; time: number | null }>()
  const toolCalls: Array<{ callId: string | null; name: string | null; args: unknown }> = []
  let firstUserMsg: string | null = null

  for (const o of objs) {
    if (!o) continue
    const t = (o.type ?? "?") as string
    const d = (o.data ?? {}) as Record<string, unknown>

    if (t === "turn/start") summary.turnCount++
    else if (t === "step/start") summary.stepCount++
    else if (t === "user/message") {
      if (!firstUserMsg) {
        const texts = ((d.content ?? []) as Array<Record<string, unknown>>)
          .map((p) => (p.text as string) ?? `[${p.type}]`)
          .filter(Boolean)
        firstUserMsg = texts.join(" ").trim()
        summary.userRequest = firstUserMsg.slice(0, 200)
      }
    } else if (t === "assistant/message") {
      const u = (d.usage ?? {}) as Record<string, unknown>
      summary.tokens.inputTokens += (u.inputTokens as number) ?? 0
      summary.tokens.outputTokens += (u.outputTokens as number) ?? 0
      summary.tokens.cacheReadTokens += (u.cacheReadTokens as number) ?? 0
      summary.tokens.reasoningTokens += (u.reasoningTokens as number) ?? 0
    } else if (t === "request/context" && !summary.model) {
      summary.model = modelLabel(d.model)
    } else if (t === "tool/call") {
      let argsObj: Record<string, unknown> | null = null
      try { argsObj = JSON.parse(String(d.arguments ?? "{}")) } catch { argsObj = null }
      toolCalls.push({ callId: d.callId as string | null, name: d.name as string | null, args: argsObj })
    } else if (t === "approval/asked") {
      pendingApproval.set(d.id as string, { toolName: d.toolName, time: (o.time as number) ?? null })
    } else if (t === "approval/decided") {
      summary.approvalStats.total++
      if (d.outcome === "denied") summary.approvalStats.denied++
      else summary.approvalStats.allowed++
      pendingApproval.delete(d.id as string)
    } else if (t === "tool/result") {
      const src = (((d.message ?? {}) as Record<string, unknown>).source as Record<string, unknown>)?.callId ?? null
      const metaObj = (d.meta ?? {}) as Record<string, unknown>
      const isError = Boolean(d.error)
      const tc = toolCalls.find((c) => c.callId === src)
      const name = tc?.name ?? null
      const path = (metaObj.path as string) ?? (tc ? pathFromArgs(JSON.stringify(tc.args)) : null)
      if (path && (name === "write" || name === "edit")) {
        const args = (tc?.args ?? {}) as Record<string, unknown>
        const content = args.content as string | undefined
        const oldString = (args.old_string ?? args.oldString) as string | undefined
        const newString = (args.new_string ?? args.newString) as string | undefined
        summary.files.push({
          path,
          action: metaObj.created ? "created" : "modified",
          time: (o.time as number) ?? null,
          lines: (metaObj.totalLines as number) ?? null,
          error: isError,
          content: name === "write" ? content : undefined,
          oldString: name === "edit" ? oldString : undefined,
          newString: name === "edit" ? newString : undefined,
          preview: name === "edit" ? newString?.slice(0, 120) : content?.slice(0, 120),
        })
      }
      if (src) {
        const idx = toolCalls.findIndex((c) => c.callId === src)
        if (idx >= 0) toolCalls.splice(idx, 1)
      }
    }
  }

  for (const o of objs) {
    if (o?.type !== "tool/call") continue
    const data = (o.data ?? {}) as Record<string, unknown>
    const name = data.name as string | undefined
    if (!name) continue
    if (!summary.toolStats[name]) {
      const h = humanTool(name)
      summary.toolStats[name] = { icon: h.icon, verb: h.verb, count: 0 }
    }
    summary.toolStats[name].count++
  }
  summary.toolStats = Object.fromEntries(Object.entries(summary.toolStats).sort((a, b) => b[1].count - a[1].count))
  summary.approvalStats.pending = pendingApproval.size
  return summary
}

// ---------------------------------------------------------------------------
// 执行故事线
// ---------------------------------------------------------------------------

function sentenceOf(text: unknown): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  const m = t.match(/^(.+?[.!?。！？])/)
  const s = m?.[1] ?? t
  return s.length > 100 ? s.slice(0, 100) + "…" : s
}

export function buildStory(lines: string[], objs: Array<Record<string, unknown> | null>): StoryTurn[] {
  const turns: StoryTurn[] = []
  let cur: StoryTurn | null = null
  let stepBuf: {
    step: number
    nodes: StoryNode[]
    reasoning: string | null
    reasoningStart: number | null
    toolNodes: StoryNode[]
    approvalNodes: StoryNode[]
    assistantText: string | null
    assistantTime: number | null
  } | null = null

  function flushStep(): void {
    if (!stepBuf || !cur) return
    if (stepBuf.reasoning) {
      stepBuf.nodes.push({
        kind: "reasoning",
        time: stepBuf.reasoningStart,
        text: stepBuf.reasoning,
        human: `AI 推理：${sentenceOf(stepBuf.reasoning)}`,
        turn: cur.turn, step: stepBuf.step,
      })
    }
    stepBuf.nodes.push(...stepBuf.toolNodes)
    stepBuf.nodes.push(...stepBuf.approvalNodes)
    if (stepBuf.assistantText) {
      stepBuf.nodes.push({
        kind: "assistant",
        time: stepBuf.assistantTime,
        text: stepBuf.assistantText,
        human: sentenceOf(stepBuf.assistantText),
        turn: cur.turn, step: stepBuf.step,
      })
    }
    cur.nodes.push(...stepBuf.nodes)
    stepBuf = null
  }

  for (const o of objs) {
    if (!o) continue
    const t = (o.type ?? "?") as string
    const d = (o.data ?? {}) as Record<string, unknown>

    if (t === "turn/start") {
      cur = { turn: d.turn as number, startTime: (o.time as number) ?? null, nodes: [], eventCount: 0 }
      turns.push(cur)
      continue
    }
    if (t === "turn/end") { flushStep(); cur = null; continue }
    if (t === "step/start") {
      flushStep()
      stepBuf = { step: d.step as number, nodes: [], reasoning: null, reasoningStart: null, toolNodes: [], approvalNodes: [], assistantText: null, assistantTime: null }
      continue
    }
    if (t === "step/end") { flushStep(); continue }
    if (!cur || !stepBuf) continue

    if (t === "user/message") {
      stepBuf.nodes.push({ kind: "user", time: (o.time as number) ?? null, text: contentTextOf(d.content), human: "用户发送需求", turn: cur.turn, step: stepBuf.step })
    } else if (t === "reasoning-chunks" || t === "text-chunks") {
      const texts = (d.texts ?? []) as string[]
      stepBuf.reasoning = (stepBuf.reasoning ?? "") + texts.join("")
      if (stepBuf.reasoningStart == null) stepBuf.reasoningStart = (o.time as number) ?? null
    } else if (t === "tool/call") {
      let argsObj: Record<string, unknown> | null = null
      try { argsObj = JSON.parse(String(d.arguments ?? "{}")) } catch { argsObj = null }
      stepBuf.toolNodes.push({
        kind: "tool",
        time: (o.time as number) ?? null,
        name: d.name as string,
        human: toolSentence(d.name as string, argsObj),
        callId: d.callId as string,
        args: d.arguments as string,
        turn: cur.turn, step: stepBuf.step,
      })
    } else if (t === "tool/result") {
      const src = (((d.message ?? {}) as Record<string, unknown>).source as Record<string, unknown>)?.callId ?? null
      const node = stepBuf.toolNodes.find((n) => n.callId === src)
      if (node) {
        node.result = resultSentence(node.name ?? null, d)
        node.resultError = Boolean(d.error)
      }
    } else if (t === "approval/asked") {
      stepBuf.approvalNodes.push({
        kind: "approval",
        time: (o.time as number) ?? null,
        id: d.id as string,
        human: approvalSentence(d),
        toolName: d.toolName as string,
        turn: cur.turn, step: stepBuf.step,
      })
    } else if (t === "approval/decided") {
      const node = stepBuf.approvalNodes.find((n) => n.id === d.id)
      if (node) {
        node.outcome = d.outcome as string
        node.outcomeHuman = d.outcome === "allowed-once" ? "✅ 已批准（一次）"
          : d.outcome === "allowed-always" ? "✅ 已批准（始终）"
          : d.outcome === "denied" ? "❌ 已拒绝" : (d.outcome as string) ?? "?"
      }
    } else if (t === "assistant/message") {
      const msg = (d.message ?? {}) as Record<string, unknown>
      const texts = ((msg.content ?? []) as Array<Record<string, unknown>>)
        .filter((p) => p.type === "text")
        .map((p) => p.text as string)
        .filter(Boolean)
      stepBuf.assistantText = texts.join(" ")
      stepBuf.assistantTime = (o.time as number) ?? null
    }
  }
  flushStep()
  for (const tr of turns) tr.eventCount = tr.nodes.length
  return turns
}

// ---------------------------------------------------------------------------
// 类型摘要（树的独立事件预览）
// ---------------------------------------------------------------------------

function summarizeType(o: Record<string, unknown>): string {
  const t = (o.type ?? "?") as string
  const d = (o.data ?? {}) as Record<string, unknown>
  switch (t) {
    case "session": return `cwd=${o.cwd ?? d.cwd}, preset=${o.agentPreset ?? d.agentPreset ?? "?"}`
    case "session/title": return `标题：${d.title ?? ""}`
    case "session/end-seed": return "会话结束标记"
    case "user/message": return contentTextOf(d.content)
    case "assistant/message": {
      const msg = (d.message ?? {}) as Record<string, unknown>
      const texts = ((msg.content ?? []) as Array<Record<string, unknown>>)
        .filter((p) => p.type === "text")
        .map((p) => p.text as string)
        .filter(Boolean)
      return (texts.join(" ") || "(无正文)").slice(0, 120)
    }
    case "tool/call": {
      let argsObj: Record<string, unknown> | null = null
      try { argsObj = JSON.parse(String(d.arguments ?? "{}")) } catch { argsObj = null }
      const file = argsObj?.file_path ?? argsObj?.path ?? null
      if (file) return `${d.name}(${String(file)})`
      if (argsObj?.pattern) return `${d.name}("${String(argsObj.pattern)}")`
      if (argsObj?.command) return `${d.name}(${String(argsObj.command).slice(0, 60)})`
      return `${d.name}(${String(d.arguments ?? "").slice(0, 80)})`
    }
    case "tool/result": {
      if (d.error) return `❌ ${typeof d.error === "string" ? d.error.slice(0, 80) : "工具错误"}`
      const meta = (d.meta ?? {}) as Record<string, unknown>
      if (meta.totalLines != null) return `${meta.totalLines} 行 · ${meta.path ?? ""}`
      return resultSentence(null, d)
    }
    case "approval/asked": return approvalSentence(d)
    case "approval/decided": {
      return d.outcome === "allowed-once" ? "→ ✅ 允许一次"
        : d.outcome === "allowed-always" ? "→ ✅ 始终允许"
        : d.outcome === "denied" ? "→ ❌ 已拒绝" : `→ ${d.outcome ?? "?"}`
    }
    case "todo/write": {
      const todos = (d.todos ?? []) as Array<Record<string, unknown>>
      const done = todos.filter((x) => x.status === "completed").length
      const run = todos.filter((x) => x.status === "in_progress").length
      const pend = todos.filter((x) => x.status === "pending").length
      return `${todos.length} 项任务：[✅完成 ${done}] [🔄进行中 ${run}] [⏳待办 ${pend}]`
    }
    case "request/context": return `${modelLabel(d.model)} / ${d.contextWindow ?? "?"} 上下文`
    case "turn/end": {
      const reason = (d.reason ?? {}) as Record<string, unknown>
      return reason.kind === "error" ? `⚠️ 异常结束：${String((reason.error as Record<string, unknown>)?.message ?? "").slice(0, 60)}` : "轮次完成"
    }
    case "step/start": return "步骤开始"
    case "step/end": return "步骤结束"
    case "assistant/chunk": {
      const chunk = (d.chunk ?? {}) as Record<string, unknown>
      return `流式输出分片（${chunk.type ?? ""}）`
    }
    case "command/run": return `${d.name}${d.args ?? ""}`
    case "command/done": return `${d.kind}: ${String(d.text ?? "").slice(0, 80)}`
    default: return "—"
  }
}
