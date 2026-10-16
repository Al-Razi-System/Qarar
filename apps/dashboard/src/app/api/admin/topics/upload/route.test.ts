// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "token" }) }) }));
vi.mock("@/shared/api/qarar-server", () => ({
  qararRpc: rpc,
  getQararEnv: async () => ({ SUPABASE_URL: "http://storage.test", SERVICE_ROLE_KEY: "private-key" }),
}));
import { GET } from "./route";

const topicId = "7a000000-0000-0000-0000-000000000001";
const meetingId = "7a000000-0000-0000-0000-000000000002";
const path = `topics/${topicId}/plan.pdf`;
const fileUrl = `https://example.test/api/admin/topics/upload?topicId=${topicId}&path=${encodeURIComponent(path)}`;
const request = (disposition: string) =>
  new Request(`http://localhost/api/admin/topics/upload?topicId=${topicId}&path=${encodeURIComponent(path)}&meetingId=${meetingId}&disposition=${disposition}`);

afterEach(() => { vi.clearAllMocks(); vi.unstubAllGlobals(); });

it("downloads an agenda file through the meeting while the chair allows it", async () => {
  rpc.mockResolvedValue([{ topic_id: topicId, file_url: fileUrl, download_allowed: true }]);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("pdf")));
  const response = await GET(request("attachment"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Disposition")).toBe("attachment");
  expect(rpc).toHaveBeenCalledWith("list_meeting_topic_attachments", { p_meeting_id: meetingId });
});

it("refuses the download when the chair withheld it, and still shows the file inline", async () => {
  rpc.mockResolvedValue([{ topic_id: topicId, file_url: fileUrl, download_allowed: false }]);
  const fetchMock = vi.fn().mockResolvedValue(new Response("pdf"));
  vi.stubGlobal("fetch", fetchMock);
  const download = await GET(request("attachment"));
  expect(download.status).toBe(403);
  expect((await download.json()).error.message).toContain("منع رئيس المجلس");
  expect(fetchMock).not.toHaveBeenCalled();
  const shown = await GET(request("inline"));
  expect(shown.status).toBe(200);
  expect(shown.headers.get("Content-Disposition")).toBe("inline");
});

it("denies a file absent from the meeting's agenda before reading storage", async () => {
  rpc.mockResolvedValue([]);
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  expect((await GET(request("inline"))).status).toBe(403);
  expect(fetchMock).not.toHaveBeenCalled();
});
