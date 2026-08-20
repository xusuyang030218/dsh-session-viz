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
 * 装载链：官方 client-modules 以 /plugins/dsh-session-viz/client.js 供给浏览器
 * （window.__ModuleLoader__.load 契约）。React 由平台 require 提供。
 * 零外部依赖：CSS 内联注入。
 */
window.__ModuleLoader__.load({
  id: 'dsh-session-viz',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const { createPortal } = require('react-dom')

    // ===== 打开状态 =====
    let open = false
    let openSessionId = null
    const listeners = new Set()
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
    const getOpen = () => open
    const setOpen = (v, sessionId) => {
      open = v
      if (sessionId !== undefined) openSessionId = sessionId
      listeners.forEach((fn) => fn())
    }

    // ===== 内联 CSS（v2） =====
    const CSS_TEXT = `
.dsvz-ov{position:fixed;inset:0;z-index:9999;background:rgba(8,10,14,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;font-family:var(--dsw-font-family,-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif)}
.dsvz-box{width:min(1240px,95vw);height:min(800px,92vh);background:var(--dsw-specific-input-major,#fff);border:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.35));border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.4);display:flex;flex-direction:column;overflow:hidden;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-primary,#1e293b)}
.dsvz-head{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l2,rgba(128,128,128,.18));background:var(--dsw-alias-surface-subtle,rgba(128,128,128,.05));flex-shrink:0;flex-wrap:wrap}
.dsvz-head .dsvz-title{font-weight:800;font-size:14px;white-space:nowrap}
.dsvz-head .dsvz-pill{font-size:11px;background:rgba(128,128,128,.08);border:1px solid rgba(128,128,128,.2);border-radius:999px;padding:1px 9px;white-space:nowrap;font-family:var(--dsw-font-mono,Consolas,monospace)}
.dsvz-head .dsvz-spacer{flex:1}
.dsvz-head select,.dsvz-head input[type=search]{font:inherit;font-size:12px;padding:4px 9px;border-radius:7px;border:1px solid rgba(128,128,128,.3);background:var(--dsw-specific-input-major,#fff);color:inherit;outline:none}
.dsvz-head .dsvz-btn{font:inherit;font-size:12px;padding:4px 11px;border-radius:7px;border:1px solid rgba(128,128,128,.3);background:transparent;color:inherit;cursor:pointer}
.dsvz-head .dsvz-btn:hover{border-color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb);color:var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb)}
.dsvz-head .dsvz-btn:disabled{opacity:.5;cursor:wait}
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
`
    function ensureStyles() {
      const id = 'dsh-session-viz/css'
      if (document.getElementById(id)) return
      const el = document.createElement('style')
      el.id = id
      el.textContent = CSS_TEXT
      document.head.appendChild(el)
    }

    // ===== 工具函数 =====
    const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))

    function fmtTime(ms) {
      if (!ms) return '—'
      const d = new Date(ms)
      const p = (n) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`
    }
    function fmtDur(ms) {
      if (ms == null) return '—'
      if (ms < 1000) return `${ms}ms`
      const s = ms / 1000
      if (s < 60) return `${s.toFixed(1)}s`
      const m = Math.floor(s / 60), ss = Math.round(s % 60)
      return `${m}m${ss}s`
    }
    // 相对会话开始时间（改动3）
    function relTime(ms, base) {
      if (ms == null) return '—'
      if (base == null) return fmtTime(ms).slice(11)
      const d = ms - base
      return d >= 0 ? `+${fmtDur(d)}` : fmtTime(ms).slice(11)
    }
    function fmtNum(n) { return (n ?? 0).toLocaleString('en-US') }

    // JSON 语法高亮（自写；深色主题用更亮的变体）
    function isDark() { return typeof document !== 'undefined' && document.body && document.body.hasAttribute('data-ds-dark-theme') }
    function jsonHighlight(json) {
      if (json === undefined || json === null) return ''
      const s = typeof json === 'string' ? json : JSON.stringify(json, null, 2)
      const dark = isDark()
      const cKey = dark ? '#c792ea' : '#7c3aed'
      const cColon = dark ? '#8b95a3' : '#64748b'
      const cStr = dark ? '#7ee2a8' : '#059669'
      const cLit = dark ? '#ff7b72' : '#dc2626'
      const cNum = dark ? '#79b8ff' : '#2563eb'
      let out = ''
      const re = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g
      let last = 0, m
      while ((m = re.exec(s))) {
        out += esc(s.slice(last, m.index))
        const [full, str, colon, lit] = m
        if (str !== undefined) {
          out += colon !== undefined
            ? `<span style="color:${cKey}">${esc(str)}</span><span style="color:${cColon}">${esc(colon)}</span>`
            : `<span style="color:${cStr}">${esc(str)}</span>`
        } else if (lit !== undefined) {
          out += `<span style="color:${cLit};font-weight:600">${esc(lit)}</span>`
        } else {
          out += `<span style="color:${cNum}">${esc(full)}</span>`
        }
        last = m.index + full.length
      }
      out += esc(s.slice(last))
      return out
    }

    // ===== API =====
    async function api(path) {
      const res = await fetch(path)
      if (!res.ok) {
        let msg = res.statusText
        try { msg = (await res.json()).error || msg } catch { /* ignore */ }
        throw new Error(msg)
      }
      return res.json()
    }
    const apiMeta = () => api('/dsh-session-viz/api/meta')
    const apiSessions = (q) => api('/dsh-session-viz/api/sessions' + (q ? `?q=${encodeURIComponent(q)}` : ''))
    const apiSummary = (sessionId) => api(`/dsh-session-viz/api/summary?sessionId=${encodeURIComponent(sessionId)}`)
    const apiStory = (sessionId) => api(`/dsh-session-viz/api/story?sessionId=${encodeURIComponent(sessionId)}`)
    const apiTree = (sessionId) => api(`/dsh-session-viz/api/tree?sessionId=${encodeURIComponent(sessionId)}`)
    const apiLine = (sessionId, line) => api(`/dsh-session-viz/api/line?sessionId=${encodeURIComponent(sessionId)}&line=${line}`)

    // ===== 类型→分组映射（与 host 一致） =====
    function groupOfType(type) {
      const map = {
        'session': 'session', 'session/title': 'session', 'session/title-llm-request': 'session', 'session/end-seed': 'session',
        'permission/preset': 'config', 'sandbox/mode': 'config', 'approval/policy': 'config',
        'request/header': 'config', 'request/context': 'config', 'agent-preset/selected': 'config',
        'turn/start': 'turn', 'turn/end': 'turn', 'step/start': 'step', 'step/end': 'step',
        'user/message': 'user', 'agent/inbox/spliced': 'user',
        'assistant/message': 'assistant', 'assistant/chunk': 'assistant',
        'reasoning-chunks': 'reasoning', 'text-chunks': 'text',
        'tool-call-chunks': 'tool', 'tool/call': 'tool', 'tool/result': 'tool',
        'approval/asked': 'approval', 'approval/decided': 'approval',
        'todo/write': 'todo', 'llm/retry': 'llm', 'llm/retry-started': 'llm',
        'command/run': 'command', 'command/done': 'command',
        'web/deepseek-search-llm-request': 'web',
      }
      return map[type] || 'config'
    }
    function grp(groups, key) {
      return groups?.[key] ?? { label: key, fg: '#607D8B', bg: '#ECEFF1', border: '#455A64' }
    }

    // ===== 事件详情 =====
    function DetailView({ ev, raw, groups }) {
      const [tab, setTab] = React.useState('解读')
      const gstyle = grp(groups, ev?.group)
      const rows = React.useMemo(() => interpret(ev, raw), [ev, raw])
      if (!ev) return React.createElement('div', { className: 'dsvz-empty' }, '无数据')
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        React.createElement('div', { className: 'dsvz-rtabs' },
          ['解读', 'JSON', '原始行'].map((t) =>
            React.createElement('button', { key: t, className: 'dsvz-rtab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, t))),
        React.createElement('div', { className: 'dsvz-rcontent' },
          React.createElement('div', { className: 'dsvz-rtitle' },
            React.createElement('span', { className: 'dsvz-typechip', style: { background: gstyle.bg, color: gstyle.fg, border: '1px solid ' + gstyle.border, borderRadius: 999, padding: '0 8px', fontSize: 11, fontWeight: 700 } }, ev.type),
            React.createElement('span', { style: { fontFamily: 'var(--dsw-font-mono,Consolas,monospace)', fontSize: 11, color: 'var(--dsw-alias-label-secondary,#8493ab)' } }, `#${ev.seq ?? ev.line} · ${ev.time ? fmtTime(ev.time) : ''}`),
            ev.error && React.createElement('span', { style: { color: '#dc2626', fontWeight: 700, fontSize: 11 } }, '⚠ 错误')),
          tab === '解读' && React.createElement('table', { className: 'dsvz-kv' },
            rows.map(([k, v], i) => React.createElement('tr', { key: i },
              React.createElement('td', null, k),
              React.createElement('td', null, React.createElement('div', { dangerouslySetInnerHTML: { __html: jsonHighlight(v) } }))))),
          tab === 'JSON' && React.createElement('pre', { className: 'dsvz-pre', dangerouslySetInnerHTML: { __html: jsonHighlight(raw) } }),
          tab === '原始行' && React.createElement('pre', { className: 'dsvz-pre' }, esc(raw || '(无)')),
        ),
      )
    }

    function interpret(ev, raw) {
      let o = null
      try { o = JSON.parse(raw) } catch { /* ignore */ }
      const d = o?.data ?? {}
      const rows = [
        ['line', ev.line],
        ['seq', ev.seq ?? '—'],
        ['type', ev.type],
        ['time', ev.time ? fmtTime(ev.time) : '—'],
        ['分组', ev.group],
      ]
      const kv = (k, v) => rows.push([k, v === undefined || v === null ? '—' : (typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v))])
      switch (ev.type) {
        case 'session': kv('cwd', o?.cwd); kv('agentPreset', o?.agentPreset); kv('delegationDepth', o?.delegationDepth); break
        case 'session/title': kv('title', d.title); break
        case 'user/message': kv('内容', d.content?.map?.((p) => p.text ?? `[${p.type}]`).filter(Boolean).join('\n')); break
        case 'assistant/message': kv('消息', d.message?.content?.map?.((p) => p.text ?? `[${p.type}]`).filter(Boolean).join('\n')); kv('tokens', JSON.stringify(d.usage ?? {}, null, 2)); break
        case 'reasoning-chunks':
        case 'text-chunks': kv('合并文本', (d.texts ?? []).join('')); kv('分片数', (d.texts ?? []).length); kv('总耗时', `${(d.dt ?? []).reduce((a, x) => a + x, 0)}ms`); break
        case 'tool/call': kv('工具', d.name); kv('参数', d.arguments); kv('callId', d.callId); break
        case 'tool/result': {
          kv('结果', d.message?.content?.map?.((p) => p.content ?? (typeof p === 'string' ? p : JSON.stringify(p))).filter(Boolean).join('\n'))
          if (d.error) kv('错误', typeof d.error === 'string' ? d.error : JSON.stringify(d.error, null, 2))
          if (d.meta) kv('meta', JSON.stringify(d.meta, null, 2))
          break
        }
        case 'approval/asked': kv('工具', d.toolName); kv('原因', d.reason); kv('id', d.id); break
        case 'approval/decided': kv('结果', d.outcome); kv('id', d.id); break
        case 'todo/write': kv('todos', JSON.stringify(d.todos ?? [], null, 2)); break
        case 'turn/start': case 'turn/end': kv('turn', d.turn); kv('reason', JSON.stringify(d.reason ?? {}, null, 2)); break
        case 'step/start': case 'step/end': kv('turn', d.turn); kv('step', d.step); break
        case 'request/context': kv('provider', d.provider); kv('model', d.model); kv('contextWindow', d.contextWindow); break
        case 'llm/retry': kv('retry', `${d.retry}/${d.maxRetries}`); kv('failure', JSON.stringify(d.failure ?? {}, null, 2)); kv('delayMs', d.delayMs); break
        case 'command/run': kv('name', d.name); kv('args', d.args); kv('commandId', d.commandId); break
        case 'command/done': kv('kind', d.kind); kv('text', d.text); break
        default: {
          const dk = Object.keys(d)
          if (dk.length) dk.slice(0, 12).forEach((k) => kv(k, typeof d[k] === 'object' ? JSON.stringify(d[k], null, 2) : d[k]))
        }
      }
      return rows
    }

    // ===== 第一层：执行摘要 =====
    function SummaryView({ summary, onStory, onTree, onSelectFile }) {
      if (!summary) return React.createElement('div', { className: 'dsvz-empty' }, '加载中…')
      const s = summary
      const toolEntries = Object.entries(s.toolStats || {})
      const maxTool = Math.max(1, ...toolEntries.map(([, v]) => v.count))
      const tok = s.tokens || {}
      return React.createElement('div', { className: 'dsvz-scroll' },
        React.createElement('div', { className: 'dsvz-summary' },
          React.createElement('div', { className: 'dsvz-sum-hero' },
            React.createElement('div', { className: 't' }, s.title ? `📋 ${s.title}` : '会话执行摘要'),
            s.userRequest && React.createElement('div', { className: 'req' }, `「${esc(s.userRequest)}」`),
            React.createElement('div', { className: 'stats' },
              React.createElement('span', { className: 'dsvz-stat' }, `🤖 ${s.turnCount} 轮对话`),
              React.createElement('span', { className: 'dsvz-stat' }, `🪜 ${s.stepCount} 个步骤`),
              React.createElement('span', { className: 'dsvz-stat' }, `⏱ 耗时 ${fmtDur(s.durationMs)}`),
              s.model && React.createElement('span', { className: 'dsvz-stat' }, `🧠 ${esc(s.model)}`),
            ),
          ),
          toolEntries.length > 0 && React.createElement('div', null,
            React.createElement('div', { className: 'dsvz-sec' }, '工具使用'),
            React.createElement('div', { className: 'dsvz-toolgrid' },
              toolEntries.slice(0, 12).map(([name, v]) =>
                React.createElement('div', { key: name, className: 'dsvz-toolcard', title: `${name} × ${v.count}` },
                  React.createElement('span', { className: 'ic' }, v.icon || '🛠️'),
                  React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                    React.createElement('div', { className: 'nm' }, `${v.verb} ${name}`),
                    React.createElement('div', { className: 'cn' }, `${v.count} 次`),
                    React.createElement('div', { className: 'dsvz-toolbar' }, React.createElement('i', { style: { width: `${(v.count / maxTool * 100).toFixed(0)}%` } })),
                  )))),
          ),
          (s.approvalStats?.total ?? 0) > 0 && React.createElement('div', null,
            React.createElement('div', { className: 'dsvz-sec' }, '审批'),
            React.createElement('div', { className: 'dsvz-approval' },
              React.createElement('span', { className: 'dsvz-badge ok' }, `${s.approvalStats.total} 次审批请求`),
              React.createElement('span', { className: 'dsvz-badge ok' }, `✅ 通过 ${s.approvalStats.allowed}`),
              s.approvalStats.denied > 0
                ? React.createElement('span', { className: 'dsvz-badge bad' }, `❌ 拒绝 ${s.approvalStats.denied}`)
                : React.createElement('span', { className: 'dsvz-badge ok' }, '全部通过 🎉'),
            ),
          ),
          (s.files || []).length > 0 && React.createElement('div', null,
            React.createElement('div', { className: 'dsvz-sec' }, '文件变更'),
            React.createElement('div', { className: 'dsvz-files' },
              s.files.map((f, i) =>
                React.createElement('div', { key: i, className: 'dsvz-file' },
                  React.createElement('span', { className: 'act ' + (f.error ? 'e' : f.action === 'created' ? 'c' : 'm') }, f.error ? '失败' : f.action === 'created' ? '✨ 新建' : '✏️ 修改'),
                  React.createElement('span', { className: 'pth' }, f.path),
                  f.lines != null && React.createElement('span', { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary,#8493ab)', flexShrink: 0 } }, `${f.lines} 行`),
                )))),
          React.createElement('div', null,
            React.createElement('div', { className: 'dsvz-sec' }, 'Token 用量'),
            React.createElement('div', { className: 'dsvz-tokens' },
              React.createElement('div', { className: 'dsvz-tok' }, React.createElement('div', { className: 'lb' }, '输入'), React.createElement('div', { className: 'vl' }, fmtNum(tok.inputTokens))),
              React.createElement('div', { className: 'dsvz-tok' }, React.createElement('div', { className: 'lb' }, '输出'), React.createElement('div', { className: 'vl' }, fmtNum(tok.outputTokens))),
              React.createElement('div', { className: 'dsvz-tok' }, React.createElement('div', { className: 'lb' }, '推理'), React.createElement('div', { className: 'vl' }, fmtNum(tok.reasoningTokens))),
              React.createElement('div', { className: 'dsvz-tok' }, React.createElement('div', { className: 'lb' }, '缓存读取'), React.createElement('div', { className: 'vl' }, fmtNum(tok.cacheReadTokens))),
            )),
          React.createElement('div', { className: 'dsvz-actions' },
            React.createElement('button', { className: 'dsvz-cta', onClick: onStory }, '📖 查看完整执行时间线'),
            React.createElement('button', { className: 'dsvz-cta ghost', onClick: onTree }, '🔬 查看技术事件列表'),
          ),
        ))
    }

    // ===== 第二层：执行故事线 =====
    function StoryView({ story, baseTime, onOpenEvent }) {
      if (!story) return React.createElement('div', { className: 'dsvz-empty' }, '加载中…')
      const [openTurns, setOpenTurns] = React.useState(new Set(story.length ? [story[0].turn] : []))
      const [openNodes, setOpenNodes] = React.useState(new Set())
      const toggleTurn = (t) => setOpenTurns((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
      const toggleNode = (key) => setOpenNodes((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
      return React.createElement('div', { className: 'dsvz-scroll' },
        React.createElement('div', { className: 'dsvz-story' },
          story.map((tr) =>
            React.createElement('div', { key: tr.turn, className: 'dsvz-story-turn' },
              React.createElement('div', { className: 'dsvz-story-turnhead', onClick: () => toggleTurn(tr.turn) },
                React.createElement('span', { className: 'tt' }, `${openTurns.has(tr.turn) ? '▾' : '▸'} 第 ${tr.turn} 轮对话`),
                React.createElement('span', { className: 'tm' }, `${tr.nodes.length} 个节点`),
              ),
              openTurns.has(tr.turn) && React.createElement('div', { className: 'dsvz-story-body' },
                tr.nodes.map((n, i) => {
                  const key = `${tr.turn}-${i}`
                  const open = openNodes.has(key)
                  const detail = n.text || n.args || ''
                  return React.createElement('div', { key, className: `dsvz-story-node ${n.kind}${open ? ' open' : ''}` },
                    React.createElement('span', { className: 'nt' }, relTime(n.time, baseTime)),
                    React.createElement('span', { className: 'nh' }, esc(n.human || '')),
                    (n.kind === 'reasoning' || n.kind === 'user' || n.kind === 'assistant') && detail && React.createElement('span', { className: 'arrow', onClick: () => toggleNode(key) }, open ? '▲ 收起' : '▼ 展开'),
                    n.kind === 'tool' && React.createElement('span', { className: 'arrow', onClick: () => toggleNode(key) }, open ? '▲ 收起' : '▼ 参数'),
                    detail && React.createElement('div', { className: 'nd' }, esc(String(detail).slice(0, 2000))),
                    n.kind === 'tool' && n.result && React.createElement('div', { className: 'res' + (n.resultError ? ' err' : '') }, n.result),
                    n.kind === 'approval' && n.outcomeHuman && React.createElement('div', { className: 'outc ' + (n.outcome === 'denied' ? 'no' : 'yes') }, n.outcomeHuman),
                  )
                }),
              ))),
        ))
    }

    // ===== 第三层：技术事件树 =====
    function TreeView({ turns, meta, typeCounts, groups, onSelectEvent, selectedLine }) {
      const [openTurns, setOpenTurns] = React.useState(new Set(turns?.length ? [turns[0].turn] : []))
      const [openSteps, setOpenSteps] = React.useState(new Set())
      const [openGroups, setOpenGroups] = React.useState(new Set())
      const [typeFilter, setTypeFilter] = React.useState('')
      const [search, setSearch] = React.useState('')
      const baseTime = meta?.startTime ?? null

      // 首次进入默认展开第一个 turn 的第一个 step
      React.useEffect(() => {
        if (!turns?.length) return
        const t0 = turns[0]
        if (t0.steps?.length) {
          const s0 = t0.steps[0]
          setOpenSteps((prev) => { const n = new Set(prev); n.add(`${t0.turn}-${s0.step}`); return n })
        }
      }, [turns])

      if (!turns) return React.createElement('div', { className: 'dsvz-empty' }, '加载中…')
      const toggleTurn = (t) => setOpenTurns((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
      const toggleStep = (k) => setOpenSteps((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })
      const toggleGroup = (k) => setOpenGroups((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })

      const ql = search.trim().toLowerCase()
      const matchesSearch = (g) => {
        if (!ql) return true
        if (g.kind === 'event') {
          const ev = g.events[0]
          return `${ev.summary ?? ''} ${ev.type} ${ev.human ?? ''} ${ev.seq ?? ''}`.toLowerCase().includes(ql)
        }
        return `${g.preview ?? ''} ${g.label}`.toLowerCase().includes(ql)
      }
      const matchesType = (g) => {
        if (!typeFilter) return true
        if (g.kind === 'event') return g.events.some((e) => e.type === typeFilter)
        return (CHUNK_TYPE_OF[g.kind] ?? '') === typeFilter
      }
      const countFor = (t) => typeCounts?.[t] ?? 0

      const turnEls = turns.map((tr) => {
        const turnOpen = openTurns.has(tr.turn)
        const stepEls = tr.steps.map((st) => {
          const stepKey = `${tr.turn}-${st.step}`
          const stepOpen = openSteps.has(stepKey)
          const groups = (st.groups || []).filter(matchesType).filter(matchesSearch)
          return React.createElement('div', { key: stepKey, className: 'dsvz-step' },
            React.createElement('div', { className: 'dsvz-stephead' + (stepOpen ? ' open' : ''), onClick: () => toggleStep(stepKey) },
              React.createElement('span', { className: 'chev' }, '▶'),
              React.createElement('span', { className: 'sb' }, `Step ${st.step}`),
              React.createElement('span', { className: 'sm' }, `${fmtNum(st.eventCount)} 条 · ${fmtDur(dur(st))}${st.tools?.length ? ' · ' + [...new Set(st.tools)].slice(0, 3).join(', ') : ''}`),
            ),
            stepOpen && React.createElement('div', { className: 'dsvz-groupwrap' },
              groups.map((g, gi) => {
                const gKey = `${stepKey}-g${gi}`
                if (g.kind === 'event') {
                  const ev = g.events[0]
                  return eventRow(ev, baseTime, selectedLine, () => onSelectEvent(ev), grp(groupsMeta(), ev.group), ql)
                }
                const gOpen = openGroups.has(gKey)
                return React.createElement('div', { key: gKey, className: 'dsvz-grp' },
                  React.createElement('div', { className: 'dsvz-grphe' + (gOpen ? ' open' : ''), onClick: () => toggleGroup(gKey), style: { borderLeftColor: g.fg } },
                    React.createElement('span', { className: 'chev', style: { color: g.fg } }, '▶'),
                    React.createElement('span', { className: 'gname', style: { color: g.fg } }, g.label),
                    React.createElement('span', { className: 'gmeta' }, `${fmtNum(g.count)} 分片 · ${fmtNum(g.chars)} 字符 · ${fmtDur(g.durationMs)}`),
                  ),
                  gOpen && React.createElement('div', { className: 'dsvz-grpbody' }, highlightQ(esc(g.preview || '(无预览)'), ql)),
                )
              })),
          )
        })
        return React.createElement('div', { key: tr.turn, className: 'dsvz-turn' },
          React.createElement('div', { className: 'dsvz-turnhead' + (turnOpen ? ' open' : ''), onClick: () => toggleTurn(tr.turn) },
            React.createElement('span', { className: 'chev' }, '▶'),
            React.createElement('span', { className: 'tb' }, `Turn ${tr.turn}`),
            React.createElement('span', { className: 'tm' }, `${fmtNum(tr.eventCount)} 条 · ${fmtDur(dur(tr))}`),
          ),
          turnOpen && React.createElement('div', { className: 'dsvz-stepwrap' },
            stepEls,
            (tr.groups || []).filter(matchesType).filter(matchesSearch).map((g, gi) => {
              const gKey = `t${tr.turn}-g${gi}`
              if (g.kind === 'event') {
                const ev = g.events[0]
                return eventRow(ev, baseTime, selectedLine, () => onSelectEvent(ev), grp(groupsMeta(), ev.group), ql)
              }
              const gOpen = openGroups.has(gKey)
              return React.createElement('div', { key: gKey, className: 'dsvz-grp' },
                React.createElement('div', { className: 'dsvz-grphe' + (gOpen ? ' open' : ''), onClick: () => toggleGroup(gKey), style: { borderLeftColor: g.fg } },
                  React.createElement('span', { className: 'chev', style: { color: g.fg } }, '▶'),
                  React.createElement('span', { className: 'gname', style: { color: g.fg } }, g.label),
                  React.createElement('span', { className: 'gmeta' }, `${fmtNum(g.count)} 分片 · ${fmtNum(g.chars)} 字符 · ${fmtDur(g.durationMs)}`),
                ),
                gOpen && React.createElement('div', { className: 'dsvz-grpbody' }, highlightQ(esc(g.preview || '(无预览)'), ql)),
              )
            }),
          ),
        )
      })

      return React.createElement('div', { className: 'dsvz-tree' },
        React.createElement('div', { className: 'dsvz-left' },
          React.createElement('div', { className: 'dsvz-leftbar' },
            React.createElement('input', { type: 'search', placeholder: '搜索摘要 / 类型 / 内容…', value: search, onChange: (e) => setSearch(e.target.value) }),
            React.createElement('select', { value: typeFilter, onChange: (e) => setTypeFilter(e.target.value), title: '按事件类型筛选（按功能分组）' },
              React.createElement('option', { value: '' }, '全部事件类型'),
              typeOptions().map((g) =>
                React.createElement('optgroup', { key: g.group, label: g.label },
                  g.types.map((t) => React.createElement('option', { key: t.type, value: t.type }, `${t.type} (${countFor(t.type)})`)))),
            ),
          ),
          React.createElement('div', { className: 'dsvz-tree' }, turnEls),
        ),
      )
    }

    const CHUNK_TYPE_OF = { reasoning: 'reasoning-chunks', text: 'text-chunks', 'tool-call': 'tool-call-chunks', assistant: 'assistant/chunk' }

    function dur(node) {
      if (node.endTime != null && node.startTime != null) return Math.max(0, node.endTime - node.startTime)
      return null
    }

    function groupsMeta() { return groupsCache }

    function eventRow(ev, baseTime, selectedLine, onClick, g, ql) {
      const isChunk = ev.human !== undefined
      const text = isChunk ? (ev.human || '') : (ev.summary || '')
      const inner = React.createElement('span', { className: isChunk ? 'eh' : 'es', dangerouslySetInnerHTML: { __html: highlightQ(esc(text), ql) } })
      return React.createElement('div', {
        key: ev.line,
        className: 'dsvz-ev' + (selectedLine === ev.line ? ' sel' : '') + (ev.error ? ' err' : ''),
        onClick,
        style: { borderLeftColor: g.border },
      },
        React.createElement('span', { className: 'et' }, ev.seq != null ? `#${ev.seq}` : `L${ev.line}`),
        React.createElement('span', { className: 'etl', style: { background: g.bg, color: g.fg, borderColor: g.border } }, ev.type),
        inner,
        React.createElement('span', { className: 'ed' }, ev.time ? relTime(ev.time, baseTime) : ''),
      )
    }

    function highlightQ(text, ql) {
      if (!ql) return text
      const re = new RegExp(escRegExp(ql), 'gi')
      return text.replace(re, (m) => `<mark style="background:#ffe58f;padding:0 1px;border-radius:2px">${m}</mark>`)
    }
    function escRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

    function typeOptions() {
      // 按功能分组的事件类型（与 host TYPE_GROUP 一致），数量由 typeCounts 提供
      const all = [
        ['会话生命周期', 'session', 'session/title', 'session/title-llm-request', 'session/end-seed'],
        ['配置与权限', 'permission/preset', 'sandbox/mode', 'approval/policy', 'request/header', 'request/context', 'agent-preset/selected'],
        ['对话轮次', 'turn/start', 'turn/end'],
        ['执行步骤', 'step/start', 'step/end'],
        ['用户输入', 'user/message', 'agent/inbox/spliced'],
        ['助手输出', 'assistant/message', 'assistant/chunk'],
        ['推理过程', 'reasoning-chunks'],
        ['通用文本', 'text-chunks'],
        ['工具调用', 'tool-call-chunks', 'tool/call', 'tool/result'],
        ['审批流程', 'approval/asked', 'approval/decided'],
        ['任务清单', 'todo/write'],
        ['LLM 重试', 'llm/retry', 'llm/retry-started'],
        ['命令执行', 'command/run', 'command/done'],
        ['Web 搜索', 'web/deepseek-search-llm-request'],
      ]
      return all.map(([label, ...types]) => ({ group: label, label, types: types.map((t) => ({ type: t, count: '' })) }))
    }

    // ===== 主查看器 =====
    function Viewer({ sessionId: initialSessionId, groups, onClose }) {
      const [sessionId, setSessionId] = React.useState(initialSessionId)
      const [sessions, setSessions] = React.useState([])
      const [mode, setMode] = React.useState('summary')
      const [meta, setMeta] = React.useState(null)
      const [summary, setSummary] = React.useState(null)
      const [story, setStory] = React.useState(null)
      const [tree, setTree] = React.useState(null)
      const [typeCounts, setTypeCounts] = React.useState(null)
      const [err, setErr] = React.useState(null)
      const [loading, setLoading] = React.useState(false)
      const [selected, setSelected] = React.useState(null) // {ev, raw}
      const [selectedLine, setSelectedLine] = React.useState(null)

      const loadSession = React.useCallback(async (sid) => {
        if (!sid) return
        setLoading(true); setErr(null)
        setSummary(null); setStory(null); setTree(null); setSelected(null); setSelectedLine(null)
        try {
          const [s, st, t] = await Promise.all([apiSummary(sid), apiStory(sid), apiTree(sid)])
          setSummary(s.summary); setStory(st.story); setTree(t.turns); setMeta(t.meta); setTypeCounts(t.typeCounts)
        } catch (e) { setErr(e.message) } finally { setLoading(false) }
      }, [])

      React.useEffect(() => { loadSession(sessionId) }, [sessionId, loadSession])
      React.useEffect(() => { apiSessions().then((d) => setSessions(d.sessions)).catch(() => {}) }, [])

      const selectEvent = React.useCallback(async (ev) => {
        setSelectedLine(ev.line)
        setSelected({ ev, raw: null })
        try {
          const d = await apiLine(sessionId, ev.line)
          setSelected((prev) => prev && prev.ev.line === ev.line ? { ev: d.event, raw: d.raw } : prev)
        } catch { /* keep summary */ }
      }, [sessionId])

      const modeTab = (id, label) =>
        React.createElement('button', { key: id, className: 'dsvz-mode' + (mode === id ? ' active' : ''), onClick: () => setMode(id) }, label)

      return React.createElement('div', { className: 'dsvz-ov', onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() } },
        React.createElement('div', { className: 'dsvz-box' },
          React.createElement('div', { className: 'dsvz-head' },
            React.createElement('span', { className: 'dsvz-title' }, '📜 会话日志查看器'),
            React.createElement('span', { className: 'dsvz-pill', title: meta?.cwd ?? '' }, meta?.title ?? sessionId),
            React.createElement('span', { className: 'dsvz-spacer' }),
            React.createElement('select', { value: sessionId, onChange: (e) => setSessionId(e.target.value), title: '切换会话' },
              sessions.map((s) => React.createElement('option', { key: s.id, value: s.id }, `${s.title ?? s.id} · ${s.cwd ?? ''}`))),
            React.createElement('button', { className: 'dsvz-btn', onClick: () => loadSession(sessionId), disabled: loading }, '↻ 刷新'),
            React.createElement('button', { className: 'dsvz-btn', onClick: onClose }, '✕ 关闭'),
          ),
          React.createElement('div', { className: 'dsvz-modes' },
            modeTab('summary', '📋 摘要'),
            modeTab('story', '📖 故事线'),
            modeTab('tree', '🔬 事件树'),
          ),
          err && React.createElement('div', { className: 'dsvz-load', style: { color: '#dc2626' } }, `错误：${esc(err)}`),
          loading && !summary && !story && !tree && React.createElement('div', { className: 'dsvz-load' }, '⏳ 解析会话日志…'),
          mode === 'summary' && React.createElement(SummaryView, {
            summary,
            onStory: () => setMode('story'),
            onTree: () => setMode('tree'),
          }),
          mode === 'story' && React.createElement(StoryView, { story, baseTime: meta?.startTime ?? summary?.startTime }),
          mode === 'tree' && React.createElement('div', { className: 'dsvz-tree' },
            React.createElement('div', { className: 'dsvz-left' },
              React.createElement(TreeView, { turns: tree, meta, typeCounts, groups, onSelectEvent: selectEvent, selectedLine }),
            ),
            React.createElement('div', { className: 'dsvz-right' },
              selected
                ? React.createElement(DetailView, { ev: selected.ev, raw: selected.raw, groups })
                : React.createElement(SessionOverview, { summary, meta }),
            ),
          ),
        ),
      )
    }

    // 右侧默认：会话概览（改动4）
    function SessionOverview({ summary, meta }) {
      if (!summary) return React.createElement('div', { className: 'dsvz-empty' }, '会话概览将在解析完成后显示')
      const toolEntries = Object.entries(summary.toolStats || {}).slice(0, 8)
      const maxTool = Math.max(1, ...toolEntries.map(([, v]) => v.count))
      return React.createElement('div', { className: 'dsvz-rcontent' },
        React.createElement('div', { className: 'dsvz-rtitle' }, '📋 会话概览'),
        React.createElement('table', { className: 'dsvz-kv' },
          [['工作目录', meta?.cwd ?? summary.title], ['会话 ID', meta?.id ?? sessionOf(meta)], ['智能体', summary.model], ['创建时间', meta?.startTime ? fmtTime(meta.startTime) : '—'], ['总耗时', fmtDur(summary.durationMs)]]
            .map(([k, v], i) => React.createElement('tr', { key: i }, React.createElement('td', null, k), React.createElement('td', null, v))),
        ),
        React.createElement('div', { className: 'dsvz-sec' }, '工具调用 Top'),
        toolEntries.map(([name, v]) =>
          React.createElement('div', { key: name, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 5 } },
            React.createElement('span', { style: { width: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `${v.icon} ${name}`),
            React.createElement('div', { style: { flex: 1, height: 8, background: 'rgba(128,128,128,.12)', borderRadius: 4, overflow: 'hidden' } },
              React.createElement('div', { style: { height: '100%', width: `${(v.count / maxTool * 100).toFixed(0)}%`, background: '#2563eb', borderRadius: 4 } })),
            React.createElement('span', { style: { width: 44, textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--dsw-alias-label-secondary,#8493ab)' } }, v.count),
          )),
        React.createElement('div', { className: 'dsvz-sec' }, '事件统计'),
        React.createElement('table', { className: 'dsvz-kv' },
          [['总事件', fmtNum(summary.eventCount)], ['轮次', summary.turnCount], ['步骤', summary.stepCount],
           ['审批', summary.approvalStats ? `${summary.approvalStats.total}（通过 ${summary.approvalStats.allowed} / 拒绝 ${summary.approvalStats.denied}）` : '—']]
            .map(([k, v], i) => React.createElement('tr', { key: i }, React.createElement('td', null, k), React.createElement('td', null, v))),
        ),
      )
    }
    function sessionOf() { return '' }

    // ===== 会话头部按钮 =====
    function ViewerButton({ sessionId, t }) {
      const isOpen = React.useSyncExternalStore(subscribe, getOpen)
      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button',
          onClick: () => setOpen(!isOpen, sessionId),
          title: '在页面内查看本会话：摘要 / 故事线 / 事件树',
          className: isOpen ? 'dsvz-header-btn active' : 'dsvz-header-btn',
          style: {
            border: '1px solid var(--dsw-alias-border-l2)',
            minWidth: '92px',
            height: 32,
            color: 'var(--dsw-alias-label-primary)',
            fontFamily: 'var(--dsw-font-family)',
            cursor: 'pointer',
            background: '0 0',
            borderRadius: 18,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 4,
            padding: '6px 12px',
            fontSize: 13,
            fontWeight: 400,
            lineHeight: '20px',
            display: 'inline-flex',
            transition: 'border-color .15s,color .15s,background .15s',
          },
        },
          React.createElement('span', null, '📜 查看日志'),
        ),
        isOpen && createPortal(
          React.createElement(Viewer, { sessionId: openSessionId || sessionId, groups: groupsCache, onClose: () => setOpen(false) }),
          document.body,
        ),
      )
    }

    // ===== 配色缓存 =====
    let groupsCache = null
    apiMeta().then((m) => { groupsCache = m.groups }).catch(() => {})

    const apply = (ctx) => {
      ensureStyles()
      ctx.effect(
        () => ctx.slots.inject('conversation.session.header.utilities', () => ctx.slots.register({
          name: 'conversation.session.header.utilities',
          id: 'session-viz',
          order: -1,
          label: () => '查看日志',
        }, ViewerButton)),
        'dsh-session-viz: session header viewer button',
      )
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
