/**
 * dsh-session-viz web 半（TypeScript 版）：同源 API 路由。
 *
 * 路由（前缀 /dsh-session-viz/api）：
 *   GET /meta | /sessions | /summary | /story | /tree | /log | /line
 *   POST /rescan
 */

import { readdir, stat, readFile } from "node:fs/promises"
import { join } from "node:path"
import { GROUPS, GROUP_ORDER, decompressSessionLog, loadAndParseSession, parseLogText } from "./parser.js"
import { buildStory, buildSummary, buildTree } from "./narrative.js"

export const name = "dsh-session-viz-web"
export const inject = ["webServer"] as const

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
  effect(fn: () => unknown, label?: string): unknown
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

async function getCached(sessionsPath: string, sessionId: string): Promise<CacheEntry> {
  const hit = CACHE.get(sessionId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit
  const { path, ...parsed } = await loadAndParseSession(sessionsPath, sessionId)
  const buffer = await readFile(path)
  const text = decompressSessionLog(buffer)
  const st = await stat(path).catch(() => null)
  parsed.meta.sizeBytes = st?.size ?? null
  const entry: CacheEntry = { parsed, text, path, at: Date.now() }
  if (CACHE.size > 32) CACHE.clear()
  CACHE.set(sessionId, entry)
  return entry
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

async function listSessions(sessionsPath: string): Promise<Array<Record<string, unknown>>> {
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
          const entry = await getCached(sessionsPath, id)
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
          if (!sessionsPath) { json(res, 400, { ok: false, error: "sessionsPath 未配置" }); return }
          if (Date.now() - listCache.at > 10_000) listCache = { at: Date.now(), sessions: await listSessions(sessionsPath) }
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
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
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
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          const line = Math.max(0, q.line)
          const ev = entry.parsed.events.find((e) => e.line === line)
          if (!ev) { json(res, 404, { ok: false, error: `行 ${line} 不存在` }); return }
          json(res, 200, { ok: true, event: ev, raw: rawLineAt(entry, line) })
          return
        }

        if (pathname === "/dsh-session-viz/api/summary" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          const { lines, objs } = narrativeInput(entry)
          const summary = buildSummary(lines, objs, entry.parsed.meta, entry.parsed.typeCounts)
          json(res, 200, { ok: true, summary })
          return
        }

        if (pathname === "/dsh-session-viz/api/story" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          const { lines, objs } = narrativeInput(entry)
          const story = buildStory(lines, objs)
          json(res, 200, { ok: true, story })
          return
        }

        if (pathname === "/dsh-session-viz/api/tree" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          const { lines, objs } = narrativeInput(entry)
          const tree = buildTree(lines, objs)
          json(res, 200, { ok: true, meta: entry.parsed.meta, typeCounts: entry.parsed.typeCounts, turns: tree })
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
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) })
      }
    },
  }), "dsh-session-viz: api routes")
}
