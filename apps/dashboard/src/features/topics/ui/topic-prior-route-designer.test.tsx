import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TopicPriorRouteDesigner, type PriorRouteStep } from "./topic-prior-route-designer";

afterEach(cleanup);

const steps: PriorRouteStep[] = [
  { template_step_id: "step-1", sequence_no: 1, title: "مناقشة القسم", step_type: "discussion", responsibility: "discuss", responsible_unit_id: "unit-1", responsible_entity: "مجلس القسم", is_terminal: false },
  { template_step_id: "step-2", sequence_no: 2, title: "مناقشة الكلية", step_type: "discussion", responsibility: "discuss", responsible_unit_id: "unit-2", responsible_entity: "مجلس الكلية", is_terminal: false },
  { template_step_id: "step-3", sequence_no: 3, title: "الاعتماد النهائي", step_type: "approval", responsibility: "final_approve", responsible_unit_id: "unit-3", responsible_entity: "مجلس الجامعة", is_terminal: true },
];

describe("TopicPriorRouteDesigner", () => {
  it("يوثق بادئة متتابعة من المسار ولا يسمح بالإرسال دون محضر", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<TopicPriorRouteDesigner steps={steps} loading={false} busy={false} onSubmit={onSubmit}/>);

    expect(screen.getByText("سيبدأ النظام من هنا")).toBeInTheDocument();
    const submit = screen.getByRole("button", { name: "إنشاء الموضوع وإرسال الإثباتات" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByLabelText("تاريخ اجتماع مجلس القسم"), "2026-08-01");
    await user.type(screen.getByPlaceholderText("اكتب القرار كما ورد في المحضر"), "الموافقة على رفع الموضوع");
    await user.type(screen.getByPlaceholderText("مثال: نوقش الموضوع واعتمد قبل تشغيل النظام الإلكتروني."), "تم الاجتماع قبل تشغيل النظام الإلكتروني");
    await user.upload(screen.getByLabelText("مرفقات مجلس القسم"), new File(["minutes"], "minutes.pdf", { type: "application/pdf" }));

    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit.mock.calls[0][0][0]).toMatchObject({
      template_step_id: "step-1",
      decision_type: "approved",
      decision_text: "الموافقة على رفع الموضوع",
    });
  });
});
