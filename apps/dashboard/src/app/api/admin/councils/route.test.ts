import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/shared/api/qarar-server", () => ({
  qararRpc: vi.fn(), qararRpcV2: vi.fn(),
  QararApiError: class extends Error {
    constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
  },
}));
vi.mock("@/shared/security/request-guards", () => ({ rejectUntrustedMutation: () => null }));
vi.mock("@/shared/observability/logger", () => ({ logEvent: vi.fn() }));
import { qararRpc, qararRpcV2, QararApiError } from "@/shared/api/qarar-server";
import { POST } from "./route";
const params = { p_council_id: "council-a" };
const send = (contract = "admin_get_council_detail_v2") => POST(new Request("http://localhost/api/admin/councils", { method: "POST", body: JSON.stringify({ contract, params }) }));
beforeEach(() => vi.resetAllMocks());
it("reads old council detail with the same contextual actor when the new read contract is missing", async () => {
  vi.mocked(qararRpcV2).mockRejectedValue(new QararApiError("missing function", 404, "PGRST202"));
  vi.mocked(qararRpc).mockResolvedValue({ id: "council-a", name_ar: "مجلس الجامعة" });
  const response = await send();
  expect(response.status).toBe(200);
  expect(qararRpc).toHaveBeenCalledWith("admin_get_council_detail", params);
  expect((await response.json()).data).toEqual(expect.objectContaining({ id: "council-a", meeting_plan_unavailable: true, can_create_meeting_plan: false }));
});
it.each([[403, "42501"], [500, "XX000"]])("does not downgrade a forbidden or failed read (%s)", async (status, code) => {
  vi.mocked(qararRpcV2).mockRejectedValue(new QararApiError("failure", status, code));
  expect((await send()).status).not.toBe(200);
  expect(qararRpc).not.toHaveBeenCalled();
});
it("does not retry any missing mutation through an old contract", async () => {
  vi.mocked(qararRpcV2).mockRejectedValue(new QararApiError("missing function", 404, "PGRST202"));
  expect((await send("admin_update_council_v2")).status).not.toBe(200);
  expect(qararRpc).not.toHaveBeenCalled();
});
it("retains the new detail and its plan when the new read is available", async () => {
  vi.mocked(qararRpcV2).mockResolvedValue({ id: "council-a", meeting_plan: { id: "plan-a" } });
  expect((await (await send()).json()).data.meeting_plan.id).toBe("plan-a");
  expect(qararRpc).not.toHaveBeenCalled();
});
