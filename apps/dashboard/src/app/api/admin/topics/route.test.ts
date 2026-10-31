import { afterEach, expect, it, vi } from "vitest";
const { rpc, rpcV2 } = vi.hoisted(() => ({ rpc: vi.fn(), rpcV2: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: rpc, qararRpcV2: rpcV2, requireQararSession: vi.fn().mockResolvedValue({}) }));
import { POST } from "./route";
afterEach(() => vi.resetAllMocks());

function request(contract: string, params: Record<string, unknown> = { p_topic_id: "topic-1" }) {
  return new Request("http://localhost/api/admin/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params }) });
}

it("allows the read-only topic audit timeline contract and rejects arbitrary calls", async () => {
  rpc.mockResolvedValueOnce([{ id: "event-1" }]);
  expect((await POST(request("get_topic_activity_timeline"))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("get_topic_activity_timeline", { p_topic_id: "topic-1" });
  expect((await POST(request("delete_topic_audit"))).status).toBe(400);
});

it("routes formal correction contracts through the v2 facade", async () => {
  rpcV2.mockResolvedValueOnce({ items: [], can_open: false });
  expect((await POST(request("list_topic_corrections_v2"))).status).toBe(200);
  expect(rpcV2).toHaveBeenCalledWith("list_topic_corrections_v2", { p_topic_id: "topic-1" });
});

it("routes correction resubmission through the v2 facade", async () => {
  const params = { p_correction_id: "correction-1", p_expected_revision: 2 };
  expect((await POST(request("revise_topic_correction_v2", params))).status).toBe(200);
  expect(rpcV2).toHaveBeenCalledWith("revise_topic_correction_v2", params);
});
