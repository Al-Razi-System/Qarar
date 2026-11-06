import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ScheduledAgendaProposalDialog } from "./scheduled-agenda-proposal-dialog";

afterEach(() => vi.unstubAllGlobals());

it("requires the classification attachments then submits and inserts the periodic proposal", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { request_id: "10000000-0000-0000-0000-000000000001", files: [] } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "20000000-0000-0000-0000-000000000001" } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "20000000-0000-0000-0000-000000000002" } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { topic_id: "30000000-0000-0000-0000-000000000001", agenda_item_id: "40000000-0000-0000-0000-000000000001" } }), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  const completed = vi.fn();

  render(<ScheduledAgendaProposalDialog
    meetingId="50000000-0000-0000-0000-000000000001"
    unitId="60000000-0000-0000-0000-000000000001"
    item={{
      occurrence_id: "70000000-0000-0000-0000-000000000001",
      topic_type_version_id: "80000000-0000-0000-0000-000000000001",
      title_ar: "اعتماد برنامج أكاديمي",
      available_from: "2026-11-01",
      due_on: "2026-11-07",
      required_attachment_count: 2,
    }}
    onClose={()=>undefined}
    onCompleted={completed}
  />);

  fireEvent.change(screen.getByLabelText("تفاصيل الموضوع"), { target: { value: "تفاصيل البرنامج الأكاديمي المطلوب من المجلس مراجعته." } });
  expect(screen.getByRole("button", { name: "إنشاء الموضوع وإدراجه" })).toBeDisabled();

  const files = [
    new File(["first"], "الخطة.pdf", { type: "application/pdf" }),
    new File(["second"], "التوصيف.pdf", { type: "application/pdf" }),
  ];
  fireEvent.change(screen.getByLabelText("مرفقات الموضوع"), { target: { files } });
  fireEvent.click(screen.getByRole("button", { name: "إنشاء الموضوع وإدراجه" }));

  await waitFor(() => expect(completed).toHaveBeenCalledWith(expect.objectContaining({ topic_id: "30000000-0000-0000-0000-000000000001" })));
  expect(fetchMock).toHaveBeenCalledTimes(4);
  expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual(expect.objectContaining({
    action: "submit_scheduled",
    meetingId: "50000000-0000-0000-0000-000000000001",
    occurrenceId: "70000000-0000-0000-0000-000000000001",
  }));
});

it("keeps inputs and shows the server cause when insertion fails", async () => {
  vi.stubGlobal("fetch", vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ data: { request_id: "10000000-0000-0000-0000-000000000001", files: [] } }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: "لم يعد الاجتماع قابلاً لتعديل جدول الأعمال.", traceId: "trace-1" } }), { status: 409 })));

  render(<ScheduledAgendaProposalDialog
    meetingId="50000000-0000-0000-0000-000000000001"
    unitId="60000000-0000-0000-0000-000000000001"
    item={{ occurrence_id: "70000000-0000-0000-0000-000000000001", topic_type_version_id: "80000000-0000-0000-0000-000000000001", title_ar: "الخطة السنوية", available_from: "2026-11-01", due_on: "2026-11-07", required_attachment_count: 0 }}
    onClose={()=>undefined}
    onCompleted={()=>undefined}
  />);
  fireEvent.change(screen.getByLabelText("تفاصيل الموضوع"), { target: { value: "تفاصيل كافية للخطة السنوية المطلوب اعتمادها." } });
  fireEvent.click(screen.getByRole("button", { name: "إنشاء الموضوع وإدراجه" }));

  expect(await screen.findByRole("alert")).toHaveTextContent("لم يعد الاجتماع قابلاً لتعديل جدول الأعمال");
  expect(screen.getByLabelText("تفاصيل الموضوع")).toHaveValue("تفاصيل كافية للخطة السنوية المطلوب اعتمادها.");
});
