import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LeadershipDialog, MemberDialog } from "./council-operation-dialogs";
import type { CouncilMembership } from "../model/types";

const roles = [{
  id: "00000000-0000-4000-8000-000000000001",
  code: "council_member",
  name_ar: "عضو مجلس",
  role_scope: "governance_unit",
}];

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("LeadershipDialog", () => {
  const users = [{ id: "member", full_name_ar: "عضو فعال", email: "member@example.test" }];
  const members = [{ user_id: "member", is_effective: true }] as CouncilMembership[];
  for (const role of ["رئيس المجلس", "مقرر المجلس"]) {
    it(`يسمح بتعيين ${role} وحده`, async () => {
      const confirm = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      render(<LeadershipDialog users={users} members={members} onClose={vi.fn()} onConfirm={confirm} />);
      await user.selectOptions(screen.getByLabelText(role), "member");
      await user.type(screen.getByLabelText("سبب التعيين"), "قرار تعيين القيادة");
      await user.click(screen.getByRole("button", { name: "اعتماد القيادة" }));
      expect(confirm).toHaveBeenCalledWith(role === "رئيس المجلس" ? "member" : "", role === "مقرر المجلس" ? "member" : "", expect.any(String), "قرار تعيين القيادة");
    });
  }
  it("يمنع التعيين دون اختيار", () => {
    render(<LeadershipDialog users={users} members={members} onClose={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.getByRole("button", { name: "اعتماد القيادة" })).toBeDisabled();
  });
  it("يعرض رفض الخادم داخل النافذة ويبقيها مفتوحة", async () => {
    const close = vi.fn(); const user = userEvent.setup();
    render(<LeadershipDialog users={users} members={members} onClose={close} onConfirm={vi.fn().mockRejectedValue(new Error("تم تغيير قيادة المجلس؛ حدّث البيانات"))} />);
    await user.selectOptions(screen.getByLabelText("رئيس المجلس"), "member");
    await user.type(screen.getByLabelText("سبب التعيين"), "قرار تعيين القيادة");
    await user.click(screen.getByRole("button", { name: "اعتماد القيادة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تم تغيير قيادة المجلس");
    expect(close).not.toHaveBeenCalled();
  });
  it("يمنع التكرار والإغلاق أثناء حفظ القيادة", async () => {
    let finish!: () => void;
    const confirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    const close = vi.fn(); const user = userEvent.setup();
    render(<LeadershipDialog users={users} members={members} onClose={close} onConfirm={confirm} />);
    await user.selectOptions(screen.getByLabelText("رئيس المجلس"), "member");
    await user.type(screen.getByLabelText("سبب التعيين"), "قرار تعيين القيادة");
    await user.click(screen.getByRole("button", { name: "اعتماد القيادة" }));
    expect(screen.getByRole("button", { name: "جارٍ التنفيذ..." })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "إغلاق" }));
    await user.click(screen.getByRole("button", { name: "إلغاء" }));
    expect(close).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledOnce();
    finish();
    await waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});

describe("MemberDialog", () => {
  it("يبحث في الخادم عن مستخدم غير موجود في الدفعة الأولية ويستبعد العضو الفعال", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      items: [
        { id: "existing-user", full_name_ar: "عضو حالي", email: "existing@example.test" },
        { id: "remote-user", full_name_ar: "طارق النهمي", email: "tariq@example.test" },
      ],
      total: 2,
    }), { status: 200 }));

    render(<MemberDialog
      users={[]}
      excludedUserIds={["existing-user"]}
      roles={roles}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />);

    await user.type(screen.getByPlaceholderText("ابحث بالاسم، البريد أو الرقم الوظيفي..."), "طارق");
    await vi.advanceTimersByTimeAsync(400);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("query=%D8%B7%D8%A7%D8%B1%D9%82");
    expect(await screen.findByRole("option", { name: "طارق النهمي - tariq@example.test" })).toBeVisible();
    expect(screen.queryByRole("option", { name: /عضو حالي/ })).not.toBeInTheDocument();
  });

  it("يعرض فشل البحث داخل نافذة إضافة العضو", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup();
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      message: "تعذر تحميل المستخدمين حالياً.",
    }), { status: 500 }));

    render(<MemberDialog
      users={[]}
      excludedUserIds={[]}
      roles={roles}
      onClose={vi.fn()}
      onConfirm={vi.fn()}
    />);

    await user.type(screen.getByPlaceholderText("ابحث بالاسم، البريد أو الرقم الوظيفي..."), "محمد");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByText("تعذر تحميل المستخدمين حالياً.")).toBeVisible();
  });
});
