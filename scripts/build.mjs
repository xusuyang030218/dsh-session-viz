/**
 * dsh-session-viz build：零编译打包校验脚本。
 * 插件是手写 ESM/CJS（与 dsh-code-workbench 同模型），无需转译，
 * 本脚本只校验产物齐全，供 dsh-dev-sandbox build / CI 使用。
 */
import { existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const required = [
  "lib/host/index.mjs",
  "lib/host/web.mjs",
  "lib/host/parser.mjs",
  "lib/client.js",
  "cordis.patch.yml",
  "package.json",
]
const missing = required.filter((f) => !existsSync(join(root, f)))
if (missing.length) {
  console.error(`build: missing ${missing.join(", ")}`)
  process.exit(1)
}
console.log("build: dsh-session-viz OK (no transform needed, plain ESM/CJS)")
