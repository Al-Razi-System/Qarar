import { afterEach, expect, it, vi } from "vitest";
const { edge } = vi.hoisted(() => ({ edge: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ requireQararSession: async () => {}, qararRpc: vi.fn(), qararEdge: edge }));
vi.mock("@/shared/security/request-guards", () => ({ rejectUntrustedMutation: () => null }));
import { POST } from "./route";
afterEach(() => vi.clearAllMocks());
it("fixes the operation to account creation even when a caller sends another action", async () => {
  edge.mockResolvedValue({ account_created: true });
  const response = await POST(new Request("https://app.test/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "unlock_user", email: "new@example.test", creation_mode: "temporary_password" }) }));
  expect(response.status).toBe(201);
  expect(edge).toHaveBeenCalledWith("iam-admin", expect.objectContaining({ action: "create_user", creation_mode: "temporary_password" }));
});
it("returns a server failure and trace so creation is not blindly repeated", async () => {
  edge.mockRejectedValue(Object.assign(new Error("QARAR_EDGE_503"), { status: 503, traceId: "trace-id" }));
  const response = await POST(new Request("https://app.test/api/admin/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }));
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ traceId: "trace-id", message: "تعذر إنشاء الحساب." });
});
