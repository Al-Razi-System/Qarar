import { afterEach, describe, expect, it, vi } from "vitest";

const { qararRpcV2 } = vi.hoisted(() => ({ qararRpcV2: vi.fn() }));
vi.mock("@/shared/api/qarar-server", async () => ({ ...(await vi.importActual<object>("@/shared/api/qarar-server")), qararRpcV2 }));

import { GET, POST } from "./route";

const post = (body: unknown) => POST(new Request("http://localhost/api/notifications", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(body),
}));

afterEach(() => vi.clearAllMocks());

describe("/api/notifications", () => {
  it("reads the caller's bell", async () => {
    qararRpcV2.mockResolvedValue({ items: [], unread_count: 0 });
    const response = await GET();
    expect(await response.json()).toEqual({ data: { items: [], unread_count: 0 } });
    expect(qararRpcV2).toHaveBeenCalledWith("get_my_notifications_v2", { p_limit: 20, p_before: null });
  });

  it("marks chosen or all notifications read", async () => {
    qararRpcV2.mockResolvedValue(2);
    const id = "11111111-1111-4111-8111-111111111111";
    expect(await (await post({ ids: [id] })).json()).toEqual({ data: { unread_count: 2 } });
    expect(qararRpcV2).toHaveBeenLastCalledWith("mark_my_notifications_read_v2", { p_ids: [id] });
    await post({ ids: null });
    expect(qararRpcV2).toHaveBeenLastCalledWith("mark_my_notifications_read_v2", { p_ids: null });
  });

  it("rejects malformed ids before calling the database", async () => {
    expect((await post({ ids: ["not-an-id"] })).status).toBe(400);
    expect(qararRpcV2).not.toHaveBeenCalled();
  });

  it("answers an expired session in Arabic", async () => {
    qararRpcV2.mockRejectedValue(new Error("UNAUTHENTICATED"));
    const response = await GET();
    expect(response.status).toBe(401);
    expect((await response.json()).error.message).toBe("انتهت الجلسة. سجّل الدخول مرة أخرى.");
  });
});
