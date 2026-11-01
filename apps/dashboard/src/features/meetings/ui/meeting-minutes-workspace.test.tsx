import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MeetingDetail, MeetingMinutes } from "../model/meeting";
import { MeetingMinutesWorkspace } from "./meeting-minutes-workspace";

const meeting: MeetingDetail = { id: "m1", title_ar: "اجتماع المجلس", status: "waiting_for_minutes" };
const minutes: MeetingMinutes = {
  id: "min1", status: "generated", updated_at: "2026-10-10T10:00:00Z", viewer_can_edit: true, approvals: [],
  decisions: [{ id: "d1", decision_no: "DEC-2026-000014", decision_text: "اعتماد الخطة بعد تعديل الميزانية." }],
};

function setup(text: string) {
  const onSubmit = vi.fn();
  const props = { meeting, minutes, loading: false, onTextChange: vi.fn(), onGenerate: vi.fn(), onSave: vi.fn(), onSubmit, onSign: vi.fn(async () => undefined), onReturn: vi.fn(async () => undefined) };
  return { onSubmit, view: render(<MeetingMinutesWorkspace {...props} text={text} />), props };
}

describe("MeetingMinutesWorkspace and the current decision text", () => {
  it("blocks submission with the reason beside it while a decision text is out of date", () => {
    setup("محضر اجتماع المجلس\nالقرار: اعتماد الخطة كما وردت في الموضوع.");
    expect(screen.getByRole("button", { name: "تثبيت النسخة وإرسالها لجميع الحاضرين" })).toBeDisabled();
    expect(screen.getByText(/لا يُرسل المحضر للمصادقة قبل أن يتضمن النص الحالي للقرار DEC-2026-000014/)).toBeInTheDocument();
  });

  it("allows submission once the minutes carry the current text", async () => {
    const { onSubmit } = setup("محضر اجتماع المجلس\nالقرار: اعتماد الخطة بعد تعديل الميزانية.");
    expect(screen.queryByText(/لا يُرسل المحضر للمصادقة/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "تثبيت النسخة وإرسالها لجميع الحاضرين" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
