// @vitest-environment node
import { afterEach, expect, it, vi } from "vitest";

const { rpc, render, readFile } = vi.hoisted(() => ({
  rpc: vi.fn(),
  render: vi.fn(),
  readFile: vi.fn(),
}));

vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: rpc }));
vi.mock("@react-pdf/renderer", () => ({ renderToBuffer: render }));
vi.mock("node:fs/promises", () => ({ readFile }));
vi.mock("@/features/topics/pdf/topic-document", () => ({ TopicDocument: vi.fn(() => ({ type: "topic-document" })) }));

import { GET } from "./route";

const topicId = "7b000000-0000-4000-8000-000000000001";
const meetingId = "7b000000-0000-4000-8000-000000000002";

afterEach(() => vi.resetAllMocks());

function coreTopic() {
  return {
    id: topicId,
    topic_no: "TOP-2026-000123",
    title_ar: "اعتماد الخطة الأكاديمية الجديدة",
    description: "وصف موضوع مكتمل",
    status: "under_review",
    priority: "high",
    category: { name_ar: "شؤون أكاديمية" },
    governance_unit: { name_ar: "مجلس الجامعة" },
    submitted_by: { full_name_ar: "مقدم الموضوع" },
  };
}

it("builds the official topic PDF from authorized contracts and records the successful export", async () => {
  rpc.mockImplementation(async (contract: string) => {
    if (contract === "get_topic_detail") return coreTopic();
    if (contract === "get_meeting_detail") return { id: meetingId, meeting_no: "MTG-2026-000010" };
    if (contract === "get_topic_workflow") return { status: "active", steps: [] };
    if (contract === "list_topic_attachments") return [{ id: "file-1", file_name: "الخطة.pdf" }];
    if (contract === "get_topic_requirements_status") return { items: [], missing_mandatory: 0, ready_for_review: true };
    if (contract === "list_topic_regulation_references") return [];
    if (contract === "get_topic_route_history") return [];
    if (contract === "get_topic_meeting_history") return [];
    if (contract === "get_topic_activity_timeline") return [];
    if (contract === "get_my_account") return { profile: { full_name_ar: "مدير النظام" } };
    if (contract === "record_topic_pdf_export") return { recorded: true };
    throw new Error(`unexpected contract ${contract}`);
  });
  readFile.mockResolvedValue(Buffer.from("logo"));
  render.mockResolvedValue(Buffer.from("official-pdf"));

  const response = await GET(
    new Request(`http://localhost/api/admin/topics/${topicId}/pdf?meetingId=${meetingId}`),
    { params: Promise.resolve({ topicId }) },
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("application/pdf");
  expect(response.headers.get("Content-Disposition")).toContain("TOP-2026-000123-topic.pdf");
  expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("official-pdf");
  expect(rpc).toHaveBeenCalledWith("get_meeting_detail", { p_meeting_id: meetingId });
  expect(rpc).toHaveBeenCalledWith("record_topic_pdf_export", { p_topic_id: topicId, p_meeting_id: meetingId });
  expect(rpc.mock.calls.at(-1)?.[0]).toBe("record_topic_pdf_export");
});

it("does not record an export when authorization or document creation fails", async () => {
  rpc.mockRejectedValueOnce(Object.assign(new Error("permission denied"), { code: "42501", status: 403 }));

  const denied = await GET(
    new Request(`http://localhost/api/admin/topics/${topicId}/pdf`),
    { params: Promise.resolve({ topicId }) },
  );

  expect(denied.status).toBe(403);
  expect(JSON.stringify(await denied.json())).not.toContain("permission denied");
  expect(rpc).not.toHaveBeenCalledWith("record_topic_pdf_export", expect.anything());

  rpc.mockReset();
  rpc.mockImplementation(async (contract: string) => contract === "get_topic_detail" ? coreTopic() : contract === "get_my_account" ? { full_name_ar: "مدير النظام" } : []);
  readFile.mockResolvedValue(Buffer.from("logo"));
  render.mockRejectedValue(new Error("renderer exploded"));
  const broken = await GET(
    new Request(`http://localhost/api/admin/topics/${topicId}/pdf`),
    { params: Promise.resolve({ topicId }) },
  );
  expect(broken.status).toBe(500);
  expect(rpc).not.toHaveBeenCalledWith("record_topic_pdf_export", expect.anything());
});
