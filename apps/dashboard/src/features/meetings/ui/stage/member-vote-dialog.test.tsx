import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemberVoteCard } from "./member-vote-card";

const vote = { voting_round_id: "r1", title_ar: "اعتماد الميزانية السنوية", has_voted: false };
describe("private voting dialog", () => {
  it("explains a lost live connection inside the dialog, not behind its backdrop", () => {
    render(<MemberVoteCard vote={vote} busy unavailableReason="انقطع تحديث التصويت؛ أعد الاتصال." onCast={vi.fn()} />);
    expect(screen.getByRole("dialog")).toHaveTextContent("انقطع تحديث التصويت؛ أعد الاتصال.");
    expect(screen.getByRole("button", { name: "تأكيد التصويت" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "لاحقًا" })).toBeEnabled();
  });
  it("opens as a dialog and requires deliberate confirmation, not a choice click", async () => {
    const cast = vi.fn().mockResolvedValue(true);
    render(<MemberVoteCard vote={vote} busy={false} onCast={cast} />);
    expect(screen.getByRole("dialog", { name: "التصويت على البند" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تأكيد التصويت" })).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "موافق" }));
    expect(cast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التصويت" }));
    expect(cast).toHaveBeenCalledWith("r1", "approve", null);
  });
  it("can minimize without voting and reopen without losing the draft", () => {
    const cast = vi.fn();
    render(<MemberVoteCard vote={vote} busy={false} onCast={cast} />);
    fireEvent.click(screen.getByRole("radio", { name: "ممتنع" }));
    fireEvent.click(screen.getByRole("button", { name: "لاحقًا" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(cast).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "أدلِ بصوتك" }));
    expect(screen.getByRole("radio", { name: "ممتنع" })).toHaveAttribute("aria-checked", "true");
  });
  it("keeps note and choice on failure and never auto retries", async () => {
    const cast = vi.fn().mockResolvedValue(false);
    render(<MemberVoteCard vote={vote} busy={false} onCast={cast} />);
    fireEvent.click(screen.getByRole("radio", { name: "غير موافق" }));
    fireEvent.click(screen.getByRole("button", { name: "إضافة ملاحظة اختيارية" }));
    fireEvent.change(screen.getByLabelText("ملاحظة مع التصويت"), { target: { value: "تحفظ على التقديرات" } });
    fireEvent.click(screen.getByRole("button", { name: "تأكيد التصويت" }));
    expect(await screen.findByText(/لم يتأكد تسجيل صوتك/)).toBeInTheDocument();
    expect(screen.getByLabelText("ملاحظة مع التصويت")).toHaveValue("تحفظ على التقديرات");
    expect(cast).toHaveBeenCalledTimes(1);
  });
});
