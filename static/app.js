/* ============================================================
   DSH Session Log Visualizer — frontend
   Vanilla JS, no dependencies.
   ============================================================ */

"use strict";

/* ---------------- state ---------------- */
const state = {
  meta: null,                    // { groups, groupOrder, decodedDir }
  sessions: [],
  sortKey: "createdAt",          // createdAt | sizeBytes | lineCount
  sortDir: -1,                   // -1 desc, 1 asc
  dirFilter: "all",
  search: "",
  current: null,                 // { dirEncoded, id }
  detail: null,                  // session summary
  tab: "overview",
  // per-view transient state
  timeline: null,
  toolsCache: null,
  reasoningCache: null,
  tokensCache: null,
  approvalsCache: null,
  todosCache: null,
  searchState: { q: "", type: "", group: "", from: "", to: "", offset: 0, total: 0, events: [] },
  rawState: { from: 0, to: 0, lines: [], line: null, seq: null, type: "" },
  eventCache: {},                // line -> {raw, event} for modal
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------------- helpers ---------------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function fmtTime(ms) {
  if (!ms) return "—";
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function fmtDur(ms) {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60000), s = Math.round((ms % 60000) / 1000);
  return `${m} min ${s} s`;
}

function fmtBytes(n) {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function fmtNum(n) { return (n ?? 0).toLocaleString("en-US"); }

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).detail || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

function groupCss(g) {
  const grp = state.meta?.groups?.[g] || { label: g, fg: "#607D8B", bg: "#ECEFF1", border: "#455A64" };
  return grp;
}

function groupChip(g) {
  const grp = groupCss(g);
  return `<span class="group-chip" style="background:${grp.bg};color:${grp.fg};border-color:${grp.border}">${esc(grp.label)}</span>`;
}

/* ---------------- boot ---------------- */
async function boot() {
  try {
    const [meta, list] = await Promise.all([api("/api/meta"), api("/api/sessions")]);
    state.meta = meta;
    state.sessions = list.sessions;
    $("#decoded-dir").textContent = meta.decodedDir;
  } catch (e) {
    $("#session-cards").innerHTML = `<div class="empty-hint">加载失败：${esc(e.message)}<br>请先运行 <code>python app.py --sync</code> 或确认服务已启动。</div>`;
    return;
  }
  renderDirFilter();
  renderSessionList();
  bindListEvents();
}

/* ---------------- sidebar: dir filter ---------------- */
function renderDirFilter() {
  const dirs = {};
  state.sessions.forEach((s) => { dirs[s.dirEncoded] = (dirs[s.dirEncoded] || 0) + 1; });
  const keys = Object.keys(dirs).sort();
  const html = [`<button class="chip ${state.dirFilter === "all" ? "active" : ""}" data-dir="all">全部 (${state.sessions.length})</button>`]
    .concat(keys.map((d) => `<button class="chip ${state.dirFilter === d ? "active" : ""}" data-dir="${esc(d)}">${esc(d)} (${dirs[d]})</button>`))
    .join("");
  $("#dir-filter").innerHTML = html;
}

/* ---------------- sidebar: session list ---------------- */
function filteredSessions() {
  let arr = state.sessions.filter((s) => {
    if (state.dirFilter !== "all" && s.dirEncoded !== state.dirFilter) return false;
    if (state.search) {
      const hay = `${s.title || ""} ${s.cwd || ""} ${s.id} ${s.dirEncoded}`.toLowerCase();
      if (!hay.includes(state.search.toLowerCase())) return false;
    }
    return true;
  });
  const key = state.sortKey;
  arr.sort((a, b) => {
    const av = a[key] ?? 0, bv = b[key] ?? 0;
    return (av - bv) * state.sortDir;
  });
  return arr;
}

function renderSessionList() {
  const arr = filteredSessions();
  const el = $("#session-list");
  if (!arr.length) {
    el.innerHTML = `<div class="empty-hint">无匹配会话</div>`;
    return;
  }
  el.innerHTML = arr.map((s) => {
    const active = state.current && state.current.dirEncoded === s.dirEncoded && state.current.id === s.id;
    return `<button class="session-item ${active ? "active" : ""}" data-dir="${esc(s.dirEncoded)}" data-id="${esc(s.id)}">
      <div class="si-title">${esc(s.title || "(无标题)")}</div>
      <div class="si-meta">
        <span>${fmtTime(s.createdAt)}</span>
        <span>${fmtNum(s.lineCount)} 事件</span>
        <span>${fmtBytes(s.sizeBytes)}</span>
      </div>
      <div class="si-cwd" title="${esc(s.cwd || "")}">${esc(s.cwd || "")}</div>
    </button>`;
  }).join("");
}

function bindListEvents() {
  $("#session-list").addEventListener("click", (e) => {
    const item = e.target.closest(".session-item");
    if (!item) return;
    openSession(item.dataset.dir, item.dataset.id);
  });
  $("#session-search").addEventListener("input", (e) => {
    state.search = e.target.value.trim();
    renderSessionList();
  });
  $("#btn-sort").addEventListener("click", () => {
    const order = ["createdAt", "sizeBytes", "lineCount"];
    state.sortKey = order[(order.indexOf(state.sortKey) + 1) % order.length];
    state.sortDir = state.sortKey === "createdAt" ? -1 : -1;
    $("#btn-sort").textContent = ({ createdAt: "时间", sizeBytes: "大小", lineCount: "事件数" }[state.sortKey]);
    renderSessionList();
  });
  $("#btn-rescan").addEventListener("click", async () => {
    $("#btn-rescan").textContent = "↻";
    try {
      const list = await api("/api/rescan", { method: "POST" });
      state.sessions = list.sessions;
      renderDirFilter();
      renderSessionList();
    } catch (e) { alert(e.message); }
  });
  $("#dir-filter").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.dirFilter = chip.dataset.dir;
    renderDirFilter();
    renderSessionList();
  });
  $("#session-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") { const items = $$("#session-list .session-item"); if (items[0]) items[0].click(); }
  });
}

/* ---------------- open session ---------------- */
async function openSession(dirEncoded, id) {
  state.current = { dirEncoded, id };
  state.detail = null;
  state.timeline = null;
  state.toolsCache = null;
  state.reasoningCache = null;
  state.tokensCache = null;
  state.approvalsCache = null;
  state.todosCache = null;
  state.tab = "overview";
  $("#view-list").classList.add("hidden");
  $("#view-detail").classList.remove("hidden");
  renderSessionList();
  showLoading("#tab-content");
  try {
    const d = await api(`/api/sessions/${encodeURIComponent(dirEncoded)}/${encodeURIComponent(id)}`);
    state.detail = d;
    renderDetailHead();
    renderTabs();
    await switchTab("overview");
  } catch (e) {
    $("#tab-content").innerHTML = `<div class="empty-hint">加载失败：${esc(e.message)}</div>`;
  }
}

function showLoading(el) {
  document.querySelector(el).innerHTML = `<div class="empty-hint"><span class="spin">◌</span> 加载中…</div>`;
}

function renderDetailHead() {
  const d = state.detail;
  $("#detail-title").textContent = d.title || d.id;
  $("#detail-meta").innerHTML = [
    `<span class="tag-pill" style="background:#E3F2FD;color:#1565C0">${esc(d.dirEncoded)}</span>`,
    `<span class="tag-pill" style="background:#EDE7F6;color:#4527A0">${esc(d.cwd || "")}</span>`,
    `<span class="tag-pill" style="background:#F3E5F5;color:#7B1FA2">preset: ${esc(d.agentPreset || "—")}</span>`,
    `<span class="tag-pill" style="background:#E0F2F1;color:#00695C">${fmtTime(d.createdAt)}</span>`,
    `<span class="tag-pill" style="background:#FBE9E7;color:#BF360C">解析 ${d.parseMs} ms</span>`,
  ].join("");
  $("#btn-export").href = `/api/sessions/${encodeURIComponent(d.dirEncoded)}/${encodeURIComponent(d.id)}/export`;
}

const TABS = [
  { id: "overview", label: "概览" },
  { id: "timeline", label: "时间线" },
  { id: "tools", label: "工具流程" },
  { id: "reasoning", label: "推理过程" },
  { id: "todos", label: "任务清单" },
  { id: "approvals", label: "审批流程" },
  { id: "tokens", label: "Token 统计" },
  { id: "search", label: "事件搜索" },
  { id: "raw", label: "原始数据" },
];

function renderTabs() {
  const counts = {
    overview: "",
    timeline: state.detail.turnCount,
    tools: state.detail.toolCount,
    reasoning: state.detail.reasoningCount,
    todos: state.detail.todoCount,
    approvals: state.detail.approvalCount,
    tokens: "",
    search: "",
    raw: "",
  };
  $("#tabs").innerHTML = TABS.map((t) =>
    `<button class="tab ${state.tab === t.id ? "active" : ""}" data-tab="${t.id}">${t.label}${counts[t.id] ? `<span class="tab-count">${counts[t.id]}</span>` : ""}</button>`
  ).join("");
}

async function switchTab(tab) {
  state.tab = tab;
  $$("#tabs .tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  const el = $("#tab-content");
  showLoading("#tab-content");
  try {
    switch (tab) {
      case "overview": await renderOverview(el); break;
      case "timeline": await renderTimeline(el); break;
      case "tools": await renderTools(el); break;
      case "reasoning": await renderReasoning(el); break;
      case "todos": await renderTodos(el); break;
      case "approvals": await renderApprovals(el); break;
      case "tokens": await renderTokens(el); break;
      case "search": await renderSearch(el); break;
      case "raw": await renderRaw(el); break;
    }
  } catch (e) {
    el.innerHTML = `<div class="empty-hint">加载失败：${esc(e.message)}</div>`;
  }
}

/* ============================================================
   Overview
   ============================================================ */
async function renderOverview(el) {
  const d = state.detail;
  const g = d.groupCounts || {};
  const maxType = Math.max(1, ...Object.values(d.typeCounts || {}));
  const maxGroup = Math.max(1, ...Object.values(g));
  const typeRows = Object.entries(d.typeCounts).sort((a, b) => b[1] - a[1]).map(([t, c]) => {
    const grp = groupCss(groupOf(t));
    return `<div class="bar-row"><div class="bar-label" title="${esc(t)}">${esc(t)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(c / maxType * 100).toFixed(1)}%;background:${grp.fg}"></div></div>
      <div class="bar-count">${fmtNum(c)}</div></div>`;
  }).join("");
  const groupRows = state.meta.groupOrder.map((k) => {
    const c = g[k] || 0;
    const grp = groupCss(k);
    return `<div class="bar-row"><div class="bar-label">${esc(grp.label)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(c / maxGroup * 100).toFixed(1)}%;background:${grp.fg}"></div></div>
      <div class="bar-count">${fmtNum(c)}</div></div>`;
  }).join("");
  const tokens = d.tokenTotals || {};
  el.innerHTML = `
  <div class="stat-grid">
    ${statCard("执行时长", fmtDur(d.durationMs), "从首个事件到末个事件")}
    ${statCard("事件总数", fmtNum(d.eventCount), `${fmtNum(d.lineCount)} 行 JSONL · ${fmtBytes(d.sizeBytes)}`)}
    ${statCard("对话轮次", fmtNum(d.turnCount), "")}
    ${statCard("工具调用", fmtNum(d.toolCount), `${fmtNum(d.toolErrorCount)} 个失败`)}
    ${statCard("推理片段", fmtNum(d.reasoningCount), "reasoning-chunks 合并")}
    ${statCard("审批请求", fmtNum(d.approvalCount), `${fmtNum(d.approvalDeniedCount)} 个被拒绝`)}
    ${statCard("任务清单快照", fmtNum(d.todoCount), "todo/write")}
    ${statCard("输出 Token", fmtNum(tokens.outputTokens), `输入 ${fmtNum(tokens.inputTokens)} · 推理 ${fmtNum(tokens.reasoningTokens)} · 缓存 ${fmtNum(tokens.cacheReadTokens)}`)}
  </div>
  <div class="panel"><h3>事件类型分布 <span class="hint">按需求文档 2.5 颜色方案着色</span></h3>${typeRows}</div>
  <div class="panel"><h3>分组统计</h3>${groupRows}</div>
  <div class="panel"><h3>会话元信息</h3>
    <table class="kv-table">
      <tr><td>会话 ID</td><td>${esc(d.id)}</td></tr>
      <tr><td>工作目录</td><td>${esc(d.cwd)}</td></tr>
      <tr><td>标题</td><td>${esc(d.title || "—")}</td></tr>
      <tr><td>创建时间</td><td>${fmtTime(d.createdAt)}</td></tr>
      <tr><td>agentPreset</td><td>${esc(d.agentPreset || "—")}</td></tr>
      <tr><td>delegationDepth</td><td>${esc(d.delegationDepth)}</td></tr>
      <tr><td>文件</td><td>${esc(d.filePath)}</td></tr>
    </table>
  </div>`;
}

function statCard(label, value, sub) {
  return `<div class="stat-card"><div class="stat-label">${esc(label)}</div>
    <div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${esc(sub)}</div>` : ""}</div>`;
}

// group lookup for a type (mirror of Python TYPE_GROUP; computed via meta when possible)
function groupOf(type) {
  const mapping = {
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
  };
  return mapping[type] || "config";
}

/* ============================================================
   Timeline
   ============================================================ */
async function renderTimeline(el) {
  if (!state.timeline) state.timeline = await api(`/api/sessions/${encCur()}/timeline`);
  const turns = state.timeline.turns;
  if (!turns.length) { el.innerHTML = `<div class="empty-hint">无时间线数据</div>`; return; }
  el.innerHTML = `<div class="timeline">${turns.map(turnHtml).join("")}</div>
  <p class="sub">点击轮次/步骤展开。步骤内的事件按需加载。</p>`;
  bindTimelineEvents(el);
}

function encCur() {
  return `${encodeURIComponent(state.current.dirEncoded)}/${encodeURIComponent(state.current.id)}`;
}

function turnHtml(t) {
  const errBadge = t.errors ? `<span class="tag-pill" style="background:#FFEBEE;color:#D32F2F">${t.errors} 错误</span>` : "";
  const reasonBadge = t.reason === "error"
    ? `<span class="tag-pill" style="background:#FFEBEE;color:#D32F2F">异常结束</span>`
    : (t.reason ? `<span class="tag-pill" style="background:#E8F5E9;color:#2E7D32">${esc(t.reason)}</span>` : "");
  return `<div class="turn-block" data-turn="${t.turn}">
    <div class="turn-head">
      <span class="turn-badge">Turn ${t.turn}</span>
      <span class="turn-summary">
        <span class="tag-pill" style="background:#E3F2FD;color:#1565C0">${t.stepCount} 步</span>
        <span class="tag-pill" style="background:#FFEBEE;color:#C62828">${t.toolCalls} 工具</span>
        <span class="tag-pill" style="background:#E0F7FA;color:#00838F">${fmtDur(t.durationMs)}</span>
        ${errBadge}${reasonBadge}
      </span>
      <span class="turn-chevron">▸</span>
    </div>
    <div class="step-list" hidden>${t.steps.map(stepHtml).join("")}</div>
  </div>`;
}

function stepHtml(st) {
  const chips = [];
  chips.push(`<span class="tag-pill" style="background:#E0F7FA;color:#00838F">${st.eventCount} 事件</span>`);
  if (st.toolCalls) chips.push(`<span class="tag-pill" style="background:#FFEBEE;color:#C62828">${st.toolCalls} 工具</span>`);
  if (st.reasoningChars) chips.push(`<span class="tag-pill" style="background:#FFF8E1;color:#F57F17">推理 ${fmtNum(st.reasoningChars)} 字符</span>`);
  if (st.textChars) chips.push(`<span class="tag-pill" style="background:#E0F2F1;color:#00695C">文本 ${fmtNum(st.textChars)} 字符</span>`);
  if (st.errors) chips.push(`<span class="tag-pill" style="background:#FFEBEE;color:#D32F2F">${st.errors} 错误</span>`);
  chips.push(`<span class="tag-pill" style="background:#ECEFF1;color:#455A64">${fmtDur(st.durationMs)}</span>`);
  const tools = (st.tools || []).map((tl) => {
    const color = tl.status === "error" ? "#D32F2F" : (tl.status === "ok" ? "#2E7D32" : "#8b95a3");
    return `<span class="tag-pill" style="background:${color}1A;color:${color}">${esc(tl.name)}</span>`;
  }).join("");
  return `<div class="step-block" data-turn="${st.turn}" data-step="${st.step}" data-from="${st.startLine}" data-to="${st.endLine}">
    <div class="step-head">
      <span class="step-badge">Step ${st.step}</span>
      <span class="step-meta">${chips.join("")}${tools ? `<span style="display:flex;gap:4px;flex-wrap:wrap">${tools}</span>` : ""}</span>
      <span class="turn-chevron">▸</span>
    </div>
    <div class="event-list" hidden></div>
  </div>`;
}

function bindTimelineEvents(root) {
  root.querySelectorAll(".turn-head").forEach((h) => {
    h.addEventListener("click", () => {
      const block = h.closest(".turn-block");
      const steps = block.querySelector(".step-list");
      steps.hidden = !steps.hidden;
      block.classList.toggle("open", !steps.hidden);
    });
  });
  root.querySelectorAll(".step-head").forEach((h) => {
    h.addEventListener("click", async () => {
      const block = h.closest(".step-block");
      const list = block.querySelector(".event-list");
      if (!list.dataset.loaded) {
        list.innerHTML = `<div class="empty-hint" style="padding:12px 0">加载事件…</div>`;
        const data = await api(`/api/sessions/${encCur()}/events?fromLine=${block.dataset.from}&toLine=${block.dataset.to}&limit=5000`);
        list.innerHTML = data.events.map(eventRowHtml).join("") || `<div class="empty-hint" style="padding:12px 0">无事件</div>`;
        list.querySelectorAll(".event-row").forEach((r) => r.addEventListener("click", () => openEvent(r.dataset.line)));
        list.dataset.loaded = "1";
      }
      list.hidden = !list.hidden;
      block.classList.toggle("open", !list.hidden);
    });
  });
  root.querySelectorAll(".event-row").forEach((r) => r.addEventListener("click", () => openEvent(r.dataset.line)));
}

function eventRowHtml(ev) {
  const grp = groupCss(ev.group);
  const err = (ev.error || ev.isError) ? `<span class="tag-pill" style="background:#FFEBEE;color:#D32F2F">ERROR</span>` : "";
  return `<div class="event-row ${ev.error || ev.isError ? "error-row" : ""}" data-line="${ev.line}" data-seq="${ev.seq ?? ""}"
    style="border-left-color:${grp.border}">
    <span class="ev-seq">#${ev.seq ?? ev.line}</span>
    <span class="ev-time">${fmtTime(ev.time).slice(11)}</span>
    <span class="group-chip" style="background:${grp.bg};color:${grp.fg};border-color:${grp.border}">${esc(ev.type)}</span>
    <span class="ev-summary" title="${esc(ev.summary)}">${esc(ev.summary)}</span>
    ${err}
  </div>`;
}

/* ============================================================
   Tools flow
   ============================================================ */
async function renderTools(el) {
  if (!state.toolsCache) state.toolsCache = await api(`/api/sessions/${encCur()}/tools`);
  const tools = state.toolsCache.tools;
  if (!tools.length) { el.innerHTML = `<div class="empty-hint">无工具调用</div>`; return; }
  el.innerHTML = `<div class="panel"><h3>工具调用流程 <span class="hint">${tools.length} 次调用，${tools.filter(t => t.status === "error").length} 次失败</span></h3></div>` +
    tools.map((t, i) => {
      const statusChip = t.status === "error"
        ? `<span class="tag-pill" style="background:#FFEBEE;color:#D32F2F">失败</span>`
        : t.status === "ok"
          ? `<span class="tag-pill" style="background:#E8F5E9;color:#2E7D32">成功</span>`
          : `<span class="tag-pill" style="background:#ECEFF1;color:#455A64">无结果</span>`;
      let args;
      try { args = JSON.stringify(JSON.parse(t.arguments || "{}"), null, 2); } catch (_) { args = t.arguments || ""; }
      return `<div class="tool-item" data-i="${i}">
        <div class="tool-head">
          <span class="tool-idx">${i + 1}</span>
          <span class="tool-name">${esc(t.name)}</span>
          <span class="tool-dur">${fmtDur(t.durationMs)}</span>
          ${statusChip}
          <span class="turn-chevron">▾</span>
        </div>
        <div class="tool-body">
          <div class="field-label">参数 arguments</div>
          <div class="mono-block">${esc(args)}</div>
          ${t.error ? `<div class="field-label">错误</div><div class="mono-block" style="border-color:#D32F2F;background:#FFF5F5">${esc(typeof t.error === "string" ? t.error : JSON.stringify(t.error))}</div>` : ""}
          <div class="field-label">结果 result</div>
          <div class="mono-block">${esc(t.resultPreview || "(无结果)")}</div>
          <div class="field-label">时序</div>
          <div class="kv-table">
            <tr><td>调用时间</td><td>${fmtTime(t.callTime)} · 行 ${t.callLine}</td></tr>
            <tr><td>结果时间</td><td>${t.resultTime ? fmtTime(t.resultTime) + " · 行 " + t.resultLine : "—"}</td></tr>
            <tr><td>callId</td><td>${esc(t.callId || "—")}</td></tr>
          </div>
        </div>
      </div>`;
    }).join("");
  el.querySelectorAll(".tool-item .tool-head").forEach((h) =>
    h.addEventListener("click", () => h.closest(".tool-item").classList.toggle("open")));
}

/* ============================================================
   Reasoning
   ============================================================ */
async function renderReasoning(el) {
  if (!state.reasoningCache) state.reasoningCache = await api(`/api/sessions/${encCur()}/reasoning`);
  const rs = state.reasoningCache.reasoning;
  if (!rs.length) { el.innerHTML = `<div class="empty-hint">无推理数据</div>`; return; }
  el.innerHTML = `<div class="panel"><h3>推理过程 <span class="hint">${rs.length} 段 · reasoning-chunks 分片合并</span></h3></div>` +
    rs.map((r, i) => {
      const maxDt = Math.max(1, ...r.dt);
      const spark = r.dt.map((d) => `<i style="height:${Math.max(3, d / maxDt * 26)}px" title="${d}ms"></i>`).join("");
      return `<div class="reasoning-item" data-i="${i}">
        <div class="r-head">
          <span class="r-badge">T${r.turn}·S${r.step}</span>
          <span class="r-meta">${fmtNum(r.charCount)} 字符 · ${r.chunks} 分片 · ${fmtDur(r.durationMs)}</span>
          <span class="turn-chevron">▾</span>
        </div>
        <div class="r-body">
          <div class="speed-bar" title="每分片耗时 (ms)">${spark}</div>
          ${highlightReasoning(r.text)}
        </div>
      </div>`;
    }).join("");
  el.querySelectorAll(".reasoning-item .r-head").forEach((h) =>
    h.addEventListener("click", () => h.closest(".reasoning-item").classList.toggle("open")));
}

function highlightReasoning(text) {
  const marks = ["Let me check", "I need to", "Actually", "Hmm", "Wait", "Let me think", "This is", "I should", "首先", "让我", "我需要", "不过", "其实", "等一下"];
  let out = esc(text);
  marks.forEach((m) => {
    const re = new RegExp(escRegExp(m), "gi");
    out = out.replace(re, (match) => `<mark>${match}</mark>`);
  });
  return out;
}
const escRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* ============================================================
   Todos
   ============================================================ */
async function renderTodos(el) {
  if (!state.todosCache) state.todosCache = await api(`/api/sessions/${encCur()}/todos`);
  const todos = state.todosCache.todos;
  if (!todos.length) { el.innerHTML = `<div class="empty-hint">无任务清单数据</div>`; return; }
  el.innerHTML = todos.map((t, i) => {
    const items = t.todos.map((td) => {
      const ch = t.changes.find((c) => c.content === td.content);
      const change = ch ? `<span class="todo-change">${statusLabel(ch.from)} → ${statusLabel(ch.to)}</span>` : "";
      return `<li><span class="todo-status ${esc(td.status)}">${statusLabel(td.status)}</span>
        <span>${esc(td.content)}</span>${change}</li>`;
    }).join("");
    return `<div class="todo-snapshot">
      <div class="ts-head"><span class="tag-pill" style="background:#E8EAF6;color:#283593">快照 #${i + 1}</span>
      <span>${fmtTime(t.time)}</span>${t.changes.length ? `<span class="tag-pill" style="background:#FFEBEE;color:#C62828">${t.changes.length} 处状态变化</span>` : ""}</div>
      <ul class="todo-list">${items}</ul>
    </div>`;
  }).join("");
}

function statusLabel(s) {
  return { pending: "待办", in_progress: "进行中", completed: "已完成" }[s] || s;
}

/* ============================================================
   Approvals
   ============================================================ */
async function renderApprovals(el) {
  if (!state.approvalsCache) state.approvalsCache = await api(`/api/sessions/${encCur()}/approvals`);
  const aps = state.approvalsCache.approvals;
  if (!aps.length) { el.innerHTML = `<div class="empty-hint">无审批数据</div>`; return; }
  el.innerHTML = aps.map((a, i) => {
    const denied = a.outcome === "denied";
    return `<div class="approval-item ${denied ? "denied" : ""}">
      <div class="ap-head">
        <span class="tag-pill" style="background:${denied ? "#FFEBEE" : "#FCE4EC"};color:${denied ? "#C62828" : "#AD1457"}">${esc(a.toolName)}</span>
        <span class="outcome-badge ${esc(a.outcome)}">${esc(outcomeLabel(a.outcome))}</span>
        <span style="margin-left:auto;font-size:11px;color:var(--ink-3)">等待 ${fmtDur(a.waitMs)}</span>
      </div>
      <div class="ap-reason">${esc(a.reason || "")}</div>
      <div class="ap-meta">id: ${esc(a.id)} · 请求 ${fmtTime(a.askTime)} → 决策 ${a.decideTime ? fmtTime(a.decideTime) : "—"}</div>
    </div>`;
  }).join("");
}

function outcomeLabel(o) {
  return { "allowed-once": "允许一次", "allowed-always": "始终允许", "denied": "已拒绝" }[o] || o || "未决策";
}

/* ============================================================
   Tokens
   ============================================================ */
async function renderTokens(el) {
  if (!state.tokensCache) state.tokensCache = await api(`/api/sessions/${encCur()}/tokens`);
  const { tokens, totals } = state.tokensCache;
  if (!tokens.length) { el.innerHTML = `<div class="empty-hint">无 token 统计（无 assistant/message usage）</div>`; return; }
  const maxTotal = Math.max(1, ...tokens.map((t) => t.total));
  const labels = [
    ["inputTokens", "输入", "#2196F3"],
    ["outputTokens", "输出", "#FF9800"],
    ["reasoningTokens", "推理", "#FFC107"],
    ["cacheReadTokens", "缓存读取", "#009688"],
  ];
  const totalRows = labels.map(([k, lab, color]) => {
    const v = totals[k] || 0;
    const maxV = Math.max(1, ...labels.map(([k2]) => totals[k2] || 0));
    return `<div class="token-bar"><span class="tb-label">${lab}</span>
      <div class="tb-track"><div class="tb-fill" style="width:${(v / maxV * 100).toFixed(1)}%;background:${color}"></div></div>
      <span class="tb-val">${fmtNum(v)}</span></div>`;
  }).join("");
  const perMsg = tokens.map((t, i) => {
    const colors = ["#2196F3", "#FF9800", "#FFC107", "#009688"];
    return `<div class="tool-item" style="margin-bottom:4px"><div class="tool-head" style="padding:7px 12px">
      <span class="tool-idx">${i + 1}</span>
      <span class="tool-name" style="color:#1565C0">T${t.turn}·S${t.step}</span>
      <span class="tool-dur">${fmtTime(t.time).slice(11)}</span>
      <div style="flex:1;display:flex;gap:2px;margin:0 8px">
        ${["inputTokens", "outputTokens", "reasoningTokens", "cacheReadTokens"].map((k, j) =>
          `<div style="width:${(t[k] / maxTotal * 100).toFixed(2)}%;min-width:2px;height:14px;background:${colors[j]};border-radius:2px" title="${k}: ${t[k]}"></div>`).join("")}
      </div>
      <span class="tag-pill" style="background:#E3F2FD;color:#1565C0">${fmtNum(t.total)}</span>
    </div></div>`;
  }).join("");
  el.innerHTML = `
  <div class="panel"><h3>Token 总量</h3>${totalRows}
    <div class="stat-grid" style="margin-top:12px">
      ${statCard("输入", fmtNum(totals.inputTokens), "")}
      ${statCard("输出", fmtNum(totals.outputTokens), "")}
      ${statCard("推理", fmtNum(totals.reasoningTokens), "")}
      ${statCard("缓存读取", fmtNum(totals.cacheReadTokens), "")}
    </div>
  </div>
  <div class="panel"><h3>逐条消息 Token 用量 <span class="hint">${tokens.length} 条 assistant/message</span></h3>${perMsg}</div>`;
}

/* ============================================================
   Search (F8)
   ============================================================ */
async function renderSearch(el) {
  const d = state.detail;
  const typeOptions = Object.keys(d.typeCounts).sort();
  const groupOptions = state.meta.groupOrder;
  const s = state.searchState;
  el.innerHTML = `
  <div class="panel"><h3>事件搜索与筛选 <span class="hint">F8：按类型 / 分组 / 全文搜索 / 时间范围</span></h3>
    <div class="search-bar">
      <input type="search" id="f-q" placeholder="全文搜索：推理文本、工具参数、工具结果…" value="${esc(s.q)}">
      <select id="f-type"><option value="">全部类型</option>${typeOptions.map((t) => `<option ${s.type === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>
      <select id="f-group"><option value="">全部分组</option>${groupOptions.map((k) => `<option value="${k}" ${s.group === k ? "selected" : ""}>${esc(state.meta.groups[k].label)}</option>`).join("")}</select>
      <input type="number" id="f-from" placeholder="起始(ms)" value="${s.from || ""}">
      <input type="number" id="f-to" placeholder="结束(ms)" value="${s.to || ""}">
      <button class="btn primary" id="f-go">搜索</button>
    </div>
  </div>
  <div id="search-results">${s.events.length ? searchResultsHtml(s.events, s.total) : `<div class="empty-hint">输入关键词后点击「搜索」</div>`}</div>`;

  $("#f-go").addEventListener("click", async () => {
    s.q = $("#f-q").value.trim();
    s.type = $("#f-type").value;
    s.group = $("#f-group").value;
    s.from = $("#f-from").value;
    s.to = $("#f-to").value;
    s.offset = 0;
    await runSearch();
  });
  // enter key triggers search
  $("#f-q").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#f-go").click(); });
}

function searchResultsHtml(events, total) {
  const rows = events.map((ev) => {
    const grp = groupCss(ev.group);
    return `<div class="search-result" data-line="${ev.line}" data-seq="${ev.seq ?? ""}">
      <div class="sr-head">
        <span class="ev-seq" style="font-family:var(--mono);font-size:10.5px;color:var(--ink-3)">#${ev.seq ?? ev.line}</span>
        <span class="group-chip" style="background:${grp.bg};color:${grp.fg};border-color:${grp.border}">${esc(ev.type)}</span>
        <span style="margin-left:auto;font-size:10.5px;color:var(--ink-3);font-family:var(--mono)">${fmtTime(ev.time).slice(11)}</span>
      </div>
      <div class="sr-summary">${highlightQ(esc(ev.summary), state.searchState.q)}</div>
    </div>`;
  }).join("");
  return `<div class="panel"><h3>搜索结果 <span class="hint">${fmtNum(total)} 条匹配</span></h3>${rows || `<div class="empty-hint">无匹配</div>`}
    <div class="raw-nav">${state.searchState.offset > 0 ? `<button class="btn small" id="search-prev">← 上一页</button>` : ""}
      <span>${state.searchState.offset + 1} - ${Math.min(state.searchState.offset + 200, total)} / ${total}</span>
      ${state.searchState.offset + 200 < total ? `<button class="btn small" id="search-next">下一页 →</button>` : ""}</div>
  </div>`;
}

function highlightQ(text, q) {
  if (!q) return text;
  return text.replace(new RegExp(escRegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "gi"),
    (m) => `<mark>${m}</mark>`);
}

async function runSearch() {
  const s = state.searchState;
  const params = new URLSearchParams({ limit: "200", offset: String(s.offset) });
  if (s.q) params.set("q", s.q);
  if (s.type) params.set("type", s.type);
  if (s.group) params.set("group", s.group);
  if (s.from) params.set("from", s.from);
  if (s.to) params.set("to", s.to);
  try {
    const data = await api(`/api/sessions/${encCur()}/events?${params}`);
    s.total = data.total;
    s.events = data.events;
    const results = $("#search-results");
    results.innerHTML = searchResultsHtml(s.events, s.total);
    bindSearchResults(results);
  } catch (e) { alert(e.message); }
}

function bindSearchResults(root) {
  root.querySelectorAll(".search-result").forEach((r) =>
    r.addEventListener("click", () => openEvent(r.dataset.line)));
  const prev = root.querySelector("#search-prev");
  const next = root.querySelector("#search-next");
  if (prev) prev.addEventListener("click", async () => { state.searchState.offset = Math.max(0, state.searchState.offset - 200); await runSearch(); });
  if (next) next.addEventListener("click", async () => { state.searchState.offset += 200; await runSearch(); });
}

/* ============================================================
   Raw view (F9)
   ============================================================ */
const RAW_PAGE = 200;

async function renderRaw(el) {
  const s = state.rawState;
  el.innerHTML = `
  <div class="panel"><h3>原始 JSONL 视图 <span class="hint">只读 · 支持按 seq 跳转 · 当前事件高亮</span></h3>
    <div class="raw-toolbar">
      <input type="number" id="raw-seq" placeholder="按 seq 跳转" style="width:140px">
      <button class="btn" id="raw-go">跳转</button>
      <select id="raw-type"><option value="">全部类型</option></select>
      <span style="margin-left:auto;font-size:11.5px;color:var(--ink-3)" id="raw-range"></span>
    </div>
  </div>
  <div id="raw-view" class="raw-view"></div>
  <div class="raw-nav">
    <button class="btn small" id="raw-prev">← 上一页</button>
    <span id="raw-pos"></span>
    <button class="btn small" id="raw-next">下一页 →</button>
  </div>`;

  // populate type filter from detail
  const types = Object.keys(state.detail.typeCounts).sort();
  $("#raw-type").innerHTML = `<option value="">全部类型</option>` + types.map((t) => `<option ${s.type === t ? "selected" : ""}>${esc(t)}</option>`).join("");

  $("#raw-go").addEventListener("click", async () => {
    const seq = parseInt($("#raw-seq").value, 10);
    if (!isNaN(seq)) await rawJump(seq);
  });
  $("#raw-type").addEventListener("change", async () => {
    s.type = $("#raw-type").value;
    await rawLoad(s.from, true);
  });
  $("#raw-prev").addEventListener("click", async () => { await rawLoad(Math.max(0, s.from - RAW_PAGE)); });
  $("#raw-next").addEventListener("click", async () => { await rawLoad(s.from + RAW_PAGE); });

  if (s.seq != null) { await rawJump(s.seq); }
  else if (!s.lines.length) { await rawLoad(0); }
  else { await rawRender(); }
}

async function rawJump(seq) {
  const s = state.rawState;
  try {
    const data = await api(`/api/sessions/${encCur()}/raw?seq=${seq}`);
    s.seq = seq;
    s.from = data.from;
    s.lines = data.lines;
    s.line = data.line;
    await rawRender();
  } catch (e) { alert(e.message); }
}

async function rawLoad(from, keepLine = false) {
  const s = state.rawState;
  const params = new URLSearchParams({ from: String(from), to: String(from + RAW_PAGE) });
  const data = await api(`/api/sessions/${encCur()}/raw?${params}`);
  s.from = data.from;
  s.lines = data.lines;
  s.line = keepLine ? s.line : null;
  await rawRender();
}

async function rawRender() {
  const s = state.rawState;
  // fetch groups for lines to colorize type tags
  let groupMap = {};
  try {
    const params = new URLSearchParams({ fromLine: String(s.from), toLine: String(s.from + s.lines.length - 1), limit: "5000" });
    const evs = await api(`/api/sessions/${encCur()}/events?${params}`);
    evs.events.forEach((e) => { groupMap[e.line] = { type: e.type, group: e.group }; });
  } catch (_) {}

  const rows = s.lines.map((line, i) => {
    const lineNum = s.from + i;
    let tag = "";
    const info = groupMap[lineNum];
    if (info) {
      const grp = groupCss(info.group);
      tag = `<span class="rl-tag" style="background:${grp.bg};color:${grp.fg};border:1px solid ${grp.border}">${esc(info.type)}</span>`;
    }
    const current = s.line === lineNum;
    return `<div class="raw-line ${current ? "current" : ""}" data-line="${lineNum}">
      <span class="rl-num">${lineNum}</span>${tag}<span>${esc(line)}</span></div>`;
  }).join("");
  $("#raw-view").innerHTML = rows;
  $("#raw-range").textContent = `行 ${s.from} – ${s.from + s.lines.length - 1}`;
  $("#raw-pos").textContent = s.seq != null ? `当前高亮 seq #${s.seq}（行 ${s.line}）` : "";
  if (s.line != null) {
    const cur = document.querySelector(`.raw-line[data-line="${s.line}"]`);
    if (cur) cur.scrollIntoView({ block: "center" });
  }
  $("#raw-view").querySelectorAll(".raw-line").forEach((r) =>
    r.addEventListener("click", () => openEvent(r.dataset.line)));
}

/* ============================================================
   Event modal
   ============================================================ */
async function openEvent(line) {
  const seq = document.querySelector(`.event-row[data-line="${line}"]`)?.dataset.seq ||
              document.querySelector(`.search-result[data-line="${line}"]`)?.dataset.seq;
  let ev = null, raw = null;
  if (seq) {
    try {
      const data = await api(`/api/sessions/${encCur()}/events/${seq}`);
      ev = data.event;
      raw = data.raw;
    } catch (_) {}
  }
  if (!ev) {
    try {
      const data = await api(`/api/sessions/${encCur()}/raw?from=${line}&to=${line + 1}`);
      raw = data.lines[0];
    } catch (_) {}
  }
  const grp = ev ? groupCss(ev.group) : groupCss("config");
  $("#modal-title").textContent = ev ? `${ev.type} · #${ev.seq ?? ev.line}` : `行 ${line}`;
  $("#modal-body").innerHTML = `
    ${ev ? `<div style="margin-bottom:10px">${groupChip(ev.group)} <span class="tag-pill" style="background:#ECEFF1;color:#455A64">${fmtTime(ev.time)}</span>
      <span style="margin-left:8px;font-size:12px;color:var(--ink-2)">${esc(ev.summary)}</span></div>` : ""}
    <div class="field-label">原始 JSONL</div>
    <div class="mono-block" style="max-height:60vh">${esc(raw || "(无)")}</div>
    ${ev ? `<div style="margin-top:10px;text-align:right"><button class="btn small" id="modal-raw">在原始视图打开</button></div>` : ""}`;
  const m = $("#modal");
  m.classList.remove("hidden");
  const btn = $("#modal-raw");
  if (btn) btn.addEventListener("click", () => {
    m.classList.add("hidden");
    state.rawState.seq = ev.seq ?? null;
    if (state.tab !== "raw") { state.tab = "raw"; renderTabs(); }
    switchTab("raw");
  });
}

function closeModal() { $("#modal").classList.add("hidden"); }

/* ============================================================
   Global binding
   ============================================================ */
function bindGlobal() {
  $("#btn-back").addEventListener("click", () => {
    $("#view-detail").classList.add("hidden");
    $("#view-list").classList.remove("hidden");
    state.current = null;
    renderSessionList();
    window.scrollTo(0, 0);
  });
  $("#tabs").addEventListener("click", (e) => {
    const t = e.target.closest(".tab");
    if (t) switchTab(t.dataset.tab);
  });
  $("#modal").addEventListener("click", (e) => {
    if (e.target.closest("[data-close]")) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); }
  });
}

boot();
bindGlobal();
