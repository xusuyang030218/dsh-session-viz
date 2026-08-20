"""DSH session log data models and the 14-group color scheme.

Mirrors REQUIREMENTS.md section 2.5. Every event type is mapped to a
visual group (fg/bg/border colors) used by both the API and the frontend.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

# ---------------------------------------------------------------------------
# Color scheme (REQUIREMENTS.md 2.5)
# ---------------------------------------------------------------------------

ColorScheme = Dict[str, Dict[str, str]]

# group key -> {label, fg, bg, border, error}
GROUPS: Dict[str, Dict[str, str]] = {
    "session":   {"label": "会话生命周期", "fg": "#9C27B0", "bg": "#F3E5F5", "border": "#7B1FA2"},
    "config":    {"label": "配置与权限",   "fg": "#607D8B", "bg": "#ECEFF1", "border": "#455A64"},
    "turn":      {"label": "对话轮次",     "fg": "#2196F3", "bg": "#E3F2FD", "border": "#1565C0"},
    "step":      {"label": "执行步骤",     "fg": "#00BCD4", "bg": "#E0F7FA", "border": "#00838F"},
    "user":      {"label": "用户输入",     "fg": "#4CAF50", "bg": "#E8F5E9", "border": "#2E7D32"},
    "assistant": {"label": "助手输出",     "fg": "#FF9800", "bg": "#FFF3E0", "border": "#E65100"},
    "reasoning": {"label": "推理过程",     "fg": "#FFC107", "bg": "#FFF8E1", "border": "#F57F17"},
    "text":      {"label": "通用文本",     "fg": "#009688", "bg": "#E0F2F1", "border": "#00695C"},
    "tool":      {"label": "工具调用",     "fg": "#F44336", "bg": "#FFEBEE", "border": "#C62828"},
    "approval":  {"label": "审批流程",     "fg": "#E91E63", "bg": "#FCE4EC", "border": "#AD1457"},
    "todo":      {"label": "任务清单",     "fg": "#3F51B5", "bg": "#E8EAF6", "border": "#283593"},
    "llm":       {"label": "LLM 重试",     "fg": "#FF5722", "bg": "#FBE9E7", "border": "#BF360C"},
    "command":   {"label": "命令执行",     "fg": "#795548", "bg": "#EFEBE9", "border": "#4E342E"},
    "web":       {"label": "Web 搜索",     "fg": "#673AB7", "bg": "#EDE7F6", "border": "#4527A0"},
}

# error / denied emphasis colors
ERROR_FG = "#D32F2F"
DENIED_FG = "#C62828"

# event type -> group key
TYPE_GROUP: Dict[str, str] = {
    # 组 1: 会话生命周期
    "session": "session",
    "session/title": "session",
    "session/title-llm-request": "session",
    "session/end-seed": "session",
    # 组 2: 配置与权限
    "permission/preset": "config",
    "sandbox/mode": "config",
    "approval/policy": "config",
    "request/header": "config",
    "request/context": "config",
    "agent-preset/selected": "config",
    # 组 3: 对话轮次
    "turn/start": "turn",
    "turn/end": "turn",
    # 组 4: 执行步骤
    "step/start": "step",
    "step/end": "step",
    # 组 5: 用户输入
    "user/message": "user",
    "agent/inbox/spliced": "user",
    # 组 6: 助手输出
    "assistant/message": "assistant",
    "assistant/chunk": "assistant",
    # 组 7: 推理过程
    "reasoning-chunks": "reasoning",
    # 组 8: 通用文本
    "text-chunks": "text",
    # 组 9: 工具调用
    "tool-call-chunks": "tool",
    "tool/call": "tool",
    "tool/result": "tool",
    # 组 10: 审批流程
    "approval/asked": "approval",
    "approval/decided": "approval",
    # 组 11: 任务清单
    "todo/write": "todo",
    # 组 12: LLM 重试
    "llm/retry": "llm",
    "llm/retry-started": "llm",
    # 组 13: 命令执行
    "command/run": "command",
    "command/done": "command",
    # 组 14: Web 搜索
    "web/deepseek-search-llm-request": "web",
}

GROUP_ORDER = [
    "session", "config", "turn", "step", "user", "assistant", "reasoning",
    "text", "tool", "approval", "todo", "llm", "command", "web",
]


def group_of(event_type: str) -> str:
    return TYPE_GROUP.get(event_type, "config")


def scheme_of(event_type: str) -> Dict[str, str]:
    return GROUPS[group_of(event_type)]


# ---------------------------------------------------------------------------
# Session data model
# ---------------------------------------------------------------------------


@dataclass
class SessionModel:
    """Parsed + structured representation of one decoded session file."""

    id: str = ""
    cwd: str = ""
    createdAt: Optional[int] = None
    agentPreset: str = ""
    delegationDepth: int = 0
    title: str = ""
    dirEncoded: str = ""            # decoded-sessions/<dirEncoded>/...
    filePath: str = ""              # absolute path of the decoded jsonl
    sizeBytes: int = 0
    lineCount: int = 0

    events: List[Dict[str, Any]] = field(default_factory=list)
    rawLines: List[str] = field(default_factory=list)
    seqToLine: Dict[int, int] = field(default_factory=dict)
    searchIndex: Dict[int, str] = field(default_factory=dict)

    typeCounts: Dict[str, int] = field(default_factory=dict)
    groupCounts: Dict[str, int] = field(default_factory=dict)
    durationMs: int = 0

    turns: List[Dict[str, Any]] = field(default_factory=list)      # timeline
    tools: List[Dict[str, Any]] = field(default_factory=list)      # call+result pairs
    reasoning: List[Dict[str, Any]] = field(default_factory=list)  # per step merged text
    todos: List[Dict[str, Any]] = field(default_factory=list)      # snapshots
    approvals: List[Dict[str, Any]] = field(default_factory=list)  # asked+decided pairs
    tokens: List[Dict[str, Any]] = field(default_factory=list)     # per assistant/message
    tokenTotals: Dict[str, int] = field(default_factory=dict)

    def start_time(self) -> Optional[int]:
        return self.events[0].get("time") if self.events else None

    def end_time(self) -> Optional[int]:
        return self.events[-1].get("time") if self.events else None
