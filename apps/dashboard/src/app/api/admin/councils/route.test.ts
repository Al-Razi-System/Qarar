import { afterEach, describe, expect, it, vi } from "vitest";

const { qararRpc, qararRpcV2 } = vi.hoisted(() => ({ qararRpc: vi.fn(), qararRpcV2: vi.fn() }));

vi.mock("@/shared/api/qarar-server", () => ({
  qararRpc,
  qararRpcV2,
  QararApiError: class QararApiError extends Error {},
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/councils", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/councils", () => {
  it("يمرر عقد المجلس المسموح ومعاملاته فقط", async () => {
    qararRpc.mockResolvedValue({ id: "council-1" });

    const response = await POST(request({ contract: "admin_get_council_detail", params: { p_council_id: "council-1" } }));

    expect(response.status).toBe(200);
    expect(qararRpc).toHaveBeenCalledWith("admin_get_council_detail", { p_council_id: "council-1" });
  });

  it("يرفض أي عقد غير مدرج قبل الوصول إلى قاعدة البيانات", async () => {
    const response = await POST(request({ contract: "execute_arbitrary_sql", params: {} }));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "INVALID_CONTRACT" } });
    expect(qararRpc).not.toHaveBeenCalled();
  });

  it("يعزل عقد إنشاء المجلس الجديد داخل واجهة api_v2", async () => {
    qararRpcV2.mockResolvedValue({ id: "council-2" });
    const response = await POST(request({ contract: "admin_create_council_v2", params: { p_name_ar: "مجلس الكلية" } }));
    expect(response.status).toBe(200);
    expect(qararRpcV2).toHaveBeenCalledWith("admin_create_council_v2", { p_name_ar: "مجلس الكلية" });
    expect(qararRpc).not.toHaveBeenCalled();
  });

  it("لا يمرر معاملات ليست كائن JSON", async () => {
    qararRpc.mockResolvedValue([]);

    const response = await POST(request({ contract: "admin_get_councils_tree", params: ["unexpected"] }));

    expect(response.status).toBe(200);
    expect(qararRpc).toHaveBeenCalledWith("admin_get_councils_tree", {});
  });
});
