import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const fixturePath = path.resolve(process.cwd(), ".playwright-regulations-fixture.json");

export async function dockerEnv() {
  const text = await readFile(path.resolve(process.cwd(), "../supabase/docker/.env"), "utf8");
  return Object.fromEntries(text.split(/\r?\n/).filter((line) =>
    line && !line.startsWith("#") && line.includes("=")
  ).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, "")];
  }));
}

export async function saveFixture(value: unknown) {
  await writeFile(fixturePath, JSON.stringify(value), "utf8");
}
