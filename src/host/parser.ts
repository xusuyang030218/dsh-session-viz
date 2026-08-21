/**
 * dsh-session-viz host 解析器（TypeScript 版）
 *
 * 从 lib/host/parser.mjs 移植并类型化。职责：
 *   1. 多帧 zstd 解码（DSH session.jsonl.zstd 是 header 帧 + 追加事件帧的级联流）
 *   2. JSONL 逐行解析：seq/time/type + 14 组配色分类 + 人读摘要
 *   3. 会话目录定位与轻量扫描
 *
 * 颜色方案与 REQUIREMENTS.md 2.5 完全一致（14 组配色）。
 */

import { readFile, readdir } from "node:fs/promises"
import { join } from "node:path"
import { zstdDecompressSync } from "node:zlib"

// ---------------------------------------------------------------------------
// 类型定义
// ---------------------------------------------------------------------------

export interface GroupStyle {
  label: string
  fg: string
  bg: string
  border: string
}

export interface EventMeta {
  title: string | null
  cwd: string | null
  createdAt: number | null
  agentPreset: string | null
  delegationDepth: number | null
  eventCount: number
  startTime: number | null
  endTime: number | null
  durationMs: number
  sizeBytes?: number | null
}

export interface LightEvent {
  line: number
  seq: number | null
  type: string
  time: number | null
  group: string
  summary: string
  error?: boolean
  tokens?: Record<string, unknown> | null
}

export interface ParsedSession {
  meta: EventMeta
  events: LightEvent[]
  typeCounts: Record<string, number>
  groupCounts: Record<string, number>
  search: Map<number, string>
  sizeBytes?: number | null
}

// ---------------------------------------------------------------------------
// 14 组颜色方案（REQUIREMENTS.md 2.5）
// ---------------------------------------------------------------------------

export const GROUPS: Record<string, GroupStyle> = {
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

const TYPE_GROUP: Record<string, string> = {
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

export function groupOf(type: string): string {
  return TYPE_GROUP[type] ?? "config"
}

const MAX_SUMMARY = 300

// ---------------------------------------------------------------------------
// 多帧 zstd 解码
// ---------------------------------------------------------------------------

const ZSTD_MAGIC = 4247762216 // 0xFD2FB528 LE

interface FrameRange { start: number; end: number }

/** 扫描完整 zstd 帧范围（移植自 dsh-session-persistence-jsonl）。 */
export function scanZstdFrames(buffer: Buffer): FrameRange[] {
  const frames: FrameRange[] = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 4) break
    if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break
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
      if (buffer.length - offset < 3) return frames
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

/** 解码整份会话文件：逐帧 zstdDecompressSync，容忍尾部未完成帧。 */
export function decompressSessionLog(buffer: Buffer): string {
  const frames = scanZstdFrames(buffer)
  if (frames.length === 0) return buffer.toString("utf8")
  const parts: string[] = []
  for (const { start, end } of frames) {
    try {
      parts.push(zstdDecompressSync(buffer.subarray(start, end)).toString("utf8"))
    } catch {
      // 单帧损坏：跳过该帧，保留其余数据
    }
  }
  return parts.join("")
}

// ---------------------------------------------------------------------------
// 目录定位（与 dsh-session-persistence-jsonl 同规则）
// ---------------------------------------------------------------------------

function encodeSegment(raw: string): string {
  let out = ""
  for (let i = 0; i < raw.length; i++) {
    const code = raw.charCodeAt(i)
    const ch = String.fromCharCode(code)
    if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) out += ch
    else out += "~" + code.toString(16).toUpperCase().padStart(4, "0")
  }
  return out
}

function projectKey(cwd: string | null): string {
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

export function sessionLogPath(sessionsRoot: string, cwd: string | null, id: string): string {
  return join(sessionsRoot, projectKey(cwd), encodeSegment(id), "session.jsonl.zstd")
}

/** 按 session id 在 sessionsRoot 下搜索（id 编码后作为目录名）。 */
export async function findSessionDir(sessionsRoot: string, sessionId: string): Promise<string | null> {
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

function clip(text: unknown, n = MAX_SUMMARY): string {
  const str = String(text ?? "").trim()
  return str.length > n ? str.slice(0, n) + "…" : str
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  const parts: string[] = []
  for (const part of content) {
    if (!part || typeof part !== "object") continue
    const p = part as Record<string, unknown>
    const pt = p.type
    if ((pt === "text" || pt === "reasoning") && typeof p.text === "string") parts.push(p.text)
    else if (pt === "tool-result") {
      const sub = contentText(p.content)
      if (sub) parts.push(sub)
    }
  }
  return parts.join("\n")
}

function toolResultText(d: Record<string, unknown>): string {
  const msg = (d.message ?? {}) as Record<string, unknown>
  return contentText(msg.content)
}

export function summarize(o: Record<string, unknown>): string {
  const t = (o.type ?? "?") as string
  const d = (o.data ?? {}) as Record<string, unknown>
  try {
    switch (t) {
      case "session": return `cwd=${d.cwd ?? o.cwd}, agentPreset=${d.agentPreset ?? o.agentPreset}`
      case "session/title": return clip(d.title)
      case "session/title-llm-request": return clip(`titleProvider=${d.titleProvider}, maxTokens=${d.maxTokens}`)
      case "session/end-seed": return "session end seed"
      case "permission/preset": return `preset=${d.preset}`
      case "sandbox/mode": return `mode=${d.mode}`
      case "approval/policy": return `policy=${d.policy}`
      case "request/header": {
        const hdr = (d.header ?? {}) as Record<string, unknown>
        return `reason=${d.reason}, ${(hdr.tools as unknown[] | undefined)?.length ?? 0} tools registered`
      }
      case "request/context": return `${d.provider} / ${d.model} (contextWindow=${d.contextWindow})`
      case "agent-preset/selected": return `agentPreset=${d.agentPreset}`
      case "turn/start": return `turn ${d.turn}`
      case "turn/end": {
        const reason = (d.reason ?? {}) as Record<string, unknown>
        if (reason.kind === "error") {
          const err = (reason.error ?? {}) as Record<string, unknown>
          return clip(`turn ${d.turn} ERROR: ${err.message ?? ""}`)
        }
        return `turn ${d.turn} completed`
      }
      case "step/start": return `turn ${d.turn} step ${d.step}`
      case "step/end": return `turn ${d.turn} step ${d.step}`
      case "user/message": return clip(contentText(d.content))
      case "agent/inbox/spliced": {
        const txts = ((d.inserted ?? []) as Array<Record<string, unknown>>)
          .map((m) => contentText(m?.content))
          .filter(Boolean)
        return clip(txts.join(" | "))
      }
      case "assistant/message": {
        const usage = (d.usage ?? {}) as Record<string, unknown>
        const msg = (d.message ?? {}) as Record<string, unknown>
        const txt = contentText(msg.content)
        return clip(txt || "(no text)") + ` [tokens in=${usage.inputTokens ?? 0} out=${usage.outputTokens ?? 0}]`
      }
      case "assistant/chunk": {
        const chunk = (d.chunk ?? {}) as Record<string, unknown>
        const reason = chunk.reason
        if (reason && typeof reason === "object" && (reason as Record<string, unknown>).kind === "error") {
          const fail = ((reason as Record<string, unknown>).failure ?? {}) as Record<string, unknown>
          return clip(`chunk error: ${fail.message ?? ""}`)
        }
        return `chunk type=${chunk.type}`
      }
      case "reasoning-chunks":
      case "text-chunks": {
        const texts = (d.texts ?? []) as string[]
        const dt = (d.dt ?? []) as number[]
        return `${texts.length} chunks, ${texts.reduce((a, x) => a + x.length, 0)} chars, ${dt.reduce((a, x) => a + x, 0)}ms`
      }
      case "tool-call-chunks": return clip(`${d.name} ${d.id} streaming ${(d.args as unknown[] | undefined)?.length ?? 0} parts`)
      case "tool/call": return clip(`${d.name}(${d.arguments ?? ""})`)
      case "tool/result": {
        if (d.error) return clip(`ERROR: ${typeof d.error === "string" ? d.error : JSON.stringify(d.error)}`)
        const txt = toolResultText(d)
        const meta = d.meta
        return meta ? clip(txt) + `  [meta: ${JSON.stringify(meta).slice(0, 80)}]` : clip(txt)
      }
      case "approval/asked": return clip(`${d.toolName} — ${d.reason ?? ""}`)
      case "approval/decided": return `outcome=${d.outcome}`
      case "todo/write": return `${(d.todos as unknown[] | undefined)?.length ?? 0} todos`
      case "llm/retry": return clip(`retry ${d.retry}/${d.maxRetries} — ${d.failure}`)
      case "llm/retry-started": return `retry ${d.retry} started`
      case "command/run": return clip(`${d.name}${d.args ?? ""} (cmd ${d.commandId})`)
      case "command/done": return clip(`${d.kind}: ${d.text ?? ""}`)
      case "web/deepseek-search-llm-request": return clip(`endpoint=${d.endpoint}, apiVersion=${d.apiVersion}`)
    }
  } catch { /* fallthrough */ }
  return `(${t})`
}

/** 解析一行 → 轻量事件视图。 */
export function parseLine(raw: string, lineIdx: number): LightEvent | null {
  let o: Record<string, unknown> | null = null
  try { o = JSON.parse(raw) } catch { return null }
  if (!o || typeof o !== "object") return null
  const t = (o.type ?? "?") as string
  const d = (o.data ?? {}) as Record<string, unknown>
  const ev: LightEvent = {
    line: lineIdx,
    seq: (o.seq as number) ?? (o.seq0 as number) ?? null,
    type: t,
    time: (o.time as number) ?? (o.time0 as number) ?? null,
    group: groupOf(t),
    summary: summarize(o),
  }
  if (t === "tool/result") ev.error = Boolean(d.error)
  else if (t === "turn/end") ev.error = ((d.reason ?? {}) as Record<string, unknown>).kind === "error"
  else if (t === "assistant/message") ev.tokens = (d.usage ?? null) as Record<string, unknown> | null
  return ev
}

/** 解析整份日志文本 → ParsedSession。 */
export function parseLogText(text: string): ParsedSession {
  const lines = text.split("\n")
  const events: LightEvent[] = []
  const meta: EventMeta = { title: null, cwd: null, createdAt: null, agentPreset: null, delegationDepth: null, eventCount: 0, startTime: null, endTime: null, durationMs: 0 }
  const typeCounts: Record<string, number> = {}
  const groupCounts: Record<string, number> = {}
  const search = new Map<number, string>()
  let startTime: number | null = null
  let endTime: number | null = null

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]?.trim() ?? ""
    if (!raw) continue
    const o = JSON.parse(raw) as Record<string, unknown> | null
    if (!o) continue
    const ev = parseLine(raw, i)
    if (!ev) continue
    events.push(ev)
    typeCounts[ev.type] = (typeCounts[ev.type] ?? 0) + 1
    groupCounts[ev.group] = (groupCounts[ev.group] ?? 0) + 1
    const d = (o.data ?? {}) as Record<string, unknown>

    if (ev.type === "reasoning-chunks" || ev.type === "text-chunks") {
      const joined = ((d.texts ?? []) as string[]).join("")
      if (joined) search.set(i, joined)
    } else if (ev.type === "tool/call") {
      search.set(i, `${d.name ?? ""} ${d.arguments ?? ""}`)
    } else if (ev.type === "tool/result") {
      const txt = toolResultText(d)
      if (txt) search.set(i, txt)
    } else if (ev.type === "user/message" || ev.type === "assistant/message") {
      const msg = (d.message ?? {}) as Record<string, unknown>
      const txt = contentText(msg.content)
      if (txt) search.set(i, txt)
    } else if (ev.type === "todo/write") {
      search.set(i, ((d.todos ?? []) as Array<Record<string, unknown>>).map((x) => x.content ?? "").join(" "))
    } else if (ev.type === "approval/asked") {
      search.set(i, `${d.toolName ?? ""} ${d.reason ?? ""}`)
    }

    if (ev.type === "session" && ev.seq == null) {
      meta.cwd = o.cwd as string | null
      meta.createdAt = o.createdAt as number | null
      meta.agentPreset = o.agentPreset as string | null
      meta.delegationDepth = o.delegationDepth as number | null
    } else if (ev.type === "session/title" && meta.title == null) {
      meta.title = d.title as string | null
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
export async function loadAndParseSession(sessionsRoot: string, sessionId: string): Promise<{ path: string } & ParsedSession> {
  const path = await findSessionDir(sessionsRoot, sessionId)
  if (!path) throw new Error(`session log not found: ${sessionId}`)
  const buffer = await readFile(path)
  const text = decompressSessionLog(buffer)
  return { path, ...parseLogText(text) }
}
