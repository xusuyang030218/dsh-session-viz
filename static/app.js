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
  charts: [],                    // live ECharts instances (disposed on tab switch)
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

/* ---------------- chart layer (ECharts + progressive fallback) ----------------
   Every chart renders inside a container div; if ECharts is unavailable the
   container keeps its inline CSS/SVG fallback content so nothing breaks. */
function echartsReady() {
  return typeof window.echarts !== "undefined";
}

function initChart(el) {
  if (!echartsReady()) return null;
  const chart = window.echarts.init(el, null, { renderer: "canvas" });
  return chart;
}

// Donut: items = [{name, value, color}]
function renderDonut(el, items, opts = {}) {
  if (!echartsReady() || !items.length) {
    el.innerHTML = donutFallbackHtml(items);
    return null;
  }
  const chart = initChart(el);
  if (!chart) { el.innerHTML = donutFallbackHtml(items); return null; }
  chart.setOption({
    tooltip: { trigger: "item", formatter: (p) =>
      `${p.marker} ${p.name}: ${fmtNum(p.value)} (${p.percent}%)` },
    legend: {
      orient: "vertical", right: 6, top: "middle",
      textStyle: { fontSize: 11, color: "#5a6675" },
      itemWidth: 10, itemHeight: 10,
    },
    series: [{
      type: "pie", radius: ["52%", "76%"], center: ["38%", "50%"],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 6, borderColor: "#fff", borderWidth: 2 },
      label: { show: false },
      emphasis: {
        label: { show: true, fontWeight: 700, fontSize: 13,
                 formatter: "{b}\n{c} ({d}%)", color: "#1c2430" },
        itemStyle: { shadowBlur: 12, shadowColor: "rgba(0,0,0,.25)" },
      },
      data: items.map((it) => ({ name: it.name, value: it.value, itemStyle: { color: it.color } })),
    }],
  });
  return chart;
}

function donutFallbackHtml(items) {
  if (!items.length) return `<div class="empty-hint">无数据</div>`;
  const total = items.reduce((s, it) => s + it.value, 0) || 1;
  return `<div class="donut-fallback">` +
    items.map((it) => {
      const pct = (it.value / total * 100).toFixed(1);
      return `<div class="df-row"><span class="df-dot" style="background:${it.color}"></span>
        <span class="df-name">${esc(it.name)}</span>
        <div class="df-track"><div class="df-fill" style="width:${pct}%;background:${it.color}"></div></div>
        <span class="df-val">${fmtNum(it.value)} · ${pct}%</span></div>`;
    }).join("") + `</div>`;
}

// Horizontal bar: rows = [{name, value, color, label?}]
function renderHBar(el, rows, opts = {}) {
  if (!echartsReady() || !rows.length) {
    el.innerHTML = hbarFallbackHtml(rows);
    return null;
  }
  const chart = initChart(el);
  if (!chart) { el.innerHTML = hbarFallbackHtml(rows); return null; }
  const clickHandler = opts.onClick;
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  chart.setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "shadow" },
      formatter: (ps) => {
        const p = ps[0];
        return `${p.marker} ${p.name}: <b>${fmtNum(p.value)}</b>${p.data.label ? " · " + esc(p.data.label) : ""}`;
      } },
    grid: { left: 8, right: 46, top: 6, bottom: 6, containLabel: true },
    xAxis: { type: "value", axisLabel: { fontSize: 10, color: "#8b95a3" }, splitLine: { lineStyle: { color: "#eef0f3" } } },
    yAxis: { type: "category", inverse: true,
      data: sorted.map((r) => r.name),
      axisLabel: { fontSize: 11, color: "#5a6675" },
      axisTick: { show: false }, axisLine: { show: false } },
    series: [{
      type: "bar", barWidth: 16,
      data: sorted.map((r) => ({ value: r.value, label: r.label || "",
        itemStyle: { color: r.color, borderRadius: [0, 5, 5, 0] } })),
      label: { show: true, position: "right", fontSize: 10.5, color: "#8b95a3",
               formatter: (p) => fmtNum(p.value) },
      itemStyle: { shadowBlur: 4, shadowColor: "rgba(16,24,40,.08)" },
      cursor: clickHandler ? "pointer" : "default",
    }],
  });
  if (clickHandler) {
    chart.on("click", (p) => clickHandler(sorted[p.dataIndex]));
  }
  return chart;
}

function hbarFallbackHtml(rows) {
  if (!rows.length) return `<div class="empty-hint">无数据</div>`;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return `<div class="hbar-fallback">` + rows.map((r) =>
    `<div class="bar-row"><div class="bar-label" title="${esc(r.name)}">${esc(r.name)}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${(r.value / max * 100).toFixed(1)}%;background:${r.color}"></div></div>
      <div class="bar-count">${fmtNum(r.value)}</div></div>`).join("") + `</div>`;
}

// Stacked area / area chart: series = [{name, color, data:[]}], xLabels = []
function renderStackedArea(el, xLabels, series, opts = {}) {
  if (!echartsReady() || !xLabels.length) {
    el.innerHTML = `<div class="empty-hint">图表库未加载，无法绘制面积图</div>`;
    return null;
  }
  const chart = initChart(el);
  if (!chart) { el.innerHTML = `<div class="empty-hint">图表库未加载，无法绘制面积图</div>`; return null; }
  chart.setOption({
    tooltip: { trigger: "axis", axisPointer: { type: "line" },
      formatter: (ps) => {
        const head = ps[0];
        let html = `${head.axisValue}<br>`;
        ps.forEach((p) => { html += `${p.marker} ${p.seriesName}: <b>${fmtNum(p.value)}</b><br>`; });
        return html;
      } },
    legend: { bottom: 0, textStyle: { fontSize: 11, color: "#5a6675" }, itemWidth: 12, itemHeight: 8 },
    grid: { left: 10, right: 14, top: 10, bottom: 34, containLabel: true },
    xAxis: { type: "category", boundaryGap: false,
      data: xLabels, axisLabel: { fontSize: 10, color: "#8b95a3" },
      axisLine: { lineStyle: { color: "#d3d8e0" } } },
    yAxis: { type: "value", axisLabel: { fontSize: 10, color: "#8b95a3" },
      splitLine: { lineStyle: { color: "#eef0f3" } } },
    dataZoom: xLabels.length > 60 ? [
      { type: "inside", start: 0, end: 100 },
      { type: "slider", height: 16, bottom: 12, borderColor: "#e4e7ec" },
    ] : [],
    series: series.map((s) => ({
      name: s.name, type: "line", stack: opts.stack ? "total" : undefined,
      smooth: 0.35, symbol: "none", emphasis: { focus: "series" },
      lineStyle: { width: 1.6, color: s.color },
      areaStyle: { opacity: s.opacity ?? 0.22, color: s.color },
      data: s.data,
    })),
  });
  return chart;
}

// Plain bar chart (vertical) for KPI mini charts if ever needed
function renderMiniBars(el, items) { /* unused placeholder */ }

function disposeChart(chart) {
  if (chart) try { chart.dispose(); } catch (_) {}
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
  // deep link: #/<dirEncoded>/<id>/<tab>
  const m = location.hash.match(/^#\/([^/]+)\/([^/]+)(?:\/([a-z]+))?/);
  if (m) {
    const s = state.sessions.find((x) => x.dirEncoded === decodeURIComponent(m[1]) && x.id === decodeURIComponent(m[2]));
    if (s) await openSession(s.dirEncoded, s.id, m[3]);
  }
}

function setDeepLink(tab) {
  if (state.current) {
    const h = `#/${encodeURIComponent(state.current.dirEncoded)}/${encodeURIComponent(state.current.id)}/${tab || state.tab}`;
    if (location.hash !== h) history.replaceState(null, "", h);
  }
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
async function openSession(dirEncoded, id, tab) {
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
    const firstTab = tab && TABS.some((t) => t.id === tab) ? tab : "overview";
    await switchTab(firstTab);
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
  // dispose charts of the previous view before re-rendering
  (state.charts || []).forEach((c) => disposeChart(c));
  state.charts = [];
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
    setDeepLink(tab);
  } catch (e) {
    el.innerHTML = `<div class="empty-hint">加载失败：${esc(e.message)}</div>`;
  }
}

/* ============================================================
   Overview — KPI cards + ECharts donut + horizontal bar
   ============================================================ */
async function renderOverview(el) {
  const d = state.detail;

  // 4 big KPI cards
  const kpis = [
    { label: "总事件", value: fmtNum(d.eventCount), sub: `${fmtNum(d.lineCount)} 行 JSONL · ${fmtBytes(d.sizeBytes)}`, icon: "▦" },
    { label: "对话轮次", value: fmtNum(d.turnCount), sub: `${fmtNum(d.stepTotal ?? d.turnCount)} 步执行`, icon: "↻" },
    { label: "工具调用", value: fmtNum(d.toolCount), sub: `${fmtNum(d.toolErrorCount)} 个失败`, icon: "⚙" },
    { label: "执行耗时", value: fmtDur(d.durationMs), sub: "从首个事件到末个事件", icon: "◷" },
  ];

  // donut: event type distribution (colors from 14-group scheme)
  const typeItems = Object.entries(d.typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([t, c]) => ({ name: t, value: c, color: groupCss(groupOf(t)).fg }));

  // hbar: group counts, click -> jump to search tab filtered by group
  const g = d.groupCounts || {};
  const groupRows = state.meta.groupOrder
    .map((k) => ({ name: state.meta.groups[k].label, value: g[k] || 0, color: groupCss(k).fg, key: k }))
    .filter((r) => r.value > 0);

  const tokens = d.tokenTotals || {};
  el.innerHTML = `
  <div class="kpi-grid">
    ${kpis.map((k) => kpiCard(k)).join("")}
  </div>
  <div class="chart-duo">
    <div class="panel chart-panel">
      <h3>事件类型分布 <span class="hint">环形图 · 前 12 类，按 14 组配色着色</span></h3>
      <div class="chart-box" id="ov-donut" style="height:300px"></div>
    </div>
    <div class="panel chart-panel">
      <h3>分组统计 <span class="hint">点击条块可跳转搜索并筛选该分组</span></h3>
      <div class="chart-box" id="ov-hbar" style="height:300px"></div>
    </div>
  </div>
  <div class="panel">
    <h3>Token 用量 <span class="hint">总览</span></h3>
    <div class="token-kpi-row">
      ${[["输入", tokens.inputTokens, "#2196F3"], ["输出", tokens.outputTokens, "#FF9800"],
         ["推理", tokens.reasoningTokens, "#FFC107"], ["缓存读取", tokens.cacheReadTokens, "#009688"]]
        .map(([lab, v, col]) => `<div class="token-kpi"><span class="tk-dot" style="background:${col}"></span>
          <span class="tk-label">${lab}</span><span class="tk-val">${fmtNum(v)}</span></div>`).join("")}
    </div>
  </div>
  <div class="panel">
    <details class="meta-fold">
      <summary>会话元信息</summary>
      <table class="kv-table">
        <tr><td>会话 ID</td><td>${esc(d.id)}</td></tr>
        <tr><td>工作目录</td><td>${esc(d.cwd)}</td></tr>
        <tr><td>标题</td><td>${esc(d.title || "—")}</td></tr>
        <tr><td>创建时间</td><td>${fmtTime(d.createdAt)}</td></tr>
        <tr><td>agentPreset</td><td>${esc(d.agentPreset || "—")}</td></tr>
        <tr><td>delegationDepth</td><td>${esc(d.delegationDepth)}</td></tr>
        <tr><td>文件</td><td>${esc(d.filePath)}</td></tr>
        <tr><td>推理片段</td><td>${fmtNum(d.reasoningCount)} 段（reasoning-chunks 合并）</td></tr>
        <tr><td>审批请求</td><td>${fmtNum(d.approvalCount)}（${fmtNum(d.approvalDeniedCount)} 个被拒绝）</td></tr>
        <tr><td>任务清单快照</td><td>${fmtNum(d.todoCount)}（todo/write）</td></tr>
      </table>
    </details>
  </div>`;

  const donutEl = $("#ov-donut");
  const c1 = renderDonut(donutEl, typeItems);
  if (c1) state.charts.push(c1);

  const hbarEl = $("#ov-hbar");
  const c2 = renderHBar(hbarEl, groupRows, {
    onClick: (row) => {
      state.searchState.group = row.key;
      if (state.tab !== "search") { state.tab = "search"; renderTabs(); }
      switchTab("search");
    },
  });
  if (c2) state.charts.push(c2);
}

function kpiCard(k) {
  return `<div class="kpi-card">
    <div class="kpi-icon">${k.icon}</div>
    <div class="kpi-body">
      <div class="kpi-label">${esc(k.label)}</div>
      <div class="kpi-value">${k.value}</div>
      <div class="kpi-sub">${esc(k.sub)}</div>
    </div>
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

function encCur() {
  return `${encodeURIComponent(state.current.dirEncoded)}/${encodeURIComponent(state.current.id)}`;
}

/* ============================================================
   Timeline — SVG tree (Turn -> Step -> merged event groups)
   ============================================================ */
const TREE_COL_W = 190;   // horizontal distance between levels
const TREE_ROW_H = 44;    // vertical slot per leaf
const TREE_X0 = 46;

async function renderTimeline(el) {
  if (!state.timeline) state.timeline = await api(`/api/sessions/${encCur()}/timeline`);
  const turns = state.timeline.turns;
  if (!turns.length) { el.innerHTML = `<div class="empty-hint">无时间线数据</div>`; return; }
  state.timelineState = { loadedSteps: {} };   // stepKey -> {events}
  // build the node tree once; open/loaded state persists across re-renders
  state.timelineRoot = { kind: "root", open: true, children: turns.map((t) => buildTurnNode(t)) };
  if (state.timelineRoot.children[0]) state.timelineRoot.children[0].open = true; // first turn expanded by default
  el.innerHTML = `
  <div class="panel" style="margin-bottom:14px">
    <h3>执行树 <span class="hint">Turn → Step → 合并事件组 · 点击节点展开/折叠 · 悬停高亮路径</span></h3>
    <div class="tree-wrap" id="tree-wrap"></div>
  </div>
  <p class="sub">事件组由步骤内事件按类型合并生成，首次展开时按需加载。</p>`;
  renderTimelineTree(el);
}

function treeNodeHtml(node, depth) {
  const x = TREE_X0 + depth * TREE_COL_W;
  const y = node.y;
  const color = node.color;
  const isTurn = node.kind === "turn";
  const isStep = node.kind === "step";
  const r = isTurn ? 24 : (isStep ? 15 : 9);
  const hasKids = (node.open && node.children && node.children.length) ? 1 : 0;
  const cls = ["tree-node", node.kind, node.open ? "open" : "", node.highlight ? "hl" : ""].join(" ");
  return `<g class="${cls}" transform="translate(${x},${y})" data-key="${esc(node.key)}" data-kind="${node.kind}"
    ${node.line != null ? `data-line="${node.line}"` : ""} data-seq="${node.seq ?? ""}" data-from="${node.from ?? ""}" data-to="${node.to ?? ""}">
    <title>${esc(node.tip)}</title>
    <circle class="tree-circle" r="${r}" fill="${color}" data-expand="${hasKids}"></circle>
    <text class="tree-label" x="${r + 8}" y="4">${esc(node.label)}</text>
    ${node.sub ? `<text class="tree-sub" x="${r + 8}" y="17">${esc(node.sub)}</text>` : ""}
  </g>`;
}

function treeLinkPath(parent, child) {
  const x1 = TREE_X0 + parent.depth * TREE_COL_W + (parent.kind === "turn" ? 24 : parent.kind === "step" ? 15 : 9);
  const y1 = parent.y;
  const x2 = TREE_X0 + child.depth * TREE_COL_W - (child.kind === "turn" ? 24 : child.kind === "step" ? 15 : 9);
  const y2 = child.y;
  const dx = Math.max(16, (x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

function renderTimelineTree(el) {
  const root = state.timelineRoot;
  layoutTree(root, 0);
  let maxX = TREE_X0, maxY = 0;
  const paths = [];
  const nodes = [];
  walkTree(root, (n, depth, parent) => {
    if (n.kind === "root") return;
    n.depth = depth;
    if (parent && parent.kind !== "root") {
      const hl = n.highlight && parent.highlight;
      paths.push({ d: treeLinkPath(parent, n), hl });
    }
    nodes.push(n);
    maxX = Math.max(maxX, TREE_X0 + depth * TREE_COL_W + 170);
    maxY = Math.max(maxY, n.y + 40);
  });
  const svg = `<svg class="tree-svg" viewBox="0 0 ${maxX + 60} ${maxY + 24}"
    xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet">
    ${paths.map((p) => `<path class="tree-link ${p.hl ? "hl" : ""}" d="${p.d}"></path>`).join("")}
    ${nodes.map((n) => treeNodeHtml(n, n.depth)).join("")}
  </svg>`;
  const wrap = el.querySelector("#tree-wrap");
  wrap.innerHTML = svg;
  bindTreeEvents(wrap);
}

function buildTurnNode(t) {
  const err = t.errors ? ` · ${t.errors} 错误` : "";
  const node = {
    kind: "turn", key: `turn-${t.turn}`, color: "#2196F3",
    label: `Turn ${t.turn}`,
    sub: `${fmtNum(t.stepCount)} 步 · ${fmtNum(t.toolCalls)} 工具 · ${fmtDur(t.durationMs)}${err}`,
    tip: `Turn ${t.turn}：${t.stepCount} 步，${fmtDur(t.durationMs)}，${t.toolCalls} 次工具调用${err}`,
    open: false, highlight: false,
    children: t.steps.map((st) => buildStepNode(st)),
    data: t,
  };
  return node;
}

function buildStepNode(st) {
  const tools = (st.tools || []).map((x) => x.name).slice(0, 2).join(", ");
  const subParts = [`${st.eventCount} 事件`];
  if (st.reasoningChars) subParts.push(`推理 ${fmtNum(st.reasoningChars)}`);
  if (st.textChars) subParts.push(`文本 ${fmtNum(st.textChars)}`);
  subParts.push(fmtDur(st.durationMs));
  const node = {
    kind: "step", key: `step-${st.turn}-${st.step}`, color: "#00BCD4",
    label: `Step ${st.step}${tools ? ` · ${tools}` : ""}`,
    sub: subParts.join(" · "),
    tip: `Step ${st.step}：${st.eventCount} 事件，${fmtDur(st.durationMs)}${tools ? `，工具 ${tools}` : ""}`,
    open: false, highlight: false,
    from: st.startLine, to: st.endLine,
    children: null,     // built lazily from loaded events
    data: st,
  };
  return node;
}

// merge step events into typed groups (14-group colors)
function buildGroupNodes(st, events) {
  const byType = new Map();
  events.forEach((ev) => {
    if (!byType.has(ev.type)) byType.set(ev.type, { type: ev.type, count: 0, evs: [] });
    const b = byType.get(ev.type);
    b.count += 1;
    if (b.evs.length < 3) b.evs.push(ev);
  });
  return Array.from(byType.values()).map((b) => {
    const grp = groupCss(groupOf(b.type));
    const first = b.evs[0] || {};
    return {
      kind: "group", key: `grp-${st.turn}-${st.step}-${b.type}`, color: grp.fg,
      label: b.type,
      sub: `${fmtNum(b.count)} 条`,
      tip: `${b.type}：${b.count} 条${first.summary ? " · " + first.summary : ""}`,
      open: false, highlight: false,
      line: first.line, seq: first.seq,
      events: b.evs,
      data: { type: b.type, count: b.count, step: st },
    };
  });
}

// layout: post-order assign leaf slots, parent centered over children.
// Collapsed nodes contribute a single slot and their children are skipped.
function layoutTree(node, depth) {
  node.depth = depth;
  const kids = node.open && node.children && node.children.length ? node.children : [];
  if (!kids.length) {
    node.y = (node._slot = 1) * TREE_ROW_H;
    return;
  }
  let total = 0;
  kids.forEach((c) => { layoutTree(c, depth + 1); total += c._slot; });
  node._slot = total;
  const first = kids[0], last = kids[kids.length - 1];
  node.y = (first.y + last.y) / 2;
}

// walk only expanded branches so collapsed subtrees stay out of the DOM
function walkTree(node, fn, depth = 0, parent = null) {
  fn(node, depth, parent);
  if (node.open && node.children) node.children.forEach((c) => walkTree(c, fn, depth + 1, node));
}

function findTreeNodeByKey(node, key) {
  if (node.key === key) return node;
  if (!node.open || !node.children) return null;
  for (const c of node.children) {
    const hit = findTreeNodeByKey(c, key);
    if (hit) return hit;
  }
  return null;
}

function bindTreeEvents(wrap) {
  // hover: highlight path to root
  wrap.querySelectorAll(".tree-node").forEach((g) => {
    g.addEventListener("mouseenter", () => {
      clearTreeHighlight(wrap);
      setTreeHighlight(wrap, g.dataset.key, true);
    });
    g.addEventListener("mouseleave", () => clearTreeHighlight(wrap));
  });
  // click: expand / collapse
  wrap.querySelectorAll(".tree-node").forEach((g) => {
    g.addEventListener("click", async (e) => {
      const kind = g.dataset.kind;
      if (kind === "turn" || kind === "step") {
        await toggleTreeBranch(wrap, g);
      } else if (kind === "group") {
        const seq = g.dataset.seq;
        const line = g.dataset.line;
        if (line != null) openEvent(line, seq);
      }
    });
  });
}

async function toggleTreeBranch(wrap, g) {
  const key = g.dataset.key;
  const kind = g.dataset.kind;
  const node = findTreeNodeByKey(state.timelineRoot, key);
  if (!node) return;
  // step: lazily load events -> build groups
  if (kind === "step" && !node.children) {
    const st = node.data;
    const stKey = `t${st.turn}s${st.step}`;
    let evs = state.timelineState.loadedSteps[stKey];
    if (!evs) {
      const data = await api(`/api/sessions/${encCur()}/events?fromLine=${node.from}&toLine=${node.to}&limit=5000`);
      evs = data.events;
      state.timelineState.loadedSteps[stKey] = evs;
    }
    node.children = buildGroupNodes(st, evs);
  }
  node.open = !node.open;
  // prune children of collapsed nodes: keep tree shallow for big sessions
  if (!node.open) node.children && node.children.forEach((c) => { c.open = false; });
  renderTimelineTree(wrap.closest("#tab-content"));
}

function setTreeHighlight(wrap, key, on) {
  // walk from the node up to root via key prefixes
  const node = wrap.querySelector(`.tree-node[data-key="${key}"]`);
  if (!node) return;
  node.classList.add("hl");
  const parts = key.split("-");
  if (parts[0] === "turn") return;
  if (parts[0] === "step") {
    const tk = wrap.querySelector(`.tree-node[data-key="turn-${parts[1]}"]`);
    if (tk) tk.classList.add("hl");
  } else if (parts[0] === "grp") {
    const sk = wrap.querySelector(`.tree-node[data-key="step-${parts[1]}-${parts[2]}"]`);
    if (sk) { sk.classList.add("hl"); }
    const tk = wrap.querySelector(`.tree-node[data-key="turn-${parts[1]}"]`);
    if (tk) tk.classList.add("hl");
  }
}

function clearTreeHighlight(wrap) {
  wrap.querySelectorAll(".tree-node.hl").forEach((n) => n.classList.remove("hl"));
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
   Tools flow — SVG network diagram
   ============================================================ */
const TOOL_COLORS = {
  read: "#2196F3", write: "#FF9800", edit: "#FF9800", glob: "#4CAF50",
  grep: "#00BCD4", rg: "#00BCD4", pwsh: "#673AB7", powershell: "#673AB7",
  bash: "#673AB7", command: "#673AB7", ls: "#4CAF50", cat: "#2196F3",
  web_search: "#7c3aed", fetch: "#7c3aed", http: "#7c3aed",
  python: "#0288D1", node: "#0288D1", npm: "#C62828", pnpm: "#C62828",
  git: "#E64A19", pip: "#0097A7", playwright: "#455A64", browser: "#455A64",
  mcp: "#303F9F", tool: "#607D8B",
};
function toolColor(name) {
  const n = (name || "").toLowerCase();
  for (const k of Object.keys(TOOL_COLORS)) {
    if (n === k || n.includes(k)) return TOOL_COLORS[k];
  }
  return "#607D8B";
}

async function renderTools(el) {
  if (!state.toolsCache) state.toolsCache = await api(`/api/sessions/${encCur()}/tools`);
  const tools = state.toolsCache.tools;
  if (!tools.length) { el.innerHTML = `<div class="empty-hint">无工具调用</div>`; return; }
  const failed = tools.filter((t) => t.status === "error").length;

  el.innerHTML = `
  <div class="panel" style="margin-bottom:14px">
    <h3>工具调用流程图 <span class="hint">${tools.length} 次调用，${failed} 次失败 · 节点大小按耗时比例 · 点击节点查看详情</span></h3>
    <div class="tree-wrap" id="tools-svg-wrap"></div>
  </div>
  <div class="panel">
    <h3>调用明细 <span class="hint">点击行可展开参数/结果</span></h3>
    <div id="tools-list"></div>
  </div>`;
  renderToolsSvg(el, tools);
  renderToolsList(el, tools);
}

function renderToolsSvg(el, tools) {
  // arrange into lanes: a tool goes to the first lane whose last call has finished
  const ordered = [...tools].sort((a, b) => (a.callTime ?? 0) - (b.callTime ?? 0));
  const lanes = [];       // lane -> { endTime, tools: [] }
  ordered.forEach((t) => {
    const start = t.callTime ?? 0;
    let lane = lanes.find((l) => l.endTime == null || start >= l.endTime);
    if (!lane) { lane = { endTime: null, tools: [] }; lanes.push(lane); }
    lane.tools.push(t);
    const end = t.resultTime ?? start;
    lane.endTime = end;
  });

  const COL_W = 168, ROW_H = 96, NODE_W = 148;
  const maxLen = Math.max(...lanes.map((l) => l.tools.length));
  const width = Math.max(320, maxLen * COL_W + 60);
  const height = Math.max(120, lanes.length * ROW_H + 40);
  // node height scales with duration
  const maxDur = Math.max(1, ...tools.map((t) => t.durationMs || 0));

  const nodes = [];
  const edges = [];
  const byCall = new Map(ordered.map((t) => [t.callId, t]));
  lanes.forEach((lane, li) => {
    lane.tools.forEach((t, ci) => {
      const x = 30 + ci * COL_W;
      const y = 24 + li * ROW_H;
      const h = Math.round(38 + (t.durationMs || 0) / maxDur * 26);
      const color = toolColor(t.name);
      nodes.push({ t, x, y, w: NODE_W, h, color, lane: li, col: ci });
      if (ci > 0) {
        edges.push({ from: { x: x - COL_W + NODE_W, y: y + h / 2 }, to: { x, y: y + h / 2 }, lane: li });
      }
    });
  });
  // cross-lane edges: from last tool of upper lane to first of lower lane when timeline overlaps
  for (let li = 1; li < lanes.length; li++) {
    const prev = lanes[li - 1].tools[lanes[li - 1].tools.length - 1];
    const cur = lanes[li].tools[0];
    if (prev && cur && (cur.callTime ?? 0) >= (prev.callTime ?? 0)) {
      const pn = nodes.find((n) => n.t.callId === prev.callId);
      const cn = nodes.find((n) => n.t.callId === cur.callId);
      if (pn && cn) {
        edges.push({ from: { x: pn.x + pn.w, y: pn.y + pn.h / 2 }, to: { x: cn.x, y: cn.y + cn.h / 2 }, lane: -1 });
      }
    }
  }

  const svg = `<svg class="tree-svg" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet">
    <defs>
      <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="#94a3b8"></path>
      </marker>
    </defs>
    ${edges.map((e) => {
      const dx = Math.max(12, (e.to.x - e.from.x) / 2);
      const d = `M ${e.from.x} ${e.from.y} C ${e.from.x + dx} ${e.from.y}, ${e.to.x - dx} ${e.to.y}, ${e.to.x} ${e.to.y}`;
      return `<path class="tool-link" d="${d}" marker-end="url(#arrowhead)"></path>`;
    }).join("")}
    ${nodes.map((n) => {
      const status = n.t.status;
      const stColor = status === "error" ? "#D32F2F" : status === "ok" ? "#2E7D32" : "#8b95a3";
      const argSum = toolArgSummary(n.t.arguments);
      return `<g class="tool-node" transform="translate(${n.x},${n.y})" data-line="${n.t.callLine}" data-seq="${n.t.callSeq ?? ""}">
        <title>${esc(n.t.name)}${n.t.durationMs != null ? " · " + fmtDur(n.t.durationMs) : ""}${argSum ? "\n" + esc(argSum) : ""}${n.t.resultPreview ? "\n结果: " + esc(n.t.resultPreview.slice(0, 80)) : ""}</title>
        <rect class="tool-rect" width="${n.w}" height="${n.h}" rx="9" fill="${n.color}" stroke="${stColor}" stroke-width="1.6"></rect>
        <circle cx="${n.w - 12}" cy="${n.h / 2}" r="5" fill="${stColor}" stroke="#fff" stroke-width="1.4"></circle>
        <text class="tool-node-name" x="12" y="16">${esc(n.t.name)}</text>
        <text class="tool-node-sub" x="12" y="${n.h - 12}">${esc(argSum || (n.t.durationMs != null ? fmtDur(n.t.durationMs) : "—"))}</text>
      </g>`;
    }).join("")}
  </svg>`;
  const wrap = el.querySelector("#tools-svg-wrap");
  wrap.innerHTML = svg;
  wrap.querySelectorAll(".tool-node").forEach((g) => {
    g.addEventListener("click", () => openEvent(g.dataset.line, g.dataset.seq));
  });
}

function toolArgSummary(args) {
  if (!args) return "";
  try {
    const o = JSON.parse(args);
    const keys = Object.keys(o);
    if (!keys.length) return "";
    const k = keys[0];
    let v = o[k];
    if (typeof v === "object") v = JSON.stringify(v);
    return `${k}: ${String(v).slice(0, 24)}`;
  } catch (_) {
    return String(args).slice(0, 24);
  }
}

function renderToolsList(el, tools) {
  const listEl = el.querySelector("#tools-list");
  listEl.innerHTML = tools.map((t, i) => {
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
  listEl.querySelectorAll(".tool-item .tool-head").forEach((h) =>
    h.addEventListener("click", () => h.closest(".tool-item").classList.toggle("open")));
}

/* ============================================================
   Reasoning — ECharts area chart + collapsible text
   ============================================================ */
async function renderReasoning(el) {
  if (!state.reasoningCache) state.reasoningCache = await api(`/api/sessions/${encCur()}/reasoning`);
  const rs = state.reasoningCache.reasoning;
  if (!rs.length) { el.innerHTML = `<div class="empty-hint">无推理数据</div>`; return; }

  // per-slice speed (chars/sec) for area fill gradient
  const speedData = [];
  rs.forEach((r) => {
    const dts = r.dt && r.dt.length ? r.dt : [r.durationMs || 1];
    const totalT = dts.reduce((s, d) => s + d, 0) || 1;
    const n = r.text ? r.text.length : 0;
    speedData.push({ label: `T${r.turn}·S${r.step}`, cps: n / (totalT / 1000) });
  });
  const maxCps = Math.max(1, ...speedData.map((s) => s.cps));

  el.innerHTML = `
  <div class="panel" style="margin-bottom:14px">
    <h3>推理节奏 <span class="hint">每段推理的字符/秒（颜色深浅=推理速度）</span></h3>
    <div class="chart-box" id="rs-area" style="height:220px"></div>
  </div>
  <div class="panel"><h3>推理文本 <span class="hint">${rs.length} 段 · reasoning-chunks 分片合并 · 点击展开</span></h3>
    <div id="rs-list"></div>
  </div>`;

  // area chart: chars per second per reasoning segment, gradient by speed
  const areaEl = $("#rs-area");
  if (echartsReady()) {
    const chart = initChart(areaEl);
    if (chart) {
      state.charts.push(chart);
      const points = speedData.map((s, i) => [i, Math.round(s.cps)]);
      chart.setOption({
        tooltip: { trigger: "axis",
          formatter: (ps) => {
            const p = ps[0];
            const r = rs[p.dataIndex];
            return `${p.name}<br>推理速度: <b>${fmtNum(p.value)}</b> 字符/秒<br>${fmtNum(r.charCount)} 字符 · ${r.chunks} 分片 · ${fmtDur(r.durationMs)}`;
          } },
        grid: { left: 12, right: 16, top: 16, bottom: 28, containLabel: true },
        xAxis: { type: "category", data: speedData.map((s) => s.label),
          axisLabel: { fontSize: 10, color: "#8b95a3", interval: Math.max(0, Math.floor(rs.length / 24) - 1) },
          axisLine: { lineStyle: { color: "#d3d8e0" } } },
        yAxis: { type: "value", name: "字符/秒", nameTextStyle: { fontSize: 10, color: "#8b95a3" },
          axisLabel: { fontSize: 10, color: "#8b95a3" }, splitLine: { lineStyle: { color: "#eef0f3" } } },
        dataZoom: rs.length > 40 ? [
          { type: "inside", start: 0, end: 100 },
          { type: "slider", height: 16, bottom: 8, borderColor: "#e4e7ec" },
        ] : [],
        series: [{
          type: "line", smooth: 0.4, symbol: "circle", symbolSize: 5,
          lineStyle: { width: 2, color: "#FFC107" },
          itemStyle: { color: "#FFC107", borderColor: "#fff", borderWidth: 1 },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: "rgba(255,193,7,.55)" },
              { offset: 1, color: "rgba(255,193,7,.08)" },
            ]),
          },
          data: points.map(([i, v]) => {
            const r = rs[i];
            // darker color = faster reasoning
            const alpha = 0.35 + (r.charCount ? Math.min(0.6, (r.charCount / 2000)) : 0.2);
            return { value: v, itemStyle: { color: `rgba(255,152,0,${alpha})` } };
          }),
          markPoint: {
            symbol: "pin", symbolSize: 36,
            data: [{ type: "max", name: "峰值" }],
            label: { fontSize: 9 },
          },
        }],
      });
    }
  } else {
    areaEl.innerHTML = `<div class="hbar-fallback">` + speedData.map((s, i) => {
      const r = rs[i];
      return `<div class="bar-row"><div class="bar-label">${esc(s.label)}</div>
        <div class="bar-track"><div class="bar-fill" style="width:${(s.cps / maxCps * 100).toFixed(1)}%;background:#FFC107"></div></div>
        <div class="bar-count">${fmtNum(Math.round(s.cps))}/s</div></div>`;
    }).join("") + `</div>`;
  }

  const listEl = el.querySelector("#rs-list");
  listEl.innerHTML = rs.map((r, i) => {
    const maxDt = Math.max(1, ...(r.dt || [1]));
    const spark = (r.dt || []).map((d) => `<i style="height:${Math.max(3, d / maxDt * 26)}px" title="${d}ms"></i>`).join("");
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
  listEl.querySelectorAll(".reasoning-item .r-head").forEach((h) =>
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
   Todos — SVG status flow (pending -> in_progress -> completed)
   ============================================================ */
const TODO_COLS = {
  pending:    { x: 130, color: "#8b95a3", label: "待处理" },
  in_progress: { x: 330, color: "#FB8C00", label: "进行中" },
  completed:  { x: 530, color: "#2E7D32", label: "已完成" },
};
const TODO_ROW_H = 44;

async function renderTodos(el) {
  if (!state.todosCache) state.todosCache = await api(`/api/sessions/${encCur()}/todos`);
  const snapshots = state.todosCache.todos;
  if (!snapshots.length) { el.innerHTML = `<div class="empty-hint">无任务清单数据</div>`; return; }

  // aggregate per-task history across snapshots
  const tasks = new Map();   // content -> { content, status, history: [{status,time}] }
  snapshots.forEach((snap) => {
    (snap.todos || []).forEach((td) => {
      if (!tasks.has(td.content)) tasks.set(td.content, { content: td.content, status: td.status, history: [] });
      const t = tasks.get(td.content);
      t.status = td.status;
      if (!t.history.length || t.history[t.history.length - 1].status !== td.status) {
        t.history.push({ status: td.status, time: snap.time });
      }
    });
  });
  const list = Array.from(tasks.values());
  const height = Math.max(140, list.length * TODO_ROW_H + 60);

  // header + nodes
  let parts = [];
  const colKeys = ["pending", "in_progress", "completed"];
  colKeys.forEach((k) => {
    const c = TODO_COLS[k];
    parts.push(`<text x="${c.x}" y="18" text-anchor="middle" font-size="12" font-weight="800" fill="${c.color}">${c.label}</text>`);
  });
  list.forEach((t, i) => {
    const y = 36 + i * TODO_ROW_H;
    const c = TODO_COLS[t.status];
    const label = t.content.length > 18 ? t.content.slice(0, 18) + "…" : t.content;
    // dotted flow line from first seen status to final status
    const first = t.history[0].status;
    if (first !== t.status) {
      const f = TODO_COLS[first];
      parts.push(`<path class="todo-flow" d="M ${f.x + 62} ${y} L ${c.x - 62} ${y}"></path>`);
    }
    parts.push(`<g class="todo-node" transform="translate(0,${y})" data-i="${i}">
      <circle cx="${c.x}" cy="0" r="11" fill="${c.color}" opacity=".18"></circle>
      <circle cx="${c.x}" cy="0" r="7" fill="${c.color}"></circle>
      <text x="${c.x + 20}" y="4" font-size="11" fill="#1c2430">${esc(label)}</text>
      <text x="${c.x + 20}" y="17" font-size="9.5" fill="#8b95a3">${t.history.length > 1 ? t.history.length + " 次状态变化" : statusLabel(t.status)}</text>
    </g>`);
  });

  const svg = `<svg class="tree-svg" viewBox="0 0 700 ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet">
    ${parts.join("")}
  </svg>`;

  el.innerHTML = `
  <div class="panel" style="margin-bottom:14px">
    <h3>任务状态流转 <span class="hint">${list.length} 个任务 · 三列按最终状态分组 · 虚线=发生过状态变化 · 点击节点查看变化历史</span></h3>
    <div class="tree-wrap" id="td-svg-wrap"></div>
  </div>
  <div class="panel"><h3>快照明细 <span class="hint">${snapshots.length} 个 todo/write 快照</span></h3>
    <div id="td-list"></div>
  </div>`;

  const wrap = el.querySelector("#td-svg-wrap");
  wrap.innerHTML = svg;
  wrap.querySelectorAll(".todo-node").forEach((g) => {
    g.addEventListener("click", () => {
      const t = list[Number(g.dataset.i)];
      $("#modal-title").textContent = `任务 · ${t.content.slice(0, 40)}`;
      $("#modal-body").innerHTML = `
        <div style="margin-bottom:10px">${t.history.map((h, i) =>
          `<span class="tag-pill" style="background:#E8EAF6;color:#283593;margin-right:4px">${i + 1}. ${statusLabel(h.status)}</span>`).join("")}
          <span class="tag-pill" style="background:#ECEFF1;color:#455A64">当前：${statusLabel(t.status)}</span></div>
        <div class="field-label">变化历史</div>
        <table class="kv-table">${t.history.map((h, i) =>
          `<tr><td>#${i + 1}</td><td>${statusLabel(h.status)} · ${fmtTime(h.time)}</td></tr>`).join("")}</table>`;
      $("#modal").classList.remove("hidden");
    });
  });

  const listEl = el.querySelector("#td-list");
  listEl.innerHTML = snapshots.map((t, i) => {
    const items = (t.todos || []).map((td) => {
      const ch = (t.changes || []).find((c) => c.content === td.content);
      const change = ch ? `<span class="todo-change">${statusLabel(ch.from)} → ${statusLabel(ch.to)}</span>` : "";
      return `<li><span class="todo-status ${esc(td.status)}">${statusLabel(td.status)}</span>
        <span>${esc(td.content)}</span>${change}</li>`;
    }).join("");
    return `<div class="todo-snapshot">
      <div class="ts-head"><span class="tag-pill" style="background:#E8EAF6;color:#283593">快照 #${i + 1}</span>
      <span>${fmtTime(t.time)}</span>${(t.changes || []).length ? `<span class="tag-pill" style="background:#FFEBEE;color:#C62828">${t.changes.length} 处状态变化</span>` : ""}</div>
      <ul class="todo-list">${items}</ul>
    </div>`;
  }).join("");
}

function statusLabel(s) {
  return { pending: "待办", in_progress: "进行中", completed: "已完成" }[s] || s;
}

/* ============================================================
   Approvals — SVG vertical timeline
   ============================================================ */
async function renderApprovals(el) {
  if (!state.approvalsCache) state.approvalsCache = await api(`/api/sessions/${encCur()}/approvals`);
  const aps = state.approvalsCache.approvals;
  if (!aps.length) { el.innerHTML = `<div class="empty-hint">无审批数据</div>`; return; }

  // node spacing proportional to wait time (min 56px, max 150px)
  const maxWait = Math.max(1, ...aps.map((a) => a.waitMs || 0));
  const gaps = aps.map((a) => Math.round(56 + (a.waitMs || 0) / maxWait * 94));
  const totalH = gaps.reduce((s, g) => s + g, 0) + 60;
  const lineX = 34;

  let parts = [];
  let y = 20;
  aps.forEach((a, i) => {
    const denied = a.outcome === "denied";
    const icon = denied ? "✕" : "✓";
    const color = denied ? "#D32F2F" : "#2E7D32";
    const circleR = 11;
    parts.push(`<g class="ap-node ${denied ? "denied" : ""}" transform="translate(0,${y})" data-i="${i}">
      <circle cx="${lineX}" cy="0" r="${circleR}" fill="${denied ? "#FFEBEE" : "#E8F5E9"}" stroke="${color}" stroke-width="2"></circle>
      <text x="${lineX}" y="4.5" text-anchor="middle" font-size="11" font-weight="800" fill="${color}">${icon}</text>
      <text class="ap-tool" x="${lineX + 22}" y="-2" font-size="12" font-weight="700" fill="#1c2430">${esc(a.toolName)}</text>
      <text class="ap-wait" x="${lineX + 22}" y="12" font-size="10.5" fill="#5a6675">等待 ${fmtDur(a.waitMs)} · ${esc(outcomeLabel(a.outcome))}</text>
      <text class="ap-time" x="${lineX + 22}" y="25" font-size="9.5" fill="#8b95a3">${fmtTime(a.askTime).slice(11)} → ${a.decideTime ? fmtTime(a.decideTime).slice(11) : "—"}</text>
      ${a.reason ? `<text class="ap-reason" x="${lineX + 22}" y="38" font-size="10" fill="#5a6675">${esc(String(a.reason).slice(0, 56))}</text>` : ""}
    </g>`);
    if (i < aps.length - 1) {
      const y2 = y + gaps[i];
      parts.push(`<line class="ap-line" x1="${lineX}" y1="${circleR + 2}" x2="${lineX}" y2="${y2 - circleR - 2}"></line>`);
    }
    y += gaps[i];
  });

  const svg = `<svg class="tree-svg" viewBox="0 0 460 ${totalH}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMinYMin meet">
    ${parts.join("")}
  </svg>`;

  el.innerHTML = `
  <div class="panel" style="margin-bottom:14px">
    <h3>审批时间线 <span class="hint">${aps.length} 次审批 · 节点间距按等待时长比例 · 点击节点查看原因</span></h3>
    <div class="tree-wrap" id="ap-svg-wrap"></div>
  </div>
  <div class="panel">
    <h3>审批明细</h3>
    <div id="ap-list"></div>
  </div>`;

  const wrap = el.querySelector("#ap-svg-wrap");
  wrap.innerHTML = svg;
  wrap.querySelectorAll(".ap-node").forEach((g) => {
    g.addEventListener("click", () => {
      const a = aps[Number(g.dataset.i)];
      const denied = a.outcome === "denied";
      $("#modal-title").textContent = `审批 · ${a.toolName}`;
      $("#modal-body").innerHTML = `
        <div style="margin-bottom:10px">
          <span class="tag-pill" style="background:${denied ? "#FFEBEE" : "#FCE4EC"};color:${denied ? "#C62828" : "#AD1457"}">${esc(a.toolName)}</span>
          <span class="outcome-badge ${esc(a.outcome)}">${esc(outcomeLabel(a.outcome))}</span>
          <span class="tag-pill" style="background:#ECEFF1;color:#455A64">等待 ${fmtDur(a.waitMs)}</span>
        </div>
        <div class="field-label">审批原因</div>
        <div class="mono-block">${esc(a.reason || "(无)")}</div>
        <div class="field-label">时序</div>
        <div class="kv-table">
          <tr><td>id</td><td>${esc(a.id)}</td></tr>
          <tr><td>请求</td><td>${fmtTime(a.askTime)}</td></tr>
          <tr><td>决策</td><td>${a.decideTime ? fmtTime(a.decideTime) : "—"}</td></tr>
          <tr><td>callId</td><td>${esc(a.callId || "—")}</td></tr>
        </div>`;
      $("#modal").classList.remove("hidden");
    });
  });

  const listEl = el.querySelector("#ap-list");
  listEl.innerHTML = aps.map((a, i) => {
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
   Tokens — ECharts donut + stacked area
   ============================================================ */
async function renderTokens(el) {
  if (!state.tokensCache) state.tokensCache = await api(`/api/sessions/${encCur()}/tokens`);
  const { tokens, totals } = state.tokensCache;
  if (!tokens.length) { el.innerHTML = `<div class="empty-hint">无 token 统计（无 assistant/message usage）</div>`; return; }

  const seriesDef = [
    ["inputTokens", "输入", "#2196F3"],
    ["outputTokens", "输出", "#FF9800"],
    ["reasoningTokens", "推理", "#FFC107"],
    ["cacheReadTokens", "缓存读取", "#009688"],
  ];
  const donutItems = seriesDef.map(([k, lab, color]) => ({ name: lab, value: totals[k] || 0, color }));

  // stacked area: X = message index (or relative time), series = 4 token kinds
  const t0 = tokens[0]?.time || 0;
  const xLabels = tokens.map((t, i) => {
    const rel = t.time && t0 ? ((t.time - t0) / 1000).toFixed(1) + "s" : String(i + 1);
    return `#${i + 1}`;
  });
  const areaSeries = seriesDef.map(([k, lab, color]) => ({
    name: lab, color,
    data: tokens.map((t) => t[k] || 0),
  }));

  el.innerHTML = `
  <div class="chart-duo">
    <div class="panel chart-panel">
      <h3>Token 构成 <span class="hint">总量环形图</span></h3>
      <div class="chart-box" id="tk-donut" style="height:300px"></div>
    </div>
    <div class="panel chart-panel">
      <h3>逐条消息 Token 趋势 <span class="hint">${tokens.length} 条 assistant/message · 点击图例高亮</span></h3>
      <div class="chart-box" id="tk-area" style="height:300px"></div>
    </div>
  </div>
  <div class="panel">
    <h3>汇总 <span class="hint">总计</span></h3>
    <div class="token-kpi-row">
      ${seriesDef.map(([k, lab, col]) => `<div class="token-kpi"><span class="tk-dot" style="background:${col}"></span>
        <span class="tk-label">${lab}</span><span class="tk-val">${fmtNum(totals[k] || 0)}</span></div>`).join("")}
      <div class="token-kpi"><span class="tk-dot" style="background:#1c2430"></span>
        <span class="tk-label">合计</span><span class="tk-val">${fmtNum(tokens.reduce((s, t) => s + (t.total || 0), 0))}</span></div>
    </div>
  </div>`;

  const donutEl = $("#tk-donut");
  const c1 = renderDonut(donutEl, donutItems);
  if (c1) state.charts.push(c1);

  const areaEl = $("#tk-area");
  const c2 = renderStackedArea(areaEl, xLabels, areaSeries, { stack: true });
  if (c2) state.charts.push(c2);
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
        <span class="type-dot" style="background:${grp.fg}" title="${esc(grp.label)}"></span>
        <span class="group-chip" style="background:${grp.bg};color:${grp.fg};border-color:${grp.border}">${esc(ev.type)}</span>
        <span style="margin-left:auto;font-size:10.5px;color:var(--ink-3);font-family:var(--mono)">${fmtTime(ev.time).slice(11)}</span>
      </div>
      <div class="sr-summary">${highlightQ(esc(ev.summary), state.searchState.q)}</div>
    </div>`;
  }).join("");
  return `<div class="panel"><h3>搜索结果 <span class="hint">${fmtNum(total)} 条匹配 · 色块=14 组配色</span></h3>${rows || `<div class="empty-hint">无匹配</div>`}
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
async function openEvent(line, seqOverride) {
  const seq = seqOverride ||
              document.querySelector(`.event-row[data-line="${line}"]`)?.dataset.seq ||
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
  // arrow bridge: collapse / expand the sidebar
  $("#arrow-bridge").addEventListener("click", () => {
    document.body.classList.toggle("sidebar-collapsed");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { closeModal(); }
  });
}

boot();
bindGlobal();
