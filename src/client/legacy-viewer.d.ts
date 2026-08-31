/**
 * legacy-viewer.js 的类型声明：该文件是零构建手写 JS（1400+ 行 React
 * createElement 代码），保持 JS 形态以避免大规模重写风险，仅在此声明其出口。
 */

import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'

/** AgentTrace 查看器需要的服务。 */
export const inject: readonly string[]

/** 外部注入的一个查看器模式（如「会话图」），render 返回 React 元素。 */
export interface ExtraMode {
  id: string
  label: string
  render(sessionId: string): unknown
}

/** 向 AgentTrace 查看器注册一个额外模式标签页（会话图等）。 */
export function registerExtraMode(mode: ExtraMode): void

/** 在会话头部注册「◈ AgentTrace」按钮，并按需以 portal 打开查看器。 */
export function apply(ctx: ClientContext): void
