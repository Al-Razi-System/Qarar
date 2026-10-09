import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: rpc }));
import { GET, PATCH } from "./route";
beforeEach(() => { rpc.mockReset(); });
it("loads the authenticated account without accepting a target user", async () => {
  rpc.mockResolvedValue({ id: "self", full_name_ar: "المستخدم" });
  expect((await GET()).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("get_my_account", {});
});
it("updates only self fields and ignores identity and authority input", async () => {
  rpc.mockResolvedValue({ id: "self", full_name_ar: "الاسم الجديد" });
  const response = await PATCH(new Request("http://localhost/api/account", { method: "PATCH", body: JSON.stringify({ full_name_ar: "الاسم الجديد", mobile: "123", user_id: "other", is_system_admin: true }) }));
  expect(response.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("update_my_profile", { p_full_name_ar: "الاسم الجديد", p_full_name_en: null, p_mobile: "123", p_job_title: null });
});
it("rejects blank names without a mutation", async () => {
  expect((await PATCH(new Request("http://localhost/api/account", { method: "PATCH", body: JSON.stringify({ full_name_ar: " " }) }))).status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});
it("returns safe denial and a trace without raw SQL", async () => {
  rpc.mockRejectedValue(Object.assign(new Error("raw SQL private data"), { status: 403, code: "42501" }));
  const response = await GET();
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ traceId: expect.any(String), message: expect.not.stringContaining("SQL") });
});
