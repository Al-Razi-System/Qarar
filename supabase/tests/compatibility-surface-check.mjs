import assert from "node:assert/strict"
import { readdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("../functions/", import.meta.url))
// Edge Functions must use governed api_v1 contracts rather than compatibility tables/views.
const allowed = new Set([])
const dependencies = []

async function walk(path, relative = "") {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const childRelative = join(relative, entry.name).replaceAll("\\", "/")
    const child = join(path, entry.name)
    if (entry.isDirectory()) await walk(child, childRelative)
    else if (entry.name.endsWith(".ts")) {
      const source = await readFile(child, "utf8")
      // Supabase table access uses `.from("relation")`; do not mistake
      // standard helpers such as Array.from(...) for database dependencies.
      if (/\.from\s*\(\s*["'`]/.test(source)) dependencies.push(childRelative)
    }
  }
}

await walk(root)
assert.deepEqual(dependencies.sort(), [...allowed].sort(),
  "new Edge table/view dependencies require registry, owner, deadline, and reviewed replacement")
console.log("ok - compatibility consumers match the reviewed allowlist")
