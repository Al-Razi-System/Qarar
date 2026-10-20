import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NotificationAdminWorkspace, type NotificationWorkspaceData } from "./notification-admin-workspace";

const data = {
  channel: { code: "whatsapp", label: "واتساب", connection_evidence: "messages_accepted", last_accepted_at: "2026-10-20T09:00:00Z" },
  summary: { total: 3, accepted: 1, queued: 1, needs_review: 1, skipped: 0 },
  deliveries: [
    { id: "1", recipient_name_ar: "تركي القباني", destination_masked: "+967******012", template_code: "task_due_soon", template_label: "قرب استحقاق تكليف", status_key: "accepted", status_label: "تم الإرسال", error_message: null, created_at: "2026-10-20T08:00:00Z", accepted_at: "2026-10-20T08:01:00Z" },
    { id: "2", recipient_name_ar: "أحمد علي", destination_masked: "+967******778", template_code: "meeting_invitation", template_label: "دعوة اجتماع", status_key: "needs_review", status_label: "يحتاج مراجعة", error_message: "قد تكون الرسالة وصلت؛ تحقق قبل إعادة الإرسال.", created_at: "2026-10-20T07:00:00Z", accepted_at: null },
  ]
} satisfies NotificationWorkspaceData;

describe("NotificationAdminWorkspace", () => {
  it("shows safe operational evidence and masked delivery review", async () => {
    const user = userEvent.setup();
    render(<NotificationAdminWorkspace initialData={data} />);
    expect(screen.getByText("توجد عمليات إرسال ناجحة")).toBeInTheDocument();
    expect(screen.queryByText("+967774440012")).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "سجل الإرسال" }));
    expect(screen.getByText((content) => content.includes("+967******778"))).toBeInTheDocument();
    expect(screen.getByText("قد تكون الرسالة وصلت؛ تحقق قبل إعادة الإرسال.")).toBeInTheDocument();
    expect(screen.queryByText("OPENWA_TIMEOUT_AMBIGUOUS")).not.toBeInTheDocument();
  });

  it("previews the approved templates and explains that sender changes require relinking", async () => {
    const user = userEvent.setup();
    render(<NotificationAdminWorkspace initialData={data} />);
    await user.click(screen.getByRole("radio", { name: "القوالب" }));
    expect(screen.getByText("دعوة اجتماع")).toBeInTheDocument();
    expect(screen.getAllByText("نظام قرار - جامعة الرازي")).toHaveLength(11);
    await user.click(screen.getByRole("radio", { name: "الإعدادات" }));
    expect(screen.getByText(/تغيير رقم الإرسال يتم بربط جلسة واتساب جديدة/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /رقم الإرسال/ })).not.toBeInTheDocument();
  });

  it("keeps a local Arabic failure state at the review surface", () => {
    render(<NotificationAdminWorkspace initialData={null} loadError="تعذر تحميل إعدادات الإشعارات." />);
    expect(screen.getByRole("alert")).toHaveTextContent("تعذر تحميل إعدادات الإشعارات.");
  });
});
