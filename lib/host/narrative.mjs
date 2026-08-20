/**
 * dsh-session-viz 叙述转换层（PRODUCT_REDESIGN.md 5.1 + UI_IMPROVEMENT.md）
 *
 * 原始事件 → 三层渐进式数据：
 *   summary: 执行摘要卡片（面向所有人，无技术术语）
 *   story:   执行故事线（面向管理者，叙事式 turn→step）
 *   tree:    技术事件树（面向开发者，turn→step→合并事件组）
 *
 * 转换规则：
 *   1. 合并 chunks：同一步内 reasoning-chunks / text-chunks / tool-call-chunks /
 *      assistant/chunk 合并为可展开节点（UI_IMPROVEMENT 改动 2/6）
 *   2. 配对事件：tool/call+tool/result、approval/asked+approval/decided
 *   3. 人类语言映射：read→📖读取, write→✏️写入, grep→🔍搜索, pwsh→⚙️执行命令…
 *   4. 摘要生成：推理取首句/前 100 字；工具结果提取行数/大小/成败
 *   5. 文件变更提取：从 write/edit 工具 + result meta 收集
 *   6. 审批故事化：原因简化为人类可读文本
 */

import { GROUPS, groupOf } from "./parser.mjs"

// ---------------------------------------------------------------------------
// 人类语言映射
// ---------------------------------------------------------------------------

const TOOL_HUMAN = {
  read: { icon: "📖", verb: "读取了" },
  write: { icon: "✏️", verb: "写入了" },
  edit: { icon: "✏️", verb: "编辑了" },
  glob: { icon: "🔍", verb: "搜索了文件" },
  grep: { icon: "🔍", verb: "搜索了关键词" },
  rg: { icon: "🔍", verb: "搜索了关键词" },
  pwsh: { icon: "⚙️", verb: "执行了命令" },
  bash: { icon: "⚙️", verb: "执行了命令" },
  "dsh": { icon: "⚙️", verb: "执行了命令" },
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
  import_documents: { icon: "📄", verb: "导入了文档" },
}

function humanTool(name) {
  return TOOL_HUMAN[name] ?? { icon: "🛠️", verb: `调用了 ${name}` }
}

/** 工具调用 → 人类语言句子。 */
function toolSentence(toolName, argsObj) {
  const h = humanTool(toolName)
  if (!argsObj || typeof argsObj !== "object") return `${h.icon} ${h.verb}`
  const file = argsObj.file_path ?? argsObj.path ?? null
  const pattern = argsObj.pattern ?? null
  const cmd = argsObj.command ?? null
  if (file) return `${h.icon} ${h.verb} ${file}`
  if (pattern) return `${h.icon} ${h.verb} "${String(pattern).slice(0, 40)}"`
  if (cmd) return `${h.icon} ${h.verb}: ${String(cmd).slice(0, 60)}`
  const argName = argsObj.name ?? null
  if (argName) return `${h.icon} ${h.verb} ${argName}`
  return `${h.icon} ${h.verb}`
}

/** 工具结果 → 人类语言摘要。 */
function resultSentence(name, data) {
  const d = data ?? {}
  if (d.error) return `❌ 失败：${typeof d.error === "string" ? d.error.slice(0, 60) : "工具错误"}`
  const meta = d.meta ?? {}
  const parts = []
  if (meta.totalLines != null) parts.push(`${meta.totalLines} 行`)
  if (meta.totalLines != null && meta.lines != null && meta.totalLines > 1) parts.push(`偏移 ${meta.offset ?? 0}`)
  if (meta.path && (name === "read" || name === "write" || name === "edit")) parts.push(`${meta.path}`)
  const ok = parts.length ? parts.join(" · ") : null
  if (ok) return `✅ ${ok}`
  const msg = d.message?.content ?? []
  for (const p of msg) {
    if (p?.type === "text" && p.text) {
      const t = String(p.text).trim().replace(/\s+/g, " ")
      return t.length > 60 ? t.slice(0, 60) + "…" : t
    }
  }
  return "✅ 完成"
}

/** 审批原因 → 人类语言。 */
function approvalSentence(data) {
  const d = data ?? {}
  const tool = d.toolName ?? "工具"
  const reason = (d.reason ?? "").trim()
  if (!reason) return `请求调用 ${tool}`
  const r = reason.replace(/^escalate sandbox to \S+:?\s*/i, "")
  return `请求调用 ${tool}：${r.length > 80 ? r.slice(0, 80) + "…" : r}`
}

const MODEL_LABELS = {
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v3.2": "DeepSeek V3.2",
}

function modelLabel(model) {
  return MODEL_LABELS[model] ?? model ?? "—"
}

// ---------------------------------------------------------------------------
// 解析工具：行缓存（narrative 需要完整 data，重新解析解码文本）
// ---------------------------------------------------------------------------

/** 从解码文本构建行数组（仅非空行）。 */
function nonEmptyLines(text) {
  return text.split("\n").filter((l) => l.trim())
}

function parseObjects(lines) {
  const objs = []
  for (const l of lines) {
    try { objs.push(JSON.parse(l)) } catch { objs.push(null) }
  }
  return objs
}

// ---------------------------------------------------------------------------
// 技术事件树（UI_IMPROVEMENT 改动 2/3/5/6）
// ---------------------------------------------------------------------------

const CHUNK_GROUP = {
  "reasoning-chunks": { kind: "reasoning", label: "推理过程", fg: "#FFC107", bg: "#FFF8E1" },
  "text-chunks": { kind: "text", label: "文本输出", fg: "#009688", bg: "#E0F2F1" },
  "tool-call-chunks": { kind: "tool-call", label: "工具调用流", fg: "#F44336", bg: "#FFEBEE" },
  "assistant/chunk": { kind: "assistant", label: "助手输出", fg: "#FF9800", bg: "#FFF3E0" },
}

/** 折叠树：turn → step → (合并组 + 独立事件)。 */
export function buildTree(lines, objs) {
  const turns = []
  let curTurn = null
  let curStep = null

  // 每个 step 内的 chunk 累积器（合并用）
  let acc = null // { kind, label, fg, bg, count, chars, dt, texts[], startLine, endLine, preview }

  function closeGroup() {
    if (!acc) return
    if (acc.count > 0) {
      acc.text = acc.texts.join("")
      acc.preview = (acc.text || "").replace(/\s+/g, " ").trim().slice(0, 100)
      if (acc.preview.length >= 100) acc.preview += "…"
      acc.durationMs = acc.dt.reduce((a, b) => a + b, 0)
      delete acc.texts
      delete acc.dt
      curStep.groups.push(acc)
    }
    acc = null
  }

  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]
    if (!o) continue
    const t = o.type ?? "?"
    const d = o.data ?? {}

    if (t === "turn/start") {
      curTurn = { turn: d.turn, startTime: o.time ?? null, startLine: i, eventCount: 0, steps: [], groups: [] }
      turns.push(curTurn)
      curStep = null
      continue
    }
    if (t === "turn/end") {
      if (curTurn) { curTurn.endTime = o.time ?? null; curTurn.endLine = i }
      curTurn = null
      continue
    }
    if (t === "step/start") {
      closeGroup()
      if (curTurn) {
        curStep = { turn: d.turn, step: d.step, startTime: o.time ?? null, startLine: i, eventCount: 0, groups: [], tools: [] }
        curTurn.steps.push(curStep)
      }
      continue
    }
    if (t === "step/end") {
      closeGroup()
      if (curStep) { curStep.endTime = o.time ?? null; curStep.endLine = i }
      curStep = null
      continue
    }

    const host = curStep ?? curTurn
    if (!host) continue
    host.eventCount++
    if (curTurn) curTurn.eventCount++

    // chunks 合并
    const cg = CHUNK_GROUP[t]
    if (cg && curStep) {
      if (!acc || acc.kind !== cg.kind) { closeGroup(); acc = { ...cg, count: 0, chars: 0, dt: [], texts: [], startLine: i, endLine: i } }
      const texts = d.texts ?? []
      const dt = d.dt ?? []
      acc.count += 1
      acc.chars += texts.reduce((a, x) => a + x.length, 0)
      acc.dt.push(...dt)
      acc.texts.push(...texts)
      acc.endLine = i
      continue
    }

    // 独立事件（低频/重要类型）
    const item = {
      line: i,
      seq: o.seq ?? o.seq0 ?? null,
      time: o.time ?? o.time0 ?? null,
      type: t,
      group: groupOf(t),
      summary: summarizeType(o),
      error: t === "tool/result" ? Boolean(d.error) : (t === "turn/end" ? (d.reason ?? {}).kind === "error" : false),
    }
    // 工具调用补充人类语言
    if (t === "tool/call") {
      let argsObj = null
      try { argsObj = JSON.parse(d.arguments ?? "{}") } catch { argsObj = null }
      item.human = toolSentence(d.name, argsObj)
      item.toolName = d.name
      if (curStep) curStep.tools.push(d.name)
    }
    if (t === "tool/result") {
      item.human = resultSentence(item.toolName ?? "", d)
    }
    if (t === "approval/asked") item.human = approvalSentence(d)
    if (t === "approval/decided") {
      item.outcome = d.outcome
      item.human = d.outcome === "allowed-once" ? "✅ 允许一次"
        : d.outcome === "allowed-always" ? "✅ 始终允许"
        : d.outcome === "denied" ? "❌ 已拒绝" : `决策 ${d.outcome ?? "?"}`
    }
    if (t === "assistant/message") {
      const usage = d.usage ?? {}
      item.human = `输出 ${usage.outputTokens ?? 0} tokens · 输入 ${usage.inputTokens ?? 0}`
    }
    if (t === "reasoning-chunks" || t === "text-chunks" || t === "tool-call-chunks") continue // 已合并
    host.groups.push({ kind: "event", events: [item] })
  }
  closeGroup()
  return turns
}

// ---------------------------------------------------------------------------
// 执行摘要（PRODUCT_REDESIGN 第一层）
// ---------------------------------------------------------------------------

export function buildSummary(lines, objs, meta, typeCounts) {
  const summary = {
    title: meta.title ?? null,
    userRequest: null,
    turnCount: 0,
    stepCount: 0,
    durationMs: meta.durationMs ?? 0,
    startTime: meta.startTime,
    endTime: meta.endTime,
    model: null,
    toolStats: {},   // name -> {icon, verb, count}
    approvalStats: { total: 0, allowed: 0, denied: 0 },
    files: [],       // {path, action, time, sizeText?}
    tokens: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, reasoningTokens: 0 },
    eventCount: typeCounts ? Object.values(typeCounts).reduce((a, b) => a + b, 0) : objs.length,
    openApprovals: 0,
  }

  const pendingApproval = new Map()
  const toolCalls = []
  let firstUserMsg = null

  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]
    if (!o) continue
    const t = o.type ?? "?"
    const d = o.data ?? {}

    if (t === "turn/start") summary.turnCount++
    else if (t === "step/start") summary.stepCount++
    else if (t === "user/message") {
      if (!firstUserMsg) {
        const texts = (d.content ?? []).map((p) => p.text ?? `[${p.type}]`).filter(Boolean)
        firstUserMsg = texts.join(" ").trim()
        summary.userRequest = firstUserMsg.slice(0, 200)
      }
    } else if (t === "assistant/message") {
      const u = d.usage ?? {}
      summary.tokens.inputTokens += u.inputTokens ?? 0
      summary.tokens.outputTokens += u.outputTokens ?? 0
      summary.tokens.cacheReadTokens += u.cacheReadTokens ?? 0
      summary.tokens.reasoningTokens += u.reasoningTokens ?? 0
    } else if (t === "request/context" && !summary.model) {
      summary.model = modelLabel(d.model)
    } else if (t === "tool/call") {
      toolCalls.push({ i, name: d.name, args: d.arguments, callId: d.callId, time: o.time ?? null })
    } else if (t === "approval/asked") {
      pendingApproval.set(d.id, { toolName: d.toolName, time: o.time ?? null })
    } else if (t === "approval/decided") {
      summary.approvalStats.total++
      if (d.outcome === "denied") summary.approvalStats.denied++
      else summary.approvalStats.allowed++
      pendingApproval.delete(d.id)
    } else if (t === "tool/result") {
      const src = (d.message?.source ?? {}).callId ?? null
      const meta = d.meta ?? {}
      const isError = Boolean(d.error)
      // 文件变更提取：write/edit 且结果带 path/lines，或从调用参数取 file_path
      const tc = toolCalls.find((c) => c.callId === src)
      const name = tc?.name ?? null
      const path = meta.path ?? (tc ? pathFromArgs(tc.args) : null)
      if (path && (name === "write" || name === "edit")) {
        summary.files.push({
          path,
          action: meta.created ? "created" : "modified",
          time: o.time ?? null,
          lines: meta.totalLines ?? null,
          error: isError,
        })
      }
      if (src) { const idx = toolCalls.findIndex((c) => c.callId === src); if (idx >= 0) toolCalls.splice(idx, 1) }
    } else if (t === "todo/write") {
      // 不在此层展示
    }
  }

  // 工具统计
  const callById = {}
  for (const tc of toolCalls) callById[tc.i] = tc
  for (const o of objs) {
    if (o?.type === "tool/call") {
      const name = o.data?.name
      if (!name) continue
      if (!summary.toolStats[name]) {
        const h = humanTool(name)
        summary.toolStats[name] = { icon: h.icon, verb: h.verb, count: 0 }
      }
      summary.toolStats[name].count++
    }
  }
  // 按次数排序
  summary.toolStats = Object.fromEntries(
    Object.entries(summary.toolStats).sort((a, b) => b[1].count - a[1].count))
  summary.approvalStats.pending = pendingApproval.size
  return summary
}

function pathFromArgs(argsStr) {
  try {
    const a = JSON.parse(argsStr ?? "{}")
    return a.file_path ?? a.path ?? null
  } catch { return null }
}

// ---------------------------------------------------------------------------
// 执行故事线（PRODUCT_REDESIGN 第二层）
// ---------------------------------------------------------------------------

export function buildStory(lines, objs) {
  const turns = []
  let cur = null
  let stepBuf = null
  let openApprovals = new Map()
  let toolById = new Map()

  function flushStep() {
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
    if (stepBuf.toolNodes.length) stepBuf.nodes.push(...stepBuf.toolNodes)
    if (stepBuf.approvalNodes.length) stepBuf.nodes.push(...stepBuf.approvalNodes)
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

  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]
    if (!o) continue
    const t = o.type ?? "?"
    const d = o.data ?? {}

    if (t === "turn/start") {
      cur = { turn: d.turn, startTime: o.time ?? null, nodes: [] }
      turns.push(cur)
      continue
    }
    if (t === "turn/end") {
      flushStep()
      cur = null
      continue
    }
    if (t === "step/start") {
      flushStep()
      stepBuf = { step: d.step, nodes: [], reasoning: null, reasoningStart: null, toolNodes: [], approvalNodes: [], assistantText: null, assistantTime: null }
      continue
    }
    if (t === "step/end") { flushStep(); continue }
    if (!cur || !stepBuf) continue

    if (t === "user/message") {
      stepBuf.nodes.push({ kind: "user", time: o.time ?? null, text: contentTextOf(d.content), human: "用户发送需求" })
    } else if (t === "reasoning-chunks" || t === "text-chunks") {
      const texts = d.texts ?? []
      stepBuf.reasoning = (stepBuf.reasoning ?? "") + texts.join("")
      if (stepBuf.reasoningStart == null) stepBuf.reasoningStart = o.time ?? null
    } else if (t === "tool/call") {
      const call = { i, name: d.name, args: d.arguments, time: o.time ?? null, callId: d.callId }
      toolById.set(d.callId, call)
      let argsObj = null
      try { argsObj = JSON.parse(d.arguments ?? "{}") } catch { argsObj = null }
      stepBuf.toolNodes.push({
        kind: "tool",
        time: o.time ?? null,
        name: d.name,
        human: toolSentence(d.name, argsObj),
        callId: d.callId,
        args: d.arguments,
        turn: cur.turn, step: stepBuf.step,
      })
    } else if (t === "tool/result") {
      const src = (d.message?.source ?? {}).callId ?? null
      const node = stepBuf.toolNodes.find((n) => n.callId === src)
      if (node) {
        node.result = resultSentence(node.name, d)
        node.resultError = Boolean(d.error)
      }
    } else if (t === "approval/asked") {
      stepBuf.approvalNodes.push({
        kind: "approval",
        time: o.time ?? null,
        id: d.id,
        human: approvalSentence(d),
        toolName: d.toolName,
        turn: cur.turn, step: stepBuf.step,
      })
    } else if (t === "approval/decided") {
      const node = stepBuf.approvalNodes.find((n) => n.id === d.id)
      if (node) {
        node.outcome = d.outcome
        node.outcomeHuman = d.outcome === "allowed-once" ? "✅ 已批准（一次）"
          : d.outcome === "allowed-always" ? "✅ 已批准（始终）"
          : d.outcome === "denied" ? "❌ 已拒绝" : d.outcome ?? "?"
      }
    } else if (t === "assistant/message") {
      const texts = (d.message?.content ?? []).filter((p) => p.type === "text").map((p) => p.text).filter(Boolean)
      stepBuf.assistantText = texts.join(" ")
      stepBuf.assistantTime = o.time ?? null
    }
  }
  flushStep()
  // 每 turn 聚合
  for (const tr of turns) {
    tr.eventCount = tr.nodes.reduce((a, n) => a + 1, 0)
  }
  return turns
}

function contentTextOf(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content.map((p) => p?.text ?? `[${p?.type ?? "?"}]`).filter(Boolean).join(" ")
}

function sentenceOf(text) {
  const t = String(text ?? "").replace(/\s+/g, " ").trim()
  if (!t) return ""
  const m = t.match(/^(.+?[.!?。！？])/)
  const s = m ? m[1] : t
  return s.length > 100 ? s.slice(0, 100) + "…" : s
}

// ---------------------------------------------------------------------------
// 类型摘要（树的独立事件预览，UI_IMPROVEMENT 改动 5）
// ---------------------------------------------------------------------------

function summarizeType(o) {
  const t = o.type ?? "?"
  const d = o.data ?? {}
  switch (t) {
    case "session": return `cwd=${o.cwd ?? d.cwd}, preset=${o.agentPreset ?? d.agentPreset ?? "?"}`
    case "session/title": return `标题：${d.title ?? ""}`
    case "session/end-seed": return "会话结束标记"
    case "user/message": return contentTextOf(d.content)
    case "assistant/message": {
      const texts = (d.message?.content ?? []).filter((p) => p.type === "text").map((p) => p.text).filter(Boolean)
      return (texts.join(" ") || "(无正文)").slice(0, 120)
    }
    case "tool/call": {
      let argsObj = null
      try { argsObj = JSON.parse(d.arguments ?? "{}") } catch { argsObj = null }
      const file = argsObj?.file_path ?? argsObj?.path ?? null
      if (file) return `${d.name}(${file})`
      if (argsObj?.pattern) return `${d.name}("${argsObj.pattern}")`
      if (argsObj?.command) return `${d.name}(${String(argsObj.command).slice(0, 60)})`
      return `${d.name}(${String(d.arguments ?? "").slice(0, 80)})`
    }
    case "tool/result": {
      if (d.error) return `❌ ${typeof d.error === "string" ? d.error.slice(0, 80) : "工具错误"}`
      const meta = d.meta ?? {}
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
      const todos = d.todos ?? []
      const done = todos.filter((x) => x.status === "completed").length
      const run = todos.filter((x) => x.status === "in_progress").length
      const pend = todos.filter((x) => x.status === "pending").length
      return `${todos.length} 项任务：[✅完成 ${done}] [🔄进行中 ${run}] [⏳待办 ${pend}]`
    }
    case "request/context": return `${modelLabel(d.model)} / ${d.contextWindow ?? "?"} 上下文`
    case "turn/end": {
      const reason = d.reason ?? {}
      return reason.kind === "error" ? `⚠️ 异常结束：${(reason.error?.message ?? "").slice(0, 60)}` : "轮次完成"
    }
    case "step/start": return "步骤开始"
    case "step/end": return "步骤结束"
    case "assistant/chunk": return `流式输出分片（${(d.chunk?.type) ?? ""}）`
    case "command/run": return `${d.name}${d.args ?? ""}`
    case "command/done": return `${d.kind}: ${String(d.text ?? "").slice(0, 80)}`
    default: return "—"
  }
}
