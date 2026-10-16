// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/shared/api/qarar-server", () => ({
  qararRpcV2: rpc,
  getQararEnv: async () => ({ SUPABASE_URL: "http://storage.test", SERVICE_ROLE_KEY: "private-key" }),
}));
vi.mock("@/shared/security/request-guards", () => ({ rejectUntrustedMutation: () => null }));
vi.mock("@/shared/security/upload-malware-scan", () => ({ scanUploadForMalware: async () => ({ state: "clean" }) }));
import { DELETE, GET, POST } from "./route";

const taskId = "7b000000-0000-0000-0000-000000000001";
const evidenceId = "7b000000-0000-0000-0000-000000000002";
const pdf = () => new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a])], "plan.pdf", { type: "application/pdf" });
function upload() {
  const form = new FormData();
  form.set("taskId", taskId);
  form.set("file", pdf());
  return new Request("http://localhost/api/admin/tasks/evidence", { method: "POST", body: form });
}

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("stores the file under its task and registers it", async () => {
  rpc.mockResolvedValueOnce({ evidence: [] }).mockResolvedValueOnce({ id: evidenceId });
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  const response = await POST(upload());
  expect(response.status).toBe(200);
  expect(fetchMock.mock.calls[0][0]).toMatch(new RegExp(`/qarar-evidence/tasks/${taskId}/[0-9a-f-]+\\.pdf$`));
  expect(rpc).toHaveBeenLastCalledWith("add_task_evidence_v2", expect.objectContaining({ p_task_id: taskId, p_file_name: "plan.pdf", p_mime_type: "application/pdf" }));
});

it("stores nothing for a task the user cannot read", async () => {
  rpc.mockRejectedValueOnce(Object.assign(new Error("هذه المهمة متاحة لمنفّذها ومتابعها ومن يتحقق منها."), { status: 403 }));
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const response = await POST(upload());
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("deletes the stored file when the database refuses the evidence", async () => {
  rpc.mockResolvedValueOnce({ evidence: [] }).mockRejectedValueOnce(new Error("المهمة بانتظار التحقق، فلا تتغير حتى يُتحقق منها أو تُعاد."));
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  const response = await POST(upload());
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: "DELETE" });
});

it("serves only evidence listed on a task the user reads", async () => {
  rpc.mockResolvedValue({ evidence: [{ id: evidenceId, storage_path: `tasks/${taskId}/a.pdf` }] });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("pdf")));
  const served = await GET(new Request(`http://localhost/api/admin/tasks/evidence?taskId=${taskId}&evidenceId=${evidenceId}`));
  expect(served.status).toBe(200);
  expect(served.headers.get("Content-Disposition")).toBe("attachment");
  const other = await GET(new Request(`http://localhost/api/admin/tasks/evidence?taskId=${taskId}&evidenceId=7b000000-0000-0000-0000-000000000009`));
  expect(other.status).toBe(404);
});

it("removes the stored file after the database removes the evidence", async () => {
  rpc.mockResolvedValue({ id: evidenceId, storage_path: `tasks/${taskId}/a.pdf` });
  const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetchMock);
  const response = await DELETE(new Request(`http://localhost/api/admin/tasks/evidence?evidenceId=${evidenceId}`, { method: "DELETE" }));
  expect(response.status).toBe(200);
  expect(fetchMock.mock.calls[0][0]).toContain(`/qarar-evidence/tasks/${taskId}/a.pdf`);
});
