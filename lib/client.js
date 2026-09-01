window.__ModuleLoader__.load({
	id: "dsh-session-viz",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region \0rolldown/runtime.js
		var __create = Object.create;
		var __defProp = Object.defineProperty;
		var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
		var __getOwnPropNames = Object.getOwnPropertyNames;
		var __getProtoOf = Object.getPrototypeOf;
		var __hasOwnProp = Object.prototype.hasOwnProperty;
		var __copyProps = (to, from, except, desc) => {
			if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
				key = keys[i];
				if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
					get: ((k) => from[k]).bind(null, key),
					enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
				});
			}
			return to;
		};
		var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
			value: mod,
			enumerable: true
		}) : target, mod));
		//#endregion
		let react = require("react");
		react = __toESM(react, 1);
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region src/client/legacy-viewer.js
		/**
		* dsh-session-viz browser 端 — v2 三层渐进式查看器
		*
		* 依据 UI_IMPROVEMENT.md + PRODUCT_REDESIGN.md 重构：
		*   ▸ 摘要视图（第一层）：执行摘要卡片，面向所有人，无技术术语
		*   ▸ 故事线（第二层）：叙事式时间线，人类语言描述工具/审批/推理
		*   ▸ 事件树（第三层）：turn → step → 合并事件组，面向开发者
		*
		* UI 改进落地点：
		*   改动1 筛选区精简为「搜索框 + 事件类型分组下拉」
		*   改动2 日志列表树形折叠（turn→step→事件组）
		*   改动3 毫秒级时间戳 + 相对时间
		*   改动4 右侧默认显示会话概览
		*   改动5 按事件类型定制预览（工具→文件名、结果→行数、todo→状态统计）
		*   改动6 chunks 同类合并为可展开节点
		*
		* 装载链：本文件不再自行调用 window.__ModuleLoader__.load，而是作为源码被
		* src/client/index.ts 引入，由 tsdown 统一打进 lib/client.js（外层 loader 包装
		* 由构建的 banner/intro/footer 注入）。React 仍由平台提供（构建标为 external）。
		* 零外部依赖：CSS 内联注入。
		*/
		let open = false;
		let openSessionId = null;
		let devMode = false;
		const listeners = /* @__PURE__ */ new Set();
		const subscribe = (fn) => {
			listeners.add(fn);
			return () => listeners.delete(fn);
		};
		const getOpen = () => open;
		const setOpen = (v, sessionId) => {
			open = v;
			if (sessionId !== void 0) openSessionId = sessionId;
			listeners.forEach((fn) => fn());
		};
		let extraModes = [];
		function registerExtraMode(mode) {
			extraModes.push(mode);
		}
		const CSS_TEXT = `
.dsvz-ov{position:fixed;inset:0;z-index:9999;background:rgba(8,10,14,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif)}
.dsvz-box{position:relative;width:min(1240px,95vw);height:min(800px,92vh);background:var(--dsw-specific-input-major,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#1e293b);transition:width .18s ease,height .18s ease,border-radius .18s ease}
.dsvz-box.dsvz-max{width:100vw;height:100vh;border-radius:0;border:none;box-shadow:none}
.dsvz-head .dsvz-ops{display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:nowrap}
.dsvz-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.05));flex-shrink:0;flex-wrap:wrap}
.dsvz-brand{display:flex;align-items:center;gap:9px;flex-shrink:0}
.dsvz-brand-icon{font-size:21px;font-weight:800;color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);text-shadow:0 0 14px rgba(37,99,235,.35)}
.dsvz-brand-text{display:flex;flex-direction:column;line-height:1.15}
.dsvz-brand-name{font-weight:800;font-size:15px;letter-spacing:-.2px;color:var(--dsw-alias-label-primary,#1e293b)}
.dsvz-brand-sub{font-size:10px;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-head .dsvz-title{display:none}
.dsvz-head .dsvz-pill{font-size:11px;background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.2);border-radius:999px;padding:1px 9px;white-space:nowrap;font-family:var(--dsw-font-mono,Consolas,monospace)}
.dsvz-head .dsvz-title-pill{max-width:320px;font-family:var(--dsw-font-family);font-weight:600;color:var(--dsw-alias-label-primary,#1e293b);background:var(--dsw-specific-input-major,#fff);border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.25))}
.dsvz-head .dsvz-spacer{flex:1}
.dsvz-head select,.dsvz-head input[type=search]{font:inherit;font-size:12px;padding:4px 9px;border-radius:7px;border:1px solid rgba(128,128,128,.3);background:var(--dsw-specific-input-major,#fff);color:inherit;outline:none}
.dsvz-head .dsvz-btn{font:inherit;font-size:12px;padding:4px 11px;border-radius:7px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;cursor:pointer}
.dsvz-head .dsvz-btn:hover{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb)}
.dsvz-head .dsvz-btn:disabled{opacity:.5;cursor:wait}
.dsvz-head .dsvz-btn.devon{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);background:rgba(37,99,235,.08);font-weight:600}
body[data-ds-dark-theme] .dsvz-head .dsvz-btn.devon{border-color:#5690fe;color:#5690fe;background:rgba(86,144,254,.14)}
.dsvz-body{flex:1;min-height:0;display:flex;overflow:hidden}

/* 模式 Tab（v3：active 用固定 accent，不再依赖会被深色主题渲染成白色的 hover 背景变量） */
.dsvz-modes{display:flex;gap:6px;padding:10px 18px 0;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.15));flex-shrink:0}
.dsvz-mode{font:inherit;font-size:13px;font-weight:600;padding:8px 20px;border:1px solid transparent;border-bottom:none;border-radius:10px 10px 0 0;background:transparent;color:var(--dsw-alias-label-secondary,#8493ab);cursor:pointer;margin-bottom:-1px;transition:color .15s,background .15s}
.dsvz-mode:hover{color:var(--dsw-alias-label-primary,#1e293b);background:rgba(128,128,128,.07)}
.dsvz-mode.active{color:#2563eb;background:var(--dsw-specific-input-major,#fff);border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.15));font-weight:700}
body[data-ds-dark-theme] .dsvz-mode.active{color:#5690fe;border-color:var(--dsw-alias-border-l2,rgba(255,255,255,.15))}
.dsvz-scroll{overflow:auto;min-height:0;flex:1}

/* ===== 摘要卡片（第一层） ===== */
.dsvz-summary{max-width:900px;margin:0 auto;padding:30px 32px}
.dsvz-sum-hero{text-align:center;padding:12px 0 26px;border-bottom:1px dashed var(--dsw-alias-border-l2,rgba(128,128,128,.22));margin-bottom:24px}
.dsvz-sum-hero .t{font-size:22px;font-weight:800;letter-spacing:-.4px}
.dsvz-sum-hero .req{margin-top:12px;font-size:13px;color:var(--dsw-alias-label-secondary,#8493ab);background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.06));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));border-radius:12px;padding:12px 16px;line-height:1.7}
.dsvz-sum-hero .stats{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}
.dsvz-stat{font-size:12.5px;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.07));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));border-radius:999px;padding:4px 14px;white-space:nowrap;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-stat b{font-weight:700;color:var(--dsw-alias-label-primary,#1e293b)}
.dsvz-sec{font-size:11px;font-weight:700;letter-spacing:.12em;color:var(--dsw-alias-label-secondary,#8493ab);margin:26px 0 12px;text-transform:uppercase;display:flex;align-items:center;gap:12px}
.dsvz-sec::after{content:'';flex:1;height:1px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.14))}
.dsvz-toolgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.dsvz-toolcard{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:12px;padding:12px 14px;display:flex;align-items:center;gap:12px;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.04));transition:border-color .15s,transform .15s,box-shadow .15s}
.dsvz-toolcard:hover{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);transform:translateY(-1px);box-shadow:0 4px 14px rgba(0,0,0,.08)}
.dsvz-toolcard .ic{font-size:22px}
.dsvz-toolcard .nm{font-size:12px;font-weight:600}
.dsvz-toolcard .cn{font-size:11px;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-toolbar{height:5px;border-radius:3px;background:rgba(128,128,128,.12);margin-top:6px;overflow:hidden}
.dsvz-toolbar i{display:block;height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);transition:width .3s}
.dsvz-approval{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.dsvz-badge{font-size:12px;font-weight:700;border-radius:999px;padding:5px 16px}
.dsvz-badge.ok{background:#e8f5e9;color:#2e7d32}
body[data-ds-dark-theme] .dsvz-badge.ok{background:rgba(63,185,80,.16);color:#3fb950}
.dsvz-badge.bad{background:#ffebee;color:#c62828}
body[data-ds-dark-theme] .dsvz-badge.bad{background:rgba(249,117,131,.16);color:#f97583}
.dsvz-files{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:12px;overflow:hidden}
.dsvz-file{display:flex;align-items:center;gap:10px;padding:10px 16px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.12));font-size:12.5px;transition:background .12s}
.dsvz-file:hover{background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.05))}
.dsvz-file:last-child{border-bottom:none}
.dsvz-file .act{font-size:10.5px;font-weight:700;border-radius:6px;padding:2px 9px;flex-shrink:0}
.dsvz-file .act.m{background:#e3f2fd;color:#1565c0}
body[data-ds-dark-theme] .dsvz-file .act.m{background:rgba(86,144,254,.16);color:#7fb0ff}
.dsvz-file .act.c{background:#e8f5e9;color:#2e7d32}
body[data-ds-dark-theme] .dsvz-file .act.c{background:rgba(63,185,80,.16);color:#3fb950}
.dsvz-file .act.e{background:#ffebee;color:#c62828}
body[data-ds-dark-theme] .dsvz-file .act.e{background:rgba(249,117,131,.16);color:#f97583}
.dsvz-file .pth{font-family:var(--dsw-font-mono,Consolas,monospace);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.dsvz-file .fchg{font-size:10px;color:var(--dsw-alias-label-secondary,#8493ab);flex-shrink:0;cursor:pointer;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));border-radius:6px;padding:1px 8px}
.dsvz-file .fchg:hover{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb)}
.dsvz-filediff{padding:10px 16px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.12));background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.03));font-size:11.5px;line-height:1.6}
.dsvz-filediff pre{font-family:var(--dsw-font-mono,Consolas,monospace);font-size:11px;margin:4px 0 0;white-space:pre-wrap;word-break:break-all;max-height:220px;overflow:auto;background:var(--dsw-specific-input-major,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.15));border-radius:8px;padding:8px 10px}
.dsvz-diff-row{font-family:var(--dsw-font-mono,Consolas,monospace);font-size:11px;line-height:1.5;margin:0;white-space:pre-wrap;word-break:break-all}
.dsvz-diff-row.del{background:rgba(220,38,38,.1);color:#c62828}
.dsvz-diff-row.add{background:rgba(46,125,50,.1);color:#2e7d32}
body[data-ds-dark-theme] .dsvz-diff-row.del{background:rgba(249,117,131,.14);color:#f97583}
body[data-ds-dark-theme] .dsvz-diff-row.add{background:rgba(63,185,80,.14);color:#3fb950}
.dsvz-tokens{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:10px}
.dsvz-tok{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:12px;padding:12px 16px;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.04))}
.dsvz-tok .lb{font-size:11px;color:var(--dsw-alias-label-secondary,#8493ab);text-transform:uppercase;letter-spacing:.06em}
.dsvz-tok .vl{font-size:19px;font-weight:800;font-variant-numeric:tabular-nums;margin-top:2px}
.dsvz-actions{display:flex;gap:12px;justify-content:center;margin-top:32px;flex-wrap:wrap}
.dsvz-cta{font:inherit;font-size:13.5px;font-weight:600;padding:10px 24px;border-radius:12px;border:1px solid transparent;background:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);color:#fff;cursor:pointer;box-shadow:0 4px 14px rgba(37,99,235,.22);transition:filter .15s,transform .15s}
.dsvz-cta:hover{filter:brightness(1.08);transform:translateY(-1px)}
.dsvz-cta.ghost{background:transparent;color:var(--dsw-alias-label-primary,#1e293b);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.3));box-shadow:none}
.dsvz-cta.ghost:hover{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);transform:none}

/* ===== 故事线（第二层） ===== */
.dsvz-story{max-width:860px;margin:0 auto;padding:22px 26px}
.dsvz-story-turn{margin-bottom:6px}
.dsvz-story-turnhead{display:flex;align-items:center;gap:10px;padding:10px 14px;cursor:pointer;border-radius:12px;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.06));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));margin-bottom:6px;transition:border-color .15s,background .15s}
.dsvz-story-turnhead:hover{background:rgba(37,99,235,.08);border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,rgba(37,99,235,.4))}
body[data-ds-dark-theme] .dsvz-story-turnhead:hover{background:rgba(86,144,254,.12)}
.dsvz-story-turnhead .tt{font-weight:800;font-size:13.5px;color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#1565c0)}
.dsvz-story-turnhead .tm{font-size:11px;color:var(--dsw-alias-label-secondary,#8493ab);margin-left:auto}
.dsvz-story-body{border-left:2px solid var(--dsw-alias-border-l2,rgba(128,128,128,.2));margin-left:20px;padding-left:22px}
.dsvz-story-node{position:relative;padding:8px 12px 8px 22px;font-size:12.5px;line-height:1.65;border-radius:8px;transition:background .12s}
.dsvz-story-node:hover{background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.05))}
.dsvz-story-node::before{content:'';position:absolute;left:-7px;top:15px;width:10px;height:10px;border-radius:50%;background:var(--dsw-specific-input-major,#fff);border:2.5px solid #8493ab}
.dsvz-story-node.user::before{border-color:#4caf50;background:#4caf50}
.dsvz-story-node.tool::before{border-color:#f44336;background:#fff}
.dsvz-story-node.approval::before{border-color:#e91e63;background:#fff}
.dsvz-story-node.reasoning::before{border-color:#ffc107;background:#ffc107}
.dsvz-story-node.assistant::before{border-color:#ff9800}
.dsvz-story-node .nt{font-size:11px;font-family:var(--dsw-font-mono,Consolas,monospace);color:var(--dsw-alias-label-dimmed,#8b95a3);margin-right:10px}
.dsvz-story-node .nh{font-weight:600}
.dsvz-story-node .nd{font-size:11.5px;color:var(--dsw-alias-label-secondary,#8493ab);margin-top:5px;white-space:pre-wrap;word-break:break-all;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.05));border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));border-radius:10px;padding:8px 12px;display:none}
.dsvz-story-node.open .nd{display:block}
.dsvz-story-node .arrow{cursor:pointer;color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);margin-left:8px;font-size:11px;user-select:none;font-weight:600}
.dsvz-story-node .res{font-size:11.5px;color:var(--dsw-alias-label-primary,#2e7d32);margin-top:3px}
.dsvz-story-node .res.err{color:var(--dsw-alias-label-primary,#c62828)}
.dsvz-story-node .outc{font-size:11.5px;font-weight:700;margin-top:3px}
.dsvz-story-node .outc.yes{color:var(--dsw-alias-label-primary,#2e7d32)}
.dsvz-story-node .outc.no{color:var(--dsw-alias-label-primary,#c62828)}

/* ===== 事件树（第三层） ===== */
.dsvz-tree{display:flex;flex:1;min-height:0}
.dsvz-left{width:48%;min-width:380px;border-right:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));display:flex;flex-direction:column;min-height:0}
.dsvz-leftbar{display:flex;align-items:center;gap:8px;padding:9px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.15));flex-shrink:0;flex-wrap:wrap}
.dsvz-leftbar input[type=search]{flex:1;min-width:130px;font:inherit;font-size:12px;padding:5px 10px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:var(--dsw-specific-input-major,#fff);color:inherit;outline:none}
.dsvz-leftbar input[type=search]:focus{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb)}
.dsvz-leftbar select{font:inherit;font-size:11.5px;padding:5px 8px;border-radius:8px;border:1px solid rgba(128,128,128,.3);background:var(--dsw-specific-input-major,#fff);color:inherit;outline:none;max-width:210px}
.dsvz-tree{flex:1;overflow:auto;min-height:0;padding:8px 6px}
.dsvz-turn{padding:5px 4px}
.dsvz-turnhead{display:flex;align-items:center;gap:9px;padding:8px 11px;border-radius:10px;cursor:pointer;border:1px solid rgba(21,101,192,.28);background:rgba(33,150,243,.06);margin-bottom:3px;transition:background .12s}
.dsvz-turnhead:hover{background:rgba(33,150,243,.1)}
body[data-ds-dark-theme] .dsvz-turnhead{background:rgba(86,144,254,.1);border-color:rgba(86,144,254,.3)}
.dsvz-turnhead .chev{transition:transform .15s;color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#1565c0);font-size:11px}
.dsvz-turnhead.open .chev{transform:rotate(90deg)}
.dsvz-turnhead .tb{font-weight:800;font-size:12px;color:#fff;background:#2196f3;border-radius:6px;padding:2px 10px;white-space:nowrap}
body[data-ds-dark-theme] .dsvz-turnhead .tb{background:#5690fe}
.dsvz-turnhead .tm{font-size:11px;color:var(--dsw-alias-label-secondary,#8493ab);margin-left:auto;white-space:nowrap}
.dsvz-stepwrap{padding:3px 0 5px 22px;border-left:2px solid rgba(0,188,212,.25);margin-left:14px}
.dsvz-step{padding:3px 0}
.dsvz-stephead{display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:8px;cursor:pointer;font-size:12px}
.dsvz-stephead:hover{background:rgba(37,99,235,.06)}
body[data-ds-dark-theme] .dsvz-stephead:hover{background:rgba(86,144,254,.1)}
.dsvz-stephead .chev{transition:transform .15s;color:#00838f;font-size:10.5px}
body[data-ds-dark-theme] .dsvz-stephead .chev{color:#4dd0e1}
.dsvz-stephead.open .chev{transform:rotate(90deg)}
.dsvz-stephead .sb{font-weight:700;font-size:11px;color:#fff;background:#00bcd4;border-radius:5px;padding:1px 9px;white-space:nowrap}
body[data-ds-dark-theme] .dsvz-stephead .sb{background:#26c6da}
.dsvz-stephead .sm{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8493ab);margin-left:auto;white-space:nowrap}
.dsvz-groupwrap{padding:1px 0 3px 22px}
.dsvz-grp{padding:2px 0}
.dsvz-grphe{display:flex;align-items:center;gap:8px;padding:5px 10px;border-radius:8px;cursor:pointer;font-size:12px;border-left:3px solid transparent}
.dsvz-grphe:hover{background:rgba(37,99,235,.06)}
body[data-ds-dark-theme] .dsvz-grphe:hover{background:rgba(86,144,254,.1)}
.dsvz-grphe .chev{transition:transform .15s;font-size:10.5px}
.dsvz-grphe.open .chev{transform:rotate(90deg)}
.dsvz-grphe .gname{font-weight:700;font-size:11.5px}
.dsvz-grphe .gmeta{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8493ab);margin-left:auto;white-space:nowrap}
.dsvz-grpbody{padding:8px 12px 8px 26px;font-size:12px;color:var(--dsw-alias-label-primary,#1e293b);white-space:pre-wrap;word-break:break-word;line-height:1.7;background:rgba(128,128,128,.04);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));border-radius:10px;margin:4px 4px 4px 8px}
.dsvz-ev{display:flex;align-items:flex-start;gap:8px;padding:5px 10px;border-radius:8px;cursor:pointer;font-size:12px;border-left:3px solid transparent;line-height:1.45;transition:background .12s}
.dsvz-ev:hover{background:rgba(37,99,235,.06)}
body[data-ds-dark-theme] .dsvz-ev:hover{background:rgba(86,144,254,.1)}
.dsvz-ev.sel{background:rgba(37,99,235,.12)}
body[data-ds-dark-theme] .dsvz-ev.sel{background:rgba(86,144,254,.16)}
.dsvz-ev .et{font-size:10px;font-family:var(--dsw-font-mono,Consolas,monospace);color:var(--dsw-alias-label-dimmed,#8b95a3);flex-shrink:0;padding-top:2px;white-space:nowrap}
.dsvz-ev .etl{font-size:10px;font-weight:700;border-radius:999px;padding:0 8px;border:1px solid;flex-shrink:0;margin-top:1px;white-space:nowrap}
.dsvz-ev .es{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsvz-ev .eh{flex:1;min-width:0;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsvz-ev .ed{margin-left:auto;font-size:10.5px;color:var(--dsw-alias-label-dimmed,#8b95a3);font-family:var(--dsw-font-mono,Consolas,monospace);flex-shrink:0;white-space:nowrap}
.dsvz-ev.err .es,.dsvz-ev.err .eh{color:#dc2626}

/* 右侧详情 */
.dsvz-right{flex:1;min-width:0;display:flex;flex-direction:column;min-height:0}
.dsvz-rtabs{display:flex;gap:4px;padding:10px 14px 0;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.15));flex-shrink:0}
.dsvz-rtab{font:inherit;font-size:12px;padding:6px 16px;border:1px solid transparent;border-bottom:none;border-radius:9px 9px 0 0;cursor:pointer;color:var(--dsw-alias-label-secondary,#8493ab);background:transparent;transition:color .15s,background .15s;margin-bottom:-1px}
.dsvz-rtab:hover{color:var(--dsw-alias-label-primary,#1e293b);background:rgba(128,128,128,.06)}
.dsvz-rtab.active{color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);font-weight:700;background:var(--dsw-specific-input-major,#fff);border-color:var(--dsw-alias-border-l2,rgba(128,128,128,.2))}
body[data-ds-dark-theme] .dsvz-rtab.active{color:#5690fe}
.dsvz-rcontent{flex:1;overflow:auto;padding:16px 18px;min-height:0}
.dsvz-rtitle{font-size:13px;font-weight:700;margin-bottom:12px;display:flex;align-items:center;gap:9px;flex-wrap:wrap}
.dsvz-kv{width:100%;border-collapse:collapse;font-size:12.5px;margin-bottom:12px}
.dsvz-kv td{padding:5px 10px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.12));vertical-align:top}
.dsvz-kv td:first-child{width:140px;color:var(--dsw-alias-label-secondary,#8493ab);font-weight:600;white-space:nowrap}
.dsvz-kv td:last-child{font-family:var(--dsw-font-mono,Consolas,monospace);font-size:11.5px;word-break:break-all}
.dsvz-pre{font-family:var(--dsw-font-mono,Consolas,monospace);font-size:11.5px;line-height:1.6;background:rgba(128,128,128,.05);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:10px;padding:12px 14px;overflow:auto;white-space:pre-wrap;word-break:break-all;margin:0 0 12px}
.dsvz-empty{color:var(--dsw-alias-label-secondary,#8493ab);padding:28px;text-align:center;font-size:13px}
.dsvz-load{color:var(--dsw-alias-label-secondary,#8493ab);padding:14px;text-align:center;font-size:12.5px}
/* 会话头部「查看日志」按钮（带 hover / active 反馈） */
.dsvz-header-btn:hover{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);background:rgba(37,99,235,.06)}
body[data-ds-dark-theme] .dsvz-header-btn:hover{border-color:#5690fe;color:#5690fe;background:rgba(86,144,254,.12)}
.dsvz-header-btn.active{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);background:rgba(37,99,235,.08)}
body[data-ds-dark-theme] .dsvz-header-btn.active{border-color:#5690fe;color:#5690fe;background:rgba(86,144,254,.14)}

/* ===== 加载进度（进度条 4：环形 + 线性 + 状态） ===== */
.dsvz-loading{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:var(--dsw-specific-input-major,#fff);color:var(--dsw-alias-label-primary,#1e293b)}
.dsvz-ring{display:block}
.dsvz-loading-label{font-size:14px;font-weight:600;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-loading-bar{width:min(300px,70%);height:6px;border-radius:3px;background:rgba(128,128,128,.12);overflow:hidden}
.dsvz-loading-fill{height:100%;border-radius:3px;background:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);transition:width .4s ease}

/* ===== 全局底部进度条（进度条 1：3px 彩色分段） ===== */
.dsvz-global-bar{position:relative;height:3px;background:var(--dsw-alias-border-l2,rgba(128,128,128,.15));cursor:pointer;flex-shrink:0;z-index:3}
.dsvz-global-bar .gb-seg{position:absolute;top:0;bottom:0;transition:filter .15s}
.dsvz-global-bar .gb-seg:hover{filter:brightness(1.15)}
.dsvz-global-bar .gb-seg.cur{box-shadow:0 0 0 1px var(--dsw-specific-input-major,#fff) inset}
.dsvz-global-bar .gb-marker{position:absolute;top:-2px;bottom:-2px;width:2px;background:var(--dsw-alias-label-primary,#1e293b);border-radius:1px;pointer-events:none;box-shadow:0 0 4px rgba(0,0,0,.4)}
.dsvz-global-bar .gb-tip{position:absolute;bottom:10px;transform:translateX(-50%);background:rgba(10,14,20,.92);color:#fff;font-size:10.5px;border-radius:6px;padding:3px 9px;white-space:nowrap;pointer-events:none;display:none;font-family:var(--dsw-font-mono,Consolas,monospace)}
.dsvz-global-bar:hover .gb-tip{display:block}

/* ===== Turn/Step 结构进度条（进度条 2：列表顶部紧凑进度链） ===== */
.dsvz-chain{display:flex;flex-direction:column;gap:6px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.15));flex-shrink:0;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.03))}
.dsvz-chain-row{display:flex;gap:3px;height:10px}
.dsvz-chain-seg{height:100%;border-radius:2px;cursor:pointer;transition:filter .15s,transform .15s;min-width:2px}
.dsvz-chain-seg:hover{filter:brightness(1.2);transform:scaleY(1.3)}
.dsvz-chain-seg.cur{box-shadow:0 0 0 1.5px var(--dsw-alias-label-primary,#1e293b)}
.dsvz-chain-meta{display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-chain-meta .step-pos{font-weight:700;color:var(--dsw-alias-label-primary,#1e293b);font-family:var(--dsw-font-mono,Consolas,monospace)}
.dsvz-chain-meta .act{font-size:10px;border-radius:999px;padding:0 7px;border:1px solid;white-space:nowrap}
.dsvz-chain-meta .spacer{flex:1}

/* ===== 单步执行进度（进度条 3：圆环 + 横条细分） ===== */
.dsvz-stepprog{display:flex;gap:18px;align-items:center;padding:6px 2px}
.dsvz-stepprog .sp-ring{flex-shrink:0}
.dsvz-stepprog .sp-ring-val{font-size:15px;font-weight:800;fill:var(--dsw-alias-label-primary,#1e293b)}
.dsvz-stepprog .sp-ring-label{font-size:8.5px;fill:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-stepprog .sp-bars{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}
.dsvz-stepprog .sp-bar{display:flex;align-items:center;gap:8px;font-size:11px}
.dsvz-stepprog .sp-bar .lb{width:64px;color:var(--dsw-alias-label-secondary,#8493ab);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0}
.dsvz-stepprog .sp-bar .tk{flex:1;height:8px;background:rgba(128,128,128,.1);border-radius:4px;overflow:hidden}
.dsvz-stepprog .sp-bar .tl{flex:1;height:8px;border-radius:4px;min-width:2px}
.dsvz-stepprog .sp-bar .ct{width:44px;text-align:right;font-family:var(--dsw-font-mono,Consolas,monospace);color:var(--dsw-alias-label-secondary,#8493ab);flex-shrink:0}
.dsvz-stepprog .sp-foot{margin-top:6px;font-size:11px;color:var(--dsw-alias-label-secondary,#8493ab);display:flex;gap:12px}

/* ===== 首页：会话过程闭环总览 ===== */
.dsvz-home{display:flex;flex-direction:column;gap:18px;padding:4px 2px 24px}
.dsvz-home-hero{padding:16px 18px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));border-radius:14px;background:linear-gradient(135deg,rgba(37,99,235,.05),rgba(34,197,94,.04))}
.dsvz-home-title{font-size:20px;font-weight:800;margin-bottom:6px}
.dsvz-home-sub{font-size:12.5px;line-height:1.7;color:var(--dsw-alias-label-secondary,#8493ab);max-width:720px}
.dsvz-home-legend{display:flex;gap:16px;margin-top:12px;flex-wrap:wrap}
.dsvz-legend-item{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-legend-dot{width:10px;height:10px;border-radius:50%;display:inline-block}
.dsvz-home-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.dsvz-home-card{display:flex;flex-direction:column;gap:8px;padding:14px 16px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));border-radius:12px;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.03))}
.dsvz-home-card-icon{font-size:20px}
.dsvz-home-card-label{font-size:12px;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-home-card-num{font-size:26px;font-weight:800;line-height:1}
.dsvz-home-card-stats{display:flex;gap:10px;font-size:11.5px;font-family:var(--dsw-font-mono,Consolas,monospace)}
.dsvz-stat-ok{color:#16a34a}
.dsvz-stat-open{color:#d97706}
.dsvz-stat-err{color:#dc2626}
.dsvz-home-unclosed{border:1px dashed rgba(217,119,6,.5);border-radius:12px;padding:12px 16px;background:rgba(217,119,6,.05)}
.dsvz-home-unclosed-title{font-size:13px;font-weight:700;color:#d97706;margin-bottom:8px}
.dsvz-home-unclosed-list{display:flex;flex-direction:column;gap:7px}
.dsvz-home-unclosed-item{display:flex;align-items:center;gap:8px;font-size:12.5px}
.dsvz-home-unclosed-label{font-weight:600}
.dsvz-home-unclosed-sub{color:var(--dsw-alias-label-secondary,#8493ab);font-size:11.5px}
.dsvz-home-jump{margin-left:auto;font-size:11px!important;padding:3px 10px!important}
.dsvz-home-rings{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:16px}
.dsvz-ring-turn{display:flex;flex-direction:column;align-items:center;gap:6px;padding:10px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));border-radius:12px;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.03));transition:border-color .15s,transform .15s}
.dsvz-ring-turn:hover{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);transform:translateY(-1px)}
.dsvz-ring-turn svg{flex-shrink:0}
.dsvz-ring-meta{display:flex;align-items:center;gap:8px;font-size:12px;width:100%;justify-content:center}
.dsvz-ring-label{font-weight:700}
.dsvz-ring-status{font-size:10.5px;padding:1px 7px;border-radius:999px;border:1px solid}
.dsvz-ring-dur{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8493ab);font-family:var(--dsw-font-mono,Consolas,monospace)}
.dsvz-ring-steps{width:100%;display:flex;flex-direction:column;gap:4px;margin-top:2px;max-height:220px;overflow:auto}
.dsvz-ring-step{display:flex;align-items:center;gap:7px;font-size:11.5px;padding:5px 8px;border-left:3px solid;border-radius:6px;background:var(--dsw-specific-input-major,#fff);cursor:pointer}
.dsvz-ring-step:hover{background:rgba(37,99,235,.06)}
.dsvz-ring-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dsvz-ring-step-label{font-weight:600;white-space:nowrap}
.dsvz-ring-step-tools{display:flex;gap:4px;flex-wrap:wrap;min-width:0}
.dsvz-ring-tool{font-size:10px;padding:1px 6px;border-radius:999px;border:1px solid rgba(128,128,128,.25);color:var(--dsw-alias-label-secondary,#8493ab);white-space:nowrap;max-width:120px;overflow:hidden;text-overflow:ellipsis}
.dsvz-ring-tool.err{border-color:#ef4444;color:#dc2626;background:rgba(239,68,68,.06)}
.dsvz-ring-tool.open{border-color:#f59e0b;color:#d97706;background:rgba(245,158,11,.08);animation:dsvz-pulse 1.6s ease-in-out infinite}
.dsvz-ring-more{font-size:10px;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-home-actions{display:flex;gap:10px;flex-wrap:wrap}
.dsvz-home-btn{font-size:12.5px!important;padding:7px 16px!important}

/* ===== 首页 v2：轮次时间线 ===== */
.dsvz-home-card-top{display:flex;align-items:center;gap:8px}
.dsvz-home-card-icon{font-size:18px}
.dsvz-home-card-label{font-size:12px;color:var(--dsw-alias-label-secondary,#8493ab);font-weight:600}
.dsvz-turnlist{display:flex;flex-direction:column;gap:12px}
.dsvz-turnrow{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.16));border-radius:14px;background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.03));overflow:hidden;transition:border-color .15s,box-shadow .15s}
.dsvz-turnrow:hover{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);box-shadow:0 3px 14px rgba(37,99,235,.10)}
.dsvz-turnrow.open{border-color:rgba(245,158,11,.5)}
.dsvz-turnrow-main{display:flex;gap:16px;padding:14px 16px;cursor:pointer;align-items:flex-start}
.dsvz-thumb{flex-shrink:0}
.dsvz-turnrow-info{flex:1;min-width:0;display:flex;flex-direction:column;gap:8px}
.dsvz-turnrow-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dsvz-turnrow-title{font-size:14px;font-weight:750}
.dsvz-turnrow-chip{font-size:11px;font-weight:650;padding:2px 10px;border-radius:999px;border:1px solid}
.dsvz-turnrow-count{font-size:11.5px;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-turnrow-dur{font-size:11.5px;color:var(--dsw-alias-label-secondary,#8493ab);font-family:var(--dsw-font-mono,Consolas,monospace)}
.dsvz-turnrow-steps{display:flex;flex-direction:column;gap:5px}
.dsvz-steprow{display:flex;align-items:center;gap:8px;font-size:12px;padding:4px 8px;border-radius:8px;background:var(--dsw-specific-input-major,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.1))}
.dsvz-steprow-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dsvz-steprow-label{font-weight:650;white-space:nowrap}
.dsvz-steprow-tools{display:flex;gap:4px;flex-wrap:wrap;flex:1;min-width:0}
.dsvz-steprow-tool{font-size:10.5px;padding:1px 7px;border-radius:999px;border:1px solid rgba(128,128,128,.25);color:var(--dsw-alias-label-secondary,#8493ab);white-space:nowrap;max-width:130px;overflow:hidden;text-overflow:ellipsis}
.dsvz-steprow-tool.err{border-color:#ef4444;color:#dc2626;background:rgba(239,68,68,.06)}
.dsvz-steprow-tool.open{border-color:#f59e0b;color:#d97706;background:rgba(245,158,11,.08);animation:dsvz-pulse 1.6s ease-in-out infinite}
.dsvz-steprow-more{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8493ab)}
.dsvz-steprow-dur{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8493ab);font-family:var(--dsw-font-mono,Consolas,monospace);white-space:nowrap}
.dsvz-pulse{animation:dsvz-pulse 1.6s ease-in-out infinite}
@keyframes dsvz-pulse{0%,100%{opacity:1}50%{opacity:.45}}


/* ===== JSON 查看器（可折叠树 + 缩进参考线 + 行号 + 长串折行） ===== */
.dsvz-json{border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));border-radius:10px;background:rgba(128,128,128,.04);overflow:hidden;margin:0 0 12px;display:flex;flex-direction:column;min-height:0}
.dsvz-json-tb{display:flex;align-items:center;gap:6px;padding:6px 8px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.14));background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.05));flex-shrink:0;flex-wrap:wrap}
.dsvz-json-tb .sp{flex:1}
.dsvz-json-btn{font:inherit;font-size:11px;padding:3px 9px;border-radius:7px;border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.22));background:var(--dsw-specific-input-major,#fff);color:var(--dsw-alias-label-secondary,#8493ab);cursor:pointer;transition:color .15s,border-color .15s,background .15s}
.dsvz-json-btn:hover{color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);background:rgba(37,99,235,.06)}
.dsvz-json-btn.on{color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);background:rgba(37,99,235,.08);font-weight:700}
body[data-ds-dark-theme] .dsvz-json-btn:hover,body[data-ds-dark-theme] .dsvz-json-btn.on{color:#5690fe;border-color:#5690fe;background:rgba(86,144,254,.12)}
.dsvz-json-stat{font-size:10.5px;color:var(--dsw-alias-label-secondary,#8493ab);font-family:var(--dsw-font-mono,Consolas,monospace)}
.dsvz-json-body{overflow:auto;padding:8px 0;font-family:var(--dsw-font-mono,Consolas,monospace);font-size:11.5px;line-height:1.75;max-height:min(62vh,540px)}
.dsvz-json-body.wrap .dsvz-jv{white-space:pre-wrap;word-break:break-all}
.dsvz-jrow{display:flex;align-items:flex-start;padding-right:10px}
.dsvz-jrow:hover{background:rgba(37,99,235,.07)}
.dsvz-jln{flex-shrink:0;width:46px;text-align:right;padding-right:10px;color:var(--dsw-alias-label-secondary,#8493ab);opacity:.5;user-select:none;font-size:10.5px}
.dsvz-jmain{flex:1;min-width:0;display:flex;align-items:flex-start}
.dsvz-jind{flex-shrink:0;width:14px;align-self:stretch;border-left:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.25))}
.dsvz-jtog{flex-shrink:0;width:15px;text-align:center;cursor:pointer;color:var(--dsw-alias-label-secondary,#8493ab);user-select:none;font-size:9px;line-height:2}
.dsvz-jtog:hover{color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb)}
.dsvz-jtog.ph{cursor:default;visibility:hidden}
.dsvz-jv{white-space:pre;min-width:0}
.dsvz-jkey{color:#7c3aed}
.dsvz-jstr{color:#059669}
.dsvz-jnum{color:#2563eb}
.dsvz-jlit{color:#dc2626;font-weight:600}
.dsvz-jpunc{color:#64748b}
.dsvz-jcount{color:var(--dsw-alias-label-secondary,#8493ab);opacity:.75;font-size:10.5px}
.dsvz-jmore{color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);cursor:pointer;font-size:10.5px;margin-left:6px;text-decoration:underline dotted}
body[data-ds-dark-theme] .dsvz-jkey{color:#c792ea}
body[data-ds-dark-theme] .dsvz-jstr{color:#7ee2a8}
body[data-ds-dark-theme] .dsvz-jnum{color:#79b8ff}
body[data-ds-dark-theme] .dsvz-jlit{color:#ff7b72}
body[data-ds-dark-theme] .dsvz-jpunc{color:#8b95a3}
body[data-ds-dark-theme] .dsvz-jmore{color:#5690fe}
`;
		function ensureStyles$1() {
			const id = "dsh-session-viz/css";
			if (document.getElementById(id)) return;
			const el = document.createElement("style");
			el.id = id;
			el.textContent = CSS_TEXT;
			document.head.appendChild(el);
		}
		const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
			"&": "&amp;",
			"<": "&lt;",
			">": "&gt;",
			"\"": "&quot;",
			"'": "&#39;"
		})[c]);
		function fmtTime(ms) {
			if (!ms) return "—";
			const d = new Date(ms);
			const p = (n) => String(n).padStart(2, "0");
			return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, "0")}`;
		}
		function fmtDur(ms) {
			if (ms == null) return "—";
			if (ms < 1e3) return `${ms}ms`;
			const s = ms / 1e3;
			if (s < 60) return `${s.toFixed(1)}s`;
			return `${Math.floor(s / 60)}m${Math.round(s % 60)}s`;
		}
		function relTime(ms, base) {
			if (ms == null) return "—";
			if (base == null) return fmtTime(ms).slice(11);
			const d = ms - base;
			return d >= 0 ? `+${fmtDur(d)}` : fmtTime(ms).slice(11);
		}
		function fmtNum(n) {
			return (n ?? 0).toLocaleString("en-US");
		}
		function shortPath(p) {
			const parts = String(p ?? "").split(/[\\/]/).filter(Boolean);
			return parts.length > 2 ? parts.slice(-2).join("/") : p ?? "";
		}
		function isDark() {
			return typeof document !== "undefined" && document.body && document.body.hasAttribute("data-ds-dark-theme");
		}
		function tryPretty(text) {
			const t = String(text ?? "");
			const trimmed = t.trim();
			if (!trimmed || trimmed[0] !== "{" && trimmed[0] !== "[") return t;
			try {
				return JSON.stringify(JSON.parse(trimmed), null, 2);
			} catch {
				return t;
			}
		}
		function jsonHighlight(json) {
			if (json === void 0 || json === null) return "";
			const s = typeof json === "string" ? tryPretty(json) : JSON.stringify(json, null, 2);
			const dark = isDark();
			const cKey = dark ? "#c792ea" : "#7c3aed";
			const cColon = dark ? "#8b95a3" : "#64748b";
			const cStr = dark ? "#7ee2a8" : "#059669";
			const cLit = dark ? "#ff7b72" : "#dc2626";
			const cNum = dark ? "#79b8ff" : "#2563eb";
			let out = "";
			const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
			let last = 0, m;
			while (m = re.exec(s)) {
				out += esc(s.slice(last, m.index));
				const [full, str, colon, lit] = m;
				if (str !== void 0) out += colon !== void 0 ? `<span style="color:${cKey}">${esc(str)}</span><span style="color:${cColon}">${esc(colon)}</span>` : `<span style="color:${cStr}">${esc(str)}</span>`;
				else if (lit !== void 0) out += `<span style="color:${cLit};font-weight:600">${esc(lit)}</span>`;
				else out += `<span style="color:${cNum}">${esc(full)}</span>`;
				last = m.index + full.length;
			}
			out += esc(s.slice(last));
			return out;
		}
		const JSON_STR_LIMIT = 220;
		const JSON_AUTO_DEPTH = 2;
		const JSON_AUTO_COUNT = 24;
		const JSEP = "\0";
		function jsonKindOf(v) {
			if (v === null) return "null";
			if (Array.isArray(v)) return "array";
			return typeof v;
		}
		function jsonEntriesOf(v, kind) {
			return kind === "array" ? v.map((x, i) => [i, x]) : Object.entries(v);
		}
		function jsonWalkContainers(root, visit) {
			const walk = (v, depth, path) => {
				const kind = jsonKindOf(v);
				if (kind !== "array" && kind !== "object") return;
				const entries = jsonEntriesOf(v, kind);
				visit(path, depth, entries.length);
				entries.forEach(([k, x]) => walk(x, depth + 1, path + JSEP + k));
			};
			walk(root, 0, "");
		}
		function jsonInitialCollapsed(root) {
			const set = /* @__PURE__ */ new Set();
			jsonWalkContainers(root, (path, depth, n) => {
				if (n && (depth >= JSON_AUTO_DEPTH || n > JSON_AUTO_COUNT)) set.add(path);
			});
			return set;
		}
		function jsonAllContainers(root) {
			const set = /* @__PURE__ */ new Set();
			jsonWalkContainers(root, (path, _depth, n) => {
				if (n) set.add(path);
			});
			return set;
		}
		function jsonRows(root, collapsed) {
			const rows = [];
			const walk = (key, v, depth, path, last) => {
				const kind = jsonKindOf(v);
				if (kind === "array" || kind === "object") {
					const entries = jsonEntriesOf(v, kind);
					const open = kind === "array" ? "[" : "{";
					const close = kind === "array" ? "]" : "}";
					const isCollapsed = collapsed.has(path);
					rows.push({
						depth,
						path,
						key,
						kind: "branch",
						open,
						close,
						n: entries.length,
						collapsed: isCollapsed,
						last
					});
					if (!isCollapsed && entries.length) {
						entries.forEach(([k, x], i) => walk(k, x, depth + 1, path + JSEP + k, i === entries.length - 1));
						rows.push({
							depth,
							kind: "close",
							close,
							last
						});
					}
				} else rows.push({
					depth,
					path,
					key,
					kind: "leaf",
					v,
					vtype: kind,
					last
				});
			};
			walk(void 0, root, 0, "", true);
			return rows;
		}
		function JsonView({ text, value }) {
			const parsed = react.default.useMemo(() => {
				if (value !== void 0) return {
					ok: true,
					data: value
				};
				const t = String(text ?? "").trim();
				if (!t) return {
					ok: false,
					data: null,
					empty: true
				};
				try {
					return {
						ok: true,
						data: JSON.parse(t)
					};
				} catch {
					return {
						ok: false,
						data: null
					};
				}
			}, [text, value]);
			const [collapsed, setCollapsed] = react.default.useState(() => parsed.ok ? jsonInitialCollapsed(parsed.data) : /* @__PURE__ */ new Set());
			const [expandedStr, setExpandedStr] = react.default.useState(() => /* @__PURE__ */ new Set());
			const [wrap, setWrap] = react.default.useState(false);
			const [lineNo, setLineNo] = react.default.useState(true);
			const [copied, setCopied] = react.default.useState(false);
			react.default.useEffect(() => {
				setCollapsed(parsed.ok ? jsonInitialCollapsed(parsed.data) : /* @__PURE__ */ new Set());
				setExpandedStr(/* @__PURE__ */ new Set());
				setCopied(false);
			}, [parsed]);
			const rows = react.default.useMemo(() => parsed.ok ? jsonRows(parsed.data, collapsed) : [], [parsed, collapsed]);
			const pretty = react.default.useMemo(() => parsed.ok ? JSON.stringify(parsed.data, null, 2) : String(text ?? ""), [parsed, text]);
			if (parsed.empty) return react.default.createElement("pre", { className: "dsvz-pre" }, "(无)");
			if (!parsed.ok) return react.default.createElement("div", { className: "dsvz-json" }, react.default.createElement("div", { className: "dsvz-json-tb" }, react.default.createElement("span", { className: "dsvz-json-stat" }, "非 JSON 文本，按原样展示")), react.default.createElement("pre", {
				className: "dsvz-pre",
				style: {
					margin: 0,
					border: "none",
					background: "transparent"
				},
				dangerouslySetInnerHTML: { __html: jsonHighlight(text) }
			}));
			const toggle = (path) => setCollapsed((prev) => {
				const s = new Set(prev);
				if (s.has(path)) s.delete(path);
				else s.add(path);
				return s;
			});
			const toggleStr = (path) => setExpandedStr((prev) => {
				const s = new Set(prev);
				if (s.has(path)) s.delete(path);
				else s.add(path);
				return s;
			});
			const doCopy = () => {
				try {
					navigator.clipboard.writeText(pretty);
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				} catch {}
			};
			const punc = (key, s) => react.default.createElement("span", {
				key,
				className: "dsvz-jpunc"
			}, s);
			const keyNodes = (key) => {
				if (key === void 0) return [];
				if (typeof key === "number") return [react.default.createElement("span", {
					key: "k",
					className: "dsvz-jcount"
				}, `${key}`), punc("kc", ": ")];
				return [react.default.createElement("span", {
					key: "k",
					className: "dsvz-jkey"
				}, JSON.stringify(String(key))), punc("kc", ": ")];
			};
			const leafNodes = (row) => {
				const { v, vtype, path } = row;
				if (vtype === "string") {
					const isLong = v.length > JSON_STR_LIMIT;
					const open = expandedStr.has(path);
					const shown = isLong && !open ? v.slice(0, JSON_STR_LIMIT) : v;
					const out = [react.default.createElement("span", {
						key: "v",
						className: "dsvz-jstr"
					}, JSON.stringify(shown) + (isLong && !open ? " …" : ""))];
					if (isLong) {
						out.push(react.default.createElement("span", {
							key: "n",
							className: "dsvz-jcount"
						}, ` ${fmtNum(v.length)} 字符`));
						out.push(react.default.createElement("span", {
							key: "m",
							className: "dsvz-jmore",
							onClick: () => toggleStr(path)
						}, open ? "收起" : "展开"));
					}
					return out;
				}
				const cls = vtype === "number" ? "dsvz-jnum" : "dsvz-jlit";
				return [react.default.createElement("span", {
					key: "v",
					className: cls
				}, v === null ? "null" : String(v))];
			};
			const rowEls = rows.map((row, i) => {
				const indents = [];
				for (let d = 0; d < row.depth; d++) indents.push(react.default.createElement("span", {
					key: "i" + d,
					className: "dsvz-jind"
				}));
				let body;
				if (row.kind === "branch") {
					const tog = row.n ? react.default.createElement("span", {
						key: "t",
						className: "dsvz-jtog",
						onClick: () => toggle(row.path),
						title: row.collapsed ? "展开" : "折叠"
					}, row.collapsed ? "▶" : "▼") : react.default.createElement("span", {
						key: "t",
						className: "dsvz-jtog ph"
					}, "·");
					const tail = row.n === 0 ? [punc("e", row.open + row.close + (row.last ? "" : ","))] : row.collapsed ? [
						punc("o", row.open),
						react.default.createElement("span", {
							key: "c",
							className: "dsvz-jcount"
						}, ` ${row.n} 项 `),
						punc("cl", row.close + (row.last ? "" : ","))
					] : [punc("o", row.open)];
					body = [tog, react.default.createElement("span", {
						key: "v",
						className: "dsvz-jv"
					}, ...keyNodes(row.key), ...tail)];
				} else if (row.kind === "close") body = [react.default.createElement("span", {
					key: "t",
					className: "dsvz-jtog ph"
				}, "·"), react.default.createElement("span", {
					key: "v",
					className: "dsvz-jv"
				}, punc("c", row.close + (row.last ? "" : ",")))];
				else body = [react.default.createElement("span", {
					key: "t",
					className: "dsvz-jtog ph"
				}, "·"), react.default.createElement("span", {
					key: "v",
					className: "dsvz-jv"
				}, ...keyNodes(row.key), ...leafNodes(row), punc("t", row.last ? "" : ","))];
				return react.default.createElement("div", {
					key: i,
					className: "dsvz-jrow"
				}, lineNo && react.default.createElement("span", { className: "dsvz-jln" }, i + 1), react.default.createElement("span", { className: "dsvz-jmain" }, ...indents, ...body));
			});
			return react.default.createElement("div", { className: "dsvz-json" }, react.default.createElement("div", { className: "dsvz-json-tb" }, react.default.createElement("button", {
				className: "dsvz-json-btn",
				onClick: () => setCollapsed(/* @__PURE__ */ new Set())
			}, "全部展开"), react.default.createElement("button", {
				className: "dsvz-json-btn",
				onClick: () => setCollapsed(jsonAllContainers(parsed.data))
			}, "全部折叠"), react.default.createElement("button", {
				className: "dsvz-json-btn" + (wrap ? " on" : ""),
				onClick: () => setWrap((w) => !w),
				title: "长值自动换行"
			}, "自动换行"), react.default.createElement("button", {
				className: "dsvz-json-btn" + (lineNo ? " on" : ""),
				onClick: () => setLineNo((v) => !v),
				title: "显示行号"
			}, "行号"), react.default.createElement("span", { className: "sp" }), react.default.createElement("span", { className: "dsvz-json-stat" }, `${fmtNum(rows.length)} 行 · ${fmtNum(pretty.length)} 字符`), react.default.createElement("button", {
				className: "dsvz-json-btn",
				onClick: doCopy
			}, copied ? "已复制" : "复制")), react.default.createElement("div", { className: "dsvz-json-body" + (wrap ? " wrap" : "") }, rowEls));
		}
		async function api(path) {
			const res = await fetch(path);
			if (!res.ok) {
				let msg = res.statusText;
				try {
					msg = (await res.json()).error || msg;
				} catch {}
				throw new Error(msg);
			}
			return res.json();
		}
		const apiMeta = () => api("/dsh-session-viz/api/meta");
		const apiSessions = (q) => api("/dsh-session-viz/api/sessions" + (q ? `?q=${encodeURIComponent(q)}` : ""));
		const apiSummary = (sessionId) => api(`/dsh-session-viz/api/summary?sessionId=${encodeURIComponent(sessionId)}`);
		const apiStory = (sessionId) => api(`/dsh-session-viz/api/story?sessionId=${encodeURIComponent(sessionId)}`);
		const apiLine = (sessionId, line) => api(`/dsh-session-viz/api/line?sessionId=${encodeURIComponent(sessionId)}&line=${line}`);
		function grp(groups, key) {
			return groups?.[key] ?? {
				label: key,
				fg: "#607D8B",
				bg: "#ECEFF1",
				border: "#455A64"
			};
		}
		function DetailView({ ev, raw, groups, devMode }) {
			const [tab, setTab] = react.default.useState("解读");
			const gstyle = grp(groups, ev?.group);
			const rows = react.default.useMemo(() => interpret(ev, raw, devMode), [
				ev,
				raw,
				devMode
			]);
			if (!ev) return react.default.createElement("div", { className: "dsvz-empty" }, "无数据");
			const tabs = devMode ? [
				"解读",
				"JSON",
				"原始行"
			] : ["解读"];
			return react.default.createElement("div", { style: {
				display: "flex",
				flexDirection: "column",
				height: "100%",
				minHeight: 0
			} }, react.default.createElement("div", { className: "dsvz-rtabs" }, tabs.map((t) => react.default.createElement("button", {
				key: t,
				className: "dsvz-rtab" + (tab === t ? " active" : ""),
				onClick: () => setTab(t)
			}, t))), react.default.createElement("div", { className: "dsvz-rcontent" }, react.default.createElement("div", { className: "dsvz-rtitle" }, react.default.createElement("span", {
				className: "dsvz-typechip",
				style: {
					background: gstyle.bg,
					color: gstyle.fg,
					border: "1px solid " + gstyle.border,
					borderRadius: 999,
					padding: "0 8px",
					fontSize: 11,
					fontWeight: 700
				}
			}, devMode ? ev.type : gstyle.label ?? ev.type), devMode && react.default.createElement("span", { style: {
				fontFamily: "var(--dsw-font-mono,Consolas,monospace)",
				fontSize: 11,
				color: "var(--dsw-alias-label-secondary,#8493ab)"
			} }, `#${ev.seq ?? ev.line} · ${ev.time ? fmtTime(ev.time) : ""}`), !devMode && react.default.createElement("span", { style: {
				fontSize: 11,
				color: "var(--dsw-alias-label-secondary,#8493ab)"
			} }, ev.time ? fmtTime(ev.time) : ""), ev.error && react.default.createElement("span", { style: {
				color: "#dc2626",
				fontWeight: 700,
				fontSize: 11
			} }, "⚠ 错误")), tab === "解读" && react.default.createElement("table", { className: "dsvz-kv" }, rows.map(([k, v], i) => react.default.createElement("tr", { key: i }, react.default.createElement("td", null, k), react.default.createElement("td", null, react.default.createElement("div", { dangerouslySetInnerHTML: { __html: jsonHighlight(v) } }))))), devMode && tab === "JSON" && react.default.createElement(JsonView, { text: raw }), devMode && tab === "原始行" && react.default.createElement("pre", { className: "dsvz-pre" }, esc(raw || "(无)"))));
		}
		function interpret(ev, raw, devMode) {
			let o = null;
			try {
				o = JSON.parse(raw);
			} catch {}
			const d = o?.data ?? {};
			const rows = [];
			rows.push(["时间", ev.time ? fmtTime(ev.time) : "—"]);
			if (devMode) {
				rows.push(["line", ev.line]);
				rows.push(["seq", ev.seq ?? "—"]);
				rows.push(["type", ev.type]);
				rows.push(["分组", ev.group]);
			}
			const kv = (k, v) => rows.push([k, v === void 0 || v === null ? "—" : typeof v === "object" ? JSON.stringify(v, null, 2) : String(v)]);
			switch (ev.type) {
				case "session":
					if (devMode) kv("cwd", o?.cwd);
					kv("agentPreset", o?.agentPreset);
					if (devMode) kv("delegationDepth", o?.delegationDepth);
					break;
				case "session/title":
					kv("标题", d.title);
					break;
				case "user/message":
					kv("内容", d.content?.map?.((p) => p.text ?? `[${p.type}]`).filter(Boolean).join("\n"));
					break;
				case "assistant/message":
					kv("回复", d.message?.content?.filter((p) => p.type === "text").map((p) => p.text).filter(Boolean).join("\n") || "(无正文)");
					if (devMode) kv("tokens", JSON.stringify(d.usage ?? {}, null, 2));
					break;
				case "reasoning-chunks":
				case "text-chunks":
					kv("内容", (d.texts ?? []).join(""));
					if (devMode) kv("分片数", (d.texts ?? []).length);
					if (devMode) kv("总耗时", `${(d.dt ?? []).reduce((a, x) => a + x, 0)}ms`);
					break;
				case "tool/call": {
					kv("工具", d.name);
					let argsPretty = d.arguments;
					try {
						argsPretty = JSON.stringify(JSON.parse(d.arguments), null, 2);
					} catch {}
					kv("请求参数", argsPretty);
					if (devMode) kv("callId", d.callId);
					break;
				}
				case "tool/result": {
					const extract = (content) => {
						if (typeof content === "string") return content;
						if (!Array.isArray(content)) return "";
						return content.map((p) => {
							if (typeof p === "string") return p;
							if (p?.type === "text") return p.text ?? "";
							if (p?.content) return extract(p.content);
							return "";
						}).filter(Boolean).join("\n");
					};
					kv("返回值", extract(d.message?.content) || "(空)");
					if (d.error) kv("错误", typeof d.error === "string" ? d.error : JSON.stringify(d.error, null, 2));
					if (devMode && d.meta) kv("meta", JSON.stringify(d.meta, null, 2));
					if (devMode && d.message?.source?.callId) kv("callId", d.message.source.callId);
					break;
				}
				case "approval/asked":
					kv("工具", d.toolName);
					kv("原因", d.reason);
					if (devMode) kv("id", d.id);
					break;
				case "approval/decided":
					kv("结果", d.outcome);
					if (devMode) kv("id", d.id);
					break;
				case "todo/write":
					kv("todos", JSON.stringify(d.todos ?? [], null, 2));
					break;
				case "turn/start":
				case "turn/end":
					kv("turn", d.turn);
					if (devMode) kv("reason", JSON.stringify(d.reason ?? {}, null, 2));
					break;
				case "step/start":
				case "step/end":
					kv("turn", d.turn);
					kv("step", d.step);
					break;
				case "request/context":
					kv("模型", d.model);
					if (devMode) kv("provider", d.provider);
					if (devMode) kv("contextWindow", d.contextWindow);
					break;
				case "llm/retry":
					kv("重试", `${d.retry}/${d.maxRetries}`);
					if (devMode) kv("failure", JSON.stringify(d.failure ?? {}, null, 2));
					if (devMode) kv("delayMs", d.delayMs);
					break;
				case "command/run":
					kv("name", d.name);
					kv("args", d.args);
					if (devMode) kv("commandId", d.commandId);
					break;
				case "command/done":
					kv("kind", d.kind);
					kv("text", d.text);
					break;
				default: if (devMode) {
					const dk = Object.keys(d);
					if (dk.length) dk.slice(0, 12).forEach((k) => kv(k, typeof d[k] === "object" ? JSON.stringify(d[k], null, 2) : d[k]));
				}
			}
			return rows;
		}
		function GlobalProgressBar({ turns, currentTurn, totalEvents, onSeek }) {
			const [tip, setTip] = react.default.useState(null);
			const [hoverPos, setHoverPos] = react.default.useState(null);
			const wrapRef = react.default.useRef(null);
			if (!turns?.length) return null;
			const total = totalEvents || turns.reduce((a, t) => a + (t.eventCount || 0), 0) || 1;
			const TURN_COLORS = [
				"#2196F3",
				"#4CAF50",
				"#FF9800",
				"#9C27B0",
				"#00BCD4",
				"#FF5722",
				"#3F51B5",
				"#009688",
				"#E91E63",
				"#795548",
				"#673AB7",
				"#F44336",
				"#FFC107",
				"#607D8B"
			];
			const handleMove = (e) => {
				const rect = wrapRef.current.getBoundingClientRect();
				const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
				setHoverPos(ratio);
				let acc = 0;
				let hit = null;
				for (const t of turns) {
					acc += t.eventCount || 0;
					if (ratio * total <= acc) {
						hit = t;
						break;
					}
				}
				setTip(hit ? {
					turn: hit.turn,
					pct: Math.round(ratio * 100)
				} : null);
			};
			const handleClick = (e) => {
				const rect = wrapRef.current.getBoundingClientRect();
				const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
				if (onSeek) onSeek(ratio);
			};
			let markerRatio = null;
			if (currentTurn != null) {
				let acc = 0;
				const cur = turns.find((t) => t.turn === currentTurn);
				for (const t of turns) {
					if (t.turn === currentTurn) break;
					acc += t.eventCount || 0;
				}
				markerRatio = (acc + (cur?.eventCount || 0) / 2) / total;
			}
			const pos = hoverPos != null ? hoverPos : markerRatio;
			return react.default.createElement("div", {
				ref: wrapRef,
				className: "dsvz-global-bar",
				onMouseMove: handleMove,
				onMouseLeave: () => {
					setTip(null);
					setHoverPos(null);
				},
				onClick: handleClick,
				title: "点击跳转到对应 Turn"
			}, turns.map((t, i) => {
				const w = (t.eventCount || 0) / total * 100;
				const isCur = t.turn === currentTurn;
				return react.default.createElement("div", {
					key: t.turn,
					className: "gb-seg" + (isCur ? " cur" : ""),
					style: {
						left: `${turns.slice(0, i).reduce((a, x) => a + (x.eventCount || 0), 0) / total * 100}%`,
						width: `${w}%`,
						background: TURN_COLORS[i % TURN_COLORS.length]
					}
				});
			}), pos != null && react.default.createElement("div", {
				className: "gb-marker",
				style: { left: `${pos * 100}%` }
			}), tip && react.default.createElement("div", {
				className: "gb-tip",
				style: { left: `${pos * 100}%` }
			}, `Turn ${tip.turn} · ${tip.pct}%`));
		}
		function TurnStepChain({ turns, currentTurn, currentStep, onSeekTurn, onSeekStep }) {
			if (!turns?.length) return null;
			const total = turns.reduce((a, t) => a + (t.eventCount || 0), 0) || 1;
			const TURN_COLORS = [
				"#2196F3",
				"#4CAF50",
				"#FF9800",
				"#9C27B0",
				"#00BCD4",
				"#FF5722",
				"#3F51B5",
				"#009688",
				"#E91E63",
				"#795548",
				"#673AB7",
				"#F44336",
				"#FFC107",
				"#607D8B"
			];
			const steps = (turns.find((t) => t.turn === currentTurn) || turns[0])?.steps || [];
			const stepTotal = steps.reduce((a, s) => a + (s.eventCount || 0), 0) || 1;
			const activeTypes = (steps.find((s) => s.step === currentStep)?.groups || []).filter((g) => g.kind !== "event").map((g) => g.label).slice(0, 2);
			return react.default.createElement("div", { className: "dsvz-chain" }, react.default.createElement("div", {
				className: "dsvz-chain-row",
				title: "点击 Turn 跳转"
			}, turns.map((t, i) => {
				const w = (t.eventCount || 0) / total * 100;
				return react.default.createElement("div", {
					key: t.turn,
					className: "dsvz-chain-seg" + (t.turn === currentTurn ? " cur" : ""),
					style: {
						width: `${w}%`,
						background: TURN_COLORS[i % TURN_COLORS.length]
					},
					onClick: (e) => {
						e.stopPropagation();
						onSeekTurn && onSeekTurn(t.turn);
					},
					title: `Turn ${t.turn} · ${t.eventCount} 条`
				});
			})), react.default.createElement("div", { className: "dsvz-chain-meta" }, react.default.createElement("span", null, `Turn ${currentTurn ?? "—"}`), react.default.createElement("span", { className: "step-pos" }, currentStep != null ? `Step ${currentStep}/${stepTotal || "—"}` : "—"), activeTypes.map((l, i) => react.default.createElement("span", {
				key: i,
				className: "act",
				style: {
					borderColor: "var(--dsw-alias-border-l2,rgba(128,128,128,.3))",
					color: "var(--dsw-alias-label-secondary,#8493ab)"
				}
			}, l)), react.default.createElement("span", { className: "spacer" }), react.default.createElement("span", null, `${fmtNum(stepTotal)} 条`)));
		}
		function StepProgress({ step, positionRatio }) {
			if (!step) return null;
			const groups = step.groups || [];
			const counts = {};
			let total = 0;
			let rawTotal = 0;
			let groupCount = 0;
			const KIND_LABEL = {
				reasoning: {
					label: "推理",
					color: "#FFC107"
				},
				text: {
					label: "输出",
					color: "#009688"
				},
				"tool-call": {
					label: "工具流",
					color: "#F44336"
				},
				assistant: {
					label: "助手",
					color: "#FF9800"
				},
				event: {
					label: "事件",
					color: "#607D8B"
				}
			};
			for (const g of groups) {
				const key = g.kind || "event";
				const n = g.kind === "event" ? g.events?.length || 0 : g.count || 1;
				counts[key] = (counts[key] || 0) + n;
				total += n;
				rawTotal += g.kind === "event" ? g.events?.length || 0 : g.count || 1;
				if (g.kind !== "event") groupCount++;
			}
			if (!total) return null;
			const r = 30;
			const c = 2 * Math.PI * r;
			const ratio = Math.min(1, Math.max(0, positionRatio || 0));
			return react.default.createElement("div", { className: "dsvz-stepprog" }, react.default.createElement("svg", {
				className: "sp-ring",
				width: 84,
				height: 84,
				viewBox: "0 0 84 84"
			}, react.default.createElement("circle", {
				cx: 42,
				cy: 42,
				r,
				fill: "none",
				stroke: "var(--dsw-alias-border-l2,rgba(128,128,128,.2))",
				strokeWidth: 7
			}), react.default.createElement("circle", {
				cx: 42,
				cy: 42,
				r,
				fill: "none",
				stroke: "var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb)",
				strokeWidth: 7,
				strokeLinecap: "round",
				strokeDasharray: c,
				strokeDashoffset: c * (1 - ratio),
				transform: "rotate(-90 42 42)",
				style: { transition: "stroke-dashoffset .4s ease" }
			}), react.default.createElement("text", {
				className: "sp-ring-val",
				x: 42,
				y: 44,
				textAnchor: "middle"
			}, `${Math.round(ratio * 100)}%`), react.default.createElement("text", {
				className: "sp-ring-label",
				x: 42,
				y: 57,
				textAnchor: "middle"
			}, "会话位置")), react.default.createElement("div", { className: "sp-bars" }, Object.entries(KIND_LABEL).map(([key, k]) => {
				const n = counts[key] || 0;
				if (!n) return null;
				return react.default.createElement("div", {
					key,
					className: "sp-bar"
				}, react.default.createElement("span", { className: "lb" }, k.label), react.default.createElement("div", { className: "tk" }, react.default.createElement("div", {
					className: "tl",
					style: {
						width: `${n / total * 100}%`,
						background: k.color
					}
				})), react.default.createElement("span", { className: "ct" }, n));
			}), react.default.createElement("div", { className: "sp-foot" }, react.default.createElement("span", null, `Step ${step.turn}·${step.step} 合并 ${fmtNum(groupCount)} 组 / 原始 ${fmtNum(rawTotal)} 条`), react.default.createElement("span", null, `耗时 ${fmtDur(dur(step))}`))));
		}
		function LoadingOverlay({ stage }) {
			const pct = stage === "meta" ? 30 : stage === "summary" ? 60 : stage === "story" ? 90 : 100;
			const label = stage === "meta" ? "正在解析事件…" : stage === "summary" ? "正在生成执行摘要…" : stage === "story" ? "正在构建故事线…" : "加载中…";
			const r = 34;
			const c = 2 * Math.PI * r;
			return react.default.createElement("div", { className: "dsvz-loading" }, react.default.createElement("svg", {
				width: 96,
				height: 96,
				viewBox: "0 0 96 96",
				className: "dsvz-ring"
			}, react.default.createElement("circle", {
				cx: 48,
				cy: 48,
				r,
				fill: "none",
				stroke: "var(--dsvz-ring-track,#e5e9ef)",
				strokeWidth: 7
			}), react.default.createElement("circle", {
				cx: 48,
				cy: 48,
				r,
				fill: "none",
				stroke: "var(--dsvz-accent,#2563eb)",
				strokeWidth: 7,
				strokeLinecap: "round",
				strokeDasharray: c,
				strokeDashoffset: c * (1 - pct / 100),
				transform: "rotate(-90 48 48)",
				style: { transition: "stroke-dashoffset .4s ease" }
			}), react.default.createElement("text", {
				x: 48,
				y: 52,
				textAnchor: "middle",
				fontSize: 16,
				fontWeight: 700,
				fill: "currentColor"
			}, `${pct}%`)), react.default.createElement("div", { className: "dsvz-loading-label" }, label), react.default.createElement("div", { className: "dsvz-loading-bar" }, react.default.createElement("div", {
				className: "dsvz-loading-fill",
				style: { width: `${pct}%` }
			})));
		}
		function renderFileDiff(f) {
			if (f.oldString != null && f.newString != null) {
				const oldLines = String(f.oldString).split("\n");
				const newLines = String(f.newString).split("\n");
				const rows = [];
				const maxLen = Math.max(oldLines.length, newLines.length);
				for (let i = 0; i < maxLen; i++) {
					const o = oldLines[i];
					const n = newLines[i];
					if (o !== void 0 && o === n) rows.push({
						type: "ctx",
						text: o
					});
					else {
						if (o !== void 0) rows.push({
							type: "del",
							text: o
						});
						if (n !== void 0) rows.push({
							type: "add",
							text: n
						});
					}
				}
				return rows.map((r, i) => react.default.createElement("div", {
					key: i,
					className: "dsvz-diff-row " + (r.type === "del" ? "del" : r.type === "add" ? "add" : "")
				}, `${r.type === "del" ? "-" : r.type === "add" ? "+" : " "} ${r.text}`));
			}
			if (f.content != null) return react.default.createElement("pre", null, String(f.content));
			return react.default.createElement("div", {
				className: "dsvz-empty",
				style: { padding: "8px 0" }
			}, "无变更内容");
		}
		function HomeView({ closure, meta, turns, onJump, onOpenTree, onOpenSummary, onOpenMap }) {
			if (!closure) return react.default.createElement("div", { className: "dsvz-empty" }, "加载中…");
			const s = closure.summary;
			const cards = [
				{
					k: "turn",
					icon: "🔄",
					label: "对话轮次",
					total: s.turn.total,
					closed: s.turn.closed,
					open: s.turn.open,
					error: s.turn.error
				},
				{
					k: "step",
					icon: "🪜",
					label: "执行步骤",
					total: s.step.total,
					closed: s.step.closed,
					open: s.step.open,
					error: s.step.error
				},
				{
					k: "tool",
					icon: "🧰",
					label: "工具调用",
					total: s.tool.total,
					closed: s.tool.closed,
					open: s.tool.open,
					error: s.tool.error
				},
				{
					k: "approval",
					icon: "🛡️",
					label: "审批",
					total: s.approval.total,
					closed: s.approval.closed,
					open: s.approval.open,
					error: s.approval.error
				}
			];
			const colorOf = (status) => status === "closed" ? "#22c55e" : status === "open" ? "#f59e0b" : "#ef4444";
			const arcPath = (radius, frac0, frac1) => {
				const a0 = -Math.PI / 2 + frac0 * Math.PI * 2 + .015;
				const a1 = -Math.PI / 2 + frac1 * Math.PI * 2 - .015;
				if (a1 <= a0) return "";
				const x0 = radius * Math.cos(a0), y0 = radius * Math.sin(a0);
				const x1 = radius * Math.cos(a1), y1 = radius * Math.sin(a1);
				const large = frac1 - frac0 > .5 ? 1 : 0;
				return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
			};
			function TurnThumb({ ring }) {
				const R = 40;
				const kids = ring.children || [];
				const segs = [];
				if (kids.length) {
					const weights = kids.map((c) => Math.max(1, c.durationMs ?? 1));
					const totalW = weights.reduce((a, b) => a + b, 0);
					let acc = 0;
					kids.forEach((c, i) => {
						const w = weights[i] / totalW;
						segs.push([
							acc,
							acc + w,
							c.status
						]);
						acc += w;
					});
				} else segs.push([
					0,
					1,
					ring.status
				]);
				const running = ring.status === "open";
				return react.default.createElement("svg", {
					viewBox: "-50 -50 100 100",
					width: 100,
					height: 100,
					className: "dsvz-thumb"
				}, react.default.createElement("circle", {
					cx: 0,
					cy: 0,
					r: R,
					fill: "none",
					stroke: colorOf(ring.status),
					strokeWidth: 4.5,
					strokeDasharray: running ? "5 4" : void 0,
					strokeLinecap: "round",
					className: running ? "dsvz-pulse" : void 0
				}), react.default.createElement("circle", {
					cx: 0,
					cy: 0,
					r: 31,
					fill: "none",
					stroke: "rgba(128,128,128,.15)",
					strokeWidth: 1
				}), segs.map((seg, i) => react.default.createElement("path", {
					key: i,
					d: arcPath(31, seg[0], seg[1]),
					fill: "none",
					stroke: colorOf(seg[2]),
					strokeWidth: 5,
					strokeLinecap: "butt",
					strokeDasharray: seg[2] === "open" ? "4 3" : void 0,
					className: seg[2] === "open" ? "dsvz-pulse" : void 0
				})), react.default.createElement("text", {
					x: 0,
					y: 4,
					textAnchor: "middle",
					fontSize: 13,
					fontWeight: 800,
					fill: "var(--dsw-alias-label-primary,#1e293b)"
				}, `T${ring.turn}`));
			}
			return react.default.createElement("div", { className: "dsvz-scroll" }, react.default.createElement("div", { className: "dsvz-home" }, react.default.createElement("div", { className: "dsvz-home-hero" }, react.default.createElement("div", { className: "dsvz-home-title" }, "会话过程"), react.default.createElement("div", { className: "dsvz-home-sub" }, "整个会话是一串「闭环」：每一轮、每一步、每一次工具调用与审批都有开始和结束。闭合环=已完成的工作；未闭合环=正在进行或中断的工作；红色=失败。点击任意一环直达事件树。"), react.default.createElement("div", { className: "dsvz-home-legend" }, react.default.createElement("span", { className: "dsvz-legend-item" }, react.default.createElement("span", {
				className: "dsvz-legend-dot",
				style: { background: "#22c55e" }
			}), "闭合"), react.default.createElement("span", { className: "dsvz-legend-item" }, react.default.createElement("span", {
				className: "dsvz-legend-dot",
				style: { background: "#f59e0b" }
			}), "进行中"), react.default.createElement("span", { className: "dsvz-legend-item" }, react.default.createElement("span", {
				className: "dsvz-legend-dot",
				style: { background: "#ef4444" }
			}), "失败"))), react.default.createElement("div", { className: "dsvz-home-cards" }, cards.map((c) => react.default.createElement("div", {
				key: c.k,
				className: "dsvz-home-card"
			}, react.default.createElement("div", { className: "dsvz-home-card-top" }, react.default.createElement("span", { className: "dsvz-home-card-icon" }, c.icon), react.default.createElement("span", { className: "dsvz-home-card-label" }, c.label)), react.default.createElement("div", { className: "dsvz-home-card-num" }, fmtNum(c.total)), react.default.createElement("div", { className: "dsvz-home-card-stats" }, react.default.createElement("span", { className: "dsvz-stat-ok" }, `✓ ${fmtNum(c.closed)}`), c.open > 0 && react.default.createElement("span", { className: "dsvz-stat-open" }, `◌ ${fmtNum(c.open)}`), c.error > 0 && react.default.createElement("span", { className: "dsvz-stat-err" }, `✕ ${fmtNum(c.error)}`))))), s.unclosed && s.unclosed.length > 0 && react.default.createElement("div", { className: "dsvz-home-unclosed" }, react.default.createElement("div", { className: "dsvz-home-unclosed-title" }, `◌ 进行中的工作（${s.unclosed.length} 个未闭合环）`), react.default.createElement("div", { className: "dsvz-home-unclosed-list" }, s.unclosed.map((r, i) => react.default.createElement("div", {
				key: i,
				className: "dsvz-home-unclosed-item"
			}, react.default.createElement("span", {
				className: "dsvz-ring-dot",
				style: { background: "#f59e0b" }
			}), react.default.createElement("span", { className: "dsvz-home-unclosed-label" }, r.kind === "tool" ? `工具 ${r.label}` : r.label), react.default.createElement("span", { className: "dsvz-home-unclosed-sub" }, r.kind === "turn" ? "本轮尚未结束" : r.kind === "step" ? "本步尚未结束" : r.kind === "approval" ? "等待审批结果" : "等待工具返回"), r.turn != null && react.default.createElement("button", {
				className: "dsvz-btn dsvz-home-jump",
				onClick: () => onJump && onJump(r)
			}, `跳到第 ${r.turn} 轮${r.step != null ? "·" + r.step + " 步" : ""}`))))), react.default.createElement("div", { className: "dsvz-turnlist" }, (closure.rings || []).map((ring) => {
				const steps = ring.children || [];
				return react.default.createElement("div", {
					key: ring.id,
					className: "dsvz-turnrow" + (ring.status === "open" ? " open" : "")
				}, react.default.createElement("div", {
					className: "dsvz-turnrow-main",
					onClick: () => onJump && onJump(ring),
					title: "跳到事件树对应轮次",
					role: "button",
					tabIndex: 0
				}, react.default.createElement(TurnThumb, { ring }), react.default.createElement("div", { className: "dsvz-turnrow-info" }, react.default.createElement("div", { className: "dsvz-turnrow-head" }, react.default.createElement("span", { className: "dsvz-turnrow-title" }, ring.label), react.default.createElement("span", {
					className: "dsvz-turnrow-chip",
					style: {
						color: colorOf(ring.status),
						borderColor: colorOf(ring.status)
					}
				}, ring.status === "closed" ? "✓ 闭合" : ring.status === "open" ? "◌ 进行中" : "✕ 失败"), react.default.createElement("span", { className: "dsvz-turnrow-count" }, `${steps.length} 步`), ring.durationMs != null && react.default.createElement("span", { className: "dsvz-turnrow-dur" }, fmtDur(ring.durationMs))), react.default.createElement("div", { className: "dsvz-turnrow-steps" }, steps.map((st, i) => react.default.createElement("div", {
					key: i,
					className: "dsvz-steprow"
				}, react.default.createElement("span", {
					className: "dsvz-steprow-dot",
					style: { background: colorOf(st.status) }
				}), react.default.createElement("span", { className: "dsvz-steprow-label" }, st.label), react.default.createElement("span", { className: "dsvz-steprow-tools" }, st.children.filter((c) => c.kind === "tool").slice(0, 5).map((c, j) => react.default.createElement("span", {
					key: j,
					className: "dsvz-steprow-tool" + (c.status === "error" ? " err" : c.status === "open" ? " open" : ""),
					title: `${c.label}${c.durationMs != null ? " · " + fmtDur(c.durationMs) : ""}${c.status === "error" ? " · 失败" : c.status === "open" ? " · 进行中" : ""}`
				}, c.label)), st.children.filter((c) => c.kind === "tool").length > 5 && react.default.createElement("span", { className: "dsvz-steprow-more" }, `+${st.children.filter((c) => c.kind === "tool").length - 5}`)), st.durationMs != null && react.default.createElement("span", { className: "dsvz-steprow-dur" }, fmtDur(st.durationMs))))))));
			})), react.default.createElement("div", { className: "dsvz-home-actions" }, react.default.createElement("button", {
				className: "dsvz-btn dsvz-home-btn",
				onClick: onOpenSummary
			}, "📋 查看执行摘要"), react.default.createElement("button", {
				className: "dsvz-btn dsvz-home-btn",
				onClick: onOpenTree
			}, "🔬 查看事件树"), onOpenMap && react.default.createElement("button", {
				className: "dsvz-btn dsvz-home-btn",
				onClick: onOpenMap
			}, "🗺 打开会话图"))));
		}
		function SummaryView({ summary, onStory, onTree, onSelectFile, devMode, turns, onPos }) {
			const [openFiles, setOpenFiles] = react.default.useState(/* @__PURE__ */ new Set());
			const toggleFile = (i) => setOpenFiles((prev) => {
				const n = new Set(prev);
				n.has(i) ? n.delete(i) : n.add(i);
				return n;
			});
			if (!summary) return react.default.createElement("div", { className: "dsvz-empty" }, "加载中…");
			const s = summary;
			const toolEntries = Object.entries(s.toolStats || {});
			const maxTool = Math.max(1, ...toolEntries.map(([, v]) => v.count));
			const tok = s.tokens || {};
			const shortPath = (p) => {
				const parts = String(p ?? "").split(/[\\/]/);
				return parts.length > 1 ? parts.slice(-2).join("/") : p ?? "";
			};
			const onScroll = (e) => {
				if (!onPos || !turns?.length) return;
				const el = e.currentTarget;
				const ratio = el.scrollHeight <= el.clientHeight ? 1 : el.scrollTop / (el.scrollHeight - el.clientHeight);
				const total = turns.reduce((a, t) => a + (t.eventCount || 0), 0) || 1;
				let acc = 0;
				let turn = turns[0].turn;
				for (const t of turns) {
					acc += t.eventCount || 0;
					if (ratio * total <= acc) {
						turn = t.turn;
						break;
					}
				}
				onPos(turn, null);
			};
			return react.default.createElement("div", {
				className: "dsvz-scroll",
				onScroll
			}, react.default.createElement("div", { className: "dsvz-summary" }, react.default.createElement("div", { className: "dsvz-sum-hero" }, react.default.createElement("div", { className: "t" }, s.title ? `📋 ${s.title}` : "会话执行摘要"), s.userRequest && react.default.createElement("div", { className: "req" }, `「${esc(s.userRequest)}」`), react.default.createElement("div", { className: "stats" }, react.default.createElement("span", { className: "dsvz-stat" }, `🤖 ${s.turnCount} 轮对话`), react.default.createElement("span", { className: "dsvz-stat" }, `🪜 ${s.stepCount} 个步骤`), react.default.createElement("span", { className: "dsvz-stat" }, `⏱ 耗时 ${fmtDur(s.durationMs)}`), s.model && react.default.createElement("span", { className: "dsvz-stat" }, `🧠 ${esc(s.model)}`))), toolEntries.length > 0 && react.default.createElement("div", null, react.default.createElement("div", { className: "dsvz-sec" }, "工具使用"), react.default.createElement("div", { className: "dsvz-toolgrid" }, toolEntries.slice(0, 12).map(([name, v]) => react.default.createElement("div", {
				key: name,
				className: "dsvz-toolcard",
				title: `${name} × ${v.count}`
			}, react.default.createElement("span", { className: "ic" }, v.icon || "🛠️"), react.default.createElement("div", { style: {
				flex: 1,
				minWidth: 0
			} }, react.default.createElement("div", { className: "nm" }, `${v.verb} ${name}`), react.default.createElement("div", { className: "cn" }, `${v.count} 次`), react.default.createElement("div", { className: "dsvz-toolbar" }, react.default.createElement("i", { style: { width: `${(v.count / maxTool * 100).toFixed(0)}%` } }))))))), (s.approvalStats?.total ?? 0) > 0 && react.default.createElement("div", null, react.default.createElement("div", { className: "dsvz-sec" }, "审批"), react.default.createElement("div", { className: "dsvz-approval" }, react.default.createElement("span", { className: "dsvz-badge ok" }, `${s.approvalStats.total} 次审批请求`), react.default.createElement("span", { className: "dsvz-badge ok" }, `✅ 通过 ${s.approvalStats.allowed}`), s.approvalStats.denied > 0 ? react.default.createElement("span", { className: "dsvz-badge bad" }, `❌ 拒绝 ${s.approvalStats.denied}`) : react.default.createElement("span", { className: "dsvz-badge ok" }, "全部通过 🎉"))), (s.files || []).length > 0 && react.default.createElement("div", null, react.default.createElement("div", { className: "dsvz-sec" }, `文件变更（${s.files.length}）`), react.default.createElement("div", { className: "dsvz-files" }, s.files.map((f, i) => {
				const open = openFiles.has(i);
				const hasChange = f.content != null || f.oldString != null && f.newString != null;
				return react.default.createElement(react.default.Fragment, { key: i }, react.default.createElement("div", { className: "dsvz-file" }, react.default.createElement("span", { className: "act " + (f.error ? "e" : f.action === "created" ? "c" : "m") }, f.error ? "失败" : f.action === "created" ? "✨ 新建" : "✏️ 修改"), react.default.createElement("span", {
					className: "pth",
					title: devMode ? f.path : shortPath(f.path)
				}, devMode ? f.path : shortPath(f.path)), f.lines != null && react.default.createElement("span", { style: {
					fontSize: 10.5,
					color: "var(--dsw-alias-label-secondary,#8493ab)",
					flexShrink: 0
				} }, `${f.lines} 行`), hasChange && react.default.createElement("span", {
					className: "fchg",
					onClick: () => toggleFile(i)
				}, open ? "▲ 收起" : "▼ 查看内容")), open && react.default.createElement("div", { className: "dsvz-filediff" }, react.default.createElement("div", { style: {
					fontSize: 10.5,
					color: "var(--dsw-alias-label-secondary,#8493ab)",
					marginBottom: 4
				} }, f.oldString != null ? `修改片段（${String(f.oldString).split("\n").length} 行 → ${String(f.newString).split("\n").length} 行）` : `新增内容（${String(f.content || "").split("\n").length} 行）`), renderFileDiff(f)));
			}))), react.default.createElement("div", null, react.default.createElement("div", { className: "dsvz-sec" }, "Token 用量"), react.default.createElement("div", { className: "dsvz-tokens" }, react.default.createElement("div", { className: "dsvz-tok" }, react.default.createElement("div", { className: "lb" }, "输入"), react.default.createElement("div", { className: "vl" }, fmtNum(tok.inputTokens))), react.default.createElement("div", { className: "dsvz-tok" }, react.default.createElement("div", { className: "lb" }, "输出"), react.default.createElement("div", { className: "vl" }, fmtNum(tok.outputTokens))), react.default.createElement("div", { className: "dsvz-tok" }, react.default.createElement("div", { className: "lb" }, "推理"), react.default.createElement("div", { className: "vl" }, fmtNum(tok.reasoningTokens))), react.default.createElement("div", { className: "dsvz-tok" }, react.default.createElement("div", { className: "lb" }, "缓存读取"), react.default.createElement("div", { className: "vl" }, fmtNum(tok.cacheReadTokens))))), react.default.createElement("div", { className: "dsvz-actions" }, react.default.createElement("button", {
				className: "dsvz-cta",
				onClick: onStory
			}, "📖 查看完整执行时间线"), devMode && react.default.createElement("button", {
				className: "dsvz-cta ghost",
				onClick: onTree
			}, "🔬 查看技术事件列表"))));
		}
		function StoryView({ story, baseTime, onOpenEvent, devMode, onPos }) {
			if (!story) return react.default.createElement("div", { className: "dsvz-empty" }, "加载中…");
			const [openTurns, setOpenTurns] = react.default.useState(new Set(story.length ? [story[0].turn] : []));
			const [openNodes, setOpenNodes] = react.default.useState(/* @__PURE__ */ new Set());
			const toggleTurn = (t) => setOpenTurns((prev) => {
				const n = new Set(prev);
				n.has(t) ? n.delete(t) : n.add(t);
				return n;
			});
			const toggleNode = (key) => setOpenNodes((prev) => {
				const n = new Set(prev);
				n.has(key) ? n.delete(key) : n.add(key);
				return n;
			});
			const onScroll = (e) => {
				if (!onPos || !story.length) return;
				const el = e.currentTarget;
				const ratio = el.scrollHeight <= el.clientHeight ? 1 : el.scrollTop / (el.scrollHeight - el.clientHeight);
				const totalNodes = story.reduce((a, t) => a + t.nodes.length, 0) || 1;
				let acc = 0;
				let turn = story[0].turn;
				for (const t of story) {
					acc += t.nodes.length;
					if (ratio * totalNodes <= acc) {
						turn = t.turn;
						break;
					}
				}
				onPos(turn, null);
			};
			return react.default.createElement("div", {
				className: "dsvz-scroll",
				onScroll
			}, react.default.createElement("div", { className: "dsvz-story" }, story.map((tr) => react.default.createElement("div", {
				key: tr.turn,
				className: "dsvz-story-turn"
			}, react.default.createElement("div", {
				className: "dsvz-story-turnhead",
				onClick: () => toggleTurn(tr.turn)
			}, react.default.createElement("span", { className: "tt" }, `${openTurns.has(tr.turn) ? "▾" : "▸"} 第 ${tr.turn} 轮对话`), react.default.createElement("span", { className: "tm" }, `${tr.nodes.length} 个节点`)), openTurns.has(tr.turn) && react.default.createElement("div", { className: "dsvz-story-body" }, tr.nodes.map((n, i) => {
				const key = `${tr.turn}-${i}`;
				const open = openNodes.has(key);
				const detail = n.text || "";
				const showArgs = devMode && !!n.args;
				return react.default.createElement("div", {
					key,
					className: `dsvz-story-node ${n.kind}${open ? " open" : ""}`
				}, react.default.createElement("span", { className: "nt" }, relTime(n.time, baseTime)), react.default.createElement("span", { className: "nh" }, esc(n.human || "")), (n.kind === "reasoning" || n.kind === "user" || n.kind === "assistant") && detail && react.default.createElement("span", {
					className: "arrow",
					onClick: () => toggleNode(key)
				}, open ? "▲ 收起" : "▼ 展开"), showArgs && react.default.createElement("span", {
					className: "arrow",
					onClick: () => toggleNode(key)
				}, open ? "▲ 收起" : "▼ 参数"), detail && react.default.createElement("div", { className: "nd" }, esc(String(detail).slice(0, 2e3))), showArgs && open && react.default.createElement("div", { className: "nd" }, esc(String(n.args).slice(0, 2e3))), n.kind === "tool" && n.result && react.default.createElement("div", { className: "res" + (n.resultError ? " err" : "") }, n.result), n.kind === "approval" && n.outcomeHuman && react.default.createElement("div", { className: "outc " + (n.outcome === "denied" ? "no" : "yes") }, n.outcomeHuman));
			}))))));
		}
		function chunkBody(g, ql) {
			const text = g.text || g.preview || "(无预览)";
			if (g.kind === "tool-call") try {
				const parsed = JSON.parse(text);
				return react.default.createElement("div", {
					className: "dsvz-grpbody",
					dangerouslySetInnerHTML: { __html: jsonHighlight(parsed) }
				});
			} catch {}
			return react.default.createElement("div", { className: "dsvz-grpbody" }, highlightQ(esc(text), ql));
		}
		function TreeView({ turns, meta, typeCounts, groups, onSelectEvent, selectedLine, onPosChange, jumpSignal, onFocusStep, onClearEvent }) {
			const [openTurns, setOpenTurns] = react.default.useState(new Set(turns?.length ? [turns[0].turn] : []));
			const [openSteps, setOpenSteps] = react.default.useState(/* @__PURE__ */ new Set());
			const [openGroups, setOpenGroups] = react.default.useState(/* @__PURE__ */ new Set());
			const [typeFilter, setTypeFilter] = react.default.useState("");
			const [search, setSearch] = react.default.useState("");
			const baseTime = meta?.startTime ?? null;
			react.default.useEffect(() => {
				if (!turns?.length) return;
				const t0 = turns[0];
				if (t0.steps?.length) {
					const s0 = t0.steps[0];
					setOpenSteps((prev) => {
						const n = new Set(prev);
						n.add(`${t0.turn}-${s0.step}`);
						return n;
					});
					onFocusStep && onFocusStep(s0);
				}
			}, [turns]);
			react.default.useEffect(() => {
				if (!jumpSignal || !turns?.length) return;
				const target = jumpSignal.turn;
				setOpenTurns((prev) => {
					const n = new Set(prev);
					n.add(target);
					return n;
				});
				if (jumpSignal.step != null) setOpenSteps((prev) => {
					const n = new Set(prev);
					n.add(`${target}-${jumpSignal.step}`);
					return n;
				});
				setTimeout(() => {
					const el = jumpSignal.step != null ? document.querySelector(`[data-step-head="${target}-${jumpSignal.step}"]`) : document.querySelector(`[data-turn-head="${target}"]`);
					if (el) el.scrollIntoView({ block: "nearest" });
				}, 50);
			}, [jumpSignal, turns]);
			react.default.useEffect(() => {
				if (onPosChange && turns?.length) onPosChange([...openTurns].sort((a, b) => a - b).pop() ?? turns[0].turn, [...openSteps].map((k) => parseInt(k.split("-")[1], 10)).sort((a, b) => a - b).pop() ?? null);
			}, [
				openTurns,
				openSteps,
				turns,
				onPosChange
			]);
			if (!turns) return react.default.createElement("div", { className: "dsvz-empty" }, "加载中…");
			const toggleTurn = (t) => setOpenTurns((prev) => {
				const n = new Set(prev);
				n.has(t) ? n.delete(t) : n.add(t);
				return n;
			});
			const toggleStep = (k) => setOpenSteps((prev) => {
				const n = new Set(prev);
				n.has(k) ? n.delete(k) : n.add(k);
				return n;
			});
			const toggleGroup = (k) => setOpenGroups((prev) => {
				const n = new Set(prev);
				n.has(k) ? n.delete(k) : n.add(k);
				return n;
			});
			const ql = search.trim().toLowerCase();
			const matchesSearch = (g) => {
				if (!ql) return true;
				if (g.kind === "event") {
					const ev = g.events[0];
					return `${ev.summary ?? ""} ${ev.type} ${ev.human ?? ""} ${ev.seq ?? ""}`.toLowerCase().includes(ql);
				}
				return `${g.preview ?? ""} ${g.label}`.toLowerCase().includes(ql);
			};
			const matchesType = (g) => {
				if (!typeFilter) return true;
				if (g.kind === "event") return g.events.some((e) => e.type === typeFilter);
				return (CHUNK_TYPE_OF[g.kind] ?? "") === typeFilter;
			};
			const countFor = (t) => typeCounts?.[t] ?? 0;
			const turnEls = turns.map((tr) => {
				const turnOpen = openTurns.has(tr.turn);
				const stepEls = tr.steps.map((st) => {
					const stepKey = `${tr.turn}-${st.step}`;
					const stepOpen = openSteps.has(stepKey);
					const groups = (st.groups || []).filter(matchesType).filter(matchesSearch);
					return react.default.createElement("div", {
						key: stepKey,
						className: "dsvz-step"
					}, react.default.createElement("div", {
						className: "dsvz-stephead" + (stepOpen ? " open" : ""),
						onClick: () => {
							toggleStep(stepKey);
							onFocusStep && onFocusStep(st);
							onClearEvent && onClearEvent();
						}
					}, react.default.createElement("span", { className: "chev" }, "▶"), react.default.createElement("span", { className: "sb" }, `Step ${st.step}`), react.default.createElement("span", { className: "sm" }, `${fmtNum(st.eventCount)} 条 · ${fmtDur(dur(st))}${st.tools?.length ? " · " + [...new Set(st.tools)].slice(0, 3).join(", ") : ""}`)), stepOpen && react.default.createElement("div", { className: "dsvz-groupwrap" }, groups.map((g, gi) => {
						const gKey = `${stepKey}-g${gi}`;
						if (g.kind === "event") {
							const ev = g.events[0];
							return eventRow(ev, baseTime, selectedLine, () => onSelectEvent(ev), grp(groupsMeta(), ev.group), ql);
						}
						const gOpen = openGroups.has(gKey);
						return react.default.createElement("div", {
							key: gKey,
							className: "dsvz-grp"
						}, react.default.createElement("div", {
							className: "dsvz-grphe" + (gOpen ? " open" : ""),
							onClick: () => toggleGroup(gKey),
							style: { borderLeftColor: g.fg }
						}, react.default.createElement("span", {
							className: "chev",
							style: { color: "var(--dsvz-text-3)" }
						}, "▶"), react.default.createElement("span", {
							className: "gname",
							style: { color: g.fg }
						}, g.label), react.default.createElement("span", { className: "gmeta" }, `${fmtNum(g.count)} 分片 · ${fmtNum(g.chars)} 字符 · ${fmtDur(g.durationMs)}`)), gOpen && chunkBody(g, ql));
					})));
				});
				return react.default.createElement("div", {
					key: tr.turn,
					className: "dsvz-turn"
				}, react.default.createElement("div", {
					"data-turn-head": tr.turn,
					className: "dsvz-turnhead" + (turnOpen ? " open" : ""),
					onClick: () => toggleTurn(tr.turn)
				}, react.default.createElement("span", { className: "chev" }, "▶"), react.default.createElement("span", { className: "tb" }, `Turn ${tr.turn}`), react.default.createElement("span", { className: "tm" }, `${fmtNum(tr.eventCount)} 条 · ${fmtDur(dur(tr))}`)), turnOpen && react.default.createElement("div", { className: "dsvz-stepwrap" }, stepEls, (tr.groups || []).filter(matchesType).filter(matchesSearch).map((g, gi) => {
					const gKey = `t${tr.turn}-g${gi}`;
					if (g.kind === "event") {
						const ev = g.events[0];
						return eventRow(ev, baseTime, selectedLine, () => onSelectEvent(ev), grp(groupsMeta(), ev.group), ql);
					}
					const gOpen = openGroups.has(gKey);
					return react.default.createElement("div", {
						key: gKey,
						className: "dsvz-grp"
					}, react.default.createElement("div", {
						className: "dsvz-grphe" + (gOpen ? " open" : ""),
						onClick: () => toggleGroup(gKey),
						style: { borderLeftColor: g.fg }
					}, react.default.createElement("span", {
						className: "chev",
						style: { color: "var(--dsvz-text-3)" }
					}, "▶"), react.default.createElement("span", {
						className: "gname",
						style: { color: g.fg }
					}, g.label), react.default.createElement("span", { className: "gmeta" }, `${fmtNum(g.count)} 分片 · ${fmtNum(g.chars)} 字符 · ${fmtDur(g.durationMs)}`)), gOpen && chunkBody(g, ql));
				})));
			});
			const curTurnNum = openTurns.size ? Math.max(...openTurns) : turns[0]?.turn ?? null;
			const curStepNum = openSteps.size ? Math.max(...[...openSteps].map((k) => parseInt(k.split("-")[1], 10))) : null;
			return react.default.createElement("div", { className: "dsvz-tree" }, react.default.createElement("div", { className: "dsvz-left" }, react.default.createElement("div", { className: "dsvz-leftbar" }, react.default.createElement("input", {
				type: "search",
				placeholder: "搜索摘要 / 类型 / 内容…",
				value: search,
				onChange: (e) => setSearch(e.target.value)
			}), react.default.createElement("select", {
				value: typeFilter,
				onChange: (e) => setTypeFilter(e.target.value),
				title: "按事件类型筛选（按功能分组）"
			}, react.default.createElement("option", { value: "" }, "全部事件类型"), typeOptions().map((g) => react.default.createElement("optgroup", {
				key: g.group,
				label: g.label
			}, g.types.map((t) => react.default.createElement("option", {
				key: t.type,
				value: t.type
			}, `${t.type} (${countFor(t.type)})`)))))), react.default.createElement(TurnStepChain, {
				turns,
				currentTurn: curTurnNum,
				currentStep: curStepNum,
				onSeekTurn: (t) => {
					setOpenTurns((prev) => {
						const n = new Set(prev);
						n.add(t);
						return n;
					});
				}
			}), react.default.createElement("div", { className: "dsvz-tree" }, turnEls)));
		}
		const CHUNK_TYPE_OF = {
			reasoning: "reasoning-chunks",
			text: "text-chunks",
			"tool-call": "tool-call-chunks",
			assistant: "assistant/chunk"
		};
		function dur(node) {
			if (node.endTime != null && node.startTime != null) return Math.max(0, node.endTime - node.startTime);
			return null;
		}
		function groupsMeta() {
			return groupsCache;
		}
		function eventRow(ev, baseTime, selectedLine, onClick, g, ql) {
			const isChunk = ev.human !== void 0;
			const text = isChunk ? ev.human || "" : ev.summary || "";
			const inner = react.default.createElement("span", {
				className: isChunk ? "eh" : "es",
				dangerouslySetInnerHTML: { __html: highlightQ(esc(text), ql) }
			});
			return react.default.createElement("div", {
				key: ev.line,
				className: "dsvz-ev" + (selectedLine === ev.line ? " sel" : "") + (ev.error ? " err" : ""),
				onClick,
				style: { borderLeftColor: g.border }
			}, react.default.createElement("span", { className: "et" }, ev.seq != null ? `#${ev.seq}` : `L${ev.line}`), react.default.createElement("span", {
				className: "etl",
				style: {
					background: g.bg,
					color: g.fg,
					borderColor: g.border
				}
			}, ev.type), inner, react.default.createElement("span", { className: "ed" }, ev.time ? relTime(ev.time, baseTime) : ""));
		}
		function highlightQ(text, ql) {
			if (!ql) return text;
			const re = new RegExp(escRegExp(ql), "gi");
			return text.replace(re, (m) => `<mark style="background:#ffe58f;padding:0 1px;border-radius:2px">${m}</mark>`);
		}
		function escRegExp(s) {
			return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		}
		function typeOptions() {
			return [
				[
					"会话生命周期",
					"session",
					"session/title",
					"session/title-llm-request",
					"session/end-seed"
				],
				[
					"配置与权限",
					"permission/preset",
					"sandbox/mode",
					"approval/policy",
					"request/header",
					"request/context",
					"agent-preset/selected"
				],
				[
					"对话轮次",
					"turn/start",
					"turn/end"
				],
				[
					"执行步骤",
					"step/start",
					"step/end"
				],
				[
					"用户输入",
					"user/message",
					"agent/inbox/spliced"
				],
				[
					"助手输出",
					"assistant/message",
					"assistant/chunk"
				],
				["推理过程", "reasoning-chunks"],
				["通用文本", "text-chunks"],
				[
					"工具调用",
					"tool-call-chunks",
					"tool/call",
					"tool/result"
				],
				[
					"审批流程",
					"approval/asked",
					"approval/decided"
				],
				["任务清单", "todo/write"],
				[
					"LLM 重试",
					"llm/retry",
					"llm/retry-started"
				],
				[
					"命令执行",
					"command/run",
					"command/done"
				],
				["Web 搜索", "web/deepseek-search-llm-request"]
			].map(([label, ...types]) => ({
				group: label,
				label,
				types: types.map((t) => ({
					type: t,
					count: ""
				}))
			}));
		}
		function Viewer({ sessionId: initialSessionId, groups, onClose }) {
			const [sessionId, setSessionId] = react.default.useState(initialSessionId);
			const [sessions, setSessions] = react.default.useState([]);
			const [mode, setMode] = react.default.useState("home");
			const [, setTick] = react.default.useState(0);
			const [meta, setMeta] = react.default.useState(null);
			const [summary, setSummary] = react.default.useState(null);
			const [story, setStory] = react.default.useState(null);
			const [tree, setTree] = react.default.useState(null);
			const [closure, setClosure] = react.default.useState(null);
			const [typeCounts, setTypeCounts] = react.default.useState(null);
			const [err, setErr] = react.default.useState(null);
			const [loading, setLoading] = react.default.useState(false);
			const [loadStage, setLoadStage] = react.default.useState(null);
			const [selected, setSelected] = react.default.useState(null);
			const [selectedLine, setSelectedLine] = react.default.useState(null);
			const [currentTurn, setCurrentTurn] = react.default.useState(null);
			const [currentStep, setCurrentStep] = react.default.useState(null);
			const [jumpSignal, setJumpSignal] = react.default.useState(null);
			const [focusedStep, setFocusedStep] = react.default.useState(null);
			const [maximized, setMaximized] = react.default.useState(false);
			const loadSession = react.default.useCallback(async (sid) => {
				if (!sid) return;
				setLoading(true);
				setErr(null);
				setSummary(null);
				setStory(null);
				setTree(null);
				setClosure(null);
				setSelected(null);
				setSelectedLine(null);
				try {
					setLoadStage("meta");
					const metaRes = await fetch(`/dsh-session-viz/api/tree?sessionId=${encodeURIComponent(sid)}`).then((r) => r.json());
					setTree(metaRes.turns);
					setMeta(metaRes.meta);
					setTypeCounts(metaRes.typeCounts);
					setClosure(metaRes.closure ?? null);
					setLoadStage("summary");
					const s = await apiSummary(sid);
					setSummary(s.summary);
					setLoadStage("story");
					const st = await apiStory(sid);
					setStory(st.story);
					setLoadStage(null);
				} catch (e) {
					setErr(e.message);
				} finally {
					setLoading(false);
					setLoadStage(null);
				}
			}, []);
			react.default.useEffect(() => {
				loadSession(sessionId);
			}, [sessionId, loadSession]);
			react.default.useEffect(() => {
				apiSessions().then((d) => setSessions(d.sessions)).catch(() => {});
			}, []);
			const selectEvent = react.default.useCallback(async (ev) => {
				setSelectedLine(ev.line);
				setSelected({
					ev,
					raw: null
				});
				setFocusedStep(null);
				try {
					const d = await apiLine(sessionId, ev.line);
					setSelected((prev) => prev && prev.ev.line === ev.line ? {
						ev: d.event,
						raw: d.raw
					} : prev);
				} catch {}
			}, [sessionId]);
			const modeTab = (id, label) => react.default.createElement("button", {
				key: id,
				className: "dsvz-mode" + (mode === id ? " active" : ""),
				onClick: () => setMode(id)
			}, label);
			const toggleDev = () => {
				devMode = !devMode;
				setTick((n) => n + 1);
				if (!devMode) setMode("summary");
			};
			const handleSeek = (ratio) => {
				if (!devMode || !tree?.length) return;
				let acc = 0;
				let target = tree[0].turn;
				const total = tree.reduce((a, t) => a + (t.eventCount || 0), 0) || 1;
				for (const t of tree) {
					acc += t.eventCount || 0;
					if (ratio * total <= acc) {
						target = t.turn;
						break;
					}
				}
				setMode("tree");
				setJumpSignal({
					turn: target,
					ts: Date.now()
				});
			};
			return react.default.createElement("div", {
				className: "dsvz-ov",
				onMouseDown: (e) => {
					if (e.target === e.currentTarget) onClose();
				}
			}, react.default.createElement("div", { className: "dsvz-box" + (maximized ? " dsvz-max" : "") }, react.default.createElement("div", { className: "dsvz-head" }, react.default.createElement("div", { className: "dsvz-brand" }, react.default.createElement("span", { className: "dsvz-brand-icon" }, "◈"), react.default.createElement("div", { className: "dsvz-brand-text" }, react.default.createElement("span", { className: "dsvz-brand-name" }, "AgentTrace"), react.default.createElement("span", { className: "dsvz-brand-sub" }, "智能体轨迹"))), react.default.createElement("span", {
				className: "dsvz-pill dsvz-title-pill",
				title: meta?.title ?? sessionId
			}, meta?.title ?? "未命名会话"), react.default.createElement("span", { className: "dsvz-spacer" }), react.default.createElement("div", { className: "dsvz-ops" }, devMode && react.default.createElement("span", {
				className: "dsvz-pill",
				title: meta?.cwd ?? ""
			}, shortPath(meta?.cwd ?? "")), react.default.createElement("span", { className: "dsvz-pill" }, loading && !summary ? "解析中…" : `${fmtNum(summary?.eventCount ?? 0)} 条事件`), react.default.createElement("select", {
				value: sessionId,
				onChange: (e) => setSessionId(e.target.value),
				title: "切换会话"
			}, sessions.map((s) => react.default.createElement("option", {
				key: s.id,
				value: s.id
			}, s.title ?? "未命名会话"))), react.default.createElement("button", {
				className: "dsvz-btn" + (devMode ? " devon" : ""),
				onClick: toggleDev,
				title: devMode ? "关闭开发者模式（隐藏原始日志/内部字段）" : "开启开发者模式（显示原始 JSON、事件类型、内部 ID）"
			}, devMode ? "🛠 开发者模式" : "🛠 开发者"), react.default.createElement("button", {
				className: "dsvz-btn",
				onClick: () => loadSession(sessionId),
				disabled: loading
			}, "↻ 刷新"), react.default.createElement("button", {
				className: "dsvz-btn",
				onClick: () => setMaximized((v) => !v),
				title: maximized ? "还原窗口大小" : "最大化窗口"
			}, maximized ? "🗗 还原" : "⛶ 最大化"), react.default.createElement("button", {
				className: "dsvz-btn",
				onClick: onClose
			}, "✕ 关闭"))), react.default.createElement("div", { className: "dsvz-modes" }, modeTab("home", "🏠 首页"), modeTab("summary", "📋 摘要"), modeTab("story", "📖 故事线"), devMode && modeTab("tree", "🔬 事件树"), extraModes.map((em) => modeTab(em.id, em.label))), err && react.default.createElement("div", {
				className: "dsvz-load",
				style: { color: "#dc2626" }
			}, `错误：${esc(err)}`), loading && !summary && react.default.createElement(LoadingOverlay, { stage: loadStage }), mode === "home" && react.default.createElement(HomeView, {
				closure,
				meta,
				turns: tree,
				onJump: (ring) => {
					if (!ring) return;
					setMode("tree");
					setJumpSignal({
						turn: ring.turn,
						step: ring.step ?? null,
						ts: Date.now()
					});
					if (!devMode) devMode = true;
				},
				onOpenSummary: () => setMode("summary"),
				onOpenTree: () => {
					if (!devMode) devMode = true;
					setMode("tree");
				},
				onOpenMap: extraModes.some((em) => em.id === "map") ? () => setMode("map") : null
			}), extraModes.map((em) => mode === em.id && em.render(sessionId)), mode === "summary" && react.default.createElement(SummaryView, {
				summary,
				devMode,
				turns: tree,
				onPos: (t) => setCurrentTurn(t),
				onStory: () => setMode("story"),
				onTree: () => setMode("tree")
			}), mode === "story" && react.default.createElement(StoryView, {
				story,
				baseTime: meta?.startTime ?? summary?.startTime,
				devMode,
				onPos: (t) => setCurrentTurn(t)
			}), mode === "tree" && devMode && react.default.createElement("div", { className: "dsvz-tree" }, react.default.createElement("div", { className: "dsvz-left" }, react.default.createElement(TreeView, {
				turns: tree,
				meta,
				typeCounts,
				groups,
				onSelectEvent: selectEvent,
				selectedLine,
				onPosChange: (t, s) => {
					setCurrentTurn(t);
					setCurrentStep(s);
				},
				jumpSignal,
				onFocusStep: (st) => {
					setFocusedStep(st);
					setSelected(null);
				},
				onClearEvent: () => setSelected(null)
			})), react.default.createElement("div", { className: "dsvz-right" }, selected ? react.default.createElement(DetailView, {
				ev: selected.ev,
				raw: selected.raw,
				groups,
				devMode
			}) : focusedStep ? react.default.createElement("div", { className: "dsvz-rcontent" }, react.default.createElement("div", { className: "dsvz-rtitle" }, "🎯 单步执行进度"), react.default.createElement(StepProgress, {
				step: focusedStep,
				positionRatio: currentTurn != null && tree?.length ? (tree.findIndex((t) => t.turn === currentTurn) + 1) / tree.length : 0
			})) : react.default.createElement(SessionOverview, {
				summary,
				meta,
				devMode
			}))), mode === "tree" && !devMode && react.default.createElement("div", { className: "dsvz-empty" }, "事件树为开发者功能，请点击顶栏「🛠 开发者」开启"), react.default.createElement(GlobalProgressBar, {
				turns: tree,
				currentTurn,
				totalEvents: summary?.eventCount,
				onSeek: handleSeek
			})));
		}
		function SessionOverview({ summary, meta, devMode }) {
			if (!summary) return react.default.createElement("div", { className: "dsvz-empty" }, "会话概览将在解析完成后显示");
			const toolEntries = Object.entries(summary.toolStats || {}).slice(0, 8);
			const maxTool = Math.max(1, ...toolEntries.map(([, v]) => v.count));
			const shortPath = (p) => {
				const parts = String(p ?? "").split(/[\\/]/);
				return parts.length > 1 ? parts.slice(-2).join("/") : p ?? "";
			};
			const rows = [
				["智能体", summary.model],
				["创建时间", meta?.startTime ? fmtTime(meta.startTime) : "—"],
				["总耗时", fmtDur(summary.durationMs)]
			];
			if (devMode) rows.unshift(["工作目录", meta?.cwd ?? summary.title], ["会话 ID", meta?.id ?? "—"]);
			else rows.unshift(["工作目录", shortPath(meta?.cwd) ?? summary.title]);
			return react.default.createElement("div", { className: "dsvz-rcontent" }, react.default.createElement("div", { className: "dsvz-rtitle" }, "📋 会话概览"), react.default.createElement("table", { className: "dsvz-kv" }, rows.map(([k, v], i) => react.default.createElement("tr", { key: i }, react.default.createElement("td", null, k), react.default.createElement("td", null, v)))), react.default.createElement("div", { className: "dsvz-sec" }, "工具调用 Top"), toolEntries.map(([name, v]) => react.default.createElement("div", {
				key: name,
				style: {
					display: "flex",
					alignItems: "center",
					gap: 8,
					fontSize: 12,
					marginBottom: 5
				}
			}, react.default.createElement("span", { style: {
				width: 110,
				overflow: "hidden",
				textOverflow: "ellipsis",
				whiteSpace: "nowrap"
			} }, `${v.icon} ${name}`), react.default.createElement("div", { style: {
				flex: 1,
				height: 8,
				background: "rgba(128,128,128,.12)",
				borderRadius: 4,
				overflow: "hidden"
			} }, react.default.createElement("div", { style: {
				height: "100%",
				width: `${(v.count / maxTool * 100).toFixed(0)}%`,
				background: "#2563eb",
				borderRadius: 4
			} })), react.default.createElement("span", { style: {
				width: 44,
				textAlign: "right",
				fontVariantNumeric: "tabular-nums",
				color: "var(--dsw-alias-label-secondary,#8493ab)"
			} }, v.count))), react.default.createElement("div", { className: "dsvz-sec" }, "事件统计"), react.default.createElement("table", { className: "dsvz-kv" }, [
				["总事件", fmtNum(summary.eventCount)],
				["轮次", summary.turnCount],
				["步骤", summary.stepCount],
				["审批", summary.approvalStats ? `${summary.approvalStats.total}（通过 ${summary.approvalStats.allowed} / 拒绝 ${summary.approvalStats.denied}）` : "—"]
			].map(([k, v], i) => react.default.createElement("tr", { key: i }, react.default.createElement("td", null, k), react.default.createElement("td", null, v)))));
		}
		function ViewerButton({ sessionId, t }) {
			const isOpen = react.default.useSyncExternalStore(subscribe, getOpen);
			return react.default.createElement(react.default.Fragment, null, react.default.createElement("button", {
				type: "button",
				onClick: () => setOpen(!isOpen, sessionId),
				title: "AgentTrace：追踪智能体执行轨迹（摘要 / 故事线 / 事件树）",
				className: isOpen ? "dsvz-header-btn active" : "dsvz-header-btn",
				style: {
					border: "1px solid var(--dsw-alias-border-l2)",
					minWidth: "104px",
					height: 32,
					color: "var(--dsw-alias-label-primary)",
					fontFamily: "var(--dsw-font-family)",
					cursor: "pointer",
					background: "0 0",
					borderRadius: 18,
					justifyContent: "center",
					alignItems: "center",
					gap: 5,
					padding: "6px 13px",
					fontSize: 13,
					fontWeight: 600,
					lineHeight: "20px",
					display: "inline-flex",
					transition: "border-color .15s,color .15s,background .15s"
				}
			}, react.default.createElement("span", null, "◈ AgentTrace")), isOpen && (0, react_dom.createPortal)(react.default.createElement(Viewer, {
				sessionId: openSessionId || sessionId,
				groups: groupsCache,
				onClose: () => setOpen(false)
			}), document.body));
		}
		let groupsCache = null;
		apiMeta().then((m) => {
			groupsCache = m.groups;
		}).catch(() => {});
		const apply$1 = (ctx) => {
			ensureStyles$1();
			ctx.effect(() => ctx.slots.inject("conversation.session.header.utilities", () => ctx.slots.register({
				name: "conversation.session.header.utilities",
				id: "session-viz",
				order: -1,
				label: () => "查看日志"
			}, ViewerButton)), "dsh-session-viz: session header viewer button");
		};
		//#endregion
		//#region src/client/model.ts
		function orderedNodes(nodes) {
			return [...nodes].sort((left, right) => left.time - right.time || left.seq - right.seq);
		}
		/** Human-facing label for a semantic event category. */
		function kindLabel(kind) {
			switch (kind) {
				case "input": return "输入";
				case "model": return "模型";
				case "tool": return "工具";
				case "error": return "错误";
				case "turn": return "轮次";
			}
		}
		/** Formats a duration without leaking raw event payloads. */
		function durationLabel(node) {
			if (node.endTime === void 0) return void 0;
			const milliseconds = Math.max(0, node.endTime - node.time);
			return milliseconds < 1e3 ? `${String(milliseconds)} ms` : `${(milliseconds / 1e3).toFixed(1)} s`;
		}
		/** Counts the lightweight facts in a projection. */
		function eventCount(snapshot) {
			return snapshot.sessions.reduce((total, session) => total + session.nodes.length, 0);
		}
		const LOOP_RING_RADIUS = 74;
		const LOOP_BRANCH_RADIUS = 34;
		function statusOfNodes(nodes) {
			if (nodes.some((node) => node.status === "error")) return "error";
			if (nodes.some((node) => node.status === "running")) return "running";
			return "completed";
		}
		/** 在节点集中找时间最近的节点，返回它的角度。 */
		function nearestAngleOf(nodes, time) {
			if (nodes.length === 0) return void 0;
			let best = nodes[0];
			let bestDistance = Infinity;
			for (const ringNode of nodes) {
				const distance = Math.abs(ringNode.node.time - time);
				if (distance < bestDistance) {
					bestDistance = distance;
					best = ringNode;
				}
			}
			return best.angle;
		}
		/**
		* 把会话快照布局为「闭环轮环卡片」：
		* 根会话的每个轮次 = 一张独立卡片里的一个闭环（半径固定），环上按时间把步骤切成
		* 弧段、节点落点在环上；子 Agent = 挂在父轮环旁的迷你分叉环（分叉→执行→汇回，
		* 组件负责定位）。闭合/进行中/失败由状态颜色、虚线与脉冲动画表达。
		*/
		function loopLayout(snapshot) {
			const root = snapshot.sessions.find((session) => session.id === snapshot.rootSessionId) ?? snapshot.sessions[0];
			const rootNodes = orderedNodes(root?.nodes ?? []);
			const byTurn = /* @__PURE__ */ new Map();
			for (const node of rootNodes) {
				const turn = node.turn ?? 1;
				const list = byTurn.get(turn) ?? [];
				list.push(node);
				byTurn.set(turn, list);
			}
			const turns = [];
			for (const turn of [...byTurn.keys()].sort((a, b) => a - b)) {
				const nodes = byTurn.get(turn);
				const sorted = [...nodes].sort((a, b) => a.time - b.time || a.seq - b.seq);
				const first = sorted[0];
				const last = sorted.at(-1);
				const span = Math.max(1, last.time - first.time);
				const ringNodes = sorted.map((node) => {
					const angle = -Math.PI / 2 + (node.time - first.time) / span * Math.PI * 2;
					return {
						node,
						angle,
						x: LOOP_RING_RADIUS * Math.cos(angle),
						y: LOOP_RING_RADIUS * Math.sin(angle)
					};
				});
				const steps = [];
				let current = [];
				let currentKey;
				for (const ringNode of ringNodes) {
					const key = ringNode.node.step ?? `n${ringNode.node.seq}`;
					if (currentKey !== void 0 && key !== currentKey && current.length > 0) {
						steps.push({
							step: typeof currentKey === "number" ? currentKey : -1,
							angleFrom: current[0].angle,
							angleTo: current.at(-1).angle,
							status: statusOfNodes(current.map((c) => c.node)),
							nodes: current
						});
						current = [];
					}
					currentKey = key;
					current.push(ringNode);
				}
				if (current.length > 0) steps.push({
					step: typeof currentKey === "number" ? currentKey : -1,
					angleFrom: current[0].angle,
					angleTo: current.at(-1).angle,
					status: statusOfNodes(current.map((c) => c.node)),
					nodes: current
				});
				turns.push({
					turn,
					radius: LOOP_RING_RADIUS,
					status: statusOfNodes(nodes),
					steps,
					nodes: ringNodes,
					startTime: first.time,
					endTime: last.endTime ?? last.time,
					durationMs: last.endTime !== void 0 ? Math.max(0, last.endTime - first.time) : void 0
				});
			}
			const branches = [];
			for (const session of snapshot.sessions) {
				if (session.id === root?.id) continue;
				const nodes = orderedNodes(session.nodes);
				const last = nodes.at(-1);
				const forkTime = session.createdAt;
				let parentTurn = turns[0]?.turn ?? 1;
				for (const ring of turns) if (ring.startTime <= forkTime && forkTime <= (ring.endTime ?? ring.startTime)) {
					parentTurn = ring.turn;
					break;
				}
				const parentRing = turns.find((ring) => ring.turn === parentTurn);
				const forkAngle = parentRing !== void 0 ? nearestAngleOf(parentRing.nodes, forkTime) ?? 0 : 0;
				const mergeAngle = parentRing !== void 0 ? nearestAngleOf(parentRing.nodes, last?.endTime ?? last?.time ?? forkTime) ?? forkAngle : forkAngle;
				const startTime = nodes[0]?.time ?? forkTime;
				const span = Math.max(1, (last?.time ?? forkTime) - startTime);
				const branchNodes = nodes.map((node) => {
					const angle = -Math.PI / 2 + (node.time - startTime) / span * Math.PI * 2;
					return {
						node,
						angle,
						x: LOOP_BRANCH_RADIUS * Math.cos(angle),
						y: LOOP_BRANCH_RADIUS * Math.sin(angle)
					};
				});
				branches.push({
					session,
					parentTurn,
					radius: LOOP_BRANCH_RADIUS,
					forkAngle,
					mergeAngle,
					status: statusOfNodes(nodes),
					nodes: branchNodes
				});
			}
			return {
				turns,
				branches,
				maxRadius: LOOP_RING_RADIUS
			};
		}
		//#endregion
		//#region src/client/semantic.ts
		const TOOL_NAMES = {
			web_search: "网页搜索",
			web_fetch: "网页读取",
			shell: "终端命令",
			bash: "终端命令",
			pwsh: "PowerShell 命令",
			read_file: "读取文件",
			write_file: "写入文件",
			edit_file: "编辑文件",
			list_dir: "列出目录",
			search_files: "搜索文件",
			subagent: "启动子 Agent",
			subagent_fork: "派生子 Agent",
			todo_write: "更新任务清单",
			apply_patch: "应用补丁",
			imagegen: "生成图片",
			exec_command: "执行命令",
			write_stdin: "终端输入",
			read_mcp_resource: "读取 MCP 资源",
			list_mcp_resources: "列出 MCP 资源",
			list_mcp_resource_templates: "列出 MCP 模板"
		};
		const ERROR_CODES = {
			WEB_PROVIDER_CREDENTIAL_MISSING: "未配置网页服务凭据",
			TOOL_TIMEOUT: "工具执行超时",
			TOOL_NOT_FOUND: "未找到工具",
			PERMISSION_DENIED: "权限被拒绝",
			UNKNOWN: "未分类错误"
		};
		/** Converts a stable tool identifier to a readable Chinese action name. */
		function toolName(value) {
			if (TOOL_NAMES[value] !== void 0) return TOOL_NAMES[value];
			if (value.startsWith("mcp__")) return "MCP 工具调用";
			return "工具调用";
		}
		/** Converts a known execution failure code while retaining unknown codes verbatim. */
		function errorName(value) {
			if (value === void 0) return void 0;
			return ERROR_CODES[value] ?? `执行失败：${value}`;
		}
		/** Produces the UI's Chinese title and semantic summary for one node. */
		function describeNode(node) {
			switch (node.kind) {
				case "input": return {
					title: "用户输入",
					summary: "一条用户消息或系统注入内容进入本轮会话。"
				};
				case "model": return {
					title: "模型回复",
					summary: "模型已完成本步骤的回复。"
				};
				case "turn": return {
					title: `第 ${String(node.turn ?? "?")} 轮开始`,
					summary: "Agent 开始处理一轮新的任务。"
				};
				case "tool": return {
					title: toolName(node.title),
					summary: node.status === "running" ? "工具仍在执行。" : "工具已完成执行。"
				};
				case "error": return {
					title: `${toolName(node.title)}失败`,
					summary: errorName(node.detail) ?? "本步骤或工具执行失败。"
				};
			}
		}
		/** Describes an original event type in Chinese for the raw-log inspector. */
		function eventTypeName(type) {
			return {
				"turn/start": "轮次开始",
				"turn/end": "轮次结束",
				"step/start": "步骤开始",
				"step/end": "步骤结束",
				"user/message": "用户消息",
				"assistant/message": "模型回复",
				"assistant/chunk": "模型流式片段",
				"tool/call": "工具调用",
				"tool/result": "工具结果",
				"request/header": "模型请求配置",
				"request/context": "模型路由信息",
				"todo/write": "任务清单更新",
				"session/title": "会话标题更新"
			}[type] ?? type;
		}
		//#endregion
		//#region src/client/LoopMap.tsx
		const KIND_COLOR = {
			input: "#62a9ff",
			model: "#b48cff",
			tool: "#3ecf9a",
			error: "#f0646b",
			turn: "#9aafd1"
		};
		const STATUS_COLOR = {
			completed: "#3ecf9a",
			running: "#f5b83d",
			error: "#f0646b"
		};
		const STATUS_LABEL = {
			completed: "闭合",
			running: "进行中",
			error: "失败"
		};
		/** 环上两点之间的弧线 path（angle 为弧度，0=正上方，顺时针）。 */
		function arcPath(radius, angleFrom, angleTo, gap = .02) {
			const a0 = angleFrom + gap;
			const a1 = angleTo - gap;
			if (a1 <= a0) return "";
			const x0 = radius * Math.cos(a0), y0 = radius * Math.sin(a0);
			const x1 = radius * Math.cos(a1), y1 = radius * Math.sin(a1);
			const large = a1 - a0 > Math.PI ? 1 : 0;
			return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
		}
		function fmt(ms) {
			if (ms < 1e3) return `${String(ms)}ms`;
			const s = ms / 1e3;
			return s < 60 ? `${s.toFixed(1)}s` : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, "0")}s`;
		}
		/** 一张轮次卡片：主环 + 中文标签卡 + 该轮子 Agent 分叉迷你环。 */
		function TurnCard({ ring, branches, selectedId, onSelect, onTip }) {
			const R = ring.radius;
			const mainCx = 150;
			const branchBaseX = 420;
			const branchGapY = 78;
			const branchCount = branches.length;
			const height = Math.max(270, 150 + branchCount * branchGapY);
			const mainCy = height / 2;
			const running = ring.status === "running";
			const bandRadius = R - 8;
			const toolCount = ring.nodes.filter((n) => n.node.kind === "tool").length;
			const labels = ring.nodes.filter((ringNode) => {
				const kind = ringNode.node.kind;
				if (kind === "input" || kind === "model" || kind === "error") return true;
				return kind === "tool" && toolCount <= 6;
			}).slice(0, 12);
			const tipFor = (ringNode, event) => {
				const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
				if (box === void 0) return;
				onTip({
					x: event.clientX - box.left + 16,
					y: event.clientY - box.top + 16,
					node: ringNode.node
				});
			};
			const nodeDot = (ringNode, cx, cy, key) => {
				const node = ringNode.node;
				const selected = node.id === selectedId;
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: cx + ringNode.x,
					cy: cy + ringNode.y,
					r: selected ? 6.5 : 4.5,
					fill: KIND_COLOR[node.kind],
					stroke: selected ? "#ffffff" : "rgba(14,25,35,0.9)",
					strokeWidth: selected ? 1.8 : 1,
					className: node.status === "running" ? "seelogRunning" : void 0,
					style: { cursor: "pointer" },
					onClick: (event) => {
						event.stopPropagation();
						onSelect(node);
					},
					onMouseEnter: (event) => tipFor(ringNode, event),
					onMouseMove: (event) => tipFor(ringNode, event),
					onMouseLeave: () => onTip(null)
				}, key);
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "seelogTurnCard",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
					className: "seelogTurnHead",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "seelogTurnTitle",
							children: [
								"第 ",
								String(ring.turn),
								" 轮"
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "seelogTurnChip",
							style: {
								color: STATUS_COLOR[ring.status],
								borderColor: STATUS_COLOR[ring.status]
							},
							children: STATUS_LABEL[ring.status]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "seelogTurnMeta",
							children: [String(ring.steps.length), " 步"]
						}),
						ring.durationMs !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "seelogTurnMeta",
							children: fmt(ring.durationMs)
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "seelogTurnBody",
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
						className: "seelogTurnSvg",
						viewBox: `0 0 550 ${height}`,
						role: "img",
						"aria-label": `第 ${String(ring.turn)} 轮闭环`,
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								cx: mainCx,
								cy: mainCy,
								r: R,
								fill: "rgba(255,255,255,0.02)",
								stroke: "rgba(120,150,190,0.15)",
								strokeWidth: 1
							}),
							ring.steps.map((step, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
								d: arcPath(bandRadius, step.angleFrom, step.angleTo),
								fill: "none",
								stroke: STATUS_COLOR[step.status],
								strokeWidth: 11,
								opacity: .85,
								className: step.status === "running" ? "seelogRunning" : void 0
							}, `arc-${index}`)),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
								cx: mainCx,
								cy: mainCy,
								r: R,
								fill: "none",
								stroke: STATUS_COLOR[ring.status],
								strokeWidth: 2.6,
								strokeDasharray: running ? "5 4" : void 0,
								className: running ? "seelogRunning" : void 0
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("text", {
								x: mainCx,
								y: mainCy - 6,
								textAnchor: "middle",
								fontSize: 14,
								fontWeight: 800,
								fill: "#e4eef8",
								children: [
									"第 ",
									String(ring.turn),
									" 轮"
								]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("text", {
								x: mainCx,
								y: mainCy + 12,
								textAnchor: "middle",
								fontSize: 10,
								fill: "#91a7bc",
								children: [String(ring.nodes.length), " 事件"]
							}),
							labels.map((ringNode) => {
								const node = ringNode.node;
								const ang = ringNode.angle;
								const dotX = mainCx + R * Math.cos(ang);
								const dotY = mainCy + R * Math.sin(ang);
								const labelRadius = R + 36;
								const lx = mainCx + labelRadius * Math.cos(ang);
								const ly = mainCy + labelRadius * Math.sin(ang);
								const anchor = Math.cos(ang) >= 0 ? "start" : "end";
								const text = describeNode(node).title;
								const boxWidth = Math.min(152, text.length * 11 + 18);
								const boxX = anchor === "start" ? lx + 4 : lx - 4 - boxWidth;
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", {
									className: "seelogRingLabel",
									children: [
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
											x1: dotX,
											y1: dotY,
											x2: lx,
											y2: ly,
											stroke: KIND_COLOR[node.kind],
											strokeWidth: 1.1,
											opacity: .7
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
											x: boxX,
											y: ly - 11,
											width: boxWidth,
											height: 20,
											rx: 5,
											fill: "#0d1823",
											stroke: KIND_COLOR[node.kind],
											strokeWidth: 1.1
										}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
											x: anchor === "start" ? boxX + 8 : boxX + boxWidth - 8,
											y: ly + 3.5,
											textAnchor: anchor,
											fontSize: 10,
											fontWeight: 600,
											fill: "#eaf5ff",
											style: { cursor: "pointer" },
											onClick: (event) => {
												event.stopPropagation();
												onSelect(node);
											},
											onMouseEnter: (event) => {
												const box = event.currentTarget.ownerSVGElement?.getBoundingClientRect();
												if (box !== void 0) onTip({
													x: event.clientX - box.left + 16,
													y: event.clientY - box.top + 16,
													node
												});
											},
											onMouseLeave: () => onTip(null),
											children: text.length > 9 ? `${text.slice(0, 9)}…` : text
										})
									]
								}, `label-${node.id}`);
							}),
							ring.nodes.map((ringNode, index) => nodeDot(ringNode, mainCx, mainCy, `n-${index}`)),
							branches.map((branch, index) => {
								const by = mainCy + (index - (branchCount - 1) / 2) * branchGapY;
								const bR = branch.radius;
								const bRunning = branch.status === "running";
								return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("g", { children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
										x1: mainCx + R * Math.cos(branch.forkAngle),
										y1: mainCy + R * Math.sin(branch.forkAngle),
										x2: branchBaseX - bR * Math.cos(branch.forkAngle),
										y2: by - bR * Math.sin(branch.forkAngle),
										stroke: "#43d4d2",
										strokeWidth: 1.3,
										opacity: .5
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("line", {
										x1: branchBaseX - bR * Math.cos(branch.mergeAngle),
										y1: by - bR * Math.sin(branch.mergeAngle),
										x2: mainCx + R * Math.cos(branch.mergeAngle),
										y2: mainCy + R * Math.sin(branch.mergeAngle),
										stroke: "#43d4d2",
										strokeWidth: 1.3,
										opacity: .5
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
										cx: branchBaseX,
										cy: by,
										r: bR,
										fill: "rgba(67,212,210,0.06)",
										stroke: "#43d4d2",
										strokeWidth: 2,
										strokeDasharray: bRunning ? "4 3" : void 0,
										className: bRunning ? "seelogRunning" : void 0
									}),
									branch.nodes.map((ringNode, nodeIndex) => nodeDot(ringNode, branchBaseX, by, `b-${index}-${nodeIndex}`)),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("text", {
										x: branchBaseX,
										y: by + bR + 15,
										textAnchor: "middle",
										fontSize: 9.5,
										fontWeight: 600,
										fill: "#43d4d2",
										children: branch.session.title.length > 12 ? `${branch.session.title.slice(0, 12)}…` : branch.session.title
									})
								] }, `branch-${index}`);
							})
						]
					})
				})]
			});
		}
		/** 会话执行环图：轮次闭环卡片流（v3，seelog 风格标签）。 */
		function LoopMap({ snapshot, selectedId, onSelect }) {
			const layout = (0, react.useMemo)(() => loopLayout(snapshot), [snapshot]);
			const [tip, setTip] = (0, react.useState)(null);
			const wrapRef = (0, react.useRef)(null);
			const branchesByTurn = (0, react.useMemo)(() => {
				const map = /* @__PURE__ */ new Map();
				for (const branch of layout.branches) {
					const list = map.get(branch.parentTurn) ?? [];
					map.set(branch.parentTurn, [...list, branch]);
				}
				return map;
			}, [layout]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "seelogRingWrap",
				ref: wrapRef,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: "seelogTurnStack",
					children: layout.turns.map((ring) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(TurnCard, {
						ring,
						branches: branchesByTurn.get(ring.turn) ?? [],
						selectedId,
						onSelect,
						onTip: (value) => {
							if (value === null) {
								setTip(null);
								return;
							}
							if (wrapRef.current?.getBoundingClientRect() === void 0) return;
							setTip({
								x: value.x,
								y: value.y,
								node: value.node
							});
						}
					}, `turn-${ring.turn}`))
				}), tip !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "seelogRingTip",
					style: {
						left: tip.x,
						top: tip.y
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: describeNode(tip.node).title }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: describeNode(tip.node).summary }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							STATUS_LABEL[tip.node.status],
							tip.node.turn !== void 0 ? ` · 第 ${String(tip.node.turn)} 轮` : "",
							tip.node.step !== void 0 ? ` · 第 ${String(tip.node.step)} 步` : "",
							durationLabel(tip.node) !== void 0 ? ` · ${durationLabel(tip.node)}` : ""
						] })
					]
				})]
			});
		}
		//#endregion
		//#region src/client/styles.ts
		let installed = false;
		/** Installs scoped visual treatment once, without relying on host CSS modules. */
		function ensureStyles() {
			if (installed) return;
			installed = true;
			const style = document.createElement("style");
			style.textContent = `
.seelogRoot{--s-bg:#101923;--s-pane:#152332;--s-line:#29465f;--s-text:#e4eef8;--s-muted:#91a7bc;--s-blue:#62a9ff;--s-green:#3ecf9a;--s-red:#f0646b;color:var(--s-text);background:var(--s-bg);min-height:100%;padding:20px 22px 36px;font:13px/1.45 Inter,system-ui,sans-serif;letter-spacing:0}
.seelogHeader{display:flex;gap:16px;justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--s-line);padding-bottom:15px}.seelogHeader h1{font-size:18px;margin:2px 0 3px;font-weight:650}.seelogEyebrow,.seelogMeta{color:var(--s-muted);margin:0}.seelogEyebrow{text-transform:uppercase;font-size:11px;letter-spacing:1.2px}.seelogActions{display:flex;gap:8px;flex-wrap:wrap}.seelogActions button,.seelogSnapshots button{border:1px solid #42647e;background:#1a2c3d;color:var(--s-text);border-radius:5px;padding:7px 10px;cursor:pointer;font:inherit}.seelogActions button:hover,.seelogSnapshots button:hover{border-color:var(--s-blue)}.seelogActions .seelogPrimary{background:#226bc0;border-color:#3e8be5}.seelogStats{display:flex;gap:20px;padding:13px 0;border-bottom:1px solid var(--s-line)}.seelogStats b{display:block;font-size:16px}.seelogStats span{color:var(--s-muted);font-size:11px}.seelogLayout{display:grid;grid-template-columns:minmax(0,1fr) 262px;gap:18px;padding-top:18px}.seelogMap{position:relative;min-height:450px;border:1px solid var(--s-line);background:#12202e;overflow:hidden}.seelogMapHeader{position:absolute;z-index:2;top:12px;left:15px;right:15px;display:flex;justify-content:space-between;color:var(--s-muted);pointer-events:none}.seelogCanvas{height:310px;border-bottom:1px solid var(--s-line)}.seelogLanes{padding:14px 15px 19px;overflow-x:auto}.seelogLane{display:grid;grid-template-columns:135px minmax(max-content,1fr);gap:12px;min-height:58px;border-top:1px solid rgba(66,100,126,.45);padding:10px 0}.seelogLane:first-child{border-top:0}.seelogLaneName{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.seelogLaneName small{display:block;font-weight:400;color:var(--s-muted);margin-top:2px}.seelogEvents{display:flex;gap:7px;align-items:center}.seelogEvent{border:0;border-left:2px solid var(--s-blue);background:#1b2c3c;color:var(--s-text);border-radius:2px;padding:5px 7px;min-width:74px;max-width:142px;text-align:left;cursor:pointer;font:12px/1.25 inherit}.seelogEvent[data-kind="tool"]{border-color:var(--s-green)}.seelogEvent[data-kind="error"]{border-color:var(--s-red);background:#34242b}.seelogEvent[data-selected="true"]{outline:1px solid var(--s-blue);background:#243d54}.seelogEvent span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.seelogEvent small{color:var(--s-muted);font-size:10px}.seelogSide{border-left:1px solid var(--s-line);min-height:450px;padding-left:18px}.seelogSide h2{font-size:13px;margin:1px 0 10px}.seelogEmpty,.seelogLoading{color:var(--s-muted);padding:18px 0}.seelogDetail{border-top:2px solid var(--s-blue);background:#142535;padding:12px}.seelogDetail p{margin:0 0 9px;color:var(--s-muted)}.seelogDetail b{color:var(--s-text)}.seelogSnapshots{border-top:1px solid var(--s-line);margin-top:18px;padding-top:14px}.seelogSnapshots h2{margin:0 0 9px;font-size:13px}.seelogSnapshots ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}.seelogSnapshots button{width:100%;text-align:left}.seelogSnapshots button[aria-pressed="true"]{border-color:var(--s-blue)}.seelogNotice{color:#f5ca72;margin:12px 0 0}.seelogError{color:#ff9da3;margin:18px 0}@media(max-width:820px){.seelogRoot{padding:15px}.seelogHeader{display:block}.seelogActions{margin-top:12px}.seelogLayout{grid-template-columns:1fr}.seelogSide{border-left:0;border-top:1px solid var(--s-line);padding:15px 0 0;min-height:0}.seelogMap{min-height:390px}.seelogLane{grid-template-columns:104px minmax(max-content,1fr)}}`;
			style.textContent += `.seelogStats{flex-wrap:wrap}.seelogRaw{border-top:1px solid var(--s-line);margin-top:12px;padding-top:10px}.seelogRaw summary{cursor:pointer;color:#b9d8ff}.seelogRaw pre{white-space:pre-wrap;overflow-wrap:anywhere;max-height:310px;overflow:auto;background:#0d1823;border:1px solid #29465f;padding:9px;color:#c9d8e8;font-size:11px}.seelogRaw ul{padding-left:16px;color:var(--s-muted);font-size:11px}.seelogMap{overflow:hidden;min-height:0;height:clamp(440px,54vh,620px)}.seelogCanvas{position:relative;height:100%;min-height:0;border-bottom:0}.seelogCanvasSurface{position:absolute;inset:0}.seelogCanvasSurface canvas{display:block;touch-action:none}.seelogCssLabels{position:absolute!important;inset:0;z-index:2;pointer-events:none;font-family:Inter,system-ui,sans-serif}.seelogEventCard,.seelogLaneLabel,.seelogTimelineLabel{box-sizing:border-box;white-space:nowrap;letter-spacing:0}.seelogEventCard{min-width:112px;max-width:112px;overflow:hidden;text-overflow:ellipsis;border:1px solid #86b3e3;border-radius:4px;padding:6px 9px;background:#17304a;color:#eaf5ff;font-size:12px;font-weight:650;line-height:14px;text-align:left;box-shadow:0 4px 12px rgba(1,9,19,.4);transform:translate(-50%,-50%)}.seelogEventCardSelected{border-color:#ffffff;background:#24609a}.seelogLaneLabel{min-width:176px;max-width:176px;overflow:hidden;text-overflow:ellipsis;border:1px solid #4caea8;border-radius:4px;padding:4px 8px;background:#143a40;color:#a4f1ea;font-size:11px;font-weight:650;transform:translate(-50%,-50%)}.seelogTimelineLabel{appearance:none;border:0;border-left:1px solid #33516b;background:transparent;color:#91a7bc;padding:3px 0 0 8px;font:600 12px/16px Inter,system-ui,sans-serif;cursor:pointer;transform:translate(-50%,-50%)}.seelogTimelineLabel:hover,.seelogTimelineLabelActive{border-left-color:#39d5df;color:#f0fbff}.seelogTimelineScroll,.seelogLanes{display:none}`;
			style.textContent += `.seelogEventCard,.seelogLaneLabel,.seelogTimelineLabel{position:absolute}.seelogOverview{position:absolute;z-index:3;top:0;left:0;right:0;height:74px;pointer-events:none;background:#0e1d2d}.seelogOverviewRail{position:absolute;top:16px;left:42px;right:42px;height:34px;border-top:2px solid #294a68;pointer-events:auto;cursor:crosshair}.seelogOverviewWindow{position:absolute;top:-3px;height:5px;border:1px solid #70e6ef;background:rgba(57,213,223,.25);box-shadow:0 0 12px rgba(57,213,223,.32);pointer-events:none}.seelogOverviewTick{position:absolute;top:6px;appearance:none;border:0;border-left:1px solid #3a627d;background:transparent;color:#a8bbcd;padding:4px 0 0 8px;font:600 12px/16px Inter,system-ui,sans-serif;white-space:nowrap;cursor:pointer;transform:translateX(-50%)}.seelogOverviewTick:first-of-type{transform:none}.seelogOverviewTick:last-of-type{transform:translateX(-100%)}.seelogOverviewTick:hover{border-left-color:#65e0e9;color:#effcff}`;
			style.textContent += `
/* ===== 闭环轮环卡片（Loop Ring Card，v3）===== */
.seelogRingWrap{position:relative;width:100%;height:100%;overflow:auto}
.seelogTurnStack{display:flex;flex-direction:column;gap:18px;padding:6px 4px 24px}
.seelogTurnCard{border:1px solid #29465f;border-radius:14px;background:#152332;overflow:hidden}
.seelogTurnHead{display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid #29465f;background:#0e1d2d}
.seelogTurnTitle{font-size:14px;font-weight:750;color:#eaf5ff}
.seelogTurnChip{font-size:11px;font-weight:650;padding:2px 10px;border-radius:999px;border:1px solid}
.seelogTurnMeta{font-size:11px;color:#91a7bc}
.seelogTurnBody{overflow:auto}
.seelogTurnSvg{display:block;width:100%;height:auto;min-width:420px}
.seelogRingLabel{cursor:pointer}
.seelogRingTip{position:absolute;z-index:5;pointer-events:none;background:#0d1823;border:1px solid #42647e;border-radius:6px;padding:7px 10px;font-size:11.5px;color:#e4eef8;box-shadow:0 6px 18px rgba(0,0,0,.5);max-width:270px;line-height:1.5}
.seelogRingTip b{display:block;font-size:12.5px;margin-bottom:2px;color:#eaf5ff}
.seelogRingTip span{color:#91a7bc}
.seelogRingLegend{display:flex;gap:14px;flex-wrap:wrap;padding:10px 2px 0;color:#91a7bc;font-size:11.5px;align-items:center}
.seelogRingLegend i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.seelogRingLegend .sep{width:1px;height:14px;background:#29465f}
@keyframes seelogPulse{0%,100%{opacity:1}50%{opacity:.35}}
.seelogRunning{animation:seelogPulse 1.6s ease-in-out infinite}
.seelogMap svg text{user-select:none}
`;
			document.head.append(style);
		}
		//#endregion
		//#region src/client/SessionMapView.tsx
		function timeLabel(value) {
			return new Intl.DateTimeFormat("zh-CN", {
				hour: "2-digit",
				minute: "2-digit",
				second: "2-digit"
			}).format(value);
		}
		function detailFor(node) {
			return [
				["类别", kindLabel(node.kind)],
				["状态", node.status === "error" ? "失败" : node.status === "running" ? "执行中" : "完成"],
				["时间", timeLabel(node.time)],
				["耗时", durationLabel(node)],
				["会话", node.sessionId.slice(0, 16)],
				["日志位置", `seq ${String(node.seq)}`],
				["轮次", node.turn === void 0 ? void 0 : String(node.turn)],
				["步骤", node.step === void 0 ? void 0 : String(node.step)],
				["结果", errorName(node.detail) ?? node.detail]
			].filter((entry) => entry[1] !== void 0);
		}
		/** AgentTrace 内部的「会话图」：SVG 闭环轮环图 + 节点检查器。 */
		function SessionMapView({ sessionId }) {
			const [snapshot, setSnapshot] = (0, react.useState)(null);
			const [selectedNode, setSelectedNode] = (0, react.useState)(null);
			const [eventDetail, setEventDetail] = (0, react.useState)(null);
			const [detailLoading, setDetailLoading] = (0, react.useState)(false);
			const [detailError, setDetailError] = (0, react.useState)(null);
			const [loading, setLoading] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const refreshSequence = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				ensureStyles();
			}, []);
			(0, react.useEffect)(() => {
				if (selectedNode === null) {
					setEventDetail(null);
					setDetailLoading(false);
					setDetailError(null);
					return;
				}
				let cancelled = false;
				setDetailLoading(true);
				setDetailError(null);
				fetch(`/dsh-session-viz/api/map/event?sessionId=${encodeURIComponent(selectedNode.sessionId)}&seq=${String(selectedNode.seq)}`, { cache: "no-store" }).then(async (response) => {
					if (!response.ok) throw new Error(`无法读取原始日志 (${String(response.status)})`);
					return await response.json();
				}).then((value) => {
					if (!cancelled) setEventDetail(value);
				}).catch((reason) => {
					if (!cancelled) setDetailError(reason instanceof Error ? reason.message : String(reason));
				}).finally(() => {
					if (!cancelled) setDetailLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [selectedNode]);
			const refresh = (0, react.useCallback)(async () => {
				const sequence = refreshSequence.current + 1;
				refreshSequence.current = sequence;
				setLoading(true);
				setError(null);
				try {
					const response = await fetch(`/dsh-session-viz/api/map/snapshot?sessionId=${encodeURIComponent(String(sessionId))}`, { cache: "no-store" });
					if (!response.ok) throw new Error(`无法刷新会话图 (${String(response.status)})`);
					const nextSnapshot = await response.json();
					if (sequence !== refreshSequence.current) return;
					setSnapshot(nextSnapshot);
				} catch (reason) {
					if (sequence === refreshSequence.current) setError(reason instanceof Error ? reason.message : String(reason));
				} finally {
					if (sequence === refreshSequence.current) setLoading(false);
				}
			}, [sessionId]);
			(0, react.useEffect)(() => {
				setSnapshot(null);
				setSelectedNode(null);
				setEventDetail(null);
				setError(null);
			}, [sessionId]);
			(0, react.useEffect)(() => {
				refresh();
			}, [refresh]);
			const selectNode = (0, react.useCallback)((node) => {
				setSelectedNode(node);
			}, []);
			const displayedCount = snapshot === null ? 0 : eventCount(snapshot);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("main", {
				className: "seelogRoot",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "seelogHeader",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "seelogEyebrow",
								children: "会话地图 · 闭环视图"
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h1", { children: "会话执行环图" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "seelogMeta",
								children: "每个轮次是一个闭合的环，子 Agent 是分叉出去再汇回的小环；进行中的工作显示为琥珀色脉冲虚线。进入视图时读取一次日志，可手动刷新。"
							})
						] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "seelogActions",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								className: "seelogPrimary",
								onClick: () => void refresh(),
								disabled: loading,
								children: loading ? "刷新中…" : "⟳ 刷新会话图"
							})
						})]
					}),
					snapshot !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "seelogStats",
						"aria-label": "会话图概览",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: String(snapshot.sessions.reduce((total, session) => total + (session.sourceEventCount ?? session.nodes.length), 0)) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "原始日志事件" })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: String(displayedCount) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "语义节点" })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: String(snapshot.sessions.length) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "会话与子 Agent" })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: timeLabel(snapshot.capturedAt) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: "刷新时间" })] })
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "seelogRingLegend",
						"aria-label": "图例",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: "#3ecf9a" } }), "闭合"] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: "#f5b83d" } }), "进行中"] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: "#f0646b" } }), "失败"] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: "sep" }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: "#62a9ff" } }), "输入"] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: "#b48cff" } }), "模型"] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: "#3ecf9a" } }), "工具"] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: "#43d4d2" } }), "子 Agent 环"] })
						]
					}),
					error !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "seelogError",
						children: error
					}),
					snapshot === null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "seelogEmpty",
						children: loading ? "正在读取当前会话图..." : "暂无可显示的会话日志。"
					}),
					snapshot !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
						className: "seelogLayout",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "seelogMap",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LoopMap, {
								snapshot,
								selectedId: selectedNode?.id ?? null,
								onSelect: selectNode
							})
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("aside", {
							className: "seelogSide",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h2", { children: "节点检查器" }), selectedNode === null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
								className: "seelogEmpty",
								children: "点击环上的节点圆点查看语义信息。"
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "seelogDetail",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: describeNode(selectedNode).title }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: describeNode(selectedNode).summary }),
									detailFor(selectedNode).map(([label, value]) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", { children: [
										label,
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("br", {}),
										/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: value })
									] }, label)),
									detailLoading && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "seelogLoading",
										children: "正在读取完整原始日志..."
									}),
									detailError !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
										className: "seelogError",
										children: detailError
									}),
									eventDetail !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("details", {
										className: "seelogRaw",
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("summary", { children: [
												eventTypeName(eventDetail.target.type),
												" · 原始日志 #",
												String(eventDetail.target.seq)
											] }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("pre", { children: JSON.stringify(eventDetail.target, null, 2) }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: "相邻日志" }),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", { children: eventDetail.context.map((event) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", { children: [
												eventTypeName(event.type),
												" · seq ",
												String(event.seq)
											] }, event.seq)) })
										]
									})
								]
							})]
						})]
					}),
					snapshot?.truncated === true && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "seelogNotice",
						children: "会话数量已达到部署上限，图中未包含其余子会话。"
					})
				]
			});
		}
		//#endregion
		//#region src/client/index.ts
		/** 只需要 slots 服务。 */
		const inject = ["slots"];
		/** 注册 AgentTrace 查看器（会话图作为其内部模式）。 */
		function apply(ctx) {
			registerExtraMode({
				id: "map",
				label: "🗺 会话图",
				render: (sessionId) => react.default.createElement(SessionMapView, { sessionId })
			});
			apply$1(ctx);
		}
		//#endregion
		exports.SessionMapView = SessionMapView;
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
