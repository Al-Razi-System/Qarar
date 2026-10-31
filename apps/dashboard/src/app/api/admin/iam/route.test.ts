import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: vi.fn(), qararRpcV2: vi.fn() }));
vi.mock("@/shared/security/request-guards", () => ({
  rejectUntrustedMutation: vi.fn(() => null),
}));
vi.mock("@/shared/observability/logger", () => ({ logEvent: vi.fn() }));
import { qararRpc, qararRpcV2 } from "@/shared/api/qarar-server";
import { POST } from "./route";
const send = (payload: object) =>
  POST(
    new Request("http://localhost/api/admin/iam", {
      method: "POST",
      body: JSON.stringify({ operation: "upsertRole", payload }),
    }),
  );
beforeEach(() => vi.resetAllMocks());
it("uses the direct V2 contract instead of creating an approval request", async () => {
  const payload = {p_role_id: "role-id",p_permission_codes:["meetings.read"],p_expected_permission_codes:[],p_request_id:"request-id",p_reason:null};
  vi.mocked(qararRpcV2).mockResolvedValue({saved:true,role_id:"role-id",permission_codes:["meetings.read"]});
  const response=await POST(new Request("http://localhost/api/admin/iam",{method:"POST",body:JSON.stringify({operation:"saveRolePermissions",payload})}));
  expect(response.status).toBe(200);
  expect(qararRpcV2).toHaveBeenCalledWith("set_role_permissions_direct_v2",payload);
  expect(qararRpc).not.toHaveBeenCalled();
});
it("generates a new role key inside the server without asking the administrator", async () => {
  vi.mocked(qararRpc).mockResolvedValue("role-id");
  expect(
    (
      await send({
        p_name_ar: "منسق الاجتماعات",
        p_role_scope: "governance_unit",
      })
    ).status,
  ).toBe(200);
  expect(qararRpc).toHaveBeenCalledWith(
    "admin_upsert_role",
    expect.objectContaining({
      p_code: expect.stringMatching(/^role_[a-f0-9]{32}$/),
      p_name_ar: "منسق الاجتماعات",
    }),
  );
});
it("rejects a technical key supplied to the administrative role form", async () => {
  expect(
    (await send({ p_code: "system_admin", p_name_ar: "دور" })).status,
  ).toBe(400);
  expect(qararRpc).not.toHaveBeenCalled();
});
it("preserves the stored scope, key, active state and English name when editing", async () => {
  vi.mocked(qararRpc)
    .mockResolvedValueOnce({
      id: "old",
      code: "council_member",
      name_en: "Member",
      role_scope: "governance_unit",
      is_active: false,
    })
    .mockResolvedValueOnce("old");
  expect(
    (
      await send({
        p_role_id: "old",
        p_name_ar: "اسم جديد",
        p_role_scope: "system",
        p_is_active: true,
      })
    ).status,
  ).toBe(200);
  expect(qararRpc).toHaveBeenLastCalledWith(
    "admin_upsert_role",
    expect.objectContaining({
      p_code: "council_member",
      p_name_en: "Member",
      p_role_scope: "governance_unit",
      p_is_active: false,
    }),
  );
});
it("rejects invalid names and scopes before calling a mutation", async () => {
  expect(
    (await send({ p_name_ar: " ", p_role_scope: "governance_unit" })).status,
  ).toBe(400);
  expect(
    (await send({ p_name_ar: "دور", p_role_scope: "system" })).status,
  ).toBe(400);
  expect(qararRpc).not.toHaveBeenCalled();
});
it("returns safe denied Arabic copy and a trace instead of the raw cause", async () => {
  vi.mocked(qararRpc).mockRejectedValue(
    Object.assign(new Error("private database detail"), { code: "42501" }),
  );
  const response = await send({
    p_name_ar: "دور",
    p_role_scope: "governance_unit",
  });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual(
    expect.objectContaining({
      traceId: expect.any(String),
      message: expect.not.stringContaining("database"),
    }),
  );
});
it("reactivates explicitly while preserving all stored role metadata", async () => {
  vi.mocked(qararRpc)
    .mockResolvedValueOnce({
      id: "old",
      code: "council_member",
      name_ar: "عضو المجلس",
      role_scope: "governance_unit",
      is_active: false,
    })
    .mockResolvedValueOnce("old");
  const response = await POST(
    new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        operation: "reactivateRole",
        payload: {
          p_role_id: "old",
          p_code: "attacker",
          p_role_scope: "system",
        },
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect(qararRpc).toHaveBeenLastCalledWith(
    "admin_upsert_role",
    expect.objectContaining({
      p_code: "council_member",
      p_role_scope: "governance_unit",
      p_is_active: true,
    }),
  );
});
