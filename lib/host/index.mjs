/**
 * dsh-session-viz 主 host 半。
 *
 * 定位：随 harness 加载的轻量行——声明包存在并把 sessions 根路径
 * 提供给 web 半；解析/路由逻辑全部在 ./parser.mjs 与 ./web.mjs。
 */
export const name = "dsh-session-viz"
export const inject = [] // config 由 loader 自动注入为 apply 第二参

export function apply(ctx, config) {
  // 把配置里的 sessionsPath 注册为上下文服务，供 web 半复用
  ctx.provide("sessionViz", {
    sessionsPath: config.sessionsPath ?? null,
  })
}
