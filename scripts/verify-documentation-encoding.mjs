import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const roots = ["docs", "supabase/docs", ".github"]
const files = []
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) await walk(full)
    else if (/\.(md|yml|yaml)$/i.test(entry.name)) files.push(full)
  }
}
for (const root of roots) await walk(root)
const failures = []
for (const file of files) {
  const bytes = await readFile(file)
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  if (text.includes("\uFFFD")) failures.push(`${file}: replacement character detected`)
}
if (failures.length) { console.error(failures.join("\n")); process.exit(1) }
console.log(`Documentation encoding OK (${files.length} files, UTF-8).`)
