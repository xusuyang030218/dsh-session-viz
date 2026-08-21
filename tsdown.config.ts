/**
 * tsdown 构建配置：host 三个产物（Node ESM）。
 *   lib/host/index.mjs  主 host 半
 *   lib/host/web.mjs    web 数据路由半
 *   lib/host/parser.mjs 解析器（narrative 的依赖，随 web 打包内联）
 *
 * client 半保持零构建手写 JS（lib/client.js），因为它依赖 DSH 平台运行时
 * （react + window.__ModuleLoader__ 契约），且需与 host 共享修复保持一致。
 */
import { defineConfig } from "tsdown"

export default defineConfig([
  {
    entry: { index: "src/host/index.ts", web: "src/host/web.ts" },
    outDir: "lib/host",
    format: ["esm"],
    platform: "node",
    external: [/^@deepseek-ai\//, /^node:/],
    sourcemap: false,
    dts: false,
  },
])
