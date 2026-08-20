/**
 * dsh-session-viz web 半：同源 API 路由，供浏览器查看器读取并解析会话日志。
 *
 * 路由（前缀 /dsh-session-viz/api）：
 *   GET /sessions?q=         列出所有会话（轻量：标题/时间/行数/大小）
 *   GET /log?sessionId=&from=&to=   返回会话日志的轻量事件列表（分页）
 *   GET /line?sessionId=&line=N     返回单行事件的完整解析（含原始 JSON）
 *   GET /meta                   返回 14 组配色方案（前端主题）
 *   POST /rescan                清除会话列表缓存
 *
 * 独立成行（而非并入主 host 半）是因为 cordis 的 inject 是强依赖：
 * webServer 只在 web profile 存在，headless 下挂载本行会永远 PENDING。
 */
import { readdir, stat } from "node:fs/promises"
import { join } from "node:path"
import { GROUPS, GROUP_ORDER, decompressSessionLog, loadAndParseSession, parseLogText } from "./parser.mjs"
import { buildStory, buildSummary, buildTree } from "./narrative.mjs"

export const name = "dsh-session-viz-web"
export const inject = ["webServer"] // config 由 loader 自动注入为 apply 第二参

const CACHE = new Map() // sessionId -> {parsed, text, path, at}
const CACHE_TTL_MS = 30_000

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(JSON.stringify(body))
}

function parseQuery(url) {
  const params = new URLSearchParams(url.search)
  const get = (k, d = null) => {
    const v = params.get(k)
    return v === null || v === "" ? d : v
  }
  return {
    sessionId: get("sessionId"),
    from: parseInt(get("from", "0"), 10) || 0,
    to: parseInt(get("to", "-1"), 10) || -1,
    line: parseInt(get("line", "-1"), 10) || -1,
    q: get("q", ""),
  }
}

async function getCached(sessionsPath, sessionId) {
  const hit = CACHE.get(sessionId)
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit
  const { path, ...parsed } = await loadAndParseSession(sessionsPath, sessionId)
  const { readFile, stat: fstat } = await import("node:fs/promises")
  const [buffer, st] = await Promise.all([readFile(path), fstat(path).catch(() => null)])
  const text = decompressSessionLog(buffer)
  parsed.meta.sizeBytes = st?.size ?? null
  const entry = { parsed, text, path, at: Date.now() }
  if (CACHE.size > 32) CACHE.clear()
  CACHE.set(sessionId, entry)
  return entry
}

function rawLineAt(entry, line) {
  const lines = entry.text.split("\n")
  let idx = 0
  for (const l of lines) {
    if (!l.trim()) continue
    if (idx === line) return l
    idx++
  }
  return null
}

/** 解码文本 → 非空行数组 + 逐行 JSON 对象（narrative 需要完整 data）。 */
function narrativeInput(entry) {
  if (entry.narrative) return entry.narrative
  const lines = entry.text.split("\n").filter((l) => l.trim())
  const objs = lines.map((l) => {
    try { return JSON.parse(l) } catch { return null }
  })
  entry.narrative = { lines, objs }
  return entry.narrative
}

/** 扫描所有会话目录：完整解码 + 解析并写入缓存（并行）。 */
async function listSessions(sessionsPath) {
  const jobs = []
  const projects = await readdir(sessionsPath, { withFileTypes: true }).catch(() => [])
  for (const proj of projects) {
    if (!proj.isDirectory()) continue
    const projDir = join(sessionsPath, proj.name)
    const sessionDirs = await readdir(projDir, { withFileTypes: true }).catch(() => [])
    for (const sd of sessionDirs) {
      if (!sd.isDirectory()) continue
      const sessionDir = join(projDir, sd.name)
      const logFile = join(sessionDir, "session.jsonl.zstd")
      const plainFile = join(sessionDir, "session.jsonl")
      let file = null
      for (const cand of [logFile, plainFile]) {
        try { await stat(cand); file = cand; break } catch { /* next */ }
      }
      if (!file) continue
      const id = sd.name // session id 已 URL 安全，encodeSegment 恒等
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
  const results = (await Promise.all(jobs)).filter(Boolean)
  results.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
  return results
}

export function apply(ctx, config) {
  const sessionsPath = config.sessionsPath ?? null
  let listCache = { at: 0, sessions: [] }

  ctx.effect(() => ctx.webServer.register({
    kind: "prefix",
    path: "/dsh-session-viz/api",
    async handler(req, res) {
      const url = new URL(req.url ?? "", "http://localhost")
      const pathname = url.pathname
      const q = parseQuery(url)
      try {
        // ---- 配色元信息 ----
        if (pathname === "/dsh-session-viz/api/meta" && (req.method === "GET" || req.method === "HEAD")) {
          json(res, 200, { groups: GROUPS, groupOrder: GROUP_ORDER, sessionsPath })
          return
        }

        // ---- 会话列表 ----
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

        // ---- 单个会话日志（分页轻量事件；?q= 全文搜索） ----
        if (pathname === "/dsh-session-viz/api/log" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          let events = entry.parsed.events
          let searchTotal = null
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

        // ---- 单行完整事件 ----
        if (pathname === "/dsh-session-viz/api/line" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          const line = Math.max(0, q.line)
          // 按行号查找事件（events 数组索引可能与行号错位：坏行/空行会被跳过）
          const ev = entry.parsed.events.find((e) => e.line === line)
          if (!ev) { json(res, 404, { ok: false, error: `行 ${line} 不存在` }); return }
          json(res, 200, { ok: true, event: ev, raw: rawLineAt(entry, line) })
          return
        }

        // ---- 执行摘要卡片（第一层） ----
        if (pathname === "/dsh-session-viz/api/summary" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          const { lines, objs } = narrativeInput(entry)
          const summary = buildSummary(lines, objs, entry.parsed.meta, entry.parsed.typeCounts)
          json(res, 200, { ok: true, summary })
          return
        }

        // ---- 执行故事线（第二层） ----
        if (pathname === "/dsh-session-viz/api/story" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          const { lines, objs } = narrativeInput(entry)
          const story = buildStory(lines, objs)
          json(res, 200, { ok: true, story })
          return
        }

        // ---- 技术事件树（第三层；turn→step→合并组） ----
        if (pathname === "/dsh-session-viz/api/tree" && (req.method === "GET" || req.method === "HEAD")) {
          if (!sessionsPath || !q.sessionId) { json(res, 400, { ok: false, error: "sessionId 缺失" }); return }
          const entry = await getCached(sessionsPath, q.sessionId)
          const { lines, objs } = narrativeInput(entry)
          const tree = buildTree(lines, objs)
          json(res, 200, { ok: true, meta: entry.parsed.meta, typeCounts: entry.parsed.typeCounts, turns: tree })
          return
        }

        // ---- 重新扫描 ----
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
