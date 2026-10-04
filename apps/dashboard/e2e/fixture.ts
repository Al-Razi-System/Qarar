import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const fixturePath = path.resolve(process.cwd(), ".playwright-regulations-fixture.json");

export async function dockerEnv() {
  const dockerDirectory = path.resolve(process.cwd(), "../../supabase/docker");
  let text: string | null = null;
  for (const name of [".env", ".env.example"]) {
    try {
      text = await readFile(path.join(dockerDirectory, name), "utf8");
      break;
    } catch {}
  }
  if (text === null) throw new Error("لا يوجد إعداد Supabase محلي لتشغيل اختبارات المتصفح.");
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
