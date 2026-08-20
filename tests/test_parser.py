"""Unit tests for the DSH session log parser.

Run:  python -m unittest tests.test_parser -v
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from lib.parser import light_scan, parse_session, summarize  # noqa: E402
from lib.models import GROUPS, TYPE_GROUP  # noqa: E402


def make_session(lines):
    """Write a temp JSONL session file and return its path."""
    tmp = tempfile.mkdtemp()
    p = Path(tmp) / "session.json"
    p.write_text("\n".join(json.dumps(l, ensure_ascii=False) for l in lines) + "\n",
                 encoding="utf-8")
    return p


class TestParser(unittest.TestCase):
    def test_meta_and_counts(self):
        lines = [
            {"type": "session", "id": "s1", "createdAt": 1000, "cwd": r"D:\x", "agentPreset": "standard"},
            {"type": "permission/preset", "seq": 0, "time": 1001, "data": {"preset": "workspace-write"}},
            {"type": "turn/start", "seq": 1, "time": 1002, "data": {"turn": 1}},
            {"type": "step/start", "seq": 2, "time": 1003, "data": {"turn": 1, "step": 1}},
            {"type": "user/message", "seq": 3, "time": 1004,
             "data": {"content": [{"type": "text", "text": "hello"}]}},
            {"type": "step/end", "seq": 4, "time": 1005, "data": {"turn": 1, "step": 1}},
            {"type": "turn/end", "seq": 5, "time": 1006, "data": {"turn": 1, "reason": {"kind": "completed"}}},
        ]
        p = make_session(lines)
        m = parse_session(p, dir_encoded="--D-x--")
        self.assertEqual(m.id, "s1")
        self.assertEqual(m.cwd, r"D:\x")
        self.assertEqual(m.lineCount, 7)
        self.assertEqual(m.typeCounts["user/message"], 1)
        self.assertEqual(len(m.turns), 1)
        self.assertEqual(len(m.turns[0]["steps"]), 1)
        self.assertEqual(m.durationMs, 5)

    def test_tool_pairing_and_error(self):
        lines = [
            {"type": "session", "id": "s2", "createdAt": 0, "cwd": "C:\\x"},
            {"type": "tool/call", "seq": 1, "time": 10,
             "data": {"turn": 1, "step": 1, "callId": "c1", "name": "read", "arguments": "{}"}},
            {"type": "tool/result", "seq": 2, "time": 40,
             "data": {"turn": 1, "step": 1,
                      "message": {"source": {"kind": "tool", "callId": "c1"},
                                  "content": [{"type": "tool-result", "toolCallId": "c1",
                                               "content": [{"type": "text", "text": "OK"}]}]}}},
            {"type": "tool/result", "seq": 3, "time": 50,
             "data": {"turn": 1, "step": 1, "error": {"code": "E"},
                      "message": {"source": {"kind": "tool", "callId": "c2"}}}},
        ]
        p = make_session(lines)
        m = parse_session(p, dir_encoded="--D-x--")
        self.assertEqual(len(m.tools), 1)
        t = m.tools[0]
        self.assertEqual(t["name"], "read")
        self.assertEqual(t["status"], "ok")
        self.assertEqual(t["durationMs"], 30)
        self.assertEqual(t["resultPreview"], "OK")

    def test_reasoning_merge_and_tokens(self):
        lines = [
            {"type": "session", "id": "s3", "createdAt": 0, "cwd": "C:\\x"},
            {"type": "reasoning-chunks", "seq0": 0, "time0": 100,
             "data": {"turn": 1, "step": 1, "index": 0, "dt": [10, 20], "texts": ["Let me", " check"]}},
            {"type": "reasoning-chunks", "seq0": 1, "time0": 130,
             "data": {"turn": 1, "step": 1, "index": 1, "dt": [5], "texts": [" this"]}},
            {"type": "assistant/message", "seq": 2, "time": 200,
             "data": {"turn": 1, "step": 1,
                      "message": {"role": "assistant", "content": [{"type": "text", "text": "hi"}]},
                      "usage": {"inputTokens": 10, "outputTokens": 5, "cacheReadTokens": 3, "reasoningTokens": 2}}},
        ]
        p = make_session(lines)
        m = parse_session(p, dir_encoded="--D-x--")
        self.assertEqual(len(m.reasoning), 1)
        r = m.reasoning[0]
        self.assertEqual(r["text"], "Let me check this")
        self.assertEqual(r["durationMs"], 35)
        self.assertEqual(m.tokenTotals["inputTokens"], 10)
        self.assertEqual(m.tokenTotals["outputTokens"], 5)
        self.assertEqual(len(m.tokens), 1)

    def test_approvals_pairing(self):
        lines = [
            {"type": "session", "id": "s4", "createdAt": 0, "cwd": "C:\\x"},
            {"type": "approval/asked", "seq": 1, "time": 10,
             "data": {"id": "a1", "toolName": "pwsh", "reason": "need"}},
            {"type": "approval/decided", "seq": 2, "time": 30,
             "data": {"id": "a1", "outcome": "allowed-once"}},
            {"type": "approval/decided", "seq": 3, "time": 40,
             "data": {"id": "a9", "outcome": "denied"}},
        ]
        p = make_session(lines)
        m = parse_session(p, dir_encoded="--D-x--")
        self.assertEqual(len(m.approvals), 1)
        a = m.approvals[0]
        self.assertEqual(a["outcome"], "allowed-once")
        self.assertEqual(a["waitMs"], 20)

    def test_todo_snapshots_and_changes(self):
        lines = [
            {"type": "session", "id": "s5", "createdAt": 0, "cwd": "C:\\x"},
            {"type": "todo/write", "seq": 1, "time": 10,
             "data": {"todos": [{"content": "a", "status": "pending"}, {"content": "b", "status": "in_progress"}]}},
            {"type": "todo/write", "seq": 2, "time": 20,
             "data": {"todos": [{"content": "a", "status": "in_progress"}, {"content": "b", "status": "completed"}]}},
        ]
        p = make_session(lines)
        m = parse_session(p, dir_encoded="--D-x--")
        self.assertEqual(len(m.todos), 2)
        self.assertEqual(len(m.todos[1]["changes"]), 2)
        ch = m.todos[1]["changes"][0]
        self.assertEqual((ch["from"], ch["to"]), ("pending", "in_progress"))

    def test_seq_to_line_map(self):
        lines = [
            {"type": "session", "id": "s6", "createdAt": 0, "cwd": "C:\\x"},
            {"type": "step/start", "seq": 7, "time": 1, "data": {"turn": 1, "step": 1}},
        ]
        p = make_session(lines)
        m = parse_session(p, dir_encoded="--D-x--")
        self.assertEqual(m.seqToLine.get(7), 1)

    def test_light_scan(self):
        lines = [
            {"type": "session", "id": "s7", "createdAt": 123456, "cwd": "C:\\y"},
            {"type": "session/title", "seq": 1, "time": 2, "data": {"title": "我的会话"}},
            {"type": "user/message", "seq": 2, "time": 3, "data": {"content": []}},
        ]
        p = make_session(lines)
        info = light_scan(p)
        self.assertEqual(info["id"], "s7")
        self.assertEqual(info["title"], "我的会话")
        self.assertEqual(info["lineCount"], 3)
        self.assertEqual(info["createdAt"], 123456)

    def test_groups_cover_all_types(self):
        """Every type in TYPE_GROUP maps to a defined group with colors."""
        for t, g in TYPE_GROUP.items():
            self.assertIn(g, GROUPS, f"type {t} -> missing group {g}")
            for key in ("fg", "bg", "border"):
                self.assertIn(key, GROUPS[g])


if __name__ == "__main__":
    unittest.main()
