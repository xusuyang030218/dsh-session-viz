/**
 * dsh-session-viz host 解析器（Node ESM）
 *
 * 负责：
 *   1. 多帧 zstd 解码（DSH 的 session.jsonl.zstd 是 header 帧 + 追加事件帧的
 *      级联流，Node 内置 zstdDecompressSync 只解第一帧，必须逐帧扫描解码）
 *   2. JSONL 逐行解析：seq/time/type + 14 组配色分类 + 人读摘要
 *   3. 会话目录定位：~/.dsh/sessions/<projectKey(cwd)>/<encoded-session-id>/
 *
 * 颜色方案与 REQUIREMENTS.md 2.5 完全一致（Python lib/models.py 的 JS 对等实现）。
 */

import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { zstdDecompressSync } from "node:zlib"

// ---------------------------------------------------------------------------
// 14 组颜色方案（REQUIREMENTS.md 2.5）
// ---------------------------------------------------------------------------

export const GROUPS = {
  session:   { label: "会话生命周期", fg: "#9C27B0", bg: "#F3E5F5", border: "#7B1FA2" },
  config:    { label: "配置与权限",   fg: "#607D8B", bg: "#ECEFF1", border: "#455A64" },
  turn:      { label: "对话轮次",     fg: "#2196F3", bg: "#E3F2FD", border: "#1565C0" },
  step:      { label: "执行步骤",     fg: "#00BCD4", bg: "#E0F7FA", border: "#00838F" },
  user:      { label: "用户输入",     fg: "#4CAF50", bg: "#E8F5E9", border: "#2E7D32" },
  assistant: { label: "助手输出",     fg: "#FF9800", bg: "#FFF3E0", border: "#E65100" },
  reasoning: { label: "推理过程",     fg: "#FFC107", bg: "#FFF8E1", border: "#F57F17" },
  text:      { label: "通用文本",     fg: "#009688", bg: "#E0F2F1", border: "#00695C" },
  tool:      { label: "工具调用",     fg: "#F44336", bg: "#FFEBEE", border: "#C62828" },
  approval:  { label: "审批流程",     fg: "#E91E63", bg: "#FCE4EC", border: "#AD1457" },
  todo:      { label: "任务清单",     fg: "#3F51B5", bg: "#E8EAF6", border: "#283593" },
  llm:       { label: "LLM 重试",     fg: "#FF5722", bg: "#FBE9E7", border: "#BF360C" },
  command:   { label: "命令执行",     fg: "#795548", bg: "#EFEBE9", border: "#4E342E" },
  web:       { label: "Web 搜索",     fg: "#673AB7", bg: "#EDE7F6", border: "#4527A0" },
}

export const GROUP_ORDER = [
  "session", "config", "turn", "step", "user", "assistant", "reasoning",
  "text", "tool", "approval", "todo", "llm", "command", "web",
]

const TYPE_GROUP = {
  "session": "session", "session/title": "session", "session/title-llm-request": "session", "session/end-seed": "session",
  "permission/preset": "config", "sandbox/mode": "config", "approval/policy": "config",
  "request/header": "config", "request/context": "config", "agent-preset/selected": "config",
  "turn/start": "turn", "turn/end": "turn", "step/start": "step", "step/end": "step",
  "user/message": "user", "agent/inbox/spliced": "user",
  "assistant/message": "assistant", "assistant/chunk": "assistant",
  "reasoning-chunks": "reasoning", "text-chunks": "text",
  "tool-call-chunks": "tool", "tool/call": "tool", "tool/result": "tool",
  "approval/asked": "approval", "approval/decided": "approval",
  "todo/write": "todo", "llm/retry": "llm", "llm/retry-started": "llm",
  "command/run": "command", "command/done": "command",
  "web/deepseek-search-llm-request": "web",
}

export function groupOf(type) {
  return TYPE_GROUP[type] ?? "config"
}

const MAX_SUMMARY = 300

// ---------------------------------------------------------------------------
// 多帧 zstd 解码
// ---------------------------------------------------------------------------

const ZSTD_MAGIC = 4247762216 // 0xFD2FB528 LE

/** 扫描完整 zstd 帧范围（移植自 dsh-session-persistence-jsonl）。 */
export function scanZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break // 容错：非帧即停止
    offset += 4
    if (offset === buffer.length) break
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 24) !== 0) break
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 32) !== 0
    const checksum = (descriptor & 4) !== 0
    const dictionaryFlag = descriptor & 3
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < remainingHeaderBytes) break
    offset += remainingHeaderBytes
    for (;;) {
      if (buffer.length - offset < 3) return frames // torn tail: 交给调用方截断
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) return frames
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) return frames
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) return frames
      offset += 4
    }
    frames.push({ start, end: offset })
  }
  return frames
}

/** 解码整份会话文件：逐帧 zstdDecompressSync，容忍尾部未完成帧（写入中的日志）。 */
export function decompressSessionLog(buffer) {
  const frames = scanZstdFrames(buffer)
  if (frames.length === 0) return buffer.toString("utf8") // 纯文本 fallback
  const parts = []
  for (const { start, end } of frames) {
    try {
      parts.push(zstdDecompressSync(buffer.subarray(start, end)).toString("utf8"))
    } catch {
      // 单帧损坏：跳过该帧，尽量保留其余数据
    }
  }
  return parts.join("")
}

// ---------------------------------------------------------------------------
// 目录定位（与 dsh-session-persistence-jsonl 同规则）
// ---------------------------------------------------------------------------

function encodeSegment(raw) {
  let out = ""
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += "~" + code.toString(16).toUpperCase().padStart(4, "0")
  }
  return out
}

function projectKey(cwd) {
  if (!cwd) return "_no-cwd"
  let readable = ""
  let separatorRun = false
  for (let i = 0; i < cwd.length; i++) {
    const code = cwd.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch === "/" || ch === "\\" || ch === ":") {
      if (!separatorRun) readable += "-"
      separatorRun = true
    } else if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      separatorRun = false
    } else {
      readable += "~" + code.toString(16).toUpperCase().padStart(4, "0")
      separatorRun = false
    }
  }
  return `--${(readable.replace(/^-+/, "") || "root").slice(0, 251)}--`
}

export function sessionLogPath(sessionsRoot, cwd, id) {
  return join(sessionsRoot, projectKey(cwd), encodeSegment(id), "session.jsonl.zstd")
}

/** 按 session id 在 sessionsRoot 下搜索（id 编码后作为目录名）。 */
export async function findSessionDir(sessionsRoot, sessionId) {
  const encoded = encodeSegment(sessionId)
  const projects = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => [])
  for (const proj of projects) {
    if (!proj.isDirectory()) continue
    const full = join(sessionsRoot, proj.name, encoded)
    const entries = await readdir(full, { withFileTypes: true }).catch(() => null)
    if (entries === null) continue
    for (const e of entries) {
      if (e.isFile() && (e.name === "session.jsonl.zstd" || e.name === "session.jsonl")) {
        return join(full, e.name)
      }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// JSONL 解析 + 摘要
// ---------------------------------------------------------------------------

function clip(text, n = MAX_SUMMARY) {
  text = String(text ?? "").trim()
  return text.length > n ? text.slice(0, n) + "…" : text
}

function contentText(content) {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts = []
  for (const part of content) {
    if (!part || typeof part !== "object") continue
    const pt = part.type
    if ((pt === "text" || pt === "reasoning") && typeof part.text === "string") parts.push(part.text)
    else if (pt === "tool-result") {
      const sub = contentText(part.content)
      if (sub) parts.push(sub)
    }
  }
  return parts.join("\n")
}

function toolResultText(d) {
  return contentText((d.message ?? {}).content)
}

export function summarize(o) {
  const t = o.type ?? "?"
  const d = o.data ?? {}
  try {
    switch (t) {
      case "session": return `cwd=${d.cwd ?? o.cwd}, agentPreset=${d.agentPreset ?? o.agentPreset}`
      case "session/title": return clip(d.title)
      case "session/title-llm-request": return clip(`titleProvider=${d.titleProvider}, maxTokens=${d.maxTokens}`)
      case "session/end-seed": return "session end seed"
      case "permission/preset": return `preset=${d.preset}`
      case "sandbox/mode": return `mode=${d.mode}`
      case "approval/policy": return `policy=${d.policy}`
      case "request/header": return `reason=${d.reason}, ${(d.header?.tools ?? []).length} tools registered`
      case "request/context": return `${d.provider} / ${d.model} (contextWindow=${d.contextWindow})`
      case "agent-preset/selected": return `agentPreset=${d.agentPreset}`
      case "turn/start": return `turn ${d.turn}`
      case "turn/end": {
        const reason = d.reason ?? {}
        if (reason.kind === "error") return clip(`turn ${d.turn} ERROR: ${reason.error?.message ?? ""}`)
        return `turn ${d.turn} completed`
      }
      case "step/start": return `turn ${d.turn} step ${d.step}`
      case "step/end": return `turn ${d.turn} step ${d.step}`
      case "user/message": return clip(contentText(d.content))
      case "agent/inbox/spliced": {
        const txts = (d.inserted ?? []).map((m) => contentText(m?.content)).filter(Boolean)
        return clip(txts.join(" | "))
      }
      case "assistant/message": {
        const usage = d.usage ?? {}
        const txt = contentText(d.message?.content)
        return clip(txt || "(no text)") + ` [tokens in=${usage.inputTokens ?? 0} out=${usage.outputTokens ?? 0}]`
      }
      case "assistant/chunk": {
        const reason = d.chunk?.reason
        if (reason && typeof reason === "object" && reason.kind === "error")
          return clip(`chunk error: ${reason.failure?.message ?? ""}`)
        return `chunk type=${d.chunk?.type}`
      }
      case "reasoning-chunks":
      case "text-chunks": {
        const texts = d.texts ?? []
        const dt = d.dt ?? []
        return `${texts.length} chunks, ${texts.reduce((a, x) => a + x.length, 0)} chars, ${dt.reduce((a, x) => a + x, 0)}ms`
      }
      case "tool-call-chunks": return clip(`${d.name} ${d.id} streaming ${(d.args ?? []).length} parts`)
      case "tool/call": return clip(`${d.name}(${d.arguments ?? ""})`)
      case "tool/result": {
        if (d.error) return clip(`ERROR: ${typeof d.error === "string" ? d.error : JSON.stringify(d.error)}`)
        const txt = toolResultText(d)
        const meta = d.meta
        return meta ? clip(txt) + `  [meta: ${JSON.stringify(meta).slice(0, 80)}]` : clip(txt)
      }
      case "approval/asked": return clip(`${d.toolName} — ${d.reason ?? ""}`)
      case "approval/decided": return `outcome=${d.outcome}`
      case "todo/write": return `${(d.todos ?? []).length} todos`
      case "llm/retry": return clip(`retry ${d.retry}/${d.maxRetries} — ${d.failure}`)
      case "llm/retry-started": return `retry ${d.retry} started`
      case "command/run": return clip(`${d.name}${d.args ?? ""} (cmd ${d.commandId})`)
      case "command/done": return clip(`${d.kind}: ${d.text ?? ""}`)
      case "web/deepseek-search-llm-request": return clip(`endpoint=${d.endpoint}, apiVersion=${d.apiVersion}`)
    }
  } catch { /* fallthrough */ }
  return `(${t})`
}

/** 解析一行 → 轻量事件视图（左侧列表用）。 */
export function parseLine(raw, lineIdx) {
  let o = null
  try { o = JSON.parse(raw) } catch { return null }
  if (!o || typeof o !== "object") return null
  const t = o.type ?? "?"
  const d = o.data ?? {}
  const ev = {
    line: lineIdx,
    seq: o.seq ?? o.seq0 ?? null,
    type: t,
    time: o.time ?? o.time0 ?? null,
    group: groupOf(t),
    summary: summarize(o),
  }
  if (t === "tool/result") ev.error = Boolean(d.error)
  else if (t === "turn/end") ev.error = (d.reason ?? {}).kind === "error"
  else if (t === "assistant/message") ev.tokens = d.usage ?? null
  return ev
}

/** 解析整份日志文本 → { meta, events, typeCounts, groupCounts, search }。 */
export function parseLogText(text, dirEncoded = null) {
  const lines = text.split("\n")
  const events = []
  let meta = { title: null, cwd: null, createdAt: null, agentPreset: null, delegationDepth: null, eventCount: 0 }
  const typeCounts = {}
  const groupCounts = {}
  const search = new Map() // line -> 可检索全文（reasoning/tool 参数/结果/消息文本）
  let startTime = null
  let endTime = null
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim()
    if (!raw) continue
    let o = null
    try { o = JSON.parse(raw) } catch { continue }
    const ev = parseLine(raw, i)
    if (!ev) continue
    events.push(ev)
    typeCounts[ev.type] = (typeCounts[ev.type] ?? 0) + 1
    groupCounts[ev.group] = (groupCounts[ev.group] ?? 0) + 1
    // 建检索索引：reasoning-chunks / text-chunks 合并文本，工具参数与结果，消息正文
    const d = o.data ?? {}
    if (ev.type === "reasoning-chunks" || ev.type === "text-chunks") {
      const joined = (d.texts ?? []).join("")
      if (joined) search.set(i, joined)
    } else if (ev.type === "tool/call") {
      search.set(i, `${d.name ?? ""} ${d.arguments ?? ""}`)
    } else if (ev.type === "tool/result") {
      const txt = toolResultText(d)
      if (txt) search.set(i, txt)
    } else if (ev.type === "user/message" || ev.type === "assistant/message") {
      const txt = contentText(d.message?.content)
      if (txt) search.set(i, txt)
    } else if (ev.type === "todo/write") {
      search.set(i, (d.todos ?? []).map((x) => x.content ?? "").join(" "))
    } else if (ev.type === "approval/asked") {
      search.set(i, `${d.toolName ?? ""} ${d.reason ?? ""}`)
    }
    if (ev.type === "session" && ev.seq == null) {
      meta.cwd = o.cwd; meta.createdAt = o.createdAt; meta.agentPreset = o.agentPreset
      meta.delegationDepth = o.delegationDepth
    } else if (ev.type === "session/title" && meta.title == null) {
      meta.title = d.title ?? null
    }
    if (ev.time != null) {
      if (startTime == null || ev.time < startTime) startTime = ev.time
      if (endTime == null || ev.time > endTime) endTime = ev.time
    }
  }
  meta.eventCount = events.length
  meta.startTime = startTime
  meta.endTime = endTime
  meta.durationMs = startTime != null && endTime != null ? Math.max(0, endTime - startTime) : 0
  return { meta, events, typeCounts, groupCounts, search }
}

/** 读取 + 解码 + 解析一个会话（整文件缓存由调用方负责）。 */
export async function loadAndParseSession(sessionsRoot, sessionId) {
  const path = await findSessionDir(sessionsRoot, sessionId)
  if (!path) throw new Error(`session log not found: ${sessionId}`)
  const buffer = await readFile(path)
  const text = decompressSessionLog(buffer)
  return { path, ...parseLogText(text) }
}
