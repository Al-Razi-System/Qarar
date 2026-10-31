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
import { qararRpc, qararRpcV2 } from "./qarar-server";
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
