//#region src/host/index.ts
/**
* dsh-session-viz 主 host 半（TypeScript 版）。
*
* 定位：随 harness 加载的轻量行——声明包存在并把 sessions 根路径提供给 web 半。
*/
const name = "dsh-session-viz";
const inject = [];
function apply(ctx, config) {
	ctx.provide("sessionViz", { sessionsPath: config.sessionsPath ?? null });
}
//#endregion
export { apply, inject, name };
