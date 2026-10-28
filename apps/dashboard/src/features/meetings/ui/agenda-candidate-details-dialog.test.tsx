import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AgendaCandidateDetailsDialog } from "./agenda-candidate-details-dialog";

const rpc = vi.fn();
const meetingRpc = vi.fn();
vi.mock("@/features/topics/api/topics-client", () => ({ topicsRpc: (...args: unknown[]) => rpc(...args) }));
vi.mock("../api/meetings-client", () => ({ meetingRpc: (...args: unknown[]) => meetingRpc(...args) }));

const candidate = {
  id: "topic-1",
  topic_no: "TOP-2026-000003",
  title_ar: "اعتماد عنوان ومشرف للرسالة",
  current_step: "اعتماد مجلس الكلية",
  source_unit_name_ar: "مجلس قسم إدارة الأعمال",
  source_meeting_no: "MTG-2026-000001",
  source_meeting_title_ar: "اجتماع مجلس قسم إدارة الأعمال الأول",
  source_decision_no: "DEC-2026-000002",
  source_decision_text: "التوصية بالموافقة ورفع الموضوع إلى مجلس الكلية.",
};

beforeEach(() => {
  rpc.mockReset();
  meetingRpc.mockReset();
  meetingRpc.mockImplementation(async (contract: string) => contract === "get_topic_return_option" ? {
    available: true,
    expected_version: 0,
    previous_unit_name_ar: "مجلس قسم إدارة الأعمال",
  } : null);
  rpc.mockImplementation(async (contract: string) => {
    if (contract === "get_topic_detail") return { ...candidate, description: "طلب اعتماد عنوان الرسالة والمشرف العلمي.", priority: "medium", status: "new", category: { name_ar: "اعتماد عنوان ومشرف للرسالة" }, governance_unit: { name_ar: "مجلس كلية العلوم الإدارية والإنسانية" }, submitted_by: { full_name_ar: "حسن قاسم علي سلوم" }, created_at: "2026-10-20T09:00:00Z", typed_creation_request: { snapshot: { topic_type_name_ar: "اعتماد عنوان ومشرف للرسالة", classification_name_ar: "أكاديمي", authoring: { discussion_instructions: "### محاور القرار\n\n- تحقق من استيفاء الخطة." } } } };
    if (contract === "get_topic_workflow") return { status: "active", steps: [{ id: "s1", sequence_no: 1, status: "completed", outcome_code: "approved", snapshot: { name_ar: "مجلس القسم" } }, { id: "s2", sequence_no: 2, status: "active", snapshot: { name_ar: "مجلس الكلية" } }] };
    if (contract === "list_topic_attachments") return [{ id: "a1", file_name: "خطة الرسالة.pdf", file_url: "/file.pdf", mime_type: "application/pdf", file_size_bytes: 2048 }];
    if (contract === "get_topic_route_history") return [];
    if (contract === "get_topic_meeting_history") return [{ agenda_item_id: "ai1", agenda_status: "discussed", meeting: { id: "m1", meeting_no: "MTG-2026-000001", title: "اجتماع مجلس القسم", status: "closed", unit_name: "مجلس قسم إدارة الأعمال" }, minutes: { id: "minute-1", status: "approved", content: "النص الرسمي لمحضر المجلس السابق", approved_at: "2026-10-21T12:00:00Z" }, voting_rounds: [{ id: "v1", round_number: 1, status: "closed", result: "approved", approve_count: 8, reject_count: 0, abstain_count: 1 }], decisions: [{ id: "d1", decision_no: "DEC-2026-000002", decision_text: "الموافقة ورفع الموضوع.", decision_status: "approved", requires_approval: false }] }];
    return null;
  });
});

it("lets the contextual chair return a proposal with an explicit written reason", async () => {
  const returned = vi.fn();
  meetingRpc.mockImplementation(async (contract: string) => {
    if (contract === "get_topic_return_option") return { available: true, expected_version: 3, previous_unit_name_ar: "مجلس قسم إدارة الأعمال" };
    if (contract === "return_topic_to_previous_council") return { returned_to_unit_id: "unit-1" };
    return null;
  });
  render(<AgendaCandidateDetailsDialog candidate={candidate} meetingId="meeting-2" busy={false} onClose={() => {}} onReview={() => {}} onReturned={returned} />);
  expect(await screen.findByRole("button", { name: "إرجاع إلى مجلس قسم إدارة الأعمال" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "إرجاع إلى مجلس قسم إدارة الأعمال" }));
  fireEvent.change(screen.getByRole("textbox", { name: "سبب الإرجاع" }), { target: { value: "استكمال المستندات النظامية المطلوبة" } });
  fireEvent.click(screen.getByRole("button", { name: "تأكيد الإرجاع" }));
  await waitFor(() => expect(meetingRpc).toHaveBeenCalledWith("return_topic_to_previous_council", expect.objectContaining({
    p_topic_id: candidate.id,
    p_reason: "استكمال المستندات النظامية المطلوبة",
    p_expected_version: 3,
  })));
  expect(returned).toHaveBeenCalled();
});

it("shows the complete decision context before offering insertion", async () => {
  const review = vi.fn();
  render(<AgendaCandidateDetailsDialog candidate={candidate} busy={false} onClose={() => {}} onReview={review} />);
  expect(screen.getByText("جاري جمع ملف الموضوع…")).toBeInTheDocument();
  expect(await screen.findByText("طلب اعتماد عنوان الرسالة والمشرف العلمي.")).toBeInTheDocument();
  expect(screen.getByText("حسن قاسم علي سلوم")).toBeInTheDocument();
  expect(screen.getByText("تصنيف الموضوع").parentElement).toHaveTextContent("أكاديمي");
  expect(screen.getByText("نوع الطلب").parentElement).toHaveTextContent("اعتماد عنوان ومشرف للرسالة");
  expect(screen.getByRole("dialog", { name: "تفاصيل الموضوع" })).toHaveClass("max-w-5xl");
  expect(screen.getByRole("dialog", { name: "تفاصيل الموضوع" })).not.toHaveClass("h-dvh");
  expect(screen.getByRole("heading", { name: "محاور القرار" })).toBeInTheDocument();
  expect(screen.getByText("تحقق من استيفاء الخطة.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "المرفقات" }));
  expect(screen.getByText("خطة الرسالة.pdf")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("radio", { name: "السجل السابق" }));
  expect(screen.getAllByText("DEC-2026-000002").length).toBeGreaterThan(0);
  expect(screen.getByText("8 موافق")).toBeInTheDocument();
  expect(screen.getByText("النص الرسمي لمحضر المجلس السابق")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "تنزيل محضر اجتماع مجلس القسم" })).toBeEnabled();
  expect(rpc.mock.calls.map((call) => call[0])).toEqual(expect.arrayContaining(["get_topic_detail", "get_topic_workflow", "list_topic_attachments", "get_topic_route_history", "get_topic_meeting_history"]));
  fireEvent.click(screen.getByRole("button", { name: "مراجعة التعليمات والإدراج" }));
  expect(review).toHaveBeenCalledWith(candidate);
});

it("keeps successful sections visible when an optional section fails", async () => {
  rpc.mockImplementation(async (contract: string) => {
    if (contract === "get_topic_detail") return { ...candidate, description: "الوصف المكتمل للموضوع", priority: "medium", status: "new" };
    if (contract === "list_topic_attachments") throw new Error("تعذر تحميل المرفقات");
    return contract === "get_topic_workflow" ? { status: "active", steps: [] } : [];
  });
  render(<AgendaCandidateDetailsDialog candidate={candidate} busy={false} onClose={() => {}} onReview={() => {}} />);
  expect(await screen.findByText("الوصف المكتمل للموضوع")).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/تعذر تحميل قسم المرفقات/)).toBeInTheDocument());
  expect(screen.getByRole("button", { name: "مراجعة التعليمات والإدراج" })).toBeEnabled();
});

it("blocks insertion when the core topic record cannot be loaded and retries in place", async () => {
  rpc.mockRejectedValueOnce(new Error("تعذر الوصول إلى ملف الموضوع."));
  render(<AgendaCandidateDetailsDialog candidate={candidate} busy={false} onClose={() => {}} onReview={() => {}} />);

  expect(await screen.findByText("تعذر الوصول إلى ملف الموضوع.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "مراجعة التعليمات والإدراج" })).toBeDisabled();

  rpc.mockImplementation(async (contract: string) => contract === "get_topic_detail"
    ? { ...candidate, description: "عاد الملف بعد المحاولة." }
    : contract === "get_topic_workflow" ? { status: "active", steps: [] } : []);
  fireEvent.click(screen.getByRole("button", { name: "إعادة تحميل ملف الموضوع" }));

  expect(await screen.findByText("عاد الملف بعد المحاولة.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "مراجعة التعليمات والإدراج" })).toBeEnabled();
});
