import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NotificationAdminWorkspace, type NotificationWorkspaceData } from "./notification-admin-workspace";

const data = {
  channel: { code: "whatsapp", label: "واتساب", connection_evidence: "messages_accepted", last_accepted_at: "2026-10-20T09:00:00Z" },
  summary: { total: 3, accepted: 1, queued: 1, needs_review: 1, skipped: 0 },
  deliveries: [
    { id: "1", recipient_name_ar: "تركي القباني", destination_masked: "+967******012", template_code: "task_due_soon", template_label: "قرب استحقاق تكليف", status_key: "accepted", status_label: "تم الإرسال", error_message: null, created_at: "2026-10-20T08:00:00Z", accepted_at: "2026-10-20T08:01:00Z" },
    { id: "2", recipient_name_ar: "أحمد علي", destination_masked: "+967******778", template_code: "meeting_invitation", template_label: "دعوة اجتماع", status_key: "needs_review", status_label: "يحتاج مراجعة", error_message: "قد تكون الرسالة وصلت؛ تحقق قبل إعادة الإرسال.", created_at: "2026-10-20T07:00:00Z", accepted_at: null },
  ],
  policy: { whatsapp_enabled: true, meeting_reminder_days: 2, task_due_soon_days: 3, version: 1, updated_at: "2026-10-20T09:00:00Z" },
  templates: [
    { code: "meeting_invitation", label: "دعوة اجتماع", description: "دعوة العضو مع تفاصيل الاجتماع.", enabled: true, custom_intro: null, custom_action: null },
    { code: "task_due_soon", label: "قرب استحقاق تكليف", description: "تذكير المكلّف والمتابع قبل موعد الإنجاز.", enabled: true, custom_intro: null, custom_action: null },
  ],
} satisfies NotificationWorkspaceData;

afterEach(() => vi.restoreAllMocks());

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
    expect(screen.getAllByText("دعوة اجتماع").length).toBeGreaterThan(0);
    expect(screen.getByText("نظام قرار - جامعة الرازي")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "الإعدادات" }));
    expect(screen.getByText(/تغيير رقم الإرسال يتم بربط جلسة واتساب جديدة/)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /رقم الإرسال/ })).not.toBeInTheDocument();
  });

  it("offers a focused template editor with locked system fields and live preview", async () => {
    const user = userEvent.setup();
    render(<NotificationAdminWorkspace initialData={data} />);
    await user.click(screen.getByRole("radio", { name: "القوالب" }));
    await user.click(screen.getByRole("button", { name: /دعوة اجتماع/ }));
    expect(screen.getByText("حقول محمية من النظام")).toBeInTheDocument();
    const intro = screen.getByRole("textbox", { name: "مقدمة الرسالة" });
    await user.clear(intro);
    await user.type(intro, "يسرّنا دعوتك للاجتماع التالي:");
    expect(screen.getAllByText("يسرّنا دعوتك للاجتماع التالي:").length).toBeGreaterThan(0);
    expect(screen.getByText((content)=>content.includes("MTG-2026-000123"))).toBeInTheDocument();
  });

  it("saves the whole policy atomically with local pending and success feedback", async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ data: { version: 2, updated_at: "2026-10-21T08:00:00Z" } }), { status: 200, headers: { "Content-Type": "application/json" } }));
    render(<NotificationAdminWorkspace initialData={data} />);
    await user.click(screen.getByRole("radio", { name: "الإعدادات" }));
    await user.clear(screen.getByRole("spinbutton", { name: "التذكير بالاجتماع قبل" }));
    await user.type(screen.getByRole("spinbutton", { name: "التذكير بالاجتماع قبل" }), "4");
    await user.click(screen.getByRole("button", { name: "حفظ إعدادات الإشعارات" }));
    expect(await screen.findByText("تم حفظ إعدادات الإشعارات وتطبيقها." )).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/admin/notifications", expect.objectContaining({ method: "POST" }));
  });

  it("keeps a local Arabic failure state at the review surface", () => {
    render(<NotificationAdminWorkspace initialData={null} loadError="تعذر تحميل إعدادات الإشعارات." />);
    expect(screen.getByRole("alert")).toHaveTextContent("تعذر تحميل إعدادات الإشعارات.");
  });
});
