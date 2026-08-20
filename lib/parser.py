"""JSONL session parser: raw decoded lines -> structured SessionModel.

Produces, in one pass:
  * meta / type / group statistics
  * the execution timeline (turns -> steps -> tool calls)
  * tool call+result pairs, approval pairs, todo snapshots
  * merged reasoning text per step, per-message token usage
  * a seq -> line index map for the raw viewer
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

from .models import GROUPS, SessionModel, group_of

MAX_SUMMARY = 300          # cap for event summaries returned to the UI
REASONING_HIGHLIGHTS = (   # "key turning points" highlighted in reasoning view
    "Let me check", "I need to", "Actually", "Hmm", "Wait", "Let me think",
    "This is", "I should", "Let's", "首先", "让我", "我需要", "不过", "其实",
    "等一下", "让我重新",
)


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

def _time_of(o: Dict[str, Any]) -> Optional[int]:
    t = o.get("time")
    if t is None:
        t = o.get("time0")
    return t


def _seq_of(o: Dict[str, Any]) -> Optional[int]:
    s = o.get("seq")
    if s is None:
        s = o.get("seq0")
    return s


def _clip(text: str, n: int = MAX_SUMMARY) -> str:
    text = (text or "").strip()
    if len(text) > n:
        return text[:n] + "…"
    return text


def _content_text(content: Any) -> str:
    """Join the text of message content parts (text / tool-result / reasoning)."""
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    parts = []
    for part in content:
        if not isinstance(part, dict):
            continue
        pt = part.get("type")
        if pt in ("text", "reasoning") and isinstance(part.get("text"), str):
            parts.append(part["text"])
        elif pt == "tool-result":
            sub = _content_text(part.get("content"))
            if sub:
                parts.append(sub)
    return "\n".join(p for p in parts if p)


def _tool_result_text(data: Dict[str, Any]) -> str:
    msg = data.get("message") or {}
    return _content_text(msg.get("content"))


def summarize(o: Dict[str, Any]) -> str:
    """Human-readable one-line summary of an event's payload."""
    t = o.get("type", "?")
    d = o.get("data") or {}
    try:
        if t == "session":
            return f'cwd={d.get("cwd") or o.get("cwd")}, agentPreset={d.get("agentPreset") or o.get("agentPreset")}'
        if t == "session/title":
            return _clip(str(d.get("title", "")))
        if t == "session/title-llm-request":
            return _clip(f'titleProvider={d.get("titleProvider")}, maxTokens={d.get("maxTokens")}')
        if t == "session/end-seed":
            return "session end seed"
        if t == "permission/preset":
            return f'preset={d.get("preset")}'
        if t == "sandbox/mode":
            return f'mode={d.get("mode")}'
        if t == "approval/policy":
            return f'policy={d.get("policy")}'
        if t == "request/header":
            hdr = d.get("header") or {}
            tools = hdr.get("tools") or []
            return f'reason={d.get("reason")}, {len(tools)} tools registered'
        if t == "request/context":
            return f'{d.get("provider")} / {d.get("model")} (contextWindow={d.get("contextWindow")})'
        if t == "agent-preset/selected":
            return f'agentPreset={d.get("agentPreset")}'
        if t == "turn/start":
            return f'turn {d.get("turn")}'
        if t == "turn/end":
            reason = d.get("reason") or {}
            if reason.get("kind") == "error":
                return _clip(f'turn {d.get("turn")} ERROR: {reason.get("error", {}).get("message", "")}')
            return f'turn {d.get("turn")} completed'
        if t == "step/start":
            return f'turn {d.get("turn")} step {d.get("step")}'
        if t == "step/end":
            return f'turn {d.get("turn")} step {d.get("step")}'
        if t == "user/message":
            return _clip(_content_text(d.get("content")))
        if t == "agent/inbox/spliced":
            inserted = d.get("inserted") or []
            txts = [_content_text(m.get("content")) for m in inserted if isinstance(m, dict)]
            return _clip(" | ".join(t for t in txts if t))
        if t == "assistant/message":
            msg = d.get("message") or {}
            usage = d.get("usage") or {}
            txt = _content_text(msg.get("content"))
            tok = usage.get("outputTokens", 0)
            return _clip(txt or "(no text)") + f" [tokens in={usage.get('inputTokens',0)} out={tok}]"
        if t == "assistant/chunk":
            chunk = d.get("chunk") or {}
            reason = chunk.get("reason")
            if isinstance(reason, dict) and reason.get("kind") == "error":
                return _clip(f'chunk error: {reason.get("failure", {}).get("message", "")}')
            return f'chunk type={chunk.get("type")}'
        if t in ("reasoning-chunks", "text-chunks"):
            texts = d.get("texts") or []
            dt = d.get("dt") or []
            return f'{len(texts)} chunks, {sum(len(x) for x in texts)} chars, {sum(dt)}ms'
        if t == "tool-call-chunks":
            return _clip(f'{d.get("name")} {d.get("id")} streaming {len(d.get("args") or [])} parts')
        if t == "tool/call":
            return _clip(f'{d.get("name")}({d.get("arguments", "")})')
        if t == "tool/result":
            if d.get("error"):
                return _clip(f'ERROR: {d.get("error")}')
            txt = _tool_result_text(d)
            meta = d.get("meta") or {}
            if meta:
                return _clip(txt) + f'  [meta: {json.dumps(meta, ensure_ascii=False)[:80]}]'
            return _clip(txt)
        if t == "approval/asked":
            return _clip(f'{d.get("toolName")} — {d.get("reason", "")}')
        if t == "approval/decided":
            return f'outcome={d.get("outcome")}'
        if t == "todo/write":
            todos = d.get("todos") or []
            return f'{len(todos)} todos'
        if t == "llm/retry":
            return _clip(f'retry {d.get("retry")}/{d.get("maxRetries")} — {d.get("failure")}')
        if t == "llm/retry-started":
            return f'retry {d.get("retry")} started'
        if t == "command/run":
            return _clip(f'{d.get("name")}{d.get("args", "")} (cmd {d.get("commandId")})')
        if t == "command/done":
            return _clip(f'{d.get("kind")}: {d.get("text", "")}')
        if t == "web/deepseek-search-llm-request":
            return _clip(f'endpoint={d.get("endpoint")}, apiVersion={d.get("apiVersion")}')
    except Exception:
        pass
    return f'({t})'


# ---------------------------------------------------------------------------
# session scanning (fast, for the sessions list API)
# ---------------------------------------------------------------------------

def light_scan(path: Path) -> Dict[str, Any]:
    """Fast scan without full parse: meta, title, line count, size."""
    info: Dict[str, Any] = {
        "id": path.parent.name,
        "dirEncoded": path.parent.parent.name,
        "filePath": str(path),
        "sizeBytes": path.stat().st_size,
        "lineCount": 0,
        "createdAt": None,
        "cwd": None,
        "agentPreset": None,
        "title": None,
        "typeCounts": {},
        "durationMs": None,
        "startTime": None,
        "endTime": None,
    }
    title_found = False
    with open(path, encoding="utf-8") as fh:
        for i, line in enumerate(fh):
            info["lineCount"] += 1
            if i == 0 or (not title_found and i < 5000):
                line = line.strip()
                if not line:
                    continue
                try:
                    o = json.loads(line)
                except Exception:
                    continue
                t = o.get("type")
                if t == "session" and info["createdAt"] is None:
                    info.update({
                        "id": o.get("id", info["id"]),
                        "cwd": o.get("cwd"),
                        "createdAt": o.get("createdAt"),
                        "agentPreset": o.get("agentPreset"),
                        "delegationDepth": o.get("delegationDepth"),
                    })
                elif t == "session/title" and not title_found:
                    info["title"] = (o.get("data") or {}).get("title")
                    title_found = True
                if i == 0 and info["createdAt"] is None:
                    info["startTime"] = _time_of(o)
    return info


# ---------------------------------------------------------------------------
# full parse
# ---------------------------------------------------------------------------

def parse_session(path: Path, dir_encoded: Optional[str] = None,
                  size_bytes: Optional[int] = None) -> SessionModel:
    model = SessionModel(filePath=str(path), sizeBytes=size_bytes or path.stat().st_size)
    if dir_encoded is None:
        dir_encoded = path.parent.parent.name
    model.dirEncoded = dir_encoded

    # turn/step stack state
    cur_turn: Optional[Dict[str, Any]] = None
    cur_step: Optional[Dict[str, Any]] = None
    open_approvals: Dict[str, Dict[str, Any]] = {}
    open_tools: Dict[str, Dict[str, Any]] = {}
    pending_tool_results: List[Dict[str, Any]] = []

    # token accumulation
    token_totals = {"inputTokens": 0, "outputTokens": 0,
                    "cacheReadTokens": 0, "reasoningTokens": 0}

    # reasoning per (turn, step)
    reasoning_buckets: Dict[tuple, Dict[str, Any]] = {}

    last_todo: Optional[List[Dict[str, Any]]] = None

    def mk_event(line_idx: int, o: Dict[str, Any]) -> Dict[str, Any]:
        ev: Dict[str, Any] = {
            "line": line_idx,
            "seq": _seq_of(o),
            "type": o.get("type", "?"),
            "time": _time_of(o),
            "group": group_of(o.get("type", "?")),
            "summary": summarize(o),
        }
        t = ev["type"]
        if t == "tool/result":
            ev["error"] = bool((o.get("data") or {}).get("error"))
            ev["isError"] = ev["error"]
        elif t == "turn/end":
            ev["isError"] = bool(((o.get("data") or {}).get("reason") or {}).get("kind") == "error")
        elif t == "assistant/message":
            usage = (o.get("data") or {}).get("usage") or {}
            ev["tokens"] = usage
        return ev

    with open(path, encoding="utf-8") as fh:
        for line_idx, line in enumerate(fh):
            line = line.strip()
            if not line:
                continue
            model.rawLines.append(line)
            try:
                o = json.loads(line)
            except Exception:
                continue
            model.events.append(mk_event(line_idx, o))
            t = o.get("type", "?")
            d = o.get("data") or {}
            seq = _seq_of(o)
            if seq is not None:
                model.seqToLine.setdefault(seq, line_idx)

            # --- meta ---
            if t == "session":
                model.id = o.get("id") or model.id
                model.cwd = o.get("cwd") or ""
                model.createdAt = o.get("createdAt")
                model.agentPreset = o.get("agentPreset") or ""
                model.delegationDepth = o.get("delegationDepth") or 0
            elif t == "session/title":
                model.title = model.title or (d.get("title") or "")

            # --- type / group counts ---
            model.typeCounts[t] = model.typeCounts.get(t, 0) + 1
            g = group_of(t)
            model.groupCounts[g] = model.groupCounts.get(g, 0) + 1

            ev = model.events[-1]

            # --- turn / step lifecycle ---
            if t == "turn/start":
                cur_turn = {
                    "turn": d.get("turn"),
                    "startTime": _time_of(o),
                    "startLine": line_idx,
                    "steps": [],
                    "events": [],
                    "toolCalls": 0,
                    "errors": 0,
                }
                model.turns.append(cur_turn)
            elif t == "turn/end":
                if cur_turn is not None:
                    cur_turn["endTime"] = _time_of(o)
                    cur_turn["endLine"] = line_idx
                    if cur_turn.get("startTime") is not None and cur_turn["endTime"] is not None:
                        cur_turn["durationMs"] = max(0, cur_turn["endTime"] - cur_turn["startTime"])
                    cur_turn["reason"] = (d.get("reason") or {}).get("kind")
                    cur_turn = None
            elif t == "step/start":
                cur_step = {
                    "turn": d.get("turn"),
                    "step": d.get("step"),
                    "startTime": _time_of(o),
                    "startLine": line_idx,
                    "events": [],
                    "tools": [],
                    "reasoningChars": 0,
                    "textChars": 0,
                    "errors": 0,
                }
                if cur_turn is not None:
                    cur_turn["steps"].append(cur_step)
            elif t == "step/end":
                if cur_step is not None:
                    cur_step["endTime"] = _time_of(o)
                    cur_step["endLine"] = line_idx
                    if cur_step.get("startTime") is not None and cur_step["endTime"] is not None:
                        cur_step["durationMs"] = max(0, cur_step["endTime"] - cur_step["startTime"])
                    cur_step = None

            # --- attach event to current step or turn ---
            attach = None
            if cur_step is not None:
                attach = cur_step
            elif cur_turn is not None:
                attach = cur_turn
            if attach is not None and t not in ("turn/start", "turn/end", "step/start", "step/end"):
                attach["events"].append(ev)
                if ev.get("isError"):
                    attach["errors"] = attach.get("errors", 0) + 1
                    if cur_turn is not None:
                        cur_turn["errors"] = cur_turn.get("errors", 0) + 1

            # --- tool calls ---
            if t == "tool/call":
                call = {
                    "callId": d.get("callId"),
                    "name": d.get("name"),
                    "arguments": d.get("arguments"),
                    "callLine": line_idx,
                    "callTime": _time_of(o),
                    "callSeq": seq,
                    "status": "no-result",
                    "resultLine": None,
                    "resultTime": None,
                    "durationMs": None,
                    "resultPreview": "",
                    "error": None,
                }
                open_tools[d.get("callId")] = call
                if cur_step is not None:
                    cur_step["tools"].append({
                        "callId": d.get("callId"),
                        "name": d.get("name"),
                        "status": "pending",
                    })
                    cur_step["toolCalls"] = cur_step.get("toolCalls", 0) + 1
                elif cur_turn is not None:
                    cur_turn["toolCalls"] = cur_turn.get("toolCalls", 0) + 1
            elif t == "tool/result":
                src = (d.get("message") or {}).get("source") or {}
                call_id = src.get("callId")
                if call_id and call_id in open_tools:
                    call = open_tools[call_id]
                    call["status"] = "error" if d.get("error") else "ok"
                    call["resultLine"] = line_idx
                    call["resultTime"] = _time_of(o)
                    if call.get("callTime") is not None and call["resultTime"] is not None:
                        call["durationMs"] = max(0, call["resultTime"] - call["callTime"])
                    call["resultPreview"] = _clip(_tool_result_text(d))
                    call["error"] = d.get("error")
                    # update step tool status
                    if cur_step is not None:
                        for st in cur_step["tools"]:
                            if st["callId"] == call_id:
                                st["status"] = call["status"]
                                break

            # --- reasoning / text chunk merging ---
            if t in ("reasoning-chunks", "text-chunks"):
                key = (d.get("turn"), d.get("step"))
                bucket = reasoning_buckets.setdefault(key, {
                    "turn": d.get("turn"),
                    "step": d.get("step"),
                    "kind": t,
                    "texts": [],
                    "dt": [],
                    "chunks": 0,
                    "firstTime": _time_of(o),
                    "lastTime": None,
                    "startLine": line_idx,
                })
                bucket["texts"].extend(d.get("texts") or [])
                bucket["dt"].extend(d.get("dt") or [])
                bucket["chunks"] += 1
                bucket["lastTime"] = _time_of(o)
                if cur_step is not None:
                    if t == "reasoning-chunks":
                        cur_step["reasoningChars"] = cur_step.get("reasoningChars", 0) + \
                            sum(len(x) for x in (d.get("texts") or []))
                    else:
                        cur_step["textChars"] = cur_step.get("textChars", 0) + \
                            sum(len(x) for x in (d.get("texts") or []))

            # --- approvals ---
            if t == "approval/asked":
                open_approvals[d.get("id")] = {
                    "id": d.get("id"),
                    "toolName": d.get("toolName"),
                    "callId": d.get("callId"),
                    "reason": d.get("reason"),
                    "askLine": line_idx,
                    "askTime": _time_of(o),
                    "outcome": None,
                    "decideLine": None,
                    "decideTime": None,
                    "waitMs": None,
                }
            elif t == "approval/decided":
                ap = open_approvals.get(d.get("id"))
                if ap is not None:
                    ap["outcome"] = d.get("outcome")
                    ap["decideLine"] = line_idx
                    ap["decideTime"] = _time_of(o)
                    if ap["askTime"] is not None and ap["decideTime"] is not None:
                        ap["waitMs"] = max(0, ap["decideTime"] - ap["askTime"])
                    model.approvals.append(ap)

            # --- todos ---
            if t == "todo/write":
                todos = d.get("todos") or []
                changes = []
                if last_todo is not None:
                    prev = {x.get("content"): x.get("status") for x in last_todo}
                    for td in todos:
                        old = prev.get(td.get("content"))
                        if old is not None and old != td.get("status"):
                            changes.append({
                                "content": td.get("content"),
                                "from": old,
                                "to": td.get("status"),
                            })
                last_todo = todos
                model.todos.append({
                    "line": line_idx,
                    "time": _time_of(o),
                    "todos": todos,
                    "changes": changes,
                })

            # --- tokens ---
            if t == "assistant/message":
                usage = d.get("usage") or {}
                for k in token_totals:
                    token_totals[k] = token_totals.get(k, 0) + (usage.get(k) or 0)
                model.tokens.append({
                    "line": line_idx,
                    "turn": d.get("turn"),
                    "step": d.get("step"),
                    "time": _time_of(o),
                    "inputTokens": usage.get("inputTokens") or 0,
                    "outputTokens": usage.get("outputTokens") or 0,
                    "cacheReadTokens": usage.get("cacheReadTokens") or 0,
                    "reasoningTokens": usage.get("reasoningTokens") or 0,
                    "total": sum(usage.get(k) or 0 for k in ("inputTokens", "outputTokens",
                                                             "cacheReadTokens", "reasoningTokens")),
                })

            # --- llm retry ---
            if t in ("llm/retry", "llm/retry-started"):
                ev["retryId"] = d.get("retryId")

            # --- search index: line -> searchable full text ---
            # (payloads too big to fit in `summary` are indexed here)
            if t in ("reasoning-chunks", "text-chunks"):
                bucket = reasoning_buckets.get((d.get("turn"), d.get("step")))
                if bucket is not None:
                    model.searchIndex.setdefault(line_idx, bucket)
            elif t == "tool/call":
                model.searchIndex[line_idx] = f'{d.get("name")} {d.get("arguments") or ""}'
            elif t == "tool/result":
                txt = _tool_result_text(d)
                if txt:
                    model.searchIndex[line_idx] = txt
            elif t in ("user/message", "assistant/message"):
                msg = d.get("message") or {}
                txt = _content_text(msg.get("content"))
                if txt:
                    model.searchIndex[line_idx] = txt
            elif t == "todo/write":
                model.searchIndex[line_idx] = " ".join(
                    x.get("content", "") for x in (d.get("todos") or []))
            elif t == "approval/asked":
                model.searchIndex[line_idx] = f'{d.get("toolName")} {d.get("reason") or ""}'

    # --- finalize reasoning buckets (sorted by startLine) ---
    for bucket in sorted(reasoning_buckets.values(), key=lambda b: b["startLine"]):
        merged = "".join(bucket["texts"])
        bucket["text"] = merged
        bucket["charCount"] = len(merged)
        bucket["durationMs"] = sum(bucket["dt"])
        bucket["avgMsPerChunk"] = round(bucket["durationMs"] / bucket["chunks"], 1) \
            if bucket["chunks"] else 0
        model.reasoning.append(bucket)

    # --- finalize tools (in call order) ---
    for call in sorted(open_tools.values(), key=lambda c: c["callLine"]):
        model.tools.append(call)

    # --- duration ---
    times = [e["time"] for e in model.events if e.get("time") is not None]
    if times:
        model.durationMs = max(0, max(times) - min(times))
    model.tokenTotals = token_totals
    model.lineCount = len(model.rawLines)
    return model
