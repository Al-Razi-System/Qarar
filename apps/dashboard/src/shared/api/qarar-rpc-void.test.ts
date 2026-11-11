import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => ({
      value:
        "header." +
        Buffer.from(JSON.stringify({ aal: "aal2" })).toString("base64url") +
        ".signature",
    }),
  })),
}));
import { qararRpc, qararRpcV2, qararTable } from "./qarar-server";
import { metricsSnapshot } from "@/shared/observability/logger";
beforeEach(() => {
  vi.stubEnv("QARAR_SUPABASE_URL", "http://localhost:55421");
  vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("treats a committed void RPC HTTP 204 as success, not a JSON parsing failure", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(null, { status: 204 })),
  );
  await expect(qararRpc("admin_review_iam_change", {})).resolves.toBeNull();
  await expect(qararRpcV2("void_command", {})).resolves.toBeNull();
});
it("does not hide malformed nonempty successful responses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("not JSON", { status: 200 })),
  );
  await expect(qararRpc("read_data", {})).rejects.toThrow();
});
it("measures complete RPC transactions without recording request payloads", async () => {
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({ok:true})));
  await qararRpc("measured_v1_contract",{secret:"must-not-be-a-metric-label"});
  await qararRpcV2("measured_v2_contract",{secret:"must-not-be-a-metric-label"});
  await qararTable("measured_records","private_filter=must-not-be-a-metric-label");
  const durations=metricsSnapshot().durations;
  expect(durations["rpc.v1.measured_v1_contract"]).toMatchObject({count:1});
  expect(durations["rpc.v2.measured_v2_contract"]).toMatchObject({count:1});
  expect(durations["table.measured_records"]).toMatchObject({count:1});
  expect(JSON.stringify(durations)).not.toContain("must-not-be-a-metric-label");
});
