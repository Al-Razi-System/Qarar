import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpcV2: rpc }));
import { GET, PUT, PATCH } from "./route";
const userId = "83000000-0000-0000-0000-000000000003";
const context = { params: Promise.resolve({ userId }) };
beforeEach(() => { rpc.mockReset(); });
it("loads only the requested user via the contextual RPC", async () => {
  rpc.mockResolvedValue({ revision: 0, rules: [] });
  expect((await GET(new Request("http://localhost/api"), context)).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("get_user_submission_scope_v2", { p_user_id: userId });
});
it("preserves version and replay contract", async () => {
  rpc.mockResolvedValue({ saved: true, revision: 1 });
  const response = await PUT(new Request("http://localhost/api", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: 0, homeUnitId: null, rules: [], requestId: userId }) }), context);
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("save_user_submission_scope_v2", { p_user_id: userId, p_expected_revision: 0, p_home_unit_id: null, p_rules: [], p_request_id: userId });
});
it("returns safe Arabic conflict and trace id", async () => {
  rpc.mockRejectedValue(Object.assign(new Error("تغير نطاق المستخدم"), { code: "40001", status: 409 }));
  const response = await GET(new Request("http://localhost/api"), context);
  expect(response.status).toBe(409);
  const payload = await response.json();
  expect(payload).toMatchObject({ message: "تغير نطاق المستخدم", traceId: expect.any(String) });
});
it("changes the scoped submitter role without overwriting its grants", async () => {
  rpc.mockResolvedValue({saved:true,revision:2,submission_enabled:false});
  const response=await PATCH(new Request("http://localhost/api",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:1,enabled:false,requestId:userId})}),context);
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("set_user_submission_enabled_v2",{p_user_id:userId,p_expected_revision:1,p_enabled:false,p_request_id:userId});
});
it("rejects a truthy string rather than granting a role", async () => {
  const response=await PATCH(new Request("http://localhost/api",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({revision:1,enabled:"false",requestId:userId})}),context);
  expect(response.status).toBe(400);expect(rpc).not.toHaveBeenCalled();
});
