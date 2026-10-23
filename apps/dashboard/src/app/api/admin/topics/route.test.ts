import { afterEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: rpc, requireQararSession: vi.fn().mockResolvedValue({}) }));
import { POST } from "./route";
afterEach(() => vi.resetAllMocks());

function request(contract: string) {
  return new Request("http://localhost/api/admin/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params: { p_topic_id: "topic-1" } }) });
}

it("allows the read-only topic audit timeline contract and rejects arbitrary calls", async () => {
  rpc.mockResolvedValueOnce([{ id: "event-1" }]);
  expect((await POST(request("get_topic_activity_timeline"))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("get_topic_activity_timeline", { p_topic_id: "topic-1" });
  expect((await POST(request("delete_topic_audit"))).status).toBe(400);
});
