/**
 * dsh-session-viz 浏览器入口 —— 合并两个互补视图：
 *
 *   ▸ AgentTrace 查看器：会话头部「◈ AgentTrace」按钮 + 三层渐进式查看器
 *     （摘要 / 故事线 / 事件树），源码见 ./legacy-viewer.js
 *   ▸ 会话图 Session Map：conversation.view 标签页，Three.js 3D 主执行线 +
 *     子 Agent 分叉 + 时间概览尺 + 节点检查器
 *
 * 会话图部分融合自 lhwu1/dsh-seelog（MIT License），完整许可见仓库根目录
 * LICENSE.dsh-seelog.MIT。本仓库整体以 Apache-2.0 分发。
 *
 * 两个视图各自独立注册、独立可卸载：任一半失败不影响另一半。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import { apply as applyTraceViewer } from './legacy-viewer.js'
import { SessionMapView } from './SessionMapView.tsx'

export { SessionMapView } from './SessionMapView.tsx'

/** 两个视图都只需要 slots 服务。 */
export const inject = ['slots']

/** 注册 AgentTrace 查看器按钮与会话图标签页。 */
export function apply(ctx: ClientContext): void {
  // 1) AgentTrace：会话头部按钮 + 弹出式三层查看器
  applyTraceViewer(ctx)

  // 2) 会话图：独立可卸载的会话视图标签页
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view', id: 'dsh-session-viz-session-map', order: 16,
    label: () => '会话图',
  }, SessionMapView))
}
