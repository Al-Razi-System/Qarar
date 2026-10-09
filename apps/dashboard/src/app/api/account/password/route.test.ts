import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn(), cookies: { get: vi.fn(), delete: vi.fn() }, limiter: vi.fn(), config: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: mocks.rpc, requireQararSession: mocks.session }));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies }));
vi.mock("@/shared/config/qarar-runtime", () => ({ getQararSupabaseRuntimeConfig: () => ({ apiUrl: "http://auth.test", anonKey: "anon" }) }));
vi.mock("@/shared/security/login-rate-limit", () => ({ getLoginRateLimitConfig: mocks.config, enforceLoginRateLimit: mocks.limiter, isProductionEnvironment: () => false }));
import { POST } from "./route";
const fetchMock = vi.fn();
const password = "NewSecurePassword42!";
function request(extra = {}) { return new Request("http://localhost/api/account/password", { method: "POST", body: JSON.stringify({ currentPassword: "old", password, ...extra }) }); }
beforeEach(() => {
  vi.clearAllMocks(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  mocks.session.mockResolvedValue(undefined);
  mocks.rpc.mockResolvedValue({ id: "self", email: "self@example.test" });
  mocks.cookies.get.mockReturnValue({ value: "original-aal2" });
  mocks.config.mockReturnValue({}); mocks.limiter.mockResolvedValue({ state: "allowed", clientIp: "127.0.0.1" });
});
it("rejects weak passwords before authentication", async () => {
  expect((await POST(request({ password: "weak" }))).status).toBe(400);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("rejects wrong current password without updating the user", async () => {
  fetchMock.mockResolvedValue(new Response("{}", { status: 400 }));
  expect((await POST(request())).status).toBe(400);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(mocks.cookies.delete).not.toHaveBeenCalled();
});
it("updates self with the original MFA token, not a client supplied identity", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ user: { id: "self" }, access_token: "reauth-token" })).mockResolvedValueOnce(Response.json({ id: "self" })).mockResolvedValue(new Response(null, { status: 204 }));
  const response = await POST(request({ user_id: "other", email: "other@example.test" }));
  expect(await response.json()).toMatchObject({ changed: true });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "self@example.test", password: "old" });
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "PUT", headers: expect.objectContaining({ Authorization: "Bearer original-aal2" }), body: JSON.stringify({ password }) });
  expect(mocks.cookies.delete).toHaveBeenCalledWith("qarar_access_token");
});
it("denies a different reauthentication identity and closes that session", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ user: { id: "other" }, access_token: "reauth-token" })).mockResolvedValue(new Response(null, { status: 204 }));
  expect((await POST(request())).status).toBe(403);
  expect(fetchMock.mock.calls.some(([, init]) => init.method === "PUT")).toBe(false);
});
it("does not mask a completed password change when global logout fails", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ user: { id: "self" }, access_token: "reauth-token" })).mockResolvedValueOnce(Response.json({ id: "self" })).mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValue(new Response(null, { status: 204 }));
  expect(await (await POST(request())).json()).toMatchObject({ changed: true, sessionsRevoked: false });
});
it("requires an authenticated session and fails closed on rate limiting", async () => {
  mocks.session.mockRejectedValueOnce(new Error("UNAUTHENTICATED"));
  expect((await POST(request())).status).toBe(401);
  mocks.session.mockResolvedValue(undefined); mocks.limiter.mockResolvedValue({ state: "limited", retryAfterSeconds: 60 });
  expect((await POST(request())).status).toBe(429);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("does not bypass MFA for sensitive accounts", async () => {
  mocks.session.mockRejectedValue(new Error("MFA_REQUIRED"));
  expect((await POST(request())).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});
it("reports uncertainty after losing the provider update response", async () => {
  fetchMock.mockResolvedValueOnce(Response.json({ user: { id: "self" }, access_token: "reauth-token" })).mockRejectedValueOnce(new TypeError("network" )).mockResolvedValue(new Response(null, { status: 204 }));
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ uncertain: true, traceId: expect.any(String) });
  expect(mocks.cookies.delete).not.toHaveBeenCalled();
});
