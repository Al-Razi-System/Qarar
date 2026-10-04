import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemberDialog } from "./council-operation-dialogs";

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
