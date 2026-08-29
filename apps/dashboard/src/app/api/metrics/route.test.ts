import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

function metricsRequest(token?: string) {
  return new Request("http://localhost/api/metrics", {
    headers: token ? { "x-internal-metrics-token": token } : undefined,
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/metrics", () => {
  it("يفشل مغلقًا عندما لا يضبط سر metrics في الإنتاج", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("METRICS_TOKEN", "");

    const response = await GET(metricsRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("يرفض رمز metrics غير المطابق", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("METRICS_TOKEN", "a-secure-metrics-token");

    const response = await GET(metricsRequest("wrong-token"));

    expect(response.status).toBe(403);
    expect(response.headers.get("Vary")).toBe("x-internal-metrics-token");
  });

  it("يسمح للرمز المطابق فقط", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("METRICS_TOKEN", "a-secure-metrics-token");

    const response = await GET(metricsRequest("a-secure-metrics-token"));

    expect(response.status).toBe(200);
  });
});
