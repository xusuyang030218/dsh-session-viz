/**
 * 构建校验：确认 tsdown 输出的 host 三模块 + client bundle 齐全，并与源码契约一致。
 * 运行：node scripts/verify-build.mjs
 */
import { existsSync, readFileSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const required = [
  "lib/host/index.mjs",
  "lib/host/web.mjs",
  "lib/host/map-web.mjs",
  "lib/client.js",
  "cordis.patch.yml",
  "package.json",
]
const missing = required.filter((f) => !existsSync(join(root, f)))
if (missing.length) {
  console.error(`verify-build: missing ${missing.join(", ")}`)
  process.exit(1)
}

// lib/ 下还住着 Python 版查看器，构建绝不能把它们清理掉
const pythonKept = ["lib/parser.py", "lib/models.py", "lib/decompressor.py", "lib/__init__.py"]
const wiped = pythonKept.filter((f) => !existsSync(join(root, f)))
if (wiped.length) {
  console.error(`verify-build: 构建清理掉了 Python 产物 ${wiped.join(", ")}（tsdown clean 必须为 false）`)
  process.exit(1)
}

// 行为冒烟：确认 host 构建产物可加载、导出契约正确
try {
  const web = await import(new URL("../lib/host/web.mjs", import.meta.url).href)
  if (web.name !== "dsh-session-viz-web") throw new Error("web.mjs name contract broken")
  if (!Array.isArray(web.inject) || !web.inject.includes("webServer")) throw new Error("web.mjs inject contract broken")

  // map-web.mjs 在模块顶层 import 了由 harness 注入的 @deepseek-ai/schemastery 与
  // dsh-session（值导入），独立 node 进程无法解析，因此改为静态契约校验。
  const mapSrc = readFileSync(join(root, "lib/host/map-web.mjs"), "utf8")
  const mapChecks = [
    ['const name = "dsh-session-viz-map-web"', "map-web name 契约"],
    ['"webServer"', "map-web 需要 webServer"],
    ['"sessionQuery"', "map-web 需要 sessionQuery"],
    ["export { Config, apply, inject, name }", "map-web 导出契约"],
    ["/dsh-session-viz/api/map/snapshot", "会话图快照路由"],
    ["/dsh-session-viz/api/map/event", "会话图事件路由"],
    ["maxSessions", "map-web 配置契约缺失"],
  ]

  // web.mjs 内含闭环模型：/api/tree 响应须携带 closure 字段
  const webSrc = readFileSync(join(root, "lib/host/web.mjs"), "utf8")
  const webChecks = [
    ["closure", "web.mjs /api/tree 缺少 closure 字段"],
  ]
  for (const [needle, message] of webChecks) {
    if (!webSrc.includes(needle)) throw new Error(`${message}（未找到 ${needle}）`)
  }
  for (const [needle, message] of mapChecks) {
    if (!mapSrc.includes(needle)) throw new Error(`${message} 不满足（未找到 ${needle}）`)
  }
  console.log("verify-build: host 契约 OK (web 动态加载 + map-web 静态校验)")
} catch (e) {
  console.error("verify-build: host smoke FAILED:", e.message)
  process.exit(1)
}

// client bundle：必须带 loader 包装，且两个视图的关键标识都在
try {
  const client = readFileSync(join(root, "lib/client.js"), "utf8")
  const checks = [
    ['window.__ModuleLoader__.load', "loader banner 缺失"],
    ['id: "dsh-session-viz"', "loader id 不是 dsh-session-viz"],
    ["return module.exports", "loader footer 缺失"],
    ["conversation.session.header.utilities", "AgentTrace 头部按钮注册缺失"],
    ["registerExtraMode", "会话图模式注册入口缺失"],
    ["会话图", "会话图模式标签缺失"],
    ["extraModes.map", "额外模式渲染循环缺失"],
    ["dsh-session-viz/api/map/snapshot", "会话图快照请求路径缺失"],
    ["dsvz-home", "首页闭环总览视图缺失"],
  ]
  for (const [needle, message] of checks) {
    if (!client.includes(needle)) throw new Error(`${message}（未找到 ${needle}）`)
  }
  const kb = Math.round(client.length / 1024)
  console.log(`verify-build: client bundle OK (${kb} KB，含 Three.js 会话图)`)
} catch (e) {
  console.error("verify-build: client smoke FAILED:", e.message)
  process.exit(1)
}

console.log("verify-build: dsh-session-viz OK")
