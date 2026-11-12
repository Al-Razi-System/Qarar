import { afterEach, describe, expect, it, vi } from "vitest";

const { qararRpcV2 } = vi.hoisted(() => ({ qararRpcV2: vi.fn() }));
vi.mock("@/shared/api/qarar-server", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api/qarar-server")>("@/shared/api/qarar-server");
  return { ...actual, qararRpcV2 };
});

import { QararApiError } from "@/shared/api/qarar-server";
import { POST } from "./route";

const call = (body: unknown) => POST(new Request("http://localhost/api/admin/oversight", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost" }, body: JSON.stringify(body),
}));

afterEach(() => vi.clearAllMocks());

describe("POST /api/admin/oversight", () => {
  it("runs only the oversight contracts", async () => {
    qararRpcV2.mockResolvedValue({ assignments: [] });
    const response = await call({ contract: "admin_get_oversight_workspace_v2", params: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: { assignments: [] } });
    expect((await call({ contract: "admin_update_council_v2", params: {} })).status).toBe(400);
  });

  it.each([
    [new QararApiError("permission denied: governance.oversight.manage", 403, "42501"), 403, "لا تملك صلاحية إدارة متابعة المجالس."],
    [new QararApiError("oversight assignment changed since it was read", 409, "40001"), 409, "تغيّر هذا التعيين منذ فتحته. أعد تحميل الصفحة ثم حاول مجددًا."],
    [new QararApiError("oversight holder user is required in this organisation", 400, "22023"), 400, "اختر الشخص الذي سيتابع."],
    [new QararApiError("choose at least one council to follow", 400, "22023"), 400, "اختر مجلسًا واحدًا على الأقل."],
    [new QararApiError("something unexpected", 500, "XX000"), 500, "تعذر تنفيذ العملية. حاول مجددًا."],
  ])("answers %s in safe Arabic", async (error, status, message) => {
    qararRpcV2.mockRejectedValue(error);
    const response = await call({ contract: "admin_save_oversight_assignment_v2", params: {} });
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.error.message).toBe(message);
    expect(JSON.stringify(body)).not.toMatch(/oversight|permission denied|XX000/);
  });
});
