/**
 * tsdown 构建配置。
 *
 * host 半（Node ESM，outDir lib/host）：
 *   lib/host/index.mjs    主 host 半
 *   lib/host/web.mjs      AgentTrace 数据路由半（/dsh-session-viz/api/*）
 *   lib/host/map-web.mjs  会话图快照路由半（/dsh-session-viz/api/map/*）
 *
 * client 半（Browser CJS，outDir lib）：
 *   lib/client.js  AgentTrace 三层查看器 + 3D 会话图，单一 bundle
 *
 * client 半原为零构建手写 JS；融合 dsh-seelog 的会话图（TSX + Three.js）后改为
 * tsdown 构建：手写查看器保留在 src/client/legacy-viewer.js 原样参与打包，
 * Three.js 内联进产物，平台运行时（react / @deepseek-ai/*）保持 external。
 * 外层 window.__ModuleLoader__.load 包装由 banner/intro/footer 注入。
 *
 * 注意：lib/ 下同时存放 Python 版查看器的 *.py，两个配置都必须 clean: false，
 * 否则会被构建清理掉。
 */
import { defineConfig } from "tsdown"

/** 由 DSH 运行时注入、不可打包的模块。 */
const platform = [
  "react",
  "react-dom",
  "react/jsx-runtime",
  "@deepseek-ai/cordis",
  "@deepseek-ai/dsh-session",
  "@deepseek-ai/dsh-session-query",
  "@deepseek-ai/dsh-host-webserver",
  "@deepseek-ai/schemastery",
  "@deepseek-ai/dsh-client-locale/client",
  "@deepseek-ai/dsh-client-runtime/client",
  "@deepseek-ai/dsh-client-ui-conversation/client",
  "@deepseek-ai/dsh-client-ui-slots",
]

export default defineConfig([
  {
    entry: {
      index: "src/host/index.ts",
      web: "src/host/web.ts",
      "map-web": "src/host/map-web.ts",
    },
    outDir: "lib/host",
    format: ["esm"],
    platform: "node",
    external: [/^@deepseek-ai\//, /^node:/],
    sourcemap: false,
    clean: false,
    dts: false,
  },
  {
    entry: { client: "src/client/index.ts" },
    outDir: "lib",
    format: "cjs",
    platform: "browser",
    external: platform,
    noExternal: (id: string) => (platform.includes(id) ? undefined : true),
    sourcemap: false,
    clean: false,
    dts: false,
    outputOptions: {
      entryFileNames: "client.js",
      banner: 'window.__ModuleLoader__.load({ id: "dsh-session-viz", factory: (require) => {',
      footer: "return module.exports; } });",
      intro: "var module = { exports: {} }; var exports = module.exports;",
    },
  },
])
