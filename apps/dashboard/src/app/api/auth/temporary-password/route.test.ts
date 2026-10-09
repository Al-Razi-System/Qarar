import { beforeEach, afterEach, expect, it, vi } from "vitest";
const { rpc, cookieDelete, getCookie } = vi.hoisted(() => ({ rpc: vi.fn(), cookieDelete: vi.fn(), getCookie: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: getCookie, delete: cookieDelete }) }));
vi.mock("@/shared/api/qarar-service", () => ({ qararServiceRpc: rpc }));
vi.mock("@/shared/security/request-guards", () => ({ rejectUntrustedMutation: () => null }));
vi.mock("@/shared/security/login-rate-limit", () => ({ getLoginRateLimitConfig: () => null, isProductionEnvironment: () => false }));
import { POST } from "./route";
const request = (body = { currentPassword: "TemporaryPassword42!", password: "NewPersonalPassword42!" }) => new Request("https://app.test/api/auth/temporary-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.stubEnv("QARAR_SUPABASE_URL", "http://kong:8000"); vi.stubEnv("QARAR_SUPABASE_ANON_KEY", "anon");
  getCookie.mockReturnValue({ value: "temporary-token" });
  rpc.mockImplementation(async (name: string) => name === "service_get_temporary_password_state" ? { must_change_password: true, expires_at: "2099-01-01" } : name === "service_finish_temporary_password" ? { completed: true } : { claimed: true });
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (input: string, init?: RequestInit) => new Response(JSON.stringify(String(input).includes("/token?") ? { user: { id: "user-id" }, access_token: "reauth-token" } : init?.method === "PUT" ? { id: "user-id" } : { id: "user-id", email: "temp@example.test" }), { status: 200 })));
});
afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("claims, changes and completes for the cookie identity, then clears cookies", async () => {
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ changed: true });
  expect(rpc.mock.calls.map(call => call[0])).toEqual(["service_get_temporary_password_state", "service_claim_temporary_password", "service_finish_temporary_password"]);
  expect(rpc).toHaveBeenCalledWith("service_finish_temporary_password", expect.objectContaining({ p_user_id: "user-id" }));
  expect(cookieDelete).toHaveBeenCalledWith("qarar_temporary_access_token");
});
it("rejects missing temporary cookie before Auth or service calls", async () => {
  getCookie.mockReturnValue(undefined);
  expect((await POST(request())).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
});
it("rejects unchanged plaintext before claiming or updating", async () => {
  expect((await POST(request({ currentPassword: "TemporaryPassword42!", password: "TemporaryPassword42!" }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("rejects wrong current password without a claim", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "user-id", email: "temp@example.test" }))).mockResolvedValueOnce(new Response("{}", { status: 400 })));
  expect((await POST(request())).status).toBe(400);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("blocks expired or already completed accounts before updates", async () => {
  rpc.mockResolvedValue({ must_change_password: false });
  expect((await POST(request())).status).toBe(403);
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("shows a concurrent claim as conflict and never sends PUT", async () => {
  rpc.mockImplementation(async (name: string) => { if (name === "service_claim_temporary_password") throw Object.assign(new Error("conflict"), { code: "40001" }); return { must_change_password: true, expires_at: "2099-01-01" }; });
  expect((await POST(request())).status).toBe(409);
  expect(vi.mocked(fetch).mock.calls.some(call => call[1]?.method === "PUT")).toBe(false);
});
it("keeps the account blocked and releases its own claim after uncertain update", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_input: string, init?: RequestInit) => {
    if (init?.method === "PUT") throw new Error("network");
    return new Response(JSON.stringify(init?.method === "POST" ? { user: { id: "user-id" }, access_token: "reauth-token" } : { id: "user-id", email: "temp@example.test" }));
  }));
  const response = await POST(request());
  expect(response.status).toBe(503); expect(await response.json()).toMatchObject({ uncertain: true });
  expect(rpc).not.toHaveBeenCalledWith("service_finish_temporary_password", expect.anything());
  expect(rpc).toHaveBeenCalledWith("service_release_temporary_password", expect.objectContaining({ p_user_id: "user-id" }));
});
it("does not make an Auth server failure blindly retryable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_input: string, init?: RequestInit) => new Response(JSON.stringify(init?.method === "POST" ? { user: { id: "user-id" }, access_token: "reauth-token" } : { id: "user-id", email: "temp@example.test" }), { status: init?.method === "PUT" ? 503 : 200 })));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ uncertain: true });
  expect(rpc).not.toHaveBeenCalledWith("service_finish_temporary_password", expect.anything());
});
