import { afterEach, expect, it, vi } from "vitest";
const { rpc, session } = vi.hoisted(() => ({ rpc: vi.fn(), session: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpcV2: rpc, qararRpc: rpc, requireQararSession: session }));
import { GET, POST } from "./route";
afterEach(() => { vi.clearAllMocks(); vi.unstubAllEnvs(); });
const id = "79000000-0000-0000-0000-000000000011";
it("validates identities before looking up available types", async () => {
  expect((await GET(new Request("http://localhost/api/admin/typed-topics?unitId=bad"))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("uses explicit typed submission and returns conflict trace", async () => {
  rpc.mockResolvedValue({ ok: false, error_code: "MODEL_VERSION_CONFLICT", message_ar: "تعارض الطلب.", trace_id: "trace" });
  const response = await POST(new Request("http://localhost/api/admin/typed-topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "عنوان الموضوع", description: "وصف الموضوع الكامل", versionId: id, unitId: id, requestId: id }) }));
  expect(response.status).toBe(409);
  expect((await response.json()).error.traceId).toBe("trace");
  expect(rpc).toHaveBeenCalledWith("create_topic_from_type_v2", expect.objectContaining({ p_topic_type_version_id: id, p_client_request_id: id }));
});
it("does not accept cross-origin mutations", async () => {
  vi.stubEnv("APP_ORIGIN", "https://devqarar.prideidea.com");
  const response = await POST(new Request("http://localhost/api/admin/typed-topics", { method: "POST", headers: { Origin: "https://attacker.example", "Content-Type": "application/json" }, body: "{}" }));
  expect(response.status).toBe(403); expect(rpc).not.toHaveBeenCalled();
});
