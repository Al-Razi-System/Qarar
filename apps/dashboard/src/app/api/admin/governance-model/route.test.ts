import { afterEach, describe, expect, it, vi } from "vitest";

const { qararRpcV2, requireQararSession } = vi.hoisted(() => ({ qararRpcV2: vi.fn(), requireQararSession: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({
  qararRpcV2,
  requireQararSession,
  QararApiError: class QararApiError extends Error {},
}));
import { GET, POST } from "./route";

function request(body: unknown) {
  return new Request("http://localhost/api/admin/governance-model", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

afterEach(() => vi.clearAllMocks());

describe("/api/admin/governance-model", () => {
  it("uses the guarded lifecycle command with concurrency and idempotency fields", async () => {
    const id = "78000000-0000-0000-0000-000000000041";
    qararRpcV2.mockResolvedValue({ ok: true, data: { bundle_id: id, is_enabled: false }, trace_id: "lifecycle" });
    expect((await POST(request({ action: "disable", bundleId: id, expectedLockVersion: 4, clientRequestId: id }))).status).toBe(200);
    expect(qararRpcV2).toHaveBeenCalledWith("manage_topic_type_v2", { p_bundle_id: id, p_action: "disable", p_expected_lock_version: 4, p_client_request_id: id, p_comment: null });
  });
  it("rejects unsupported lifecycle actions before the RPC", async () => {
    expect((await POST(request({ action: "delete_all", bundleId: "id", expectedLockVersion: 1, clientRequestId: "id" }))).status).toBe(400);
    expect(qararRpcV2).not.toHaveBeenCalled();
  });
  it("loads the management list and preserves filter contracts", async () => {
    qararRpcV2.mockResolvedValue({ ok: true, data: { items: [], total: 0 }, trace_id: "list-trace" });
    const response = await GET(new Request("http://localhost/api/admin/governance-model?view=types&status=draft&page=2&search=test"));
    expect(response.status).toBe(200);
    expect(qararRpcV2).toHaveBeenCalledWith("list_governance_topic_types_v2", { p_search: "test", p_status: "draft", p_page: 2 });
  });
  it("rejects invalid filters and detail ids", async () => {
    expect((await GET(new Request("http://localhost/api/admin/governance-model?view=types&page=-1"))).status).toBe(400);
    expect((await GET(new Request("http://localhost/api/admin/governance-model?bundleId=invalid"))).status).toBe(400);
    expect(qararRpcV2).not.toHaveBeenCalled();
  });
  it("rejects client-selected type codes", async () => {
    const response = await POST(request({ bundleId: null, clientRequestId: "52000000-0000-0000-0000-000000000010", bundle: { topic_type: { code: "manual", name_ar: "اسم الموضوع" } } }));
    expect(response.status).toBe(400);
    expect(qararRpcV2).not.toHaveBeenCalled();
  });
  it("loads authoring options through the V2 schema", async () => {
    qararRpcV2.mockResolvedValue({ ok: true, data: { classifications: [], workflow_versions: [] }, trace_id: "trace-1" });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(qararRpcV2).toHaveBeenCalledWith("get_governance_authoring_options_v2", {});
  });

  it("passes only the atomic draft command shape", async () => {
    qararRpcV2.mockResolvedValue({ ok: true, data: { bundle_id: "bundle-1" }, trace_id: "trace-2" });
    const bundle = { classification: { code: "academic", name_ar: "أكاديمي" } };
    const response = await POST(request({ bundleId: null, expectedLockVersion: null, clientRequestId: "52000000-0000-0000-0000-000000000010", bundle }));
    expect(response.status).toBe(200);
    expect(qararRpcV2).toHaveBeenCalledWith("save_governance_bundle_draft_v2", {
      p_bundle_id: null, p_expected_lock_version: null,
      p_client_request_id: "52000000-0000-0000-0000-000000000010", p_bundle: bundle,
    });
  });

  it("returns safe Arabic failure with its trace id", async () => {
    qararRpcV2.mockResolvedValue({ ok: false, error_code: "MODEL_VERSION_CONFLICT", message_ar: "تم تعديل الحزمة في جلسة أخرى.", field_errors: [], trace_id: "trace-conflict" });
    const response = await POST(request({ bundleId: "bundle-1", expectedLockVersion: 1, clientRequestId: "52000000-0000-0000-0000-000000000011", bundle: {} }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { message: "تم تعديل الحزمة في جلسة أخرى.", traceId: "trace-conflict" } });
  });

  it("rejects malformed commands before calling the database", async () => {
    const response = await POST(request({ clientRequestId: "bad", bundle: [] }));
    expect(response.status).toBe(400);
    expect(qararRpcV2).not.toHaveBeenCalled();
  });
});
