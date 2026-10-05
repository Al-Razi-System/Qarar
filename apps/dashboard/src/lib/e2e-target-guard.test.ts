import { describe, expect, it } from "vitest";
import { assertIsolatedE2ETarget } from "./e2e-target-guard";

const safe = {
  QARAR_E2E_ALLOW_DATABASE_MUTATION: "isolated-local-only",
  SUPABASE_PUBLIC_URL: "http://127.0.0.1:64321",
  QARAR_E2E_DATABASE_CONTAINER: "qarar-e2e-supabase-db",
  QARAR_E2E_DATABASE_NAME: "qarar_dashboard_e2e",
};

describe("assertIsolatedE2ETarget", () => {
  it("accepts an explicitly authorized isolated local target", () => {
    expect(assertIsolatedE2ETarget(safe)).toEqual({
      container: "qarar-e2e-supabase-db",
      database: "qarar_dashboard_e2e",
    });
  });

  it.each([
    [{ ...safe, QARAR_E2E_ALLOW_DATABASE_MUTATION: undefined }],
    [{ ...safe, SUPABASE_PUBLIC_URL: "https://qarar.prideidea.com" }],
    [{ ...safe, QARAR_E2E_DATABASE_CONTAINER: "qarar-supabase-db" }],
    [{ ...safe, QARAR_E2E_DATABASE_NAME: "postgres" }],
  ])("rejects a target that can overlap production", (candidate) => {
    expect(() => assertIsolatedE2ETarget(candidate)).toThrow(/أوقِف اختبار E2E/);
  });
});
