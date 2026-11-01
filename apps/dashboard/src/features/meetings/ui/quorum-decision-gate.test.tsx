import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LiveMeetingSession } from "../model/live-meeting";
import { QuorumDecisionGate } from "./quorum-decision-gate";

const session = { viewer: { can_decide_quorum: true }, meeting: { status: "in_progress", attendance_locked: true }, quorum: { quorum_status: "not_met", actual_percentage: 30, required_percentage: 60, present_members: 3, eligible_members: 10 } } as LiveMeetingSession;
describe("quorum choice at the preparation boundary", () => {
  it("asks the chair for an explicit reason and choice, not a fabricated quorum", () => {
    const choose = vi.fn().mockResolvedValue(true);
    render(<QuorumDecisionGate session={session} busy={false} onChoose={choose} />);
    expect(screen.getByRole("dialog", { name: "النصاب غير مكتمل" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "المتابعة بنصاب غير مكتمل" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("سبب القرار"), { target: { value: "متابعة الاختبار بقرار صريح" } });
    fireEvent.click(screen.getByRole("button", { name: "المتابعة بنصاب غير مكتمل" }));
    expect(choose).toHaveBeenCalledWith("continue", "متابعة الاختبار بقرار صريح");
  });
  it("does not let an administrative mode or rapporteur authorize continuation", () => {
    render(<QuorumDecisionGate session={{ ...session, viewer: { ...session.viewer, mode: "chair", can_decide_quorum: false } }} busy={false} onChoose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText(/لا تبدأ المناقشة/)).toBeInTheDocument();
  });
  it("keeps the recorded warning visible without offering another choice", () => {
    render(<QuorumDecisionGate session={{ ...session, meeting: { ...session.meeting, quorum_continuation: { authorized_by: "chair", authorized_at: "2026-10-19", reason: "قرار متابعة موثق", quorum: session.quorum! } } }} busy={false} onChoose={vi.fn()} />);
    expect(screen.getByText(/قرار متابعة موثق/)).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("keeps the choice open with an in-place failure instead of losing the reason", async () => {
    render(<QuorumDecisionGate session={session} busy={false} onChoose={vi.fn().mockResolvedValue(false)} />);
    fireEvent.change(screen.getByLabelText("سبب القرار"), { target: { value: "سبب تأجيل الاجتماع" } });
    fireEvent.click(screen.getByRole("button", { name: "تأجيل الاجتماع" }));
    expect(await screen.findByText(/تعذر حفظ القرار/)).toBeInTheDocument();
    expect(screen.getByLabelText("سبب القرار")).toHaveValue("سبب تأجيل الاجتماع");
  });
});
