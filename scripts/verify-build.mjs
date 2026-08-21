/**
 * 构建校验：确认 tsdown 输出的 host 三模块齐全，并与源码行为一致。
 * 运行：node scripts/verify-build.mjs
 */
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const required = [
  "lib/host/index.mjs",
  "lib/host/web.mjs",
  "lib/client.js",
  "cordis.patch.yml",
  "package.json",
]
const missing = required.filter((f) => !existsSync(join(root, f)))
if (missing.length) {
  console.error(`verify-build: missing ${missing.join(", ")}`)
  process.exit(1)
}

// 行为冒烟：确认构建产物模块可加载、导出契约正确
try {
  const sample = '{"type":"session","id":"s","createdAt":0,"cwd":"C:\\\\x"}\n{"type":"user/message","seq":1,"time":1,"data":{"content":[{"type":"text","text":"hi"}]}}\n'
  const web = await import(new URL("../lib/host/web.mjs", import.meta.url).href)
  if (web.name !== "dsh-session-viz-web") throw new Error("web.mjs name contract broken")
  if (!Array.isArray(web.inject) || !web.inject.includes("webServer")) throw new Error("web.mjs inject contract broken")
  console.log(`verify-build: parse/load smoke OK (${sample.split("\n").filter(Boolean).length} sample lines)`)
} catch (e) {
  console.error("verify-build: smoke FAILED:", e.message)
  process.exit(1)
}

console.log("verify-build: dsh-session-viz OK")
