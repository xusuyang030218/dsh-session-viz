"""dsh-session-viz — FastAPI backend.

Serves the decoded-sessions tree with a JSON API plus a static frontend.
Run:  python app.py [--port 8765] [--host 127.0.0.1]
"""

from __future__ import annotations

import argparse
import json
import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from lib.decompressor import DEFAULT_SOURCE, sync_all
from lib.models import GROUPS, GROUP_ORDER, group_of
from lib.parser import light_scan, parse_session

BASE_DIR = Path(__file__).resolve().parent
DECODED_DIR = BASE_DIR / "decoded-sessions"
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(title="DSH Session Log Visualizer", version="1.0.0")

# ---------------------------------------------------------------------------
# cache: session scans (list) and parsed sessions (LRU-ish)
# ---------------------------------------------------------------------------

_list_cache: Dict[str, Any] = {"t": 0.0, "sessions": []}
_parsed_cache: Dict[str, Any] = {}
_CACHE_MAX = 4


def _list_sessions(force: bool = False) -> List[dict]:
    """Light scan of decoded-sessions (cached 30s)."""
    if not force and _list_cache["sessions"] and time.time() - _list_cache["t"] < 30:
        return _list_cache["sessions"]
    sessions = []
    if DECODED_DIR.is_dir():
        for f in sorted(DECODED_DIR.rglob("session.json")):
            try:
                info = light_scan(f)
                sessions.append(info)
            except Exception:
                continue
    sessions.sort(key=lambda s: s.get("createdAt") or 0)
    _list_cache.update(t=time.time(), sessions=sessions)
    return sessions


def _find_session(dir_enc: str, sid: str) -> Path:
    p = DECODED_DIR / dir_enc / sid / "session.json"
    if not p.is_file():
        raise HTTPException(status_code=404, detail=f"session not found: {dir_enc}/{sid}")
    return p


def _get_model(dir_enc: str, sid: str):
    """Parse + cache a session model."""
    key = f"{dir_enc}/{sid}"
    if key in _parsed_cache:
        return _parsed_cache[key]
    path = _find_session(dir_enc, sid)
    t0 = time.time()
    model = parse_session(path, dir_encoded=dir_enc)
    model.parseMs = int((time.time() - t0) * 1000)
    if len(_parsed_cache) >= _CACHE_MAX:
        # evict oldest (dict preserves insertion order)
        _parsed_cache.pop(next(iter(_parsed_cache)))
    _parsed_cache[key] = model
    return model


# ---------------------------------------------------------------------------
# static frontend
# ---------------------------------------------------------------------------

@app.get("/", response_class=HTMLResponse)
def index():
    return FileResponse(STATIC_DIR / "index.html")


if STATIC_DIR.is_dir():
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# ---------------------------------------------------------------------------
# API
# ---------------------------------------------------------------------------

@app.get("/api/health")
def health():
    return {"ok": True, "decodedDir": str(DECODED_DIR)}


@app.get("/api/meta")
def meta():
    return {
        "groups": GROUPS,
        "groupOrder": GROUP_ORDER,
        "decodedDir": str(DECODED_DIR),
        "sourceDir": str(DEFAULT_SOURCE),
    }


@app.get("/api/sessions")
def sessions():
    return {"sessions": _list_sessions()}


@app.post("/api/rescan")
def rescan():
    _list_cache.clear()
    return {"sessions": _list_sessions()}


@app.post("/api/sync")
def sync(force: bool = False):
    """Re-decode zstd sources into decoded-sessions."""
    results = sync_all(force=force)
    _list_cache.clear()
    return {"results": results}


def _model_summary(model) -> dict:
    times = [e["time"] for e in model.events if e.get("time") is not None]
    return {
        "id": model.id,
        "dirEncoded": model.dirEncoded,
        "cwd": model.cwd,
        "createdAt": model.createdAt,
        "agentPreset": model.agentPreset,
        "delegationDepth": model.delegationDepth,
        "title": model.title,
        "filePath": model.filePath,
        "sizeBytes": model.sizeBytes,
        "lineCount": model.lineCount,
        "eventCount": len(model.events),
        "durationMs": model.durationMs,
        "startTime": times[0] if times else None,
        "endTime": times[-1] if times else None,
        "parseMs": getattr(model, "parseMs", None),
        "typeCounts": model.typeCounts,
        "groupCounts": model.groupCounts,
        "tokenTotals": model.tokenTotals,
        "turnCount": len(model.turns),
        "toolCount": len(model.tools),
        "toolErrorCount": sum(1 for t in model.tools if t["status"] == "error"),
        "reasoningCount": len(model.reasoning),
        "approvalCount": len(model.approvals),
        "approvalDeniedCount": sum(1 for a in model.approvals if a.get("outcome") == "denied"),
        "todoCount": len(model.todos),
    }


@app.get("/api/sessions/{dir_enc}/{sid}")
def session_detail(dir_enc: str, sid: str):
    model = _get_model(dir_enc, sid)
    return _model_summary(model)


@app.get("/api/sessions/{dir_enc}/{sid}/events")
def events(
    dir_enc: str,
    sid: str,
    type: Optional[str] = Query(None),
    group: Optional[str] = Query(None),
    q: Optional[str] = Query(None),
    from_time: Optional[int] = Query(None, alias="from"),
    to_time: Optional[int] = Query(None, alias="to"),
    from_line: Optional[int] = Query(None, alias="fromLine"),
    to_line: Optional[int] = Query(None, alias="toLine"),
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    model = _get_model(dir_enc, sid)
    ql = q.lower() if q else None
    out = []
    for ev in model.events:
        if from_line is not None and ev["line"] < from_line:
            continue
        if to_line is not None and ev["line"] > to_line:
            continue
        if type and ev["type"] != type:
            continue
        if group and ev["group"] != group:
            continue
        t = ev.get("time")
        if from_time is not None and (t is None or t < from_time):
            continue
        if to_time is not None and (t is None or t > to_time):
            continue
        if ql:
            hay = (ev.get("summary") or "").lower()
            if ql not in hay:
                idx = model.searchIndex.get(ev["line"])
                if isinstance(idx, dict):
                    hay = (idx.get("text") or "").lower()
                elif isinstance(idx, str):
                    hay = idx.lower()
                else:
                    hay = ""
                if ql not in hay:
                    continue
        out.append(ev)
    total = len(out)
    page = out[offset:offset + limit]
    return {"total": total, "offset": offset, "limit": limit, "events": page}


@app.get("/api/sessions/{dir_enc}/{sid}/events/{seq}")
def event_by_seq(dir_enc: str, sid: str, seq: int):
    model = _get_model(dir_enc, sid)
    line = model.seqToLine.get(seq)
    if line is None:
        raise HTTPException(status_code=404, detail=f"seq {seq} not found")
    return {
        "line": line,
        "seq": seq,
        "raw": model.rawLines[line],
        "event": model.events[line],
    }


@app.get("/api/sessions/{dir_enc}/{sid}/timeline")
def timeline(dir_enc: str, sid: str):
    """Light timeline: turns/steps with counts; per-step events are
    fetched lazily via /events?fromLine=&toLine=."""
    model = _get_model(dir_enc, sid)
    turns = []
    for t in model.turns:
        steps = []
        for st in t.get("steps", []):
            steps.append({
                "turn": st.get("turn"),
                "step": st.get("step"),
                "startTime": st.get("startTime"),
                "endTime": st.get("endTime"),
                "startLine": st.get("startLine"),
                "endLine": st.get("endLine"),
                "durationMs": st.get("durationMs"),
                "eventCount": len(st.get("events", [])),
                "toolCalls": st.get("toolCalls", 0),
                "tools": st.get("tools", []),
                "reasoningChars": st.get("reasoningChars", 0),
                "textChars": st.get("textChars", 0),
                "errors": st.get("errors", 0),
            })
        turns.append({
            "turn": t.get("turn"),
            "startTime": t.get("startTime"),
            "endTime": t.get("endTime"),
            "startLine": t.get("startLine"),
            "endLine": t.get("endLine"),
            "durationMs": t.get("durationMs"),
            "reason": t.get("reason"),
            "errors": t.get("errors", 0),
            "toolCalls": t.get("toolCalls", 0),
            "stepCount": len(steps),
            "steps": steps,
        })
    return {"turns": turns}


@app.get("/api/sessions/{dir_enc}/{sid}/tools")
def tools(dir_enc: str, sid: str):
    model = _get_model(dir_enc, sid)
    return {"tools": model.tools}


@app.get("/api/sessions/{dir_enc}/{sid}/reasoning")
def reasoning(dir_enc: str, sid: str):
    model = _get_model(dir_enc, sid)
    # strip the raw `texts` fragment list (merged `text` + `dt` are enough)
    out = []
    for r in model.reasoning:
        out.append({k: v for k, v in r.items() if k != "texts"})
    return {"reasoning": out}


@app.get("/api/sessions/{dir_enc}/{sid}/tokens")
def tokens(dir_enc: str, sid: str):
    model = _get_model(dir_enc, sid)
    return {"tokens": model.tokens, "totals": model.tokenTotals}


@app.get("/api/sessions/{dir_enc}/{sid}/approvals")
def approvals(dir_enc: str, sid: str):
    model = _get_model(dir_enc, sid)
    return {"approvals": model.approvals}


@app.get("/api/sessions/{dir_enc}/{sid}/todos")
def todos(dir_enc: str, sid: str):
    model = _get_model(dir_enc, sid)
    return {"todos": model.todos}


@app.get("/api/sessions/{dir_enc}/{sid}/raw")
def raw(
    dir_enc: str,
    sid: str,
    from_line: int = Query(0, alias="from"),
    to_line: Optional[int] = Query(None, alias="to"),
    seq: Optional[int] = Query(None),
):
    model = _get_model(dir_enc, sid)
    if seq is not None:
        line = model.seqToLine.get(seq)
        if line is None:
            raise HTTPException(status_code=404, detail=f"seq {seq} not found")
        lo = max(0, line - 3)
        hi = min(model.lineCount, line + 4)
        return {"line": line, "from": lo, "to": hi,
                "lines": model.rawLines[lo:hi]}
    lo = max(0, from_line)
    hi = model.lineCount if to_line is None else min(model.lineCount, to_line)
    return {"from": lo, "to": hi, "lines": model.rawLines[lo:hi]}


# ---------------------------------------------------------------------------
# F10: static HTML report export
# ---------------------------------------------------------------------------

def _fmt_ms(ms: Optional[int]) -> str:
    if ms is None:
        return "—"
    if ms < 1000:
        return f"{ms} ms"
    s = ms / 1000
    if s < 60:
        return f"{s:.1f} s"
    m = int(s // 60)
    return f"{m} min {int(s % 60)} s"


def _fmt_dt(ts: Optional[int]) -> str:
    if not ts:
        return "—"
    import datetime
    return datetime.datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d %H:%M:%S")


@app.get("/api/sessions/{dir_enc}/{sid}/export")
def export_report(dir_enc: str, sid: str):
    model = _get_model(dir_enc, sid)
    html = _render_report(model)
    return HTMLResponse(html)


def _render_report(model) -> str:
    from lib.models import GROUPS
    esc = lambda s: (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = model
    rows = []
    rows.append(f"<h2>会话摘要</h2><table class='kv'><tr><td>会话 ID</td><td>{esc(s.id)}</td></tr>"
                f"<tr><td>工作目录</td><td>{esc(s.cwd)}</td></tr>"
                f"<tr><td>标题</td><td>{esc(s.title)}</td></tr>"
                f"<tr><td>创建时间</td><td>{_fmt_dt(s.createdAt)}</td></tr>"
                f"<tr><td>agentPreset</td><td>{esc(s.agentPreset)}</td></tr>"
                f"<tr><td>事件总数</td><td>{len(s.events)}</td></tr>"
                f"<tr><td>执行时长</td><td>{_fmt_ms(s.durationMs)}</td></tr>"
                f"<tr><td>工具调用</td><td>{len(s.tools)}（错误 {sum(1 for t in s.tools if t['status']=='error')}）</td></tr>"
                f"<tr><td>审批请求</td><td>{len(s.approvals)}</td></tr></table>")

    # type distribution
    dist = sorted(s.typeCounts.items(), key=lambda x: -x[1])
    rows.append("<h2>事件类型分布</h2><table><tr><th>类型</th><th>数量</th><th>分组</th></tr>")
    for t, c in dist:
        rows.append(f"<tr><td>{esc(t)}</td><td>{c}</td><td>{GROUPS[group_of(t)]['label']}</td></tr>")
    rows.append("</table>")

    # tools
    rows.append("<h2>工具调用表</h2><table><tr><th>#</th><th>工具</th><th>耗时</th><th>状态</th><th>参数</th><th>结果摘要</th></tr>")
    for i, tl in enumerate(s.tools, 1):
        status = tl["status"]
        rows.append(f"<tr><td>{i}</td><td>{esc(tl['name'])}</td><td>{_fmt_ms(tl['durationMs'])}</td>"
                    f"<td>{status}</td><td><pre>{esc(tl['arguments'])}</pre></td>"
                    f"<td>{esc(tl['resultPreview'])}</td></tr>")
    rows.append("</table>")

    # tokens
    rows.append("<h2>Token 用量</h2><table><tr><th>指标</th><th>总计</th></tr>")
    labels = {"inputTokens": "输入", "outputTokens": "输出", "cacheReadTokens": "缓存读取",
              "reasoningTokens": "推理"}
    for k, v in s.tokenTotals.items():
        rows.append(f"<tr><td>{labels.get(k, k)}</td><td>{v:,}</td></tr>")
    rows.append("</table>")

    # reasoning excerpts
    rows.append("<h2>推理片段（前 20 段）</h2>")
    for i, r in enumerate(s.reasoning[:20]):
        rows.append(f"<details><summary>turn {r['turn']} step {r['step']} — {len(r['text'])} 字符 / {_fmt_ms(r['durationMs'])}</summary>"
                    f"<pre>{esc(r['text'][:3000])}</pre></details>")

    # approvals
    rows.append("<h2>审批流程</h2><table><tr><th>工具</th><th>结果</th><th>等待</th><th>原因</th></tr>")
    for a in s.approvals:
        rows.append(f"<tr><td>{esc(a['toolName'])}</td><td>{esc(a['outcome'])}</td>"
                    f"<td>{_fmt_ms(a['waitMs'])}</td><td>{esc(a['reason'])}</td></tr>")
    rows.append("</table>")

    css = """
    body{font-family:'Segoe UI',system-ui,sans-serif;margin:24px;color:#222;background:#fafafa}
    h1{color:#1565C0} h2{color:#37474F;border-bottom:2px solid #eee;padding-bottom:6px;margin-top:32px}
    table{border-collapse:collapse;width:100%;margin:8px 0}
    th,td{border:1px solid #ddd;padding:6px 10px;text-align:left;font-size:13px;vertical-align:top}
    th{background:#f0f4f8} .kv td:first-child{width:160px;background:#f5f5f5;font-weight:600}
    pre{white-space:pre-wrap;word-break:break-all;background:#f7f7f7;padding:8px;border-radius:4px;font-size:12px}
    details{margin:6px 0} summary{cursor:pointer;color:#6d4c41;font-weight:600}
    """
    return f"""<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8">
<title>会话报告 {esc(s.title or s.id)}</title><style>{css}</style></head>
<body><h1>DSH 会话报告：{esc(s.title or s.id)}</h1>
<p>导出时间：{_fmt_dt(int(time.time() * 1000))}</p>
{''.join(rows)}</body></html>"""


# ---------------------------------------------------------------------------
# entry point
# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description="DSH Session Log Visualizer")
    ap.add_argument("--host", default=os.environ.get("DSH_VIZ_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("DSH_VIZ_PORT", "8765")))
    ap.add_argument("--sync", action="store_true", help="decode zstd sources before serving")
    args = ap.parse_args()
    if args.sync:
        results = sync_all()
        print(f"sync: {sum(1 for r in results if r['status']=='decoded')} decoded, "
              f"{sum(1 for r in results if r['status']=='error')} error")
    import uvicorn
    print(f"DSH Session Viz -> http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port, log_level="info")


if __name__ == "__main__":
    main()
