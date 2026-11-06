import { readFileSync } from "node:fs";
import path from "node:path";
import { assertIsolatedE2ETarget } from "./e2e-target-guard";

// Fixtures and Next must read the same explicit file, never a developer's .env.
export function readE2EEnvironment(env: Record<string, string | undefined> = process.env) {
  if (!env.QARAR_E2E_ENV_FILE) throw new Error("حدد ملف بيئة E2E المعزول صراحة؛ لن يُستخدم إعداد التطوير تلقائيًا.");
  const text = readFileSync(path.resolve(env.QARAR_E2E_ENV_FILE), "utf8");
  const values = Object.fromEntries(text.split(/\r?\n/).filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line)).map((line) => {
    const at = line.indexOf("=");
    return [line.slice(0, at), line.slice(at + 1).replace(/^"|"$/g, "")];
  }));
  const target = assertIsolatedE2ETarget(values);
  if (values.SUPABASE_PUBLIC_URL !== "http://127.0.0.1:64321" || values.POSTGRES_DB !== target.database || target.database !== "qarar_e2e" || target.container !== "qarar-e2e-db") {
    throw new Error("أوقِف اختبار E2E: ملف الإعداد لا يطابق حزمة CI المعزولة؛ لا تستخدم منفذ التطوير أو الإنتاج.");
  }
  return values;
}
