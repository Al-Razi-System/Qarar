import { afterEach, describe, expect, it, vi } from "vitest";

const { qararEdge, qararRpc } = vi.hoisted(() => ({
  qararEdge: vi.fn(),
  qararRpc: vi.fn(),
}));

vi.mock("@/shared/api/qarar-server", () => ({
  qararEdge,
  qararRpc,
  QararApiError: class QararApiError extends Error {
    constructor(message: string, readonly status: number) {
      super(message);
    }
  },
}));

import { GET, POST } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("/api/admin/sessions", () => {
  it("يعرض جلسات المتصل عبر عقد IAM فقط", async () => {
    qararRpc.mockResolvedValue([{ id: "session-1" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ sessions: [{ id: "session-1" }] });
    expect(qararRpc).toHaveBeenCalledWith("list_my_sessions", {});
  });

  it("يرفض معرف الجلسة غير الصالح قبل استدعاء Edge", async () => {
    const response = await POST(new Request("http://localhost/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "not-a-uuid" }),
    }));

    expect(response.status).toBe(400);
    expect(qararEdge).not.toHaveBeenCalled();
  });

  it("يرفض جسماً لا يمثل كائن JSON قبل استدعاء Edge", async () => {
    const response = await POST(new Request("http://localhost/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "[]",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_JSON_BODY" },
    });
    expect(qararEdge).not.toHaveBeenCalled();
  });

  it("يبطل الجلسة عبر IAM Edge حتى تُلغى سلسلة refresh token", async () => {
    qararEdge.mockResolvedValue({ revoked: true, auth_sessions_revoked: 1 });
    const sessionId = "11111111-1111-4111-8111-111111111111";

    const response = await POST(new Request("http://localhost/api/admin/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, reason: "Lost device" }),
    }));

    expect(response.status).toBe(200);
    expect(qararEdge).toHaveBeenCalledWith("iam-admin", {
      action: "revoke_session",
      session_id: sessionId,
      reason: "Lost device",
    });
  });
});
