import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); });

it.each(["development", "production"])("uses non-storable responses only in %s development", async (mode) => {
  vi.stubEnv("NODE_ENV", mode);
  vi.resetModules();
  const { default: config } = await import("../../../next.config");
  const rules = await config.headers!();
  const headers = rules.flatMap((rule) => rule.headers);
  const cache = headers.find((header) => header.key === "Cache-Control");
  if (mode === "development") expect(cache?.value).toBe("no-store, max-age=0");
  else expect(cache).toBeUndefined();
});
