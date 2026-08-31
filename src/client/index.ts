/**
 * dsh-session-viz 浏览器入口 —— 一个查看器承载全部视图：
 *
 *   ▸ AgentTrace 查看器：会话头部「◈ AgentTrace」按钮，打开后包含——
 *       🏠 首页（会话过程闭环总览）
 *       📋 摘要 / 📖 故事线 / 🔬 事件树
 *       🗺 会话图（Three.js 3D 主执行线 + 子 Agent 分叉，融合 dsh-seelog）
 *
 * 「会话图」不再占用独立的 conversation.view 标签页，而是作为 AgentTrace
 * 内部的一个模式（见 legacy-viewer.js 的 registerExtraMode）。
 *
 * 会话图部分融合自 lhwu1/dsh-seelog（MIT License），完整许可见仓库根目录
 * LICENSE.dsh-seelog.MIT。本仓库整体以 Apache-2.0 分发。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import React from 'react'
import { apply as applyTraceViewer, registerExtraMode } from './legacy-viewer.js'
import { SessionMapView } from './SessionMapView.tsx'

export { SessionMapView } from './SessionMapView.tsx'

/** 只需要 slots 服务。 */
export const inject = ['slots']

/** 注册 AgentTrace 查看器（会话图作为其内部模式）。 */
export function apply(ctx: ClientContext): void {
  // 把「会话图」注入 AgentTrace 查看器内部（home 首页也可一键打开）
  registerExtraMode({
    id: 'map',
    label: '🗺 会话图',
    render: (sessionId) => React.createElement(SessionMapView, { sessionId }),
  })

  applyTraceViewer(ctx)
}
