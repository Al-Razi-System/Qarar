import { afterEach, describe, expect, it, vi } from "vitest";

const { qararRpc, qararRpcV2, qararEdge } = vi.hoisted(() => ({ qararRpc: vi.fn(), qararRpcV2: vi.fn(), qararEdge: vi.fn() }));
vi.mock("@/shared/api/qarar-server", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api/qarar-server")>("@/shared/api/qarar-server");
  return { ...actual, qararRpc, qararRpcV2, qararEdge };
});

import { QararApiError } from "@/shared/api/qarar-server";
import { GET, POST } from "./route";

afterEach(() => vi.clearAllMocks());

describe("GET /api/admin/sessions", () => {
  it("lists the caller's own sessions by default", async () => {
    qararRpc.mockResolvedValue([{ id: "s1" }]);
    const response = await GET(new Request("http://localhost/api/admin/sessions"));
    expect(await response.json()).toEqual({ sessions: [{ id: "s1" }] });
    expect(qararRpc).toHaveBeenCalledWith("list_my_sessions", {});
  });

  it("lists the organisation's sessions through the monitoring contract", async () => {
    qararRpcV2.mockResolvedValue({ items: [{ id: "s2" }], total: 1 });
    const response = await GET(new Request("http://localhost/api/admin/sessions?scope=organization&status=all&q=%20عضو%20"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ id: "s2" }], total: 1 });
    expect(qararRpcV2).toHaveBeenCalledWith("admin_list_sessions_v2", { p_status: "all", p_query: "عضو", p_limit: 100, p_offset: 0 });
  });

  it("rejects an unknown status before calling the database", async () => {
    const response = await GET(new Request("http://localhost/api/admin/sessions?scope=organization&status=open"));
    expect(response.status).toBe(400);
    expect(qararRpcV2).not.toHaveBeenCalled();
  });

  it("answers a denied caller with safe Arabic copy", async () => {
    qararRpcV2.mockRejectedValue(new QararApiError("permission denied: iam.sessions.manage", 403, "42501"));
    const response = await GET(new Request("http://localhost/api/admin/sessions?scope=organization"));
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.message).toBe("لا تملك صلاحية مراقبة جلسات المؤسسة.");
    expect(JSON.stringify(body)).not.toContain("iam.sessions.manage");
  });
});

describe("POST /api/admin/sessions", () => {
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
