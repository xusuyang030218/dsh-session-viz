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
import React from 'react'
import { createPortal } from 'react-dom'

    // ===== 打开状态 =====
    let open = false
    let openSessionId = null
    let devMode = false
    const listeners = new Set()
    const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn) }
    const getOpen = () => open
    const setOpen = (v, sessionId) => {
      open = v
      if (sessionId !== undefined) openSessionId = sessionId
      listeners.forEach((fn) => fn())
    }

    // ===== 额外视图注册（供 index.ts 注入「会话图」等 TSX 视图）=====
    // 保持本文件零构建手写 JS 的定位：外部视图通过 render(sessionId) 回调注入，
    // 本文件不直接依赖任何 TSX 模块。
    let extraModes = []
    function registerExtraMode(mode) {
      extraModes.push(mode)
    }

    // ===== 内联 CSS（v2） =====
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
    // 路径缩短：普通用户只看最后两段
    function shortPath(p) {
      const parts = String(p ?? '').split(/[\\/]/).filter(Boolean)
      return parts.length > 2 ? parts.slice(-2).join('/') : (p ?? '')
    }

    // JSON 语法高亮（自写；深色主题用更亮的变体）
    function isDark() { return typeof document !== 'undefined' && document.body && document.body.hasAttribute('data-ds-dark-theme') }
    // 字符串形态的 JSON 也重新缩进：原始 JSONL 是压缩单行，直接展示极难阅读
    function tryPretty(text) {
      const t = String(text ?? '')
      const trimmed = t.trim()
      if (!trimmed || (trimmed[0] !== '{' && trimmed[0] !== '[')) return t
      try { return JSON.stringify(JSON.parse(trimmed), null, 2) } catch { return t }
    }
    function jsonHighlight(json) {
      if (json === undefined || json === null) return ''
      const s = typeof json === 'string' ? tryPretty(json) : JSON.stringify(json, null, 2)
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

    // ===== JSON 可折叠树查看器 =====
    const JSON_STR_LIMIT = 220   // 单个字符串值超过此长度先截断，点「展开」看全文
    const JSON_AUTO_DEPTH = 2    // 深于此层级的容器默认折叠
    const JSON_AUTO_COUNT = 24   // 子项数超过此值默认折叠
    const JSEP = '\u0000'        // 路径分隔符（不会出现在 JSON key 里）

    function jsonKindOf(v) {
      if (v === null) return 'null'
      if (Array.isArray(v)) return 'array'
      return typeof v
    }
    function jsonEntriesOf(v, kind) {
      return kind === 'array' ? v.map((x, i) => [i, x]) : Object.entries(v)
    }
    function jsonWalkContainers(root, visit) {
      const walk = (v, depth, path) => {
        const kind = jsonKindOf(v)
        if (kind !== 'array' && kind !== 'object') return
        const entries = jsonEntriesOf(v, kind)
        visit(path, depth, entries.length)
        entries.forEach(([k, x]) => walk(x, depth + 1, path + JSEP + k))
      }
      walk(root, 0, '')
    }
    // 默认折叠：深层容器与超大容器，首屏只给主干
    function jsonInitialCollapsed(root) {
      const set = new Set()
      jsonWalkContainers(root, (path, depth, n) => {
        if (n && (depth >= JSON_AUTO_DEPTH || n > JSON_AUTO_COUNT)) set.add(path)
      })
      return set
    }
    function jsonAllContainers(root) {
      const set = new Set()
      jsonWalkContainers(root, (path, _depth, n) => { if (n) set.add(path) })
      return set
    }
    // 扁平化为行：{depth, kind:'branch'|'close'|'leaf', ...}
    function jsonRows(root, collapsed) {
      const rows = []
      const walk = (key, v, depth, path, last) => {
        const kind = jsonKindOf(v)
        if (kind === 'array' || kind === 'object') {
          const entries = jsonEntriesOf(v, kind)
          const open = kind === 'array' ? '[' : '{'
          const close = kind === 'array' ? ']' : '}'
          const isCollapsed = collapsed.has(path)
          rows.push({ depth, path, key, kind: 'branch', open, close, n: entries.length, collapsed: isCollapsed, last })
          if (!isCollapsed && entries.length) {
            entries.forEach(([k, x], i) => walk(k, x, depth + 1, path + JSEP + k, i === entries.length - 1))
            rows.push({ depth, kind: 'close', close, last })
          }
        } else {
          rows.push({ depth, path, key, kind: 'leaf', v, vtype: kind, last })
        }
      }
      walk(undefined, root, 0, '', true)
      return rows
    }

    function JsonView({ text, value }) {
      const parsed = React.useMemo(() => {
        if (value !== undefined) return { ok: true, data: value }
        const t = String(text ?? '').trim()
        if (!t) return { ok: false, data: null, empty: true }
        try { return { ok: true, data: JSON.parse(t) } } catch { return { ok: false, data: null } }
      }, [text, value])
      const [collapsed, setCollapsed] = React.useState(() => (parsed.ok ? jsonInitialCollapsed(parsed.data) : new Set()))
      const [expandedStr, setExpandedStr] = React.useState(() => new Set())
      const [wrap, setWrap] = React.useState(false)
      const [lineNo, setLineNo] = React.useState(true)
      const [copied, setCopied] = React.useState(false)
      // 切换事件后回到默认折叠视图
      React.useEffect(() => {
        setCollapsed(parsed.ok ? jsonInitialCollapsed(parsed.data) : new Set())
        setExpandedStr(new Set())
        setCopied(false)
      }, [parsed])

      const rows = React.useMemo(() => (parsed.ok ? jsonRows(parsed.data, collapsed) : []), [parsed, collapsed])
      const pretty = React.useMemo(() => (parsed.ok ? JSON.stringify(parsed.data, null, 2) : String(text ?? '')), [parsed, text])

      if (parsed.empty) return React.createElement('pre', { className: 'dsvz-pre' }, '(无)')
      // 不是合法 JSON：退回带高亮的纯文本，不丢信息
      if (!parsed.ok) {
        return React.createElement('div', { className: 'dsvz-json' },
          React.createElement('div', { className: 'dsvz-json-tb' },
            React.createElement('span', { className: 'dsvz-json-stat' }, '非 JSON 文本，按原样展示')),
          React.createElement('pre', { className: 'dsvz-pre', style: { margin: 0, border: 'none', background: 'transparent' }, dangerouslySetInnerHTML: { __html: jsonHighlight(text) } }))
      }

      const toggle = (path) => setCollapsed((prev) => {
        const s = new Set(prev)
        if (s.has(path)) s.delete(path); else s.add(path)
        return s
      })
      const toggleStr = (path) => setExpandedStr((prev) => {
        const s = new Set(prev)
        if (s.has(path)) s.delete(path); else s.add(path)
        return s
      })
      const doCopy = () => {
        try {
          navigator.clipboard.writeText(pretty)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch { /* 忽略：无剪贴板权限时静默 */ }
      }

      const punc = (key, s) => React.createElement('span', { key, className: 'dsvz-jpunc' }, s)
      // key 前缀："key": / 数组下标灰显
      const keyNodes = (key) => {
        if (key === undefined) return []
        if (typeof key === 'number') return [React.createElement('span', { key: 'k', className: 'dsvz-jcount' }, `${key}`), punc('kc', ': ')]
        return [React.createElement('span', { key: 'k', className: 'dsvz-jkey' }, JSON.stringify(String(key))), punc('kc', ': ')]
      }
      const leafNodes = (row) => {
        const { v, vtype, path } = row
        if (vtype === 'string') {
          const isLong = v.length > JSON_STR_LIMIT
          const open = expandedStr.has(path)
          const shown = isLong && !open ? v.slice(0, JSON_STR_LIMIT) : v
          const out = [React.createElement('span', { key: 'v', className: 'dsvz-jstr' }, JSON.stringify(shown) + (isLong && !open ? ' …' : ''))]
          if (isLong) {
            out.push(React.createElement('span', { key: 'n', className: 'dsvz-jcount' }, ` ${fmtNum(v.length)} 字符`))
            out.push(React.createElement('span', { key: 'm', className: 'dsvz-jmore', onClick: () => toggleStr(path) }, open ? '收起' : '展开'))
          }
          return out
        }
        const cls = vtype === 'number' ? 'dsvz-jnum' : 'dsvz-jlit'
        return [React.createElement('span', { key: 'v', className: cls }, v === null ? 'null' : String(v))]
      }

      const rowEls = rows.map((row, i) => {
        const indents = []
        for (let d = 0; d < row.depth; d++) indents.push(React.createElement('span', { key: 'i' + d, className: 'dsvz-jind' }))
        let body
        if (row.kind === 'branch') {
          const tog = row.n
            ? React.createElement('span', { key: 't', className: 'dsvz-jtog', onClick: () => toggle(row.path), title: row.collapsed ? '展开' : '折叠' }, row.collapsed ? '▶' : '▼')
            : React.createElement('span', { key: 't', className: 'dsvz-jtog ph' }, '·')
          const tail = row.n === 0
            ? [punc('e', row.open + row.close + (row.last ? '' : ','))]
            : row.collapsed
              ? [punc('o', row.open), React.createElement('span', { key: 'c', className: 'dsvz-jcount' }, ` ${row.n} 项 `), punc('cl', row.close + (row.last ? '' : ','))]
              : [punc('o', row.open)]
          body = [tog, React.createElement('span', { key: 'v', className: 'dsvz-jv' }, ...keyNodes(row.key), ...tail)]
        } else if (row.kind === 'close') {
          body = [React.createElement('span', { key: 't', className: 'dsvz-jtog ph' }, '·'),
            React.createElement('span', { key: 'v', className: 'dsvz-jv' }, punc('c', row.close + (row.last ? '' : ',')))]
        } else {
          body = [React.createElement('span', { key: 't', className: 'dsvz-jtog ph' }, '·'),
            React.createElement('span', { key: 'v', className: 'dsvz-jv' }, ...keyNodes(row.key), ...leafNodes(row), punc('t', row.last ? '' : ','))]
        }
        return React.createElement('div', { key: i, className: 'dsvz-jrow' },
          lineNo && React.createElement('span', { className: 'dsvz-jln' }, i + 1),
          React.createElement('span', { className: 'dsvz-jmain' }, ...indents, ...body))
      })

      return React.createElement('div', { className: 'dsvz-json' },
        React.createElement('div', { className: 'dsvz-json-tb' },
          React.createElement('button', { className: 'dsvz-json-btn', onClick: () => setCollapsed(new Set()) }, '全部展开'),
          React.createElement('button', { className: 'dsvz-json-btn', onClick: () => setCollapsed(jsonAllContainers(parsed.data)) }, '全部折叠'),
          React.createElement('button', { className: 'dsvz-json-btn' + (wrap ? ' on' : ''), onClick: () => setWrap((w) => !w), title: '长值自动换行' }, '自动换行'),
          React.createElement('button', { className: 'dsvz-json-btn' + (lineNo ? ' on' : ''), onClick: () => setLineNo((v) => !v), title: '显示行号' }, '行号'),
          React.createElement('span', { className: 'sp' }),
          React.createElement('span', { className: 'dsvz-json-stat' }, `${fmtNum(rows.length)} 行 · ${fmtNum(pretty.length)} 字符`),
          React.createElement('button', { className: 'dsvz-json-btn', onClick: doCopy }, copied ? '已复制' : '复制')),
        React.createElement('div', { className: 'dsvz-json-body' + (wrap ? ' wrap' : '') }, rowEls))
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
    function DetailView({ ev, raw, groups, devMode }) {
      const [tab, setTab] = React.useState('解读')
      const gstyle = grp(groups, ev?.group)
      const rows = React.useMemo(() => interpret(ev, raw, devMode), [ev, raw, devMode])
      if (!ev) return React.createElement('div', { className: 'dsvz-empty' }, '无数据')
      const tabs = devMode ? ['解读', 'JSON', '原始行'] : ['解读']
      return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
        React.createElement('div', { className: 'dsvz-rtabs' },
          tabs.map((t) =>
            React.createElement('button', { key: t, className: 'dsvz-rtab' + (tab === t ? ' active' : ''), onClick: () => setTab(t) }, t))),
        React.createElement('div', { className: 'dsvz-rcontent' },
          React.createElement('div', { className: 'dsvz-rtitle' },
            React.createElement('span', { className: 'dsvz-typechip', style: { background: gstyle.bg, color: gstyle.fg, border: '1px solid ' + gstyle.border, borderRadius: 999, padding: '0 8px', fontSize: 11, fontWeight: 700 } }, devMode ? ev.type : (gstyle.label ?? ev.type)),
            devMode && React.createElement('span', { style: { fontFamily: 'var(--dsw-font-mono,Consolas,monospace)', fontSize: 11, color: 'var(--dsw-alias-label-secondary,#8493ab)' } }, `#${ev.seq ?? ev.line} · ${ev.time ? fmtTime(ev.time) : ''}`),
            !devMode && React.createElement('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-secondary,#8493ab)' } }, ev.time ? fmtTime(ev.time) : ''),
            ev.error && React.createElement('span', { style: { color: '#dc2626', fontWeight: 700, fontSize: 11 } }, '⚠ 错误')),
          tab === '解读' && React.createElement('table', { className: 'dsvz-kv' },
            rows.map(([k, v], i) => React.createElement('tr', { key: i },
              React.createElement('td', null, k),
              React.createElement('td', null, React.createElement('div', { dangerouslySetInnerHTML: { __html: jsonHighlight(v) } }))))),
          devMode && tab === 'JSON' && React.createElement(JsonView, { text: raw }),
          devMode && tab === '原始行' && React.createElement('pre', { className: 'dsvz-pre' }, esc(raw || '(无)')),
        ),
      )
    }

    function interpret(ev, raw, devMode) {
      let o = null
      try { o = JSON.parse(raw) } catch { /* ignore */ }
      const d = o?.data ?? {}
      const rows = []
      // 时间始终展示
      rows.push(['时间', ev.time ? fmtTime(ev.time) : '—'])
      // 内部字段仅开发者模式展示
      if (devMode) {
        rows.push(['line', ev.line])
        rows.push(['seq', ev.seq ?? '—'])
        rows.push(['type', ev.type])
        rows.push(['分组', ev.group])
      }
      const kv = (k, v) => rows.push([k, v === undefined || v === null ? '—' : (typeof v === 'object' ? JSON.stringify(v, null, 2) : String(v))])
      switch (ev.type) {
        case 'session': if (devMode) kv('cwd', o?.cwd); kv('agentPreset', o?.agentPreset); if (devMode) kv('delegationDepth', o?.delegationDepth); break
        case 'session/title': kv('标题', d.title); break
        case 'user/message': kv('内容', d.content?.map?.((p) => p.text ?? `[${p.type}]`).filter(Boolean).join('\n')); break
        case 'assistant/message': kv('回复', d.message?.content?.filter((p) => p.type === 'text').map((p) => p.text).filter(Boolean).join('\n') || '(无正文)'); if (devMode) kv('tokens', JSON.stringify(d.usage ?? {}, null, 2)); break
        case 'reasoning-chunks':
        case 'text-chunks': kv('内容', (d.texts ?? []).join('')); if (devMode) kv('分片数', (d.texts ?? []).length); if (devMode) kv('总耗时', `${(d.dt ?? []).reduce((a, x) => a + x, 0)}ms`); break
        case 'tool/call': {
          kv('工具', d.name)
          // 参数格式化为可读 JSON
          let argsPretty = d.arguments
          try { argsPretty = JSON.stringify(JSON.parse(d.arguments), null, 2) } catch { /* keep raw */ }
          kv('请求参数', argsPretty)
          if (devMode) kv('callId', d.callId)
          break
        }
        case 'tool/result': {
          // 提取返回内容：tool-result 块的 text（可能嵌套）
          const extract = (content) => {
            if (typeof content === 'string') return content
            if (!Array.isArray(content)) return ''
            return content.map((p) => {
              if (typeof p === 'string') return p
              if (p?.type === 'text') return p.text ?? ''
              if (p?.content) return extract(p.content)
              return ''
            }).filter(Boolean).join('\n')
          }
          const result = extract(d.message?.content)
          kv('返回值', result || '(空)')
          if (d.error) kv('错误', typeof d.error === 'string' ? d.error : JSON.stringify(d.error, null, 2))
          if (devMode && d.meta) kv('meta', JSON.stringify(d.meta, null, 2))
          if (devMode && d.message?.source?.callId) kv('callId', d.message.source.callId)
          break
        }
        case 'approval/asked': kv('工具', d.toolName); kv('原因', d.reason); if (devMode) kv('id', d.id); break
        case 'approval/decided': kv('结果', d.outcome); if (devMode) kv('id', d.id); break
        case 'todo/write': kv('todos', JSON.stringify(d.todos ?? [], null, 2)); break
        case 'turn/start': case 'turn/end': kv('turn', d.turn); if (devMode) kv('reason', JSON.stringify(d.reason ?? {}, null, 2)); break
        case 'step/start': case 'step/end': kv('turn', d.turn); kv('step', d.step); break
        case 'request/context': kv('模型', d.model); if (devMode) kv('provider', d.provider); if (devMode) kv('contextWindow', d.contextWindow); break
        case 'llm/retry': kv('重试', `${d.retry}/${d.maxRetries}`); if (devMode) kv('failure', JSON.stringify(d.failure ?? {}, null, 2)); if (devMode) kv('delayMs', d.delayMs); break
        case 'command/run': kv('name', d.name); kv('args', d.args); if (devMode) kv('commandId', d.commandId); break
        case 'command/done': kv('kind', d.kind); kv('text', d.text); break
        default: {
          if (devMode) {
            const dk = Object.keys(d)
            if (dk.length) dk.slice(0, 12).forEach((k) => kv(k, typeof d[k] === 'object' ? JSON.stringify(d[k], null, 2) : d[k]))
          }
        }
      }
      return rows
    }

    // ===== 全局底部进度条（进度条 1：3px 彩色分段，Turn 按事件数比例） =====
    function GlobalProgressBar({ turns, currentTurn, totalEvents, onSeek }) {
      const [tip, setTip] = React.useState(null)
      const [hoverPos, setHoverPos] = React.useState(null)
      const wrapRef = React.useRef(null)
      if (!turns?.length) return null
      const total = totalEvents || turns.reduce((a, t) => a + (t.eventCount || 0), 0) || 1
      const TURN_COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#FF5722', '#3F51B5', '#009688', '#E91E63', '#795548', '#673AB7', '#F44336', '#FFC107', '#607D8B']
      const handleMove = (e) => {
        const rect = wrapRef.current.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        setHoverPos(ratio)
        let acc = 0
        let hit = null
        for (const t of turns) {
          acc += t.eventCount || 0
          if (ratio * total <= acc) { hit = t; break }
        }
        setTip(hit ? { turn: hit.turn, pct: Math.round(ratio * 100) } : null)
      }
      const handleClick = (e) => {
        const rect = wrapRef.current.getBoundingClientRect()
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
        if (onSeek) onSeek(ratio)
      }
      let markerRatio = null
      if (currentTurn != null) {
        let acc = 0
        const cur = turns.find((t) => t.turn === currentTurn)
        for (const t of turns) {
          if (t.turn === currentTurn) break
          acc += t.eventCount || 0
        }
        markerRatio = (acc + (cur?.eventCount || 0) / 2) / total
      }
      const pos = hoverPos != null ? hoverPos : markerRatio
      return React.createElement('div', {
        ref: wrapRef, className: 'dsvz-global-bar',
        onMouseMove: handleMove, onMouseLeave: () => { setTip(null); setHoverPos(null) },
        onClick: handleClick, title: '点击跳转到对应 Turn',
      },
        turns.map((t, i) => {
          const w = ((t.eventCount || 0) / total) * 100
          const isCur = t.turn === currentTurn
          return React.createElement('div', {
            key: t.turn, className: 'gb-seg' + (isCur ? ' cur' : ''),
            style: { left: `${(turns.slice(0, i).reduce((a, x) => a + (x.eventCount || 0), 0) / total) * 100}%`, width: `${w}%`, background: TURN_COLORS[i % TURN_COLORS.length] },
          })
        }),
        pos != null && React.createElement('div', { className: 'gb-marker', style: { left: `${pos * 100}%` } }),
        tip && React.createElement('div', { className: 'gb-tip', style: { left: `${pos * 100}%` } }, `Turn ${tip.turn} · ${tip.pct}%`),
      )
    }

    // ===== Turn/Step 结构进度条（进度条 2：列表顶部紧凑进度链） =====
    function TurnStepChain({ turns, currentTurn, currentStep, onSeekTurn, onSeekStep }) {
      if (!turns?.length) return null
      const total = turns.reduce((a, t) => a + (t.eventCount || 0), 0) || 1
      const TURN_COLORS = ['#2196F3', '#4CAF50', '#FF9800', '#9C27B0', '#00BCD4', '#FF5722', '#3F51B5', '#009688', '#E91E63', '#795548', '#673AB7', '#F44336', '#FFC107', '#607D8B']
      const curTurnObj = turns.find((t) => t.turn === currentTurn) || turns[0]
      const steps = curTurnObj?.steps || []
      const stepTotal = steps.reduce((a, s) => a + (s.eventCount || 0), 0) || 1
      const curStepObj = steps.find((s) => s.step === currentStep)
      const activeTypes = (curStepObj?.groups || []).filter((g) => g.kind !== 'event').map((g) => g.label).slice(0, 2)
      return React.createElement('div', { className: 'dsvz-chain' },
        React.createElement('div', { className: 'dsvz-chain-row', title: '点击 Turn 跳转' },
          turns.map((t, i) => {
            const w = ((t.eventCount || 0) / total) * 100
            return React.createElement('div', {
              key: t.turn, className: 'dsvz-chain-seg' + (t.turn === currentTurn ? ' cur' : ''),
              style: { width: `${w}%`, background: TURN_COLORS[i % TURN_COLORS.length] },
              onClick: (e) => { e.stopPropagation(); onSeekTurn && onSeekTurn(t.turn) },
              title: `Turn ${t.turn} · ${t.eventCount} 条`,
            })
          }),
        ),
        React.createElement('div', { className: 'dsvz-chain-meta' },
          React.createElement('span', null, `Turn ${currentTurn ?? '—'}`),
          React.createElement('span', { className: 'step-pos' }, currentStep != null ? `Step ${currentStep}/${stepTotal || '—'}` : '—'),
          activeTypes.map((l, i) => React.createElement('span', { key: i, className: 'act', style: { borderColor: 'var(--dsw-alias-border-l2,rgba(128,128,128,.3))', color: 'var(--dsw-alias-label-secondary,#8493ab)' } }, l)),
          React.createElement('span', { className: 'spacer' }),
          React.createElement('span', null, `${fmtNum(stepTotal)} 条`),
        ),
      )
    }

    // ===== 单步执行进度（进度条 3：圆环 + 横条细分） =====
    function StepProgress({ step, positionRatio }) {
      if (!step) return null
      const groups = step.groups || []
      const counts = {}
      let total = 0
      // 原始事件数（chunk 组的 count 是分片数，非合并组数）
      let rawTotal = 0
      let groupCount = 0
      const KIND_LABEL = {
        reasoning: { label: '推理', color: '#FFC107' },
        text: { label: '输出', color: '#009688' },
        'tool-call': { label: '工具流', color: '#F44336' },
        assistant: { label: '助手', color: '#FF9800' },
        event: { label: '事件', color: '#607D8B' },
      }
      for (const g of groups) {
        const key = g.kind || 'event'
        const n = g.kind === 'event' ? (g.events?.length || 0) : (g.count || 1)
        counts[key] = (counts[key] || 0) + n
        total += n
        rawTotal += g.kind === 'event' ? (g.events?.length || 0) : (g.count || 1)
        if (g.kind !== 'event') groupCount++
      }
      if (!total) return null
      const r = 30
      const c = 2 * Math.PI * r
      const ratio = Math.min(1, Math.max(0, positionRatio || 0))
      return React.createElement('div', { className: 'dsvz-stepprog' },
        React.createElement('svg', { className: 'sp-ring', width: 84, height: 84, viewBox: '0 0 84 84' },
          React.createElement('circle', { cx: 42, cy: 42, r, fill: 'none', stroke: 'var(--dsw-alias-border-l2,rgba(128,128,128,.2))', strokeWidth: 7 }),
          React.createElement('circle', {
            cx: 42, cy: 42, r, fill: 'none', stroke: 'var(--dsw-alias-brand-primary-new-colorprimary-new-color,#2563eb)', strokeWidth: 7, strokeLinecap: 'round',
            strokeDasharray: c, strokeDashoffset: c * (1 - ratio), transform: 'rotate(-90 42 42)', style: { transition: 'stroke-dashoffset .4s ease' },
          }),
          React.createElement('text', { className: 'sp-ring-val', x: 42, y: 44, textAnchor: 'middle' }, `${Math.round(ratio * 100)}%`),
          React.createElement('text', { className: 'sp-ring-label', x: 42, y: 57, textAnchor: 'middle' }, '会话位置'),
        ),
        React.createElement('div', { className: 'sp-bars' },
          Object.entries(KIND_LABEL).map(([key, k]) => {
            const n = counts[key] || 0
            if (!n) return null
            return React.createElement('div', { key, className: 'sp-bar' },
              React.createElement('span', { className: 'lb' }, k.label),
              React.createElement('div', { className: 'tk' }, React.createElement('div', { className: 'tl', style: { width: `${(n / total) * 100}%`, background: k.color } })),
              React.createElement('span', { className: 'ct' }, n),
            )
          }),
          React.createElement('div', { className: 'sp-foot' },
            React.createElement('span', null, `Step ${step.turn}·${step.step} 合并 ${fmtNum(groupCount)} 组 / 原始 ${fmtNum(rawTotal)} 条`),
            React.createElement('span', null, `耗时 ${fmtDur(dur(step))}`),
          ),
        ),
      )
    }

    // ===== 加载进度（进度条 4：环形 + 线性 + 实时状态） =====
    function LoadingOverlay({ stage }) {
      const pct = stage === 'meta' ? 30 : stage === 'summary' ? 60 : stage === 'story' ? 90 : 100
      const label = stage === 'meta' ? '正在解析事件…' : stage === 'summary' ? '正在生成执行摘要…' : stage === 'story' ? '正在构建故事线…' : '加载中…'
      const r = 34
      const c = 2 * Math.PI * r
      return React.createElement('div', { className: 'dsvz-loading' },
        React.createElement('svg', { width: 96, height: 96, viewBox: '0 0 96 96', className: 'dsvz-ring' },
          React.createElement('circle', { cx: 48, cy: 48, r, fill: 'none', stroke: 'var(--dsvz-ring-track,#e5e9ef)', strokeWidth: 7 }),
          React.createElement('circle', {
            cx: 48, cy: 48, r, fill: 'none',
            stroke: 'var(--dsvz-accent,#2563eb)', strokeWidth: 7, strokeLinecap: 'round',
            strokeDasharray: c, strokeDashoffset: c * (1 - pct / 100),
            transform: 'rotate(-90 48 48)', style: { transition: 'stroke-dashoffset .4s ease' },
          }),
          React.createElement('text', { x: 48, y: 52, textAnchor: 'middle', fontSize: 16, fontWeight: 700, fill: 'currentColor' }, `${pct}%`),
        ),
        React.createElement('div', { className: 'dsvz-loading-label' }, label),
        React.createElement('div', { className: 'dsvz-loading-bar' },
          React.createElement('div', { className: 'dsvz-loading-fill', style: { width: `${pct}%` } })),
      )
    }

    // ===== 文件变更 diff 渲染 =====
    // 简单 LCS 行级 diff：edit 的 old/new 片段 → 增删行标记
    function renderFileDiff(f) {
      if (f.oldString != null && f.newString != null) {
        const oldLines = String(f.oldString).split('\n')
        const newLines = String(f.newString).split('\n')
        // 行级 diff：完全相同的行保持，否则整段标记
        const rows = []
        const maxLen = Math.max(oldLines.length, newLines.length)
        for (let i = 0; i < maxLen; i++) {
          const o = oldLines[i]
          const n = newLines[i]
          if (o !== undefined && o === n) rows.push({ type: 'ctx', text: o })
          else {
            if (o !== undefined) rows.push({ type: 'del', text: o })
            if (n !== undefined) rows.push({ type: 'add', text: n })
          }
        }
        return rows.map((r, i) => React.createElement('div', { key: i, className: 'dsvz-diff-row ' + (r.type === 'del' ? 'del' : r.type === 'add' ? 'add' : '') },
          `${r.type === 'del' ? '-' : r.type === 'add' ? '+' : ' '} ${r.text}`))
      }
      // write：展示完整新内容（截断为预览，可滚动）
      if (f.content != null) {
        return React.createElement('pre', null, String(f.content))
      }
      return React.createElement('div', { className: 'dsvz-empty', style: { padding: '8px 0' } }, '无变更内容')
    }

    // ===== 首页：会话过程闭环总览 =====
    // 每个「环」= 一个开始/结束配对（turn / step / tool / approval）。
    // 闭合环 = 绿色实线；未闭合环 = 琥珀色虚线 + 脉冲动画（会话进行中/异常中断）；
    // 失败环 = 红色。点击环 → 跳到事件树对应 turn/step。
    function HomeView({ closure, meta, turns, onJump, onOpenTree, onOpenSummary, onOpenMap }) {
      const [expandTurn, setExpandTurn] = React.useState(null) // 展开的 turn 序号（null=全部折叠为概览）
      if (!closure) return React.createElement('div', { className: 'dsvz-empty' }, '加载中…')
      const s = closure.summary
      const cards = [
        { k: 'turn', icon: '🔄', label: '对话轮次', total: s.turn.total, closed: s.turn.closed, open: s.turn.open, error: s.turn.error },
        { k: 'step', icon: '🪜', label: '执行步骤', total: s.step.total, closed: s.step.closed, open: s.step.open, error: s.step.error },
        { k: 'tool', icon: '🧰', label: '工具调用', total: s.tool.total, closed: s.tool.closed, open: s.tool.open, error: s.tool.error },
        { k: 'approval', icon: '🛡️', label: '审批', total: s.approval.total, closed: s.approval.closed, open: s.approval.open, error: s.approval.error },
      ]
      // 环的圆环几何：内层 = 该层 children 的占比环
      function ringArc(ring, radius) {
        // 返回若干圆弧段：每一段是 [startFrac, endFrac, status]
        const segs = []
        const kids = ring.children || []
        if (!kids.length) {
          segs.push([0, 1, ring.status])
          return segs
        }
        // 每个 child 按权重分一段（权重=耗时或 1）
        const weights = kids.map((c) => Math.max(1, c.durationMs ?? 1))
        const totalW = weights.reduce((a, b) => a + b, 0)
        let acc = 0
        kids.forEach((c, i) => {
          const w = weights[i] / totalW
          segs.push([acc, acc + w, c.status])
          acc += w
        })
        return segs
      }
      // SVG 弧线 path：从 start 到 end（占比 0..1，0=12 点方向，顺时针）
      function arcPath(frac0, frac1, radius) {
        const a0 = -Math.PI / 2 + frac0 * Math.PI * 2
        const a1 = -Math.PI / 2 + frac1 * Math.PI * 2
        const cx = 0, cy = 0
        const x0 = cx + radius * Math.cos(a0), y0 = cy + radius * Math.sin(a0)
        const x1 = cx + radius * Math.cos(a1), y1 = cy + radius * Math.sin(a1)
        const large = (frac1 - frac0) > 0.5 ? 1 : 0
        return `M ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`
      }
      const colorOf = (status) => status === 'closed' ? '#22c55e' : status === 'open' ? '#f59e0b' : '#ef4444'
      const dashOf = (status) => status === 'open' ? '4 3' : null

      // 单个 turn 的环（大圆 + 内层 step 环）
      function TurnRing({ ring }) {
        const expanded = expandTurn === ring.turn
        const R = 64
        const kids = ring.children || []
        const stepSegs = kids.map((st) => ringArc(st, R - 14)).flat()
        // 外层 turn 环
        const outer = ringArc(ring, R)
        return React.createElement('div', {
          className: 'dsvz-ring-turn' + (expanded ? ' expanded' : ''),
          style: { cursor: 'pointer' },
          onClick: (e) => { e.stopPropagation(); setExpandTurn(expanded ? null : ring.turn) },
          title: `${ring.label}${ring.durationMs != null ? ` · ${fmtDur(ring.durationMs)}` : ''}`,
        },
          React.createElement('svg', { viewBox: '-80 -80 160 160', width: 160, height: 160 },
            outer.map((seg, i) => React.createElement('circle', {
              key: i, cx: 0, cy: 0, r: R, fill: 'none',
              stroke: colorOf(seg[2]), strokeWidth: 6,
              strokeDasharray: dashOf(seg[2]) ?? undefined,
              strokeLinecap: 'round',
              // 画弧段：用 dashoffset 技巧不可靠，改用 path
            })),
            // 简化：整环颜色 = 该 turn 状态；内层 step 环分段
            React.createElement('circle', { cx: 0, cy: 0, r: R, fill: 'none', stroke: colorOf(ring.status), strokeWidth: 7, strokeDasharray: dashOf(ring.status) ?? undefined, strokeLinecap: 'round' }),
            React.createElement('circle', { cx: 0, cy: 0, r: R - 14, fill: 'none', stroke: 'rgba(128,128,128,.18)', strokeWidth: 1 }),
            stepSegs.map((seg, i) => React.createElement('path', { key: i, d: arcPath(seg[0], seg[1], R - 14), fill: 'none', stroke: colorOf(seg[2]), strokeWidth: 4, strokeDasharray: dashOf(seg[2]) ?? undefined, strokeLinecap: 'butt' })),
            React.createElement('text', { x: 0, y: -6, textAnchor: 'middle', fontSize: 15, fontWeight: 800, fill: 'var(--dsw-alias-label-primary,#1e293b)' }, `T${ring.turn}`),
            React.createElement('text', { x: 0, y: 12, textAnchor: 'middle', fontSize: 9.5, fill: 'var(--dsw-alias-label-secondary,#8493ab)' }, `${kids.length} 步`),
          ),
          React.createElement('div', { className: 'dsvz-ring-meta' },
            React.createElement('span', { className: 'dsvz-ring-label' }, ring.label),
            React.createElement('span', { className: 'dsvz-ring-status' }, ring.status === 'closed' ? '✓ 闭合' : ring.status === 'open' ? '◌ 进行中' : '✕ 失败'),
            ring.durationMs != null && React.createElement('span', { className: 'dsvz-ring-dur' }, fmtDur(ring.durationMs)),
          ),
          expanded && React.createElement('div', { className: 'dsvz-ring-steps' },
            kids.map((st, i) => React.createElement('div', {
              key: i, className: 'dsvz-ring-step', style: { borderLeftColor: colorOf(st.status) },
              onClick: (e) => { e.stopPropagation(); onJump && onJump(st) },
              title: `跳到第 ${st.turn} 轮·第 ${st.step} 步`,
            },
              React.createElement('span', { className: 'dsvz-ring-dot', style: { background: colorOf(st.status) } }, st.status === 'open' ? '◌' : ''),
              React.createElement('span', { className: 'dsvz-ring-step-label' }, st.label),
              React.createElement('span', { className: 'dsvz-ring-step-tools' },
                st.children.filter((c) => c.kind === 'tool').slice(0, 6).map((c, j) =>
                  React.createElement('span', { key: j, className: 'dsvz-ring-tool' + (c.status === 'error' ? ' err' : c.status === 'open' ? ' open' : ''), title: `${c.label}${c.durationMs != null ? ' · ' + fmtDur(c.durationMs) : ''}${c.status === 'error' ? ' · 失败' : c.status === 'open' ? ' · 进行中' : ''}` }, c.label)),
                st.children.filter((c) => c.kind === 'tool').length > 6 && React.createElement('span', { className: 'dsvz-ring-more' }, `+${st.children.filter((c) => c.kind === 'tool').length - 6}`),
              ),
              st.durationMs != null && React.createElement('span', { className: 'dsvz-ring-dur' }, fmtDur(st.durationMs)),
            )),
          ),
        )
      }

      return React.createElement('div', { className: 'dsvz-scroll' },
        React.createElement('div', { className: 'dsvz-home' },
          React.createElement('div', { className: 'dsvz-home-hero' },
            React.createElement('div', { className: 'dsvz-home-title' }, '会话过程'),
            React.createElement('div', { className: 'dsvz-home-sub' }, '把整个会话拆成一圈圈「环」：每一轮、每一步、每一次工具调用、每一次审批，都有开始与结束。闭合的环是已完成的工作，未闭合的环是正在进行或中断的工作。'),
            React.createElement('div', { className: 'dsvz-home-legend' },
              React.createElement('span', { className: 'dsvz-legend-item' }, React.createElement('span', { className: 'dsvz-legend-dot', style: { background: '#22c55e' } }), '闭合'),
              React.createElement('span', { className: 'dsvz-legend-item' }, React.createElement('span', { className: 'dsvz-legend-dot', style: { background: '#f59e0b' } }), '进行中'),
              React.createElement('span', { className: 'dsvz-legend-item' }, React.createElement('span', { className: 'dsvz-legend-dot', style: { background: '#ef4444' } }), '失败'),
            ),
          ),
          React.createElement('div', { className: 'dsvz-home-cards' },
            cards.map((c) => React.createElement('div', { key: c.k, className: 'dsvz-home-card' },
              React.createElement('div', { className: 'dsvz-home-card-icon' }, c.icon),
              React.createElement('div', { className: 'dsvz-home-card-body' },
                React.createElement('div', { className: 'dsvz-home-card-label' }, c.label),
                React.createElement('div', { className: 'dsvz-home-card-num' }, fmtNum(c.total)),
              ),
              React.createElement('div', { className: 'dsvz-home-card-stats' },
                React.createElement('span', { className: 'dsvz-stat-ok' }, `✓ ${fmtNum(c.closed)}`),
                c.open > 0 && React.createElement('span', { className: 'dsvz-stat-open' }, `◌ ${fmtNum(c.open)}`),
                c.error > 0 && React.createElement('span', { className: 'dsvz-stat-err' }, `✕ ${fmtNum(c.error)}`),
              ),
            )),
          ),
          s.unclosed && s.unclosed.length > 0 && React.createElement('div', { className: 'dsvz-home-unclosed' },
            React.createElement('div', { className: 'dsvz-home-unclosed-title' }, '◌ 进行中的工作（未闭合）'),
            React.createElement('div', { className: 'dsvz-home-unclosed-list' },
              s.unclosed.map((r, i) => React.createElement('div', { key: i, className: 'dsvz-home-unclosed-item' },
                React.createElement('span', { className: 'dsvz-ring-dot', style: { background: '#f59e0b' } }),
                React.createElement('span', { className: 'dsvz-home-unclosed-label' }, r.kind === 'tool' ? `工具 ${r.label}` : r.label),
                React.createElement('span', { className: 'dsvz-home-unclosed-sub' }, r.kind === 'turn' ? '本轮尚未结束' : r.kind === 'step' ? '本步尚未结束' : r.kind === 'approval' ? '等待审批结果' : '等待工具返回'),
                r.turn != null && React.createElement('button', { className: 'dsvz-btn dsvz-home-jump', onClick: () => onJump && onJump(r) }, `跳到第 ${r.turn} 轮${r.step != null ? '·' + r.step + ' 步' : ''}`),
              )),
            ),
          ),
          React.createElement('div', { className: 'dsvz-home-rings' },
            (closure.rings || []).map((ring) => React.createElement(TurnRing, { key: ring.id, ring })),
          ),
          React.createElement('div', { className: 'dsvz-home-actions' },
            React.createElement('button', { className: 'dsvz-btn dsvz-home-btn', onClick: onOpenSummary }, '📋 查看执行摘要'),
            React.createElement('button', { className: 'dsvz-btn dsvz-home-btn', onClick: onOpenTree }, '🔬 查看事件树'),
            onOpenMap && React.createElement('button', { className: 'dsvz-btn dsvz-home-btn', onClick: onOpenMap }, '🗺 打开会话图'),
          ),
        ),
      )
    }

    // ===== 第一层：执行摘要 =====
    function SummaryView({ summary, onStory, onTree, onSelectFile, devMode, turns, onPos }) {
      const [openFiles, setOpenFiles] = React.useState(new Set())
      const toggleFile = (i) => setOpenFiles((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
      if (!summary) return React.createElement('div', { className: 'dsvz-empty' }, '加载中…')
      const s = summary
      const toolEntries = Object.entries(s.toolStats || {})
      const maxTool = Math.max(1, ...toolEntries.map(([, v]) => v.count))
      const tok = s.tokens || {}
      // 文件路径：普通用户只看文件名，开发者看完整路径
      const shortPath = (p) => {
        const parts = String(p ?? '').split(/[\\/]/)
        return parts.length > 1 ? parts.slice(-2).join('/') : (p ?? '')
      }
      // 滚动 → 当前 Turn
      const onScroll = (e) => {
        if (!onPos || !turns?.length) return
        const el = e.currentTarget
        const ratio = el.scrollHeight <= el.clientHeight ? 1 : el.scrollTop / (el.scrollHeight - el.clientHeight)
        const total = turns.reduce((a, t) => a + (t.eventCount || 0), 0) || 1
        let acc = 0
        let turn = turns[0].turn
        for (const t of turns) {
          acc += t.eventCount || 0
          if (ratio * total <= acc) { turn = t.turn; break }
        }
        onPos(turn, null)
      }
      return React.createElement('div', { className: 'dsvz-scroll', onScroll },
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
            React.createElement('div', { className: 'dsvz-sec' }, `文件变更（${s.files.length}）`),
            React.createElement('div', { className: 'dsvz-files' },
              s.files.map((f, i) => {
                const open = openFiles.has(i)
                const hasChange = f.content != null || (f.oldString != null && f.newString != null)
                return React.createElement(React.Fragment, { key: i },
                  React.createElement('div', { className: 'dsvz-file' },
                    React.createElement('span', { className: 'act ' + (f.error ? 'e' : f.action === 'created' ? 'c' : 'm') }, f.error ? '失败' : f.action === 'created' ? '✨ 新建' : '✏️ 修改'),
                    React.createElement('span', { className: 'pth', title: devMode ? f.path : shortPath(f.path) }, devMode ? f.path : shortPath(f.path)),
                    f.lines != null && React.createElement('span', { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary,#8493ab)', flexShrink: 0 } }, `${f.lines} 行`),
                    hasChange && React.createElement('span', { className: 'fchg', onClick: () => toggleFile(i) }, open ? '▲ 收起' : '▼ 查看内容'),
                  ),
                  open && React.createElement('div', { className: 'dsvz-filediff' },
                    React.createElement('div', { style: { fontSize: 10.5, color: 'var(--dsw-alias-label-secondary,#8493ab)', marginBottom: 4 } },
                      f.oldString != null ? `修改片段（${String(f.oldString).split('\n').length} 行 → ${String(f.newString).split('\n').length} 行）` : `新增内容（${String(f.content || '').split('\n').length} 行）`),
                    renderFileDiff(f),
                  ),
                )
              }))),
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
            devMode && React.createElement('button', { className: 'dsvz-cta ghost', onClick: onTree }, '🔬 查看技术事件列表'),
          ),
        ))
    }

    // ===== 第二层：执行故事线 =====
    function StoryView({ story, baseTime, onOpenEvent, devMode, onPos }) {
      if (!story) return React.createElement('div', { className: 'dsvz-empty' }, '加载中…')
      const [openTurns, setOpenTurns] = React.useState(new Set(story.length ? [story[0].turn] : []))
      const [openNodes, setOpenNodes] = React.useState(new Set())
      const toggleTurn = (t) => setOpenTurns((prev) => { const n = new Set(prev); n.has(t) ? n.delete(t) : n.add(t); return n })
      const toggleNode = (key) => setOpenNodes((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
      // 滚动位置 → 当前 Turn 序号（按 story 节点数比例）
      const onScroll = (e) => {
        if (!onPos || !story.length) return
        const el = e.currentTarget
        const ratio = el.scrollHeight <= el.clientHeight ? 1 : el.scrollTop / (el.scrollHeight - el.clientHeight)
        const totalNodes = story.reduce((a, t) => a + t.nodes.length, 0) || 1
        let acc = 0
        let turn = story[0].turn
        for (const t of story) {
          acc += t.nodes.length
          if (ratio * totalNodes <= acc) { turn = t.turn; break }
        }
        onPos(turn, null)
      }
      return React.createElement('div', { className: 'dsvz-scroll', onScroll },
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
                  // 推理/消息正文始终可展开；工具参数（原始 JSON）仅开发者模式展开
                  const detail = n.text || ''
                  const showArgs = devMode && !!n.args
                  return React.createElement('div', { key, className: `dsvz-story-node ${n.kind}${open ? ' open' : ''}` },
                    React.createElement('span', { className: 'nt' }, relTime(n.time, baseTime)),
                    React.createElement('span', { className: 'nh' }, esc(n.human || '')),
                    (n.kind === 'reasoning' || n.kind === 'user' || n.kind === 'assistant') && detail && React.createElement('span', { className: 'arrow', onClick: () => toggleNode(key) }, open ? '▲ 收起' : '▼ 展开'),
                    showArgs && React.createElement('span', { className: 'arrow', onClick: () => toggleNode(key) }, open ? '▲ 收起' : '▼ 参数'),
                    detail && React.createElement('div', { className: 'nd' }, esc(String(detail).slice(0, 2000))),
                    showArgs && open && React.createElement('div', { className: 'nd' }, esc(String(n.args).slice(0, 2000))),
                    n.kind === 'tool' && n.result && React.createElement('div', { className: 'res' + (n.resultError ? ' err' : '') }, n.result),
                    n.kind === 'approval' && n.outcomeHuman && React.createElement('div', { className: 'outc ' + (n.outcome === 'denied' ? 'no' : 'yes') }, n.outcomeHuman),
                  )
                }),
              ))),
        ))
    }

    // ===== 第三层：技术事件树 =====
    // chunk 组展开内容：tool-call 用 JSON 高亮，其余纯文本
    function chunkBody(g, ql) {
      const text = g.text || g.preview || '(无预览)'
      if (g.kind === 'tool-call') {
        // 尝试格式化为 JSON 高亮；失败则原样
        try {
          const parsed = JSON.parse(text)
          return React.createElement('div', { className: 'dsvz-grpbody', dangerouslySetInnerHTML: { __html: jsonHighlight(parsed) } })
        } catch { /* fallthrough */ }
      }
      return React.createElement('div', { className: 'dsvz-grpbody' }, highlightQ(esc(text), ql))
    }

    function TreeView({ turns, meta, typeCounts, groups, onSelectEvent, selectedLine, onPosChange, jumpSignal, onFocusStep, onClearEvent }) {
      const [openTurns, setOpenTurns] = React.useState(new Set(turns?.length ? [turns[0].turn] : []))
      const [openSteps, setOpenSteps] = React.useState(new Set())
      const [openGroups, setOpenGroups] = React.useState(new Set())
      const [typeFilter, setTypeFilter] = React.useState('')
      const [search, setSearch] = React.useState('')
      const baseTime = meta?.startTime ?? null

      // 首次进入默认展开第一个 turn 的第一个 step，并聚焦该 step
      React.useEffect(() => {
        if (!turns?.length) return
        const t0 = turns[0]
        if (t0.steps?.length) {
          const s0 = t0.steps[0]
          setOpenSteps((prev) => { const n = new Set(prev); n.add(`${t0.turn}-${s0.step}`); return n })
          onFocusStep && onFocusStep(s0)
        }
      }, [turns])

      // 外部跳转信号（全局进度条点击 / 首页环点击）→ 展开目标 Turn/Step 并滚动
      React.useEffect(() => {
        if (!jumpSignal || !turns?.length) return
        const target = jumpSignal.turn
        setOpenTurns((prev) => { const n = new Set(prev); n.add(target); return n })
        if (jumpSignal.step != null) {
          setOpenSteps((prev) => { const n = new Set(prev); n.add(`${target}-${jumpSignal.step}`); return n })
        }
        // 滚动到目标 turn（有 step 则滚动到 step）
        setTimeout(() => {
          const el = jumpSignal.step != null
            ? document.querySelector(`[data-step-head="${target}-${jumpSignal.step}"]`)
            : document.querySelector(`[data-turn-head="${target}"]`)
          if (el) el.scrollIntoView({ block: 'nearest' })
        }, 50)
      }, [jumpSignal, turns])

      // 上报当前 Turn/Step（全局进度条 + 底部链用）
      React.useEffect(() => {
        if (onPosChange && turns?.length) {
          const curTurn = [...openTurns].sort((a, b) => a - b).pop() ?? turns[0].turn
          const curStep = [...openSteps].map((k) => parseInt(k.split('-')[1], 10)).sort((a, b) => a - b).pop() ?? null
          onPosChange(curTurn, curStep)
        }
      }, [openTurns, openSteps, turns, onPosChange])

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
            React.createElement('div', { className: 'dsvz-stephead' + (stepOpen ? ' open' : ''), onClick: () => { toggleStep(stepKey); onFocusStep && onFocusStep(st); onClearEvent && onClearEvent() } },
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
                    React.createElement('span', { className: 'chev', style: { color: 'var(--dsvz-text-3)' } }, '▶'),
                    React.createElement('span', { className: 'gname', style: { color: g.fg } }, g.label),
                    React.createElement('span', { className: 'gmeta' }, `${fmtNum(g.count)} 分片 · ${fmtNum(g.chars)} 字符 · ${fmtDur(g.durationMs)}`),
                  ),
                  gOpen && chunkBody(g, ql),
                )
              })),
          )
        })
        return React.createElement('div', { key: tr.turn, className: 'dsvz-turn' },
          React.createElement('div', { 'data-turn-head': tr.turn, className: 'dsvz-turnhead' + (turnOpen ? ' open' : ''), onClick: () => toggleTurn(tr.turn) },
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
                  React.createElement('span', { className: 'chev', style: { color: 'var(--dsvz-text-3)' } }, '▶'),
                  React.createElement('span', { className: 'gname', style: { color: g.fg } }, g.label),
                  React.createElement('span', { className: 'gmeta' }, `${fmtNum(g.count)} 分片 · ${fmtNum(g.chars)} 字符 · ${fmtDur(g.durationMs)}`),
                ),
                gOpen && chunkBody(g, ql),
              )
            }),
          ),
        )
      })

      // 当前 Turn/Step（供 TurnStepChain 高亮）
      const curTurnNum = openTurns.size ? Math.max(...openTurns) : (turns[0]?.turn ?? null)
      const curStepNum = openSteps.size
        ? Math.max(...[...openSteps].map((k) => parseInt(k.split('-')[1], 10)))
        : null
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
          React.createElement(TurnStepChain, {
            turns, currentTurn: curTurnNum, currentStep: curStepNum,
            onSeekTurn: (t) => { setOpenTurns((prev) => { const n = new Set(prev); n.add(t); return n }) },
          }),
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
      const [mode, setMode] = React.useState('home')
      const [, setTick] = React.useState(0)
      const [meta, setMeta] = React.useState(null)
      const [summary, setSummary] = React.useState(null)
      const [story, setStory] = React.useState(null)
      const [tree, setTree] = React.useState(null)
      const [closure, setClosure] = React.useState(null)
      const [typeCounts, setTypeCounts] = React.useState(null)
      const [err, setErr] = React.useState(null)
      const [loading, setLoading] = React.useState(false)
      const [loadStage, setLoadStage] = React.useState(null) // 加载阶段：meta/summary/story/tree
      const [selected, setSelected] = React.useState(null) // {ev, raw}
      const [selectedLine, setSelectedLine] = React.useState(null)
      const [currentTurn, setCurrentTurn] = React.useState(null)
      const [currentStep, setCurrentStep] = React.useState(null)
      const [jumpSignal, setJumpSignal] = React.useState(null) // {turn, ts}
      const [focusedStep, setFocusedStep] = React.useState(null) // 详情面板单步进度
      const [maximized, setMaximized] = React.useState(false)

      const loadSession = React.useCallback(async (sid) => {
        if (!sid) return
        setLoading(true); setErr(null)
        setSummary(null); setStory(null); setTree(null); setClosure(null); setSelected(null); setSelectedLine(null)
        try {
          // 分阶段加载 → 展示加载进度
          setLoadStage('meta')
          const metaRes = await fetch(`/dsh-session-viz/api/tree?sessionId=${encodeURIComponent(sid)}`).then((r) => r.json())
          setTree(metaRes.turns); setMeta(metaRes.meta); setTypeCounts(metaRes.typeCounts); setClosure(metaRes.closure ?? null)
          setLoadStage('summary')
          const s = await apiSummary(sid)
          setSummary(s.summary)
          setLoadStage('story')
          const st = await apiStory(sid)
          setStory(st.story)
          setLoadStage(null)
        } catch (e) { setErr(e.message) } finally { setLoading(false); setLoadStage(null) }
      }, [])

      React.useEffect(() => { loadSession(sessionId) }, [sessionId, loadSession])
      React.useEffect(() => { apiSessions().then((d) => setSessions(d.sessions)).catch(() => {}) }, [])

      const selectEvent = React.useCallback(async (ev) => {
        setSelectedLine(ev.line)
        setSelected({ ev, raw: null })
        setFocusedStep(null) // 点击事件 → 清除 step 进度，显示事件详情
        try {
          const d = await apiLine(sessionId, ev.line)
          setSelected((prev) => prev && prev.ev.line === ev.line ? { ev: d.event, raw: d.raw } : prev)
        } catch { /* keep summary */ }
      }, [sessionId])

      const modeTab = (id, label) =>
        React.createElement('button', { key: id, className: 'dsvz-mode' + (mode === id ? ' active' : ''), onClick: () => setMode(id) }, label)

      // 开发者模式开关（模块级持久化：切会话/重开查看器后保持）
      const toggleDev = () => {
        devMode = !devMode
        setTick((n) => n + 1)
        if (!devMode) setMode('summary')
      }

      // 全局进度条点击 → 跳到对应 Turn（事件树视图并展开）；非开发者模式仅展示不跳转
      const handleSeek = (ratio) => {
        if (!devMode || !tree?.length) return
        let acc = 0
        let target = tree[0].turn
        const total = tree.reduce((a, t) => a + (t.eventCount || 0), 0) || 1
        for (const t of tree) {
          acc += t.eventCount || 0
          if (ratio * total <= acc) { target = t.turn; break }
        }
        setMode('tree')
        setJumpSignal({ turn: target, ts: Date.now() })
      }

      return React.createElement('div', { className: 'dsvz-ov', onMouseDown: (e) => { if (e.target === e.currentTarget) onClose() } },
        React.createElement('div', { className: 'dsvz-box' + (maximized ? ' dsvz-max' : '') },
          React.createElement('div', { className: 'dsvz-head' },
            React.createElement('div', { className: 'dsvz-brand' },
              React.createElement('span', { className: 'dsvz-brand-icon' }, '◈'),
              React.createElement('div', { className: 'dsvz-brand-text' },
                React.createElement('span', { className: 'dsvz-brand-name' }, 'AgentTrace'),
                React.createElement('span', { className: 'dsvz-brand-sub' }, '智能体轨迹'),
              ),
            ),
            React.createElement('span', { className: 'dsvz-pill dsvz-title-pill', title: meta?.title ?? sessionId }, meta?.title ?? '未命名会话'),
            React.createElement('span', { className: 'dsvz-spacer' }),
            React.createElement('div', { className: 'dsvz-ops' },
              devMode && React.createElement('span', { className: 'dsvz-pill', title: meta?.cwd ?? '' }, shortPath(meta?.cwd ?? '')),
              React.createElement('span', { className: 'dsvz-pill' }, loading && !summary ? '解析中…' : `${fmtNum(summary?.eventCount ?? 0)} 条事件`),
              React.createElement('select', { value: sessionId, onChange: (e) => setSessionId(e.target.value), title: '切换会话' },
                sessions.map((s) => React.createElement('option', { key: s.id, value: s.id }, s.title ?? '未命名会话'))),
              React.createElement('button', {
                className: 'dsvz-btn' + (devMode ? ' devon' : ''),
                onClick: toggleDev,
                title: devMode ? '关闭开发者模式（隐藏原始日志/内部字段）' : '开启开发者模式（显示原始 JSON、事件类型、内部 ID）',
              }, devMode ? '🛠 开发者模式' : '🛠 开发者'),
              React.createElement('button', { className: 'dsvz-btn', onClick: () => loadSession(sessionId), disabled: loading }, '↻ 刷新'),
              React.createElement('button', {
                className: 'dsvz-btn',
                onClick: () => setMaximized((v) => !v),
                title: maximized ? '还原窗口大小' : '最大化窗口',
              }, maximized ? '🗗 还原' : '⛶ 最大化'),
              React.createElement('button', { className: 'dsvz-btn', onClick: onClose }, '✕ 关闭'),
            ),
          ),
          React.createElement('div', { className: 'dsvz-modes' },
            modeTab('home', '🏠 首页'),
            modeTab('summary', '📋 摘要'),
            modeTab('story', '📖 故事线'),
            devMode && modeTab('tree', '🔬 事件树'),
            extraModes.map((em) => modeTab(em.id, em.label)),
          ),
          err && React.createElement('div', { className: 'dsvz-load', style: { color: '#dc2626' } }, `错误：${esc(err)}`),
          loading && !summary && React.createElement(LoadingOverlay, { stage: loadStage }),
          mode === 'home' && React.createElement(HomeView, {
            closure,
            meta,
            turns: tree,
            onJump: (ring) => {
              // 跳到对应 turn（若为 step/tool 则也跳到 step）的事件树
              if (!ring) return
              setMode('tree')
              setJumpSignal({ turn: ring.turn, step: ring.step ?? null, ts: Date.now() })
              if (!devMode) devMode = true
            },
            onOpenSummary: () => setMode('summary'),
            onOpenTree: () => { if (!devMode) devMode = true; setMode('tree') },
            onOpenMap: extraModes.some((em) => em.id === 'map') ? () => setMode('map') : null,
          }),
          extraModes.map((em) => mode === em.id && em.render(sessionId)),
          mode === 'summary' && React.createElement(SummaryView, {
            summary,
            devMode,
            turns: tree,
            onPos: (t) => setCurrentTurn(t),
            onStory: () => setMode('story'),
            onTree: () => setMode('tree'),
          }),
          mode === 'story' && React.createElement(StoryView, {
            story, baseTime: meta?.startTime ?? summary?.startTime, devMode,
            onPos: (t) => setCurrentTurn(t),
          }),
          mode === 'tree' && devMode && React.createElement('div', { className: 'dsvz-tree' },
            React.createElement('div', { className: 'dsvz-left' },
              React.createElement(TreeView, {
                turns: tree, meta, typeCounts, groups, onSelectEvent: selectEvent, selectedLine,
                onPosChange: (t, s) => { setCurrentTurn(t); setCurrentStep(s) },
                jumpSignal,
                onFocusStep: (st) => { setFocusedStep(st); setSelected(null) },
                onClearEvent: () => setSelected(null),
              }),
            ),
            React.createElement('div', { className: 'dsvz-right' },
              selected
                ? React.createElement(DetailView, { ev: selected.ev, raw: selected.raw, groups, devMode })
                : focusedStep
                  ? React.createElement('div', { className: 'dsvz-rcontent' },
                      React.createElement('div', { className: 'dsvz-rtitle' }, '🎯 单步执行进度'),
                      React.createElement(StepProgress, { step: focusedStep, positionRatio: currentTurn != null && tree?.length ? (tree.findIndex((t) => t.turn === currentTurn) + 1) / tree.length : 0 }),
                    )
                  : React.createElement(SessionOverview, { summary, meta, devMode }),
            ),
          ),
          mode === 'tree' && !devMode && React.createElement('div', { className: 'dsvz-empty' }, '事件树为开发者功能，请点击顶栏「🛠 开发者」开启'),
          React.createElement(GlobalProgressBar, { turns: tree, currentTurn, totalEvents: summary?.eventCount, onSeek: handleSeek }),
        ),
      )
    }

    // 右侧默认：会话概览（改动4）
    function SessionOverview({ summary, meta, devMode }) {
      if (!summary) return React.createElement('div', { className: 'dsvz-empty' }, '会话概览将在解析完成后显示')
      const toolEntries = Object.entries(summary.toolStats || {}).slice(0, 8)
      const maxTool = Math.max(1, ...toolEntries.map(([, v]) => v.count))
      const shortPath = (p) => {
        const parts = String(p ?? '').split(/[\\/]/)
        return parts.length > 1 ? parts.slice(-2).join('/') : (p ?? '')
      }
      const rows = [['智能体', summary.model], ['创建时间', meta?.startTime ? fmtTime(meta.startTime) : '—'], ['总耗时', fmtDur(summary.durationMs)]]
      if (devMode) {
        rows.unshift(['工作目录', meta?.cwd ?? summary.title], ['会话 ID', meta?.id ?? '—'])
      } else {
        rows.unshift(['工作目录', shortPath(meta?.cwd) ?? summary.title])
      }
      return React.createElement('div', { className: 'dsvz-rcontent' },
        React.createElement('div', { className: 'dsvz-rtitle' }, '📋 会话概览'),
        React.createElement('table', { className: 'dsvz-kv' },
          rows.map(([k, v], i) => React.createElement('tr', { key: i }, React.createElement('td', null, k), React.createElement('td', null, v))),
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

    // ===== 会话头部按钮 =====
    function ViewerButton({ sessionId, t }) {
      const isOpen = React.useSyncExternalStore(subscribe, getOpen)
      return React.createElement(React.Fragment, null,
        React.createElement('button', {
          type: 'button',
          onClick: () => setOpen(!isOpen, sessionId),
          title: 'AgentTrace：追踪智能体执行轨迹（摘要 / 故事线 / 事件树）',
          className: isOpen ? 'dsvz-header-btn active' : 'dsvz-header-btn',
          style: {
            border: '1px solid var(--dsw-alias-border-l2)',
            minWidth: '104px',
            height: 32,
            color: 'var(--dsw-alias-label-primary)',
            fontFamily: 'var(--dsw-font-family)',
            cursor: 'pointer',
            background: '0 0',
            borderRadius: 18,
            justifyContent: 'center',
            alignItems: 'center',
            gap: 5,
            padding: '6px 13px',
            fontSize: 13,
            fontWeight: 600,
            lineHeight: '20px',
            display: 'inline-flex',
            transition: 'border-color .15s,color .15s,background .15s',
          },
        },
          React.createElement('span', null, '◈ AgentTrace'),
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

export const inject = ['slots']
export { apply, registerExtraMode }
