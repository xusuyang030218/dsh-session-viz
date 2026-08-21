import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { zstdDecompressSync } from "node:zlib";
//#region src/host/parser.ts
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
const GROUPS = {
	session: {
		label: "会话生命周期",
		fg: "#9C27B0",
		bg: "#F3E5F5",
		border: "#7B1FA2"
	},
	config: {
		label: "配置与权限",
		fg: "#607D8B",
		bg: "#ECEFF1",
		border: "#455A64"
	},
	turn: {
		label: "对话轮次",
		fg: "#2196F3",
		bg: "#E3F2FD",
		border: "#1565C0"
	},
	step: {
		label: "执行步骤",
		fg: "#00BCD4",
		bg: "#E0F7FA",
		border: "#00838F"
	},
	user: {
		label: "用户输入",
		fg: "#4CAF50",
		bg: "#E8F5E9",
		border: "#2E7D32"
	},
	assistant: {
		label: "助手输出",
		fg: "#FF9800",
		bg: "#FFF3E0",
		border: "#E65100"
	},
	reasoning: {
		label: "推理过程",
		fg: "#FFC107",
		bg: "#FFF8E1",
		border: "#F57F17"
	},
	text: {
		label: "通用文本",
		fg: "#009688",
		bg: "#E0F2F1",
		border: "#00695C"
	},
	tool: {
		label: "工具调用",
		fg: "#F44336",
		bg: "#FFEBEE",
		border: "#C62828"
	},
	approval: {
		label: "审批流程",
		fg: "#E91E63",
		bg: "#FCE4EC",
		border: "#AD1457"
	},
	todo: {
		label: "任务清单",
		fg: "#3F51B5",
		bg: "#E8EAF6",
		border: "#283593"
	},
	llm: {
		label: "LLM 重试",
		fg: "#FF5722",
		bg: "#FBE9E7",
		border: "#BF360C"
	},
	command: {
		label: "命令执行",
		fg: "#795548",
		bg: "#EFEBE9",
		border: "#4E342E"
	},
	web: {
		label: "Web 搜索",
		fg: "#673AB7",
		bg: "#EDE7F6",
		border: "#4527A0"
	}
};
const GROUP_ORDER = [
	"session",
	"config",
	"turn",
	"step",
	"user",
	"assistant",
	"reasoning",
	"text",
	"tool",
	"approval",
	"todo",
	"llm",
	"command",
	"web"
];
const TYPE_GROUP = {
	"session": "session",
	"session/title": "session",
	"session/title-llm-request": "session",
	"session/end-seed": "session",
	"permission/preset": "config",
	"sandbox/mode": "config",
	"approval/policy": "config",
	"request/header": "config",
	"request/context": "config",
	"agent-preset/selected": "config",
	"turn/start": "turn",
	"turn/end": "turn",
	"step/start": "step",
	"step/end": "step",
	"user/message": "user",
	"agent/inbox/spliced": "user",
	"assistant/message": "assistant",
	"assistant/chunk": "assistant",
	"reasoning-chunks": "reasoning",
	"text-chunks": "text",
	"tool-call-chunks": "tool",
	"tool/call": "tool",
	"tool/result": "tool",
	"approval/asked": "approval",
	"approval/decided": "approval",
	"todo/write": "todo",
	"llm/retry": "llm",
	"llm/retry-started": "llm",
	"command/run": "command",
	"command/done": "command",
	"web/deepseek-search-llm-request": "web"
};
function groupOf(type) {
	return TYPE_GROUP[type] ?? "config";
}
const MAX_SUMMARY = 300;
const ZSTD_MAGIC = 4247762216;
/** 扫描完整 zstd 帧范围（移植自 dsh-session-persistence-jsonl）。 */
function scanZstdFrames(buffer) {
	const frames = [];
	let offset = 0;
	while (offset < buffer.length) {
		const start = offset;
		if (buffer.length - offset < 4) break;
		if (buffer.readUInt32LE(offset) !== ZSTD_MAGIC) break;
		offset += 4;
		if (offset === buffer.length) break;
		const descriptor = buffer.readUInt8(offset);
		offset += 1;
		if ((descriptor & 24) !== 0) break;
		const contentSizeFlag = descriptor >>> 6;
		const singleSegment = (descriptor & 32) !== 0;
		const checksum = (descriptor & 4) !== 0;
		const dictionaryFlag = descriptor & 3;
		const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag;
		const contentSizeBytes = contentSizeFlag === 0 ? singleSegment ? 1 : 0 : 1 << contentSizeFlag;
		const remainingHeaderBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
		if (buffer.length - offset < remainingHeaderBytes) break;
		offset += remainingHeaderBytes;
		for (;;) {
			if (buffer.length - offset < 3) return frames;
			const blockHeader = buffer.readUIntLE(offset, 3);
			offset += 3;
			const lastBlock = (blockHeader & 1) !== 0;
			const blockType = blockHeader >>> 1 & 3;
			const blockSize = blockHeader >>> 3;
			if (blockType === 3) return frames;
			const payloadBytes = blockType === 1 ? 1 : blockSize;
			if (buffer.length - offset < payloadBytes) return frames;
			offset += payloadBytes;
			if (lastBlock) break;
		}
		if (checksum) {
			if (buffer.length - offset < 4) return frames;
			offset += 4;
		}
		frames.push({
			start,
			end: offset
		});
	}
	return frames;
}
/** 解码整份会话文件：逐帧 zstdDecompressSync，容忍尾部未完成帧。 */
function decompressSessionLog(buffer) {
	const frames = scanZstdFrames(buffer);
	if (frames.length === 0) return buffer.toString("utf8");
	const parts = [];
	for (const { start, end } of frames) try {
		parts.push(zstdDecompressSync(buffer.subarray(start, end)).toString("utf8"));
	} catch {}
	return parts.join("");
}
function encodeSegment(raw) {
	let out = "";
	for (let i = 0; i < raw.length; i++) {
		const code = raw.charCodeAt(i);
		const ch = String.fromCharCode(code);
		if (ch !== "~" && /^[A-Za-z0-9._-]$/.test(ch)) out += ch;
		else out += "~" + code.toString(16).toUpperCase().padStart(4, "0");
	}
	return out;
}
/** 按 session id 在 sessionsRoot 下搜索（id 编码后作为目录名）。 */
async function findSessionDir(sessionsRoot, sessionId) {
	const encoded = encodeSegment(sessionId);
	const projects = await readdir(sessionsRoot, { withFileTypes: true }).catch(() => []);
	for (const proj of projects) {
		if (!proj.isDirectory()) continue;
		const full = join(sessionsRoot, proj.name, encoded);
		const entries = await readdir(full, { withFileTypes: true }).catch(() => null);
		if (entries === null) continue;
		for (const e of entries) if (e.isFile() && (e.name === "session.jsonl.zstd" || e.name === "session.jsonl")) return join(full, e.name);
	}
	return null;
}
function clip(text, n = MAX_SUMMARY) {
	const str = String(text ?? "").trim();
	return str.length > n ? str.slice(0, n) + "…" : str;
}
function contentText(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts = [];
	for (const part of content) {
		if (!part || typeof part !== "object") continue;
		const p = part;
		const pt = p.type;
		if ((pt === "text" || pt === "reasoning") && typeof p.text === "string") parts.push(p.text);
		else if (pt === "tool-result") {
			const sub = contentText(p.content);
			if (sub) parts.push(sub);
		}
	}
	return parts.join("\n");
}
function toolResultText(d) {
	return contentText((d.message ?? {}).content);
}
function summarize(o) {
	const t = o.type ?? "?";
	const d = o.data ?? {};
	try {
		switch (t) {
			case "session": return `cwd=${d.cwd ?? o.cwd}, agentPreset=${d.agentPreset ?? o.agentPreset}`;
			case "session/title": return clip(d.title);
			case "session/title-llm-request": return clip(`titleProvider=${d.titleProvider}, maxTokens=${d.maxTokens}`);
			case "session/end-seed": return "session end seed";
			case "permission/preset": return `preset=${d.preset}`;
			case "sandbox/mode": return `mode=${d.mode}`;
			case "approval/policy": return `policy=${d.policy}`;
			case "request/header": {
				const hdr = d.header ?? {};
				return `reason=${d.reason}, ${hdr.tools?.length ?? 0} tools registered`;
			}
			case "request/context": return `${d.provider} / ${d.model} (contextWindow=${d.contextWindow})`;
			case "agent-preset/selected": return `agentPreset=${d.agentPreset}`;
			case "turn/start": return `turn ${d.turn}`;
			case "turn/end": {
				const reason = d.reason ?? {};
				if (reason.kind === "error") {
					const err = reason.error ?? {};
					return clip(`turn ${d.turn} ERROR: ${err.message ?? ""}`);
				}
				return `turn ${d.turn} completed`;
			}
			case "step/start": return `turn ${d.turn} step ${d.step}`;
			case "step/end": return `turn ${d.turn} step ${d.step}`;
			case "user/message": return clip(contentText(d.content));
			case "agent/inbox/spliced": return clip((d.inserted ?? []).map((m) => contentText(m?.content)).filter(Boolean).join(" | "));
			case "assistant/message": {
				const usage = d.usage ?? {};
				return clip(contentText((d.message ?? {}).content) || "(no text)") + ` [tokens in=${usage.inputTokens ?? 0} out=${usage.outputTokens ?? 0}]`;
			}
			case "assistant/chunk": {
				const chunk = d.chunk ?? {};
				const reason = chunk.reason;
				if (reason && typeof reason === "object" && reason.kind === "error") return clip(`chunk error: ${(reason.failure ?? {}).message ?? ""}`);
				return `chunk type=${chunk.type}`;
			}
			case "reasoning-chunks":
			case "text-chunks": {
				const texts = d.texts ?? [];
				const dt = d.dt ?? [];
				return `${texts.length} chunks, ${texts.reduce((a, x) => a + x.length, 0)} chars, ${dt.reduce((a, x) => a + x, 0)}ms`;
			}
			case "tool-call-chunks": return clip(`${d.name} ${d.id} streaming ${d.args?.length ?? 0} parts`);
			case "tool/call": return clip(`${d.name}(${d.arguments ?? ""})`);
			case "tool/result": {
				if (d.error) return clip(`ERROR: ${typeof d.error === "string" ? d.error : JSON.stringify(d.error)}`);
				const txt = toolResultText(d);
				const meta = d.meta;
				return meta ? clip(txt) + `  [meta: ${JSON.stringify(meta).slice(0, 80)}]` : clip(txt);
			}
			case "approval/asked": return clip(`${d.toolName} — ${d.reason ?? ""}`);
			case "approval/decided": return `outcome=${d.outcome}`;
			case "todo/write": return `${d.todos?.length ?? 0} todos`;
			case "llm/retry": return clip(`retry ${d.retry}/${d.maxRetries} — ${d.failure}`);
			case "llm/retry-started": return `retry ${d.retry} started`;
			case "command/run": return clip(`${d.name}${d.args ?? ""} (cmd ${d.commandId})`);
			case "command/done": return clip(`${d.kind}: ${d.text ?? ""}`);
			case "web/deepseek-search-llm-request": return clip(`endpoint=${d.endpoint}, apiVersion=${d.apiVersion}`);
		}
	} catch {}
	return `(${t})`;
}
/** 解析一行 → 轻量事件视图。 */
function parseLine(raw, lineIdx) {
	let o = null;
	try {
		o = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!o || typeof o !== "object") return null;
	const t = o.type ?? "?";
	const d = o.data ?? {};
	const ev = {
		line: lineIdx,
		seq: o.seq ?? o.seq0 ?? null,
		type: t,
		time: o.time ?? o.time0 ?? null,
		group: groupOf(t),
		summary: summarize(o)
	};
	if (t === "tool/result") ev.error = Boolean(d.error);
	else if (t === "turn/end") ev.error = (d.reason ?? {}).kind === "error";
	else if (t === "assistant/message") ev.tokens = d.usage ?? null;
	return ev;
}
/** 解析整份日志文本 → ParsedSession。 */
function parseLogText(text) {
	const lines = text.split("\n");
	const events = [];
	const meta = {
		title: null,
		cwd: null,
		createdAt: null,
		agentPreset: null,
		delegationDepth: null,
		eventCount: 0,
		startTime: null,
		endTime: null,
		durationMs: 0
	};
	const typeCounts = {};
	const groupCounts = {};
	const search = /* @__PURE__ */ new Map();
	let startTime = null;
	let endTime = null;
	for (let i = 0; i < lines.length; i++) {
		const raw = lines[i]?.trim() ?? "";
		if (!raw) continue;
		const o = JSON.parse(raw);
		if (!o) continue;
		const ev = parseLine(raw, i);
		if (!ev) continue;
		events.push(ev);
		typeCounts[ev.type] = (typeCounts[ev.type] ?? 0) + 1;
		groupCounts[ev.group] = (groupCounts[ev.group] ?? 0) + 1;
		const d = o.data ?? {};
		if (ev.type === "reasoning-chunks" || ev.type === "text-chunks") {
			const joined = (d.texts ?? []).join("");
			if (joined) search.set(i, joined);
		} else if (ev.type === "tool/call") search.set(i, `${d.name ?? ""} ${d.arguments ?? ""}`);
		else if (ev.type === "tool/result") {
			const txt = toolResultText(d);
			if (txt) search.set(i, txt);
		} else if (ev.type === "user/message" || ev.type === "assistant/message") {
			const txt = contentText((d.message ?? {}).content);
			if (txt) search.set(i, txt);
		} else if (ev.type === "todo/write") search.set(i, (d.todos ?? []).map((x) => x.content ?? "").join(" "));
		else if (ev.type === "approval/asked") search.set(i, `${d.toolName ?? ""} ${d.reason ?? ""}`);
		if (ev.type === "session" && ev.seq == null) {
			meta.cwd = o.cwd;
			meta.createdAt = o.createdAt;
			meta.agentPreset = o.agentPreset;
			meta.delegationDepth = o.delegationDepth;
		} else if (ev.type === "session/title" && meta.title == null) meta.title = d.title;
		if (ev.time != null) {
			if (startTime == null || ev.time < startTime) startTime = ev.time;
			if (endTime == null || ev.time > endTime) endTime = ev.time;
		}
	}
	meta.eventCount = events.length;
	meta.startTime = startTime;
	meta.endTime = endTime;
	meta.durationMs = startTime != null && endTime != null ? Math.max(0, endTime - startTime) : 0;
	return {
		meta,
		events,
		typeCounts,
		groupCounts,
		search
	};
}
/** 读取 + 解码 + 解析一个会话（整文件缓存由调用方负责）。 */
async function loadAndParseSession(sessionsRoot, sessionId) {
	const path = await findSessionDir(sessionsRoot, sessionId);
	if (!path) throw new Error(`session log not found: ${sessionId}`);
	return {
		path,
		...parseLogText(decompressSessionLog(await readFile(path)))
	};
}
//#endregion
//#region src/host/narrative.ts
/**
* dsh-session-viz 叙述转换层（TypeScript 版）
*
* 原始事件 → 三层渐进式数据：
*   summary: 执行摘要卡片（面向所有人，无技术术语）
*   story:   执行故事线（面向管理者，叙事式 turn→step）
*   tree:    技术事件树（面向开发者，turn→step→合并事件组）
*
* 转换规则：
*   1. 合并 chunks：同一步内 reasoning-chunks / text-chunks / tool-call-chunks /
*      assistant/chunk 合并为可展开节点（字段差异：texts[] / args[] / chunk 块标记）
*   2. 配对事件：tool/call+tool/result、approval/asked+approval/decided
*   3. 人类语言映射：read→📖读取, write→✏️写入, grep→🔍搜索, pwsh→⚙️执行命令…
*   4. 摘要生成：推理取首句/前 100 字；工具结果提取行数/大小/成败
*   5. 文件变更提取：从 write/edit 工具 + result meta 收集
*   6. 审批故事化：原因简化为人类可读文本
*/
const TOOL_HUMAN = {
	read: {
		icon: "📖",
		verb: "读取了"
	},
	write: {
		icon: "✏️",
		verb: "写入了"
	},
	edit: {
		icon: "✏️",
		verb: "编辑了"
	},
	glob: {
		icon: "🔍",
		verb: "搜索了文件"
	},
	grep: {
		icon: "🔍",
		verb: "搜索了关键词"
	},
	rg: {
		icon: "🔍",
		verb: "搜索了关键词"
	},
	pwsh: {
		icon: "⚙️",
		verb: "执行了命令"
	},
	bash: {
		icon: "⚙️",
		verb: "执行了命令"
	},
	dsh: {
		icon: "⚙️",
		verb: "执行了命令"
	},
	web_search: {
		icon: "🌐",
		verb: "搜索了网页"
	},
	todo_write: {
		icon: "📋",
		verb: "更新了任务清单"
	},
	skill: {
		icon: "📚",
		verb: "加载了技能"
	},
	subagent: {
		icon: "🧩",
		verb: "派发了子任务"
	},
	ask_user_question: {
		icon: "❓",
		verb: "询问了用户"
	},
	import_document: {
		icon: "📄",
		verb: "导入了文档"
	},
	recommend_plugins: {
		icon: "⭐",
		verb: "推荐了插件"
	},
	search_plugins: {
		icon: "🔎",
		verb: "搜索了插件"
	},
	rank_plugins: {
		icon: "🏆",
		verb: "查询了插件榜"
	},
	trend_plugins: {
		icon: "📈",
		verb: "查询了插件趋势"
	},
	sync_registry: {
		icon: "🔄",
		verb: "同步了插件数据"
	},
	sandbox_start: {
		icon: "🧪",
		verb: "启动了沙盒"
	},
	sandbox_list: {
		icon: "🧪",
		verb: "列出了沙盒"
	},
	sandbox_stop: {
		icon: "🧪",
		verb: "停止了沙盒"
	},
	sandbox_destroy: {
		icon: "🧪",
		verb: "销毁了沙盒"
	},
	sandbox_logs: {
		icon: "🧪",
		verb: "查看了沙盒日志"
	},
	sandbox_build: {
		icon: "🧪",
		verb: "构建了沙盒插件"
	},
	code_workbench: {
		icon: "💻",
		verb: "操作了代码工作台"
	}
};
function humanTool(name) {
	return TOOL_HUMAN[name] ?? {
		icon: "🛠️",
		verb: `调用了 ${name}`
	};
}
/** 工具调用 → 人类语言句子。 */
function toolSentence(toolName, argsObj) {
	const h = humanTool(toolName);
	if (!argsObj || typeof argsObj !== "object") return `${h.icon} ${h.verb}`;
	const file = argsObj.file_path ?? argsObj.path ?? null;
	const pattern = argsObj.pattern ?? null;
	const cmd = argsObj.command ?? null;
	if (file) return `${h.icon} ${h.verb} ${String(file)}`;
	if (pattern) return `${h.icon} ${h.verb} "${String(pattern).slice(0, 40)}"`;
	if (cmd) return `${h.icon} ${h.verb}: ${String(cmd).slice(0, 60)}`;
	const argName = argsObj.name ?? null;
	if (argName) return `${h.icon} ${h.verb} ${String(argName)}`;
	return `${h.icon} ${h.verb}`;
}
/** 工具结果 → 人类语言摘要。 */
function resultSentence(name, data) {
	const d = data ?? {};
	if (d.error) return `❌ 失败：${typeof d.error === "string" ? d.error.slice(0, 60) : "工具错误"}`;
	const meta = d.meta ?? {};
	const parts = [];
	if (meta.totalLines != null) parts.push(`${meta.totalLines} 行`);
	if (meta.path && (name === "read" || name === "write" || name === "edit")) parts.push(String(meta.path));
	if (parts.length) return `✅ ${parts.join(" · ")}`;
	const msg = (d.message ?? {}).content ?? [];
	for (const p of msg) if (p?.type === "text" && typeof p.text === "string") {
		const t = p.text.trim().replace(/\s+/g, " ");
		return t.length > 60 ? t.slice(0, 60) + "…" : t;
	}
	return "✅ 完成";
}
/** 审批原因 → 人类语言。 */
function approvalSentence(data) {
	const d = data ?? {};
	const tool = d.toolName ?? "工具";
	const reason = String(d.reason ?? "").trim();
	if (!reason) return `请求调用 ${tool}`;
	const r = reason.replace(/^escalate sandbox to \S+:?\s*/i, "");
	return `请求调用 ${tool}：${r.length > 80 ? r.slice(0, 80) + "…" : r}`;
}
const MODEL_LABELS = {
	"deepseek-v4-flash": "DeepSeek V4 Flash",
	"deepseek-v3.2": "DeepSeek V3.2"
};
function modelLabel(model) {
	return MODEL_LABELS[String(model)] ?? (model ? String(model) : "—");
}
const CHUNK_GROUP = {
	"reasoning-chunks": {
		kind: "reasoning",
		label: "推理过程",
		fg: "#FFC107",
		bg: "#FFF8E1"
	},
	"text-chunks": {
		kind: "text",
		label: "文本输出",
		fg: "#009688",
		bg: "#E0F2F1"
	},
	"tool-call-chunks": {
		kind: "tool-call",
		label: "工具调用流",
		fg: "#F44336",
		bg: "#FFEBEE"
	},
	"assistant/chunk": {
		kind: "assistant",
		label: "助手输出",
		fg: "#FF9800",
		bg: "#FFF3E0"
	}
};
/** 折叠树：turn → step → (合并组 + 独立事件)。 */
function buildTree(lines, objs) {
	const turns = [];
	let curTurn = null;
	let curStep = null;
	let acc = null;
	function closeGroup() {
		if (!acc) return;
		if (acc.count > 0) {
			const joined = acc.texts.join("");
			const clean = joined.replace(/\s+/g, " ").trim();
			const preview = clean ? clean.length > 100 ? clean.slice(0, 100) + "…" : clean : acc.kind === "assistant" ? `${acc.count} 个流式块标记` : acc.kind === "tool-call" ? `${acc.count} 个参数分片` : `${acc.count} 个分片`;
			const group = {
				kind: acc.kind,
				label: acc.label,
				fg: acc.fg,
				bg: acc.bg,
				count: acc.count,
				chars: acc.chars,
				preview,
				text: joined,
				durationMs: acc.dt.reduce((a, b) => a + b, 0),
				startLine: acc.startLine,
				endLine: acc.endLine
			};
			if (curStep) curStep.groups.push(group);
		}
		acc = null;
	}
	for (let i = 0; i < objs.length; i++) {
		const o = objs[i];
		if (!o) continue;
		const t = o.type ?? "?";
		const d = o.data ?? {};
		if (t === "turn/start") {
			curTurn = {
				turn: d.turn,
				startTime: o.time ?? null,
				startLine: i,
				eventCount: 0,
				steps: [],
				groups: []
			};
			turns.push(curTurn);
			curStep = null;
			continue;
		}
		if (t === "turn/end") {
			if (curTurn) {
				curTurn.endTime = o.time ?? null;
				curTurn.endLine = i;
			}
			curTurn = null;
			continue;
		}
		if (t === "step/start") {
			closeGroup();
			if (curTurn) {
				curStep = {
					turn: d.turn,
					step: d.step,
					startTime: o.time ?? null,
					startLine: i,
					eventCount: 0,
					groups: [],
					tools: []
				};
				curTurn.steps.push(curStep);
			}
			continue;
		}
		if (t === "step/end") {
			closeGroup();
			if (curStep) {
				curStep.endTime = o.time ?? null;
				curStep.endLine = i;
			}
			curStep = null;
			continue;
		}
		const host = curStep ?? curTurn;
		if (!host) continue;
		host.eventCount++;
		if (curTurn) curTurn.eventCount++;
		const cg = CHUNK_GROUP[t];
		if (cg && curStep) {
			if (!acc || acc.kind !== cg.kind) {
				closeGroup();
				acc = {
					...cg,
					count: 0,
					chars: 0,
					dt: [],
					texts: [],
					startLine: i,
					endLine: i
				};
			}
			const texts = d.texts ?? [];
			const dt = d.dt ?? [];
			acc.count += 1;
			acc.dt.push(...dt);
			if (t === "tool-call-chunks") {
				const argText = (d.args ?? []).join("");
				if (argText) {
					acc.texts.push(argText);
					acc.chars += argText.length;
				}
			} else if (t === "assistant/chunk") {
				const chunk = d.chunk ?? {};
				const blockType = chunk.blockType ?? chunk.type ?? "";
				acc.texts.push(blockType ? `[${blockType}]` : "[流式块]");
				acc.chars += blockType.length + 2;
			} else {
				acc.chars += texts.reduce((a, x) => a + x.length, 0);
				acc.texts.push(...texts);
			}
			acc.endLine = i;
			continue;
		}
		const item = {
			line: i,
			seq: o.seq ?? o.seq0 ?? null,
			time: o.time ?? o.time0 ?? null,
			type: t,
			group: groupOf(t),
			summary: summarizeType(o),
			error: t === "tool/result" ? Boolean(d.error) : t === "turn/end" ? (d.reason ?? {}).kind === "error" : false
		};
		if (t === "tool/call") {
			let argsObj = null;
			try {
				argsObj = JSON.parse(String(d.arguments ?? "{}"));
			} catch {
				argsObj = null;
			}
			item.human = toolSentence(d.name, argsObj);
			item.toolName = d.name;
			if (curStep) curStep.tools.push(d.name);
		}
		if (t === "tool/result") item.human = resultSentence(item.toolName ?? null, d);
		if (t === "approval/asked") item.human = approvalSentence(d);
		if (t === "approval/decided") {
			item.outcome = d.outcome;
			item.human = d.outcome === "allowed-once" ? "✅ 允许一次" : d.outcome === "allowed-always" ? "✅ 始终允许" : d.outcome === "denied" ? "❌ 已拒绝" : `决策 ${d.outcome ?? "?"}`;
		}
		if (t === "assistant/message") {
			const usage = d.usage ?? {};
			item.human = `输出 ${usage.outputTokens ?? 0} tokens · 输入 ${usage.inputTokens ?? 0}`;
		}
		host.groups.push({
			kind: "event",
			events: [item]
		});
	}
	closeGroup();
	return turns;
}
function contentTextOf(content) {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content.map((p) => {
		const part = p;
		return part.text ?? `[${part.type ?? "?"}]`;
	}).filter(Boolean).join(" ");
}
function pathFromArgs(argsStr) {
	try {
		const a = JSON.parse(String(argsStr ?? "{}"));
		return a.file_path ?? a.path ?? null;
	} catch {
		return null;
	}
}
function buildSummary(lines, objs, meta, typeCounts) {
	const summary = {
		title: meta.title ?? null,
		userRequest: null,
		turnCount: 0,
		stepCount: 0,
		durationMs: meta.durationMs ?? 0,
		startTime: meta.startTime ?? null,
		endTime: meta.endTime ?? null,
		model: null,
		toolStats: {},
		approvalStats: {
			total: 0,
			allowed: 0,
			denied: 0,
			pending: 0
		},
		files: [],
		tokens: {
			inputTokens: 0,
			outputTokens: 0,
			cacheReadTokens: 0,
			reasoningTokens: 0
		},
		eventCount: typeCounts ? Object.values(typeCounts).reduce((a, b) => a + b, 0) : objs.length,
		openApprovals: 0
	};
	const pendingApproval = /* @__PURE__ */ new Map();
	const toolCalls = [];
	let firstUserMsg = null;
	for (const o of objs) {
		if (!o) continue;
		const t = o.type ?? "?";
		const d = o.data ?? {};
		if (t === "turn/start") summary.turnCount++;
		else if (t === "step/start") summary.stepCount++;
		else if (t === "user/message") {
			if (!firstUserMsg) {
				firstUserMsg = (d.content ?? []).map((p) => p.text ?? `[${p.type}]`).filter(Boolean).join(" ").trim();
				summary.userRequest = firstUserMsg.slice(0, 200);
			}
		} else if (t === "assistant/message") {
			const u = d.usage ?? {};
			summary.tokens.inputTokens += u.inputTokens ?? 0;
			summary.tokens.outputTokens += u.outputTokens ?? 0;
			summary.tokens.cacheReadTokens += u.cacheReadTokens ?? 0;
			summary.tokens.reasoningTokens += u.reasoningTokens ?? 0;
		} else if (t === "request/context" && !summary.model) summary.model = modelLabel(d.model);
		else if (t === "tool/call") toolCalls.push({
			callId: d.callId,
			name: d.name,
			args: d.arguments
		});
		else if (t === "approval/asked") pendingApproval.set(d.id, {
			toolName: d.toolName,
			time: o.time ?? null
		});
		else if (t === "approval/decided") {
			summary.approvalStats.total++;
			if (d.outcome === "denied") summary.approvalStats.denied++;
			else summary.approvalStats.allowed++;
			pendingApproval.delete(d.id);
		} else if (t === "tool/result") {
			const src = (d.message ?? {}).source?.callId ?? null;
			const metaObj = d.meta ?? {};
			const isError = Boolean(d.error);
			const tc = toolCalls.find((c) => c.callId === src);
			const name = tc?.name ?? null;
			const path = metaObj.path ?? (tc ? pathFromArgs(tc.args) : null);
			if (path && (name === "write" || name === "edit")) summary.files.push({
				path,
				action: metaObj.created ? "created" : "modified",
				time: o.time ?? null,
				lines: metaObj.totalLines ?? null,
				error: isError
			});
			if (src) {
				const idx = toolCalls.findIndex((c) => c.callId === src);
				if (idx >= 0) toolCalls.splice(idx, 1);
			}
		}
	}
	for (const o of objs) {
		if (o?.type !== "tool/call") continue;
		const name = (o.data ?? {}).name;
		if (!name) continue;
		if (!summary.toolStats[name]) {
			const h = humanTool(name);
			summary.toolStats[name] = {
				icon: h.icon,
				verb: h.verb,
				count: 0
			};
		}
		summary.toolStats[name].count++;
	}
	summary.toolStats = Object.fromEntries(Object.entries(summary.toolStats).sort((a, b) => b[1].count - a[1].count));
	summary.approvalStats.pending = pendingApproval.size;
	return summary;
}
function sentenceOf(text) {
	const t = String(text ?? "").replace(/\s+/g, " ").trim();
	if (!t) return "";
	const s = t.match(/^(.+?[.!?。！？])/)?.[1] ?? t;
	return s.length > 100 ? s.slice(0, 100) + "…" : s;
}
function buildStory(lines, objs) {
	const turns = [];
	let cur = null;
	let stepBuf = null;
	function flushStep() {
		if (!stepBuf || !cur) return;
		if (stepBuf.reasoning) stepBuf.nodes.push({
			kind: "reasoning",
			time: stepBuf.reasoningStart,
			text: stepBuf.reasoning,
			human: `AI 推理：${sentenceOf(stepBuf.reasoning)}`,
			turn: cur.turn,
			step: stepBuf.step
		});
		stepBuf.nodes.push(...stepBuf.toolNodes);
		stepBuf.nodes.push(...stepBuf.approvalNodes);
		if (stepBuf.assistantText) stepBuf.nodes.push({
			kind: "assistant",
			time: stepBuf.assistantTime,
			text: stepBuf.assistantText,
			human: sentenceOf(stepBuf.assistantText),
			turn: cur.turn,
			step: stepBuf.step
		});
		cur.nodes.push(...stepBuf.nodes);
		stepBuf = null;
	}
	for (const o of objs) {
		if (!o) continue;
		const t = o.type ?? "?";
		const d = o.data ?? {};
		if (t === "turn/start") {
			cur = {
				turn: d.turn,
				startTime: o.time ?? null,
				nodes: [],
				eventCount: 0
			};
			turns.push(cur);
			continue;
		}
		if (t === "turn/end") {
			flushStep();
			cur = null;
			continue;
		}
		if (t === "step/start") {
			flushStep();
			stepBuf = {
				step: d.step,
				nodes: [],
				reasoning: null,
				reasoningStart: null,
				toolNodes: [],
				approvalNodes: [],
				assistantText: null,
				assistantTime: null
			};
			continue;
		}
		if (t === "step/end") {
			flushStep();
			continue;
		}
		if (!cur || !stepBuf) continue;
		if (t === "user/message") stepBuf.nodes.push({
			kind: "user",
			time: o.time ?? null,
			text: contentTextOf(d.content),
			human: "用户发送需求",
			turn: cur.turn,
			step: stepBuf.step
		});
		else if (t === "reasoning-chunks" || t === "text-chunks") {
			const texts = d.texts ?? [];
			stepBuf.reasoning = (stepBuf.reasoning ?? "") + texts.join("");
			if (stepBuf.reasoningStart == null) stepBuf.reasoningStart = o.time ?? null;
		} else if (t === "tool/call") {
			let argsObj = null;
			try {
				argsObj = JSON.parse(String(d.arguments ?? "{}"));
			} catch {
				argsObj = null;
			}
			stepBuf.toolNodes.push({
				kind: "tool",
				time: o.time ?? null,
				name: d.name,
				human: toolSentence(d.name, argsObj),
				callId: d.callId,
				args: d.arguments,
				turn: cur.turn,
				step: stepBuf.step
			});
		} else if (t === "tool/result") {
			const src = (d.message ?? {}).source?.callId ?? null;
			const node = stepBuf.toolNodes.find((n) => n.callId === src);
			if (node) {
				node.result = resultSentence(node.name ?? null, d);
				node.resultError = Boolean(d.error);
			}
		} else if (t === "approval/asked") stepBuf.approvalNodes.push({
			kind: "approval",
			time: o.time ?? null,
			id: d.id,
			human: approvalSentence(d),
			toolName: d.toolName,
			turn: cur.turn,
			step: stepBuf.step
		});
		else if (t === "approval/decided") {
			const node = stepBuf.approvalNodes.find((n) => n.id === d.id);
			if (node) {
				node.outcome = d.outcome;
				node.outcomeHuman = d.outcome === "allowed-once" ? "✅ 已批准（一次）" : d.outcome === "allowed-always" ? "✅ 已批准（始终）" : d.outcome === "denied" ? "❌ 已拒绝" : d.outcome ?? "?";
			}
		} else if (t === "assistant/message") {
			const texts = ((d.message ?? {}).content ?? []).filter((p) => p.type === "text").map((p) => p.text).filter(Boolean);
			stepBuf.assistantText = texts.join(" ");
			stepBuf.assistantTime = o.time ?? null;
		}
	}
	flushStep();
	for (const tr of turns) tr.eventCount = tr.nodes.length;
	return turns;
}
function summarizeType(o) {
	const t = o.type ?? "?";
	const d = o.data ?? {};
	switch (t) {
		case "session": return `cwd=${o.cwd ?? d.cwd}, preset=${o.agentPreset ?? d.agentPreset ?? "?"}`;
		case "session/title": return `标题：${d.title ?? ""}`;
		case "session/end-seed": return "会话结束标记";
		case "user/message": return contentTextOf(d.content);
		case "assistant/message": return (((d.message ?? {}).content ?? []).filter((p) => p.type === "text").map((p) => p.text).filter(Boolean).join(" ") || "(无正文)").slice(0, 120);
		case "tool/call": {
			let argsObj = null;
			try {
				argsObj = JSON.parse(String(d.arguments ?? "{}"));
			} catch {
				argsObj = null;
			}
			const file = argsObj?.file_path ?? argsObj?.path ?? null;
			if (file) return `${d.name}(${String(file)})`;
			if (argsObj?.pattern) return `${d.name}("${String(argsObj.pattern)}")`;
			if (argsObj?.command) return `${d.name}(${String(argsObj.command).slice(0, 60)})`;
			return `${d.name}(${String(d.arguments ?? "").slice(0, 80)})`;
		}
		case "tool/result": {
			if (d.error) return `❌ ${typeof d.error === "string" ? d.error.slice(0, 80) : "工具错误"}`;
			const meta = d.meta ?? {};
			if (meta.totalLines != null) return `${meta.totalLines} 行 · ${meta.path ?? ""}`;
			return resultSentence(null, d);
		}
		case "approval/asked": return approvalSentence(d);
		case "approval/decided": return d.outcome === "allowed-once" ? "→ ✅ 允许一次" : d.outcome === "allowed-always" ? "→ ✅ 始终允许" : d.outcome === "denied" ? "→ ❌ 已拒绝" : `→ ${d.outcome ?? "?"}`;
		case "todo/write": {
			const todos = d.todos ?? [];
			const done = todos.filter((x) => x.status === "completed").length;
			const run = todos.filter((x) => x.status === "in_progress").length;
			const pend = todos.filter((x) => x.status === "pending").length;
			return `${todos.length} 项任务：[✅完成 ${done}] [🔄进行中 ${run}] [⏳待办 ${pend}]`;
		}
		case "request/context": return `${modelLabel(d.model)} / ${d.contextWindow ?? "?"} 上下文`;
		case "turn/end": {
			const reason = d.reason ?? {};
			return reason.kind === "error" ? `⚠️ 异常结束：${String(reason.error?.message ?? "").slice(0, 60)}` : "轮次完成";
		}
		case "step/start": return "步骤开始";
		case "step/end": return "步骤结束";
		case "assistant/chunk": return `流式输出分片（${(d.chunk ?? {}).type ?? ""}）`;
		case "command/run": return `${d.name}${d.args ?? ""}`;
		case "command/done": return `${d.kind}: ${String(d.text ?? "").slice(0, 80)}`;
		default: return "—";
	}
}
//#endregion
//#region src/host/web.ts
/**
* dsh-session-viz web 半（TypeScript 版）：同源 API 路由。
*
* 路由（前缀 /dsh-session-viz/api）：
*   GET /meta | /sessions | /summary | /story | /tree | /log | /line
*   POST /rescan
*/
const name = "dsh-session-viz-web";
const inject = ["webServer"];
const CACHE = /* @__PURE__ */ new Map();
const CACHE_TTL_MS = 3e4;
function json(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store"
	});
	res.end(JSON.stringify(body));
}
function parseQuery(url) {
	const params = url.searchParams;
	const get = (k) => {
		const v = params.get(k);
		return v === null || v === "" ? null : v;
	};
	return {
		sessionId: get("sessionId"),
		from: parseInt(get("from") ?? "0", 10) || 0,
		to: parseInt(get("to") ?? "-1", 10) || -1,
		line: parseInt(get("line") ?? "-1", 10) || -1,
		q: get("q") ?? ""
	};
}
async function getCached(sessionsPath, sessionId) {
	const hit = CACHE.get(sessionId);
	if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit;
	const { path, ...parsed } = await loadAndParseSession(sessionsPath, sessionId);
	const text = decompressSessionLog(await readFile(path));
	const st = await stat(path).catch(() => null);
	parsed.meta.sizeBytes = st?.size ?? null;
	const entry = {
		parsed,
		text,
		path,
		at: Date.now()
	};
	if (CACHE.size > 32) CACHE.clear();
	CACHE.set(sessionId, entry);
	return entry;
}
function rawLineAt(entry, line) {
	const lines = entry.text.split("\n");
	let idx = 0;
	for (const l of lines) {
		if (!l.trim()) continue;
		if (idx === line) return l;
		idx++;
	}
	return null;
}
function narrativeInput(entry) {
	const lines = entry.text.split("\n").filter((l) => l.trim());
	return {
		lines,
		objs: lines.map((l) => {
			try {
				return JSON.parse(l);
			} catch {
				return null;
			}
		})
	};
}
async function listSessions(sessionsPath) {
	const jobs = [];
	const projects = await readdir(sessionsPath, { withFileTypes: true }).catch(() => []);
	for (const proj of projects) {
		if (!proj.isDirectory()) continue;
		const projDir = join(sessionsPath, proj.name);
		const sessionDirs = await readdir(projDir, { withFileTypes: true }).catch(() => []);
		for (const sd of sessionDirs) {
			if (!sd.isDirectory()) continue;
			const sessionDir = join(projDir, sd.name);
			let file = null;
			for (const cand of [join(sessionDir, "session.jsonl.zstd"), join(sessionDir, "session.jsonl")]) try {
				await stat(cand);
				file = cand;
				break;
			} catch {}
			if (!file) continue;
			const id = sd.name;
			jobs.push((async () => {
				try {
					const entry = await getCached(sessionsPath, id);
					const m = entry.parsed.meta;
					return {
						id,
						dirEncoded: proj.name,
						cwd: m.cwd ?? null,
						createdAt: m.createdAt ?? null,
						title: m.title ?? null,
						lineCount: entry.parsed.events.length,
						sizeBytes: entry.parsed.sizeBytes ?? null
					};
				} catch {
					return null;
				}
			})());
		}
	}
	const results = (await Promise.all(jobs)).filter((r) => r !== null);
	results.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
	return results;
}
function apply(ctx, config) {
	const sessionsPath = config.sessionsPath ?? null;
	let listCache = {
		at: 0,
		sessions: []
	};
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/dsh-session-viz/api",
		async handler(req, res) {
			const url = new URL(req.url ?? "", "http://localhost");
			const pathname = url.pathname;
			const q = parseQuery(url);
			try {
				if (pathname === "/dsh-session-viz/api/meta" && (req.method === "GET" || req.method === "HEAD")) {
					json(res, 200, {
						groups: GROUPS,
						groupOrder: GROUP_ORDER,
						sessionsPath
					});
					return;
				}
				if (pathname === "/dsh-session-viz/api/sessions" && (req.method === "GET" || req.method === "HEAD")) {
					if (!sessionsPath) {
						json(res, 400, {
							ok: false,
							error: "sessionsPath 未配置"
						});
						return;
					}
					if (Date.now() - listCache.at > 1e4) listCache = {
						at: Date.now(),
						sessions: await listSessions(sessionsPath)
					};
					let out = listCache.sessions;
					if (q.q) {
						const ql = q.q.toLowerCase();
						out = out.filter((s) => `${s.id} ${s.cwd ?? ""} ${s.title ?? ""} ${s.dirEncoded}`.toLowerCase().includes(ql));
					}
					json(res, 200, {
						ok: true,
						sessions: out
					});
					return;
				}
				if (pathname === "/dsh-session-viz/api/log" && (req.method === "GET" || req.method === "HEAD")) {
					if (!sessionsPath || !q.sessionId) {
						json(res, 400, {
							ok: false,
							error: "sessionId 缺失"
						});
						return;
					}
					const entry = await getCached(sessionsPath, q.sessionId);
					let events = entry.parsed.events;
					let searchTotal = null;
					if (q.q) {
						const ql = q.q.toLowerCase();
						const matched = [];
						for (const ev of events) {
							const hay = (ev.summary ?? "").toLowerCase();
							const full = entry.parsed.search.get(ev.line);
							const fullHay = full ? full.toLowerCase() : "";
							if (hay.includes(ql) || fullHay.includes(ql)) matched.push(ev);
						}
						searchTotal = matched.length;
						events = matched;
					}
					const from = Math.max(0, q.from);
					const to = q.to < 0 || q.to > events.length ? events.length : q.to;
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
						events: events.slice(from, to)
					});
					return;
				}
				if (pathname === "/dsh-session-viz/api/line" && (req.method === "GET" || req.method === "HEAD")) {
					if (!sessionsPath || !q.sessionId) {
						json(res, 400, {
							ok: false,
							error: "sessionId 缺失"
						});
						return;
					}
					const entry = await getCached(sessionsPath, q.sessionId);
					const line = Math.max(0, q.line);
					const ev = entry.parsed.events.find((e) => e.line === line);
					if (!ev) {
						json(res, 404, {
							ok: false,
							error: `行 ${line} 不存在`
						});
						return;
					}
					json(res, 200, {
						ok: true,
						event: ev,
						raw: rawLineAt(entry, line)
					});
					return;
				}
				if (pathname === "/dsh-session-viz/api/summary" && (req.method === "GET" || req.method === "HEAD")) {
					if (!sessionsPath || !q.sessionId) {
						json(res, 400, {
							ok: false,
							error: "sessionId 缺失"
						});
						return;
					}
					const entry = await getCached(sessionsPath, q.sessionId);
					const { lines, objs } = narrativeInput(entry);
					json(res, 200, {
						ok: true,
						summary: buildSummary(lines, objs, entry.parsed.meta, entry.parsed.typeCounts)
					});
					return;
				}
				if (pathname === "/dsh-session-viz/api/story" && (req.method === "GET" || req.method === "HEAD")) {
					if (!sessionsPath || !q.sessionId) {
						json(res, 400, {
							ok: false,
							error: "sessionId 缺失"
						});
						return;
					}
					const { lines, objs } = narrativeInput(await getCached(sessionsPath, q.sessionId));
					json(res, 200, {
						ok: true,
						story: buildStory(lines, objs)
					});
					return;
				}
				if (pathname === "/dsh-session-viz/api/tree" && (req.method === "GET" || req.method === "HEAD")) {
					if (!sessionsPath || !q.sessionId) {
						json(res, 400, {
							ok: false,
							error: "sessionId 缺失"
						});
						return;
					}
					const entry = await getCached(sessionsPath, q.sessionId);
					const { lines, objs } = narrativeInput(entry);
					const tree = buildTree(lines, objs);
					json(res, 200, {
						ok: true,
						meta: entry.parsed.meta,
						typeCounts: entry.parsed.typeCounts,
						turns: tree
					});
					return;
				}
				if (pathname === "/dsh-session-viz/api/rescan" && (req.method === "POST" || req.method === "GET")) {
					listCache = {
						at: 0,
						sessions: []
					};
					CACHE.clear();
					json(res, 200, { ok: true });
					return;
				}
				json(res, 404, {
					ok: false,
					error: "未知路由"
				});
			} catch (error) {
				json(res, 500, {
					ok: false,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
	}), "dsh-session-viz: api routes");
}
//#endregion
export { apply, inject, name };
