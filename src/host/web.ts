/**
 * dsh-session-viz web 半（TypeScript 版）：同源 API 路由。
 *
 * 路由（前缀 /dsh-session-viz/api）：
 *   GET /meta | /sessions | /summary | /story | /tree | /log | /line
 *   POST /rescan
 */

import { readdir, stat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { SessionId, type SessionEvent } from "@deepseek-ai/dsh-session"
import type { SessionQuery } from "@deepseek-ai/dsh-session-query"
import { GROUPS, GROUP_ORDER, decompressSessionLog, loadAndParseSession, parseLogText } from "./parser.js"
import { buildStory, buildSummary, buildTree, buildClosure, rewindOptsOf } from "./narrative.js"

export const name = "dsh-session-viz-web"
export const inject = ["webServer", "sessionQuery"] as const

// ---------------------------------------------------------------------------
// 最小 webServer 类型（与 @deepseek-ai/dsh-host-webserver 的 register 契约一致）
// ---------------------------------------------------------------------------

interface WebRequest {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
}

interface WebResponse {
  writeHead(status: number, headers?: Record<string, string>): void
  end(body?: string): void
}

interface WebServer {
  register(opts: { kind: "prefix"; path: string; handler: (req: WebRequest, res: WebResponse) => Promise<void> | void }): unknown
}

interface CordisCtx {
  webServer: WebServer
  sessionQuery?: SessionQuery
  effect(fn: () => unknown, label?: string): unknown
}

function eventLogText(session: { session: { createdAt: number, cwd?: string, parentSession?: string }, events: readonly SessionEvent[] }): string {
  const header = { type: "session", time: session.session.createdAt, createdAt: session.session.createdAt,
    cwd: session.session.cwd ?? null, data: { cwd: session.session.cwd ?? null } }
  return [header, ...session.events].map(event => JSON.stringify(event)).join("\n") + "\n"
}

async function getSessionQueryCached(ctx: CordisCtx, sessionId: string): Promise<CacheEntry> {
  if (!ctx.sessionQuery) throw new Error("本地日志不可用：当前 Profile 未提供 sessionQuery")
  const read = await ctx.sessionQuery.readSession(SessionId(sessionId))
  const text = eventLogText(read)
  const parsed = parseLogText(text)
  parsed.meta.sizeBytes = Buffer.byteLength(text, "utf8")
  return { parsed, text, path: `dsh-session-query:${sessionId}`, at: Date.now() }
}

// ---------------------------------------------------------------------------
// 缓存
// ---------------------------------------------------------------------------

interface CacheEntry {
  parsed: ReturnType<typeof parseLogText>
  text: string
  path: string
  at: number
}

const CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30_000

function json(res: WebResponse, status: number, body: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(JSON.stringify(body))
}

interface Query {
  sessionId: string | null
  from: number
  to: number
  line: number
  q: string
}

function parseQuery(url: URL): Query {
  const params = url.searchParams
  const get = (k: string): string | null => {
    const v = params.get(k)
    return v === null || v === "" ? null : v
  }
  return {
    sessionId: get("sessionId"),
    from: parseInt(get("from") ?? "0", 10) || 0,
    to: parseInt(get("to") ?? "-1", 10) || -1,
    line: parseInt(get("line") ?? "-1", 10) || -1,
    q: get("q") ?? "",
  }
}

async function getCached(sessionsPath: string | null, sessionId: string, sessionQuery?: SessionQuery): Promise<CacheEntry> {
  const hit = CACHE.get(sessionId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit
  if (!sessionsPath && sessionQuery) {
    const read = await sessionQuery.readSession(SessionId(sessionId))
    const text = eventLogText(read)
    const parsed = parseLogText(text)
    parsed.meta.sizeBytes = Buffer.byteLength(text, "utf8")
    const entry: CacheEntry = { parsed, text, path: `dsh-session-query:${sessionId}`, at: Date.now() }
    CACHE.set(sessionId, entry)
    return entry
  }
  if (!sessionsPath) throw new Error("sessionsPath 未配置，且 sessionQuery 不可用")
  try {
    const { path, ...parsed } = await loadAndParseSession(sessionsPath, sessionId)
    const buffer = await readFile(path)
    const text = decompressSessionLog(buffer)
    const st = await stat(path).catch(() => null)
    parsed.meta.sizeBytes = st?.size ?? null
    const entry: CacheEntry = { parsed, text, path, at: Date.now() }
    if (CACHE.size > 32) CACHE.clear()
    CACHE.set(sessionId, entry)
    return entry
  } catch (error) {
    // Agent Anywhere 的逻辑会话可能由 sessionQuery 提供，而不落在旧版 sessionsPath 目录。
    if (sessionQuery) {
      const read = await sessionQuery.readSession(SessionId(sessionId))
      const text = eventLogText(read)
      const parsed = parseLogText(text)
      parsed.meta.sizeBytes = Buffer.byteLength(text, "utf8")
      const entry: CacheEntry = { parsed, text, path: `dsh-session-query:${sessionId}`, at: Date.now() }
      CACHE.set(sessionId, entry)
      return entry
    }
    throw error
  }
}

function rawLineAt(entry: CacheEntry, line: number): string | null {
  const lines = entry.text.split("\n")
  let idx = 0
  for (const l of lines) {
    if (!l.trim()) continue
    if (idx === line) return l
    idx++
  }
  return null
}

interface NarrativeInput { lines: string[]; objs: Array<Record<string, unknown> | null> }

function narrativeInput(entry: CacheEntry): NarrativeInput {
  const lines = entry.text.split("\n").filter((l) => l.trim())
  const objs = lines.map((l) => {
    try { return JSON.parse(l) as Record<string, unknown> } catch { return null }
  })
  return { lines, objs }
}

// ---------------------------------------------------------------------------
// 会话列表（完整解码 + 解析并写入缓存，并行）
// ---------------------------------------------------------------------------

async function listSessions(sessionsPath: string | null, sessionQuery?: SessionQuery): Promise<Array<Record<string, unknown>>> {
  if (!sessionsPath && sessionQuery) {
    const records = await sessionQuery.listSessions()
    const jobs = records.map(async record => {
      const id = String(record.header.id)
      try {
        const entry = await getCached(null, id, sessionQuery)
        return { id, dirEncoded: "dsh-session-query", cwd: entry.parsed.meta.cwd ?? null,
          createdAt: entry.parsed.meta.createdAt ?? null, title: entry.parsed.meta.title ?? null,
          lineCount: entry.parsed.events.length, sizeBytes: entry.parsed.sizeBytes ?? null }
      } catch { return null }
    })
    const results: Array<Record<string, unknown>> = []
    for (const item of await Promise.all(jobs)) if (item !== null) results.push(item)
    return results.sort((a, b) => ((b.createdAt as number) ?? 0) - ((a.createdAt as number) ?? 0))
  }
  if (!sessionsPath) return []
  const jobs: Array<Promise<Record<string, unknown> | null>> = []
  const projects = await readdir(sessionsPath, { withFileTypes: true }).catch(() => [])
  for (const proj of projects) {
    if (!proj.isDirectory()) continue
    const projDir = join(sessionsPath, proj.name)
    const sessionDirs = await readdir(projDir, { withFileTypes: true }).catch(() => [])
    for (const sd of sessionDirs) {
      if (!sd.isDirectory()) continue
      const sessionDir = join(projDir, sd.name)
      let file: string | null = null
      for (const cand of [join(sessionDir, "session.jsonl.zstd"), join(sessionDir, "session.jsonl")]) {
        try { await stat(cand); file = cand; break } catch { /* next */ }
      }
      if (!file) continue
      const id = sd.name
      jobs.push((async () => {
        try {
          const entry = await getCached(sessionsPath, id, sessionQuery)
          const m = entry.parsed.meta
          return {
            id,
            dirEncoded: proj.name,
            cwd: m.cwd ?? null,
            createdAt: m.createdAt ?? null,
            title: m.title ?? null,
            lineCount: entry.parsed.events.length,
            sizeBytes: entry.parsed.sizeBytes ?? null,
          }
        } catch {
          return null
        }
      })())
    }
  }
  const results = (await Promise.all(jobs)).filter((r): r is Record<string, unknown> => r !== null)
  results.sort((a, b) => ((b.createdAt as number) ?? 0) - ((a.createdAt as number) ?? 0))
  return results
}

// ---------------------------------------------------------------------------
// 路由
// ---------------------------------------------------------------------------

export function apply(ctx: CordisCtx, config: { sessionsPath?: string | null }): void {
  const sessionsPath = config.sessionsPath ?? null
  const sessionQuery = ctx.sessionQuery
  let listCache = { at: 0, sessions: [] as Array<Record<string, unknown>> }

  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/dsh-session-viz/api",
    async handler(req: WebRequest, res: WebResponse): Promise<void> {
      const url = new URL(req.url ?? "", "http://localhost")
      const pathname = url.pathname
      const q = parseQuery(url)
      try {
        if (pathname === "/dsh-session-viz/api/meta" && (req.method === "GET" || req.method === "HEAD")) {
          json(res, 200, { groups: GROUPS, groupOrder: GROUP_ORDER, sessionsPath })
          return
        }

        if (pathname === "/dsh-session-viz/api/sessions" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath && !sessionQuery) { json(res, 400, { ok: false, error: "当前 Profile 未提供本地日志或 sessionQuery" }); return }
          if (Date.now() - listCache.at > 10_000) listCache = { at: Date.now(), sessions: await listSessions(sessionsPath, sessionQuery) }
          let out = listCache.sessions
          if (q.q) {
            const ql = q.q.toLowerCase()
            out = out.filter((s) =>
              `${s.id} ${s.cwd ?? ""} ${s.title ?? ""} ${s.dirEncoded}`.toLowerCase().includes(ql))
          }
          json(res, 200, { ok: true, sessions: out })
          return
        }

        if (pathname === "/dsh-session-viz/api/log" && (req.method === "GET" || req.method === "HEAD")) {
          if ((!sessionsPath && !sessionQuery) || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失或当前 Profile 不支持会话读取" }); return }
          const entry = await getCached(sessionsPath, q.sessionId, sessionQuery)
          let events = entry.parsed.events
          let searchTotal: number | null = null
          if (q.q) {
            const ql = q.q.toLowerCase()
            const matched = []
            for (const ev of events) {
              const hay = (ev.summary ?? "").toLowerCase()
              const full = entry.parsed.search.get(ev.line)
              const fullHay = full ? full.toLowerCase() : ""
              if (hay.includes(ql) || fullHay.includes(ql)) matched.push(ev)
            }
            searchTotal = matched.length
            events = matched
          }
          const from = Math.max(0, q.from)
          const to = q.to < 0 || q.to > events.length ? events.length : q.to
          json(res, 200, {
            ok: true,
            sessionId: q.sessionId,
            meta: entry.parsed.meta,
            typeCounts: entry.parsed.typeCounts,
            groupCounts: entry.parsed.groupCounts,
            total: events.length,
            searchTotal,
            from,
            to,
            events: events.slice(from, to),
          })
          return
        }

        if (pathname === "/dsh-session-viz/api/line" && (req.method === "GET" || req.method === "HEAD")) {
          if ((!sessionsPath && !sessionQuery) || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失或当前 Profile 不支持会话读取" }); return }
          const entry = await getCached(sessionsPath, q.sessionId, sessionQuery)
          const line = Math.max(0, q.line)
          const ev = entry.parsed.events.find((e) => e.line === line)
          if (!ev) { json(res, 404, { ok: false, error: `行 ${line} 不存在` }); return }
          json(res, 200, { ok: true, event: ev, raw: rawLineAt(entry, line) })
          return
        }

        if (pathname === "/dsh-session-viz/api/summary" && (req.method === "GET" || req.method === "HEAD")) {
          if ((!sessionsPath && !sessionQuery) || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失或当前 Profile 不支持会话读取" }); return }
          const entry = await getCached(sessionsPath, q.sessionId, sessionQuery)
          const { lines, objs } = narrativeInput(entry)
          const summary = buildSummary(lines, objs, entry.parsed.meta, entry.parsed.typeCounts)
          json(res, 200, { ok: true, summary })
          return
        }

        if (pathname === "/dsh-session-viz/api/story" && (req.method === "GET" || req.method === "HEAD")) {
          if ((!sessionsPath && !sessionQuery) || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失或当前 Profile 不支持会话读取" }); return }
          const entry = await getCached(sessionsPath, q.sessionId, sessionQuery)
          const { lines, objs } = narrativeInput(entry)
          const rw = rewindOptsOf(objs)
          const story = buildStory(lines, objs, rw)
          json(res, 200, { ok: true, story })
          return
        }

        if (pathname === "/dsh-session-viz/api/tree" && (req.method === "GET" || req.method === "HEAD")) {
          if ((!sessionsPath && !sessionQuery) || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失或当前 Profile 不支持会话读取" }); return }
          const entry = await getCached(sessionsPath, q.sessionId, sessionQuery)
          const { lines, objs } = narrativeInput(entry)
          const rw = rewindOptsOf(objs)
          const tree = buildTree(lines, objs, rw)
          const closure = buildClosure(objs, rw)
          json(res, 200, { ok: true, meta: entry.parsed.meta, typeCounts: entry.parsed.typeCounts, turns: tree, closure, rewinds: entry.parsed.rewinds })
          return
        }

        if (pathname === "/dsh-session-viz/api/rescan" && (req.method === "POST" || req.method === "GET")) {
          listCache = { at: 0, sessions: [] }
          CACHE.clear()
          json(res, 200, { ok: true })
          return
        }

        json(res, 404, { ok: false, error: "未知路由" })
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const missing = message.includes('session log not found') || message.includes('not found')
        json(res, missing ? 404 : 500, { ok: false, code: missing ? 'SESSION_LOG_NOT_FOUND' : 'SESSION_READ_FAILED', error: message,
          hint: missing ? '该会话可能来自 Agent Anywhere 或尚未持久化；已切换到 sessionQuery 时请确认当前 Profile 支持它。' : undefined })
      }
    },
  }), "dsh-session-viz: api routes")
}
