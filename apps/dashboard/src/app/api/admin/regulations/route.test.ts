import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ qararRpc: vi.fn(), qararRpcV2: vi.fn(), requireQararSession: vi.fn(), logEvent: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ ...mocks, QararApiError: class extends Error { constructor(message: string, public status: number, public code?: string) { super(message); } } }));
vi.mock("@/shared/observability/logger", () => ({ logEvent: mocks.logEvent }));
import { POST } from "./route";
import { QararApiError } from "@/shared/api/qarar-server";
const request = (contract: string) => new Request("http://localhost/api/admin/regulations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params: {} }) });
afterEach(() => vi.clearAllMocks());
describe("regulation library API", () => {
  it("routes designer calls through v2 without leaking library-specific copy", async () => {
    mocks.qararRpcV2.mockResolvedValue({ items: [], councils: [], classes: [] });
    expect((await POST(request("admin_get_route_designer_v2"))).status).toBe(200);
    mocks.qararRpcV2.mockRejectedValue(new QararApiError("ROUTE_COUNCIL_INACTIVE", 409, "55000"));
    const body = await (await POST(request("admin_save_route_designer_v2"))).json();
    expect(body.error.message).toContain("المجالس");
    expect(body.error.message).not.toContain("اللائحة");
    expect(body.error.message).not.toContain("ROUTE");
    expect(body.error.requestId).toBeTruthy();
  });
  it("uses the new isolated contract and keeps legacy consumers", async () => {
    mocks.qararRpcV2.mockResolvedValue({ revision: "rev" });
    expect((await POST(request("admin_save_regulation_library_v2"))).status).toBe(200);
    expect(mocks.qararRpcV2).toHaveBeenCalled();
    expect(mocks.qararRpc).not.toHaveBeenCalled();
    mocks.qararRpc.mockResolvedValue({ items: [] });
    expect((await POST(request("admin_search_policies"))).status).toBe(200);
    expect(mocks.qararRpc).toHaveBeenCalled();
  });
  it("returns safe conflict copy while recording a traceable cause", async () => {
    mocks.qararRpcV2.mockRejectedValue(new QararApiError("LIBRARY_CONFLICT raw internal", 409, "PT409"));
    const response = await POST(request("admin_save_regulation_library_v2"));
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.message).toContain("تعديل");
    expect(body.error.message).not.toContain("LIBRARY");
    expect(body.error.requestId).toBeTruthy();
    expect(mocks.logEvent).toHaveBeenCalled();
  });
  it("rejects unknown contracts before RPC", async () => {
    expect((await POST(request("anything_v2"))).status).toBe(400);
    expect(mocks.qararRpcV2).not.toHaveBeenCalled();
  });
  it("explains pending changes without asking for an independent reviewer", async () => {
    mocks.qararRpcV2.mockRejectedValue(new QararApiError("LIBRARY_PENDING_CHANGES", 409, "PT409"));
    const response = await POST(request("admin_save_regulation_library_v2"));
    const body = await response.json();
    expect(response.status).toBe(409);
    expect(body.error.message).toContain("مسودة التعديل");
    expect(body.error.message).not.toContain("LIBRARY");
    expect(body.error.message).not.toContain("مراجع");
  });
});
