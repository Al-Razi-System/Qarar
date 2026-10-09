import { afterEach, expect, it, vi } from "vitest";
const { rpc, rpcV2 } = vi.hoisted(() => ({ rpc: vi.fn(), rpcV2: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: rpc, qararRpcV2: rpcV2 }));
import { POST } from "./route";
afterEach(() => vi.resetAllMocks());
function request(contract: string, params: unknown = {}) {
  return new Request("http://localhost/api/admin/meetings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params }) });
}
it("dispatches atomic invitation timing to V2, not the legacy facade", async () => {
  rpcV2.mockResolvedValue({ queued: 2 });
  const params = { p_meeting_id: "meeting-1", p_start_time: "09:00", p_end_time: "11:00", p_expected_updated_at: "2026-10-07T00:00:00Z" };
  const response = await POST(request("send_meeting_invitations_v2", params));
  expect(response.status).toBe(200);
  expect(rpcV2).toHaveBeenCalledWith("send_meeting_invitations_v2", params);
  expect(rpc).not.toHaveBeenCalled();
});
it("preserves V1 consumers and rejects unsupported calls", async () => {
  rpc.mockResolvedValue({ id: "meeting-1" });
  expect((await POST(request("create_meeting"))).status).toBe(200);
  expect((await POST(request("delete_arbitrary_record"))).status).toBe(400);
  expect(rpcV2).not.toHaveBeenCalled();
});
it("rejects malformed parameters before invoking the database", async () => {
  expect((await POST(request("send_meeting_invitations_v2", []))).status).toBe(400);
  expect(rpcV2).not.toHaveBeenCalled();
});
