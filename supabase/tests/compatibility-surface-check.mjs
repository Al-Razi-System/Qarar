import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../functions/", import.meta.url))
const allowed = new Set(["generate-minutes/index.ts"])
const dependencies = []

async function walk(path, relative = "") {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const childRelative = join(relative, entry.name).replaceAll("\\", "/")
    const child = join(path, entry.name)
    if (entry.isDirectory()) await walk(child, childRelative)
    else if (entry.name.endsWith(".ts") && (await readFile(child, "utf8")).includes(".from(")) {
      dependencies.push(childRelative)
    }
  }
}

await walk(root)
assert.deepEqual(dependencies.sort(), [...allowed].sort(),
  "new Edge table/view dependencies require registry, owner, deadline, and reviewed replacement")
console.log("ok - compatibility consumers match the reviewed allowlist")
