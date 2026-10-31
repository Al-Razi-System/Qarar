import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { readE2EEnvironment } from "./e2e-environment";
const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true }); });
describe("explicit E2E environment", () => {
  it("does not fall back to a developer environment", () => {
    expect(() => readE2EEnvironment({})).toThrow(/صراحة/);
    expect(() => readE2EEnvironment({ QARAR_E2E_ENV_FILE: "/missing-e2e-env" })).toThrow();
  });
  it("uses the isolated file for fixtures and server, ignoring ambient credentials", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "qarar-e2e-env-test-")); directories.push(directory);
    const file = path.join(directory, ".env.e2e");
    const text = "QARAR_E2E_ALLOW_DATABASE_MUTATION=isolated-local-only\nSUPABASE_PUBLIC_URL=http://127.0.0.1:64321\nQARAR_E2E_DATABASE_CONTAINER=qarar-e2e-db\nQARAR_E2E_DATABASE_NAME=qarar_e2e\nPOSTGRES_DB=qarar_e2e\nSERVICE_ROLE_KEY=test-only\n";
    writeFileSync(file, text);
    expect(readE2EEnvironment({ QARAR_E2E_ENV_FILE: file, SUPABASE_PUBLIC_URL: "https://devqarar.prideidea.com" }).SERVICE_ROLE_KEY).toBe("test-only");
    writeFileSync(file, text.replace("http://127.0.0.1:64321", "https://qarar.prideidea.com"));
    expect(() => readE2EEnvironment({ QARAR_E2E_ENV_FILE: file })).toThrow(/أوقِف/);
    writeFileSync(file, text.replace(":64321", ":55421"));
    expect(() => readE2EEnvironment({ QARAR_E2E_ENV_FILE: file })).toThrow(/أوقِف/);
    writeFileSync(file, text.replace("POSTGRES_DB=qarar_e2e", "POSTGRES_DB=postgres"));
    expect(() => readE2EEnvironment({ QARAR_E2E_ENV_FILE: file })).toThrow(/أوقِف/);
  });
});
