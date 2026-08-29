import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { qararRpc } = vi.hoisted(() => ({
  qararRpc: vi.fn(),
}));

vi.mock("@/shared/api/qarar-server", () => ({
  qararRpc,
  QararApiError: class QararApiError extends Error {},
}));

import { POST } from "./route";

function ssoRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/admin/sso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/admin/sso", () => {
  beforeEach(() => vi.stubEnv("QARAR_SSO_ENABLED", "true"));
  it("يرفض ادعاء التحقق القادم من العميل", async () => {
    const response = await POST(ssoRequest({
      action: "upsert_domain",
      sso_provider_id: "provider-id",
      domain: "example.com",
      verified: true,
    }));

    expect(response.status).toBe(400);
    expect(qararRpc).not.toHaveBeenCalled();
  });

  it("يسجل النطاق جديدًا بحالة غير موثقة بغض النظر عن مدخلات العميل", async () => {
    qararRpc.mockResolvedValue("domain-id");

    const response = await POST(ssoRequest({
      action: "upsert_domain",
      sso_provider_id: "provider-id",
      domain: "example.com",
      verified: false,
    }));

    expect(response.status).toBe(200);
    expect(qararRpc).toHaveBeenCalledWith("admin_upsert_sso_domain", {
      p_sso_provider_id: "provider-id",
      p_domain: "example.com",
      p_verified: false,
    });
  });
});
