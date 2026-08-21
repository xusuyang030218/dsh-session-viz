/**
 * dsh-session-viz 主 host 半（TypeScript 版）。
 *
 * 定位：随 harness 加载的轻量行——声明包存在并把 sessions 根路径提供给 web 半。
 */

export const name = "dsh-session-viz"
export const inject: string[] = [] // config 由 loader 自动注入为 apply 第二参

interface CordisCtx {
  provide(key: string, value: unknown): unknown
}

export function apply(ctx: CordisCtx, config: { sessionsPath?: string | null }): void {
  ctx.provide("sessionViz", {
    sessionsPath: config.sessionsPath ?? null,
  })
}
