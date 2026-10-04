import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UsersTable, type ManagedUser } from "./users-table";

const firstPage: ManagedUser[] = Array.from({ length: 25 }, (_, index) => ({
  id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  email: `user${index + 1}@example.test`,
  full_name_ar: `مستخدم ${index + 1}`,
  employee_no: String(index + 1),
  job_title: null,
  status: "active",
  is_system_admin: false,
  roles: [],
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("UsersTable", () => {
  it("لا يعيد تحميل الصفحة الأولى بسبب التشغيل المزدوج لتأثيرات React", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(globalThis, "fetch");

    render(<StrictMode><UsersTable users={firstPage} total={26} /></StrictMode>);
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });

    expect(fetchMock).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("يجلب الصفحة التالية من الخادم ولا يحصر العرض في أول 25 مستخدماً", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        items: [{ ...firstPage[0], id: "00000000-0000-4000-8000-000000000026", email: "user26@example.test", full_name_ar: "مستخدم 26" }],
        total: 26,
      }), { status: 200 }),
    );

    render(<UsersTable users={firstPage} total={26} />);
    await user.click(screen.getByRole("button", { name: "الصفحة التالية" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("offset=25");
    expect(await screen.findByText("مستخدم 26")).toBeVisible();
  });

  it("ينفذ البحث على الخادم ويعرض سبب الفشل في مكان الجدول", async () => {
    const user = userEvent.setup();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "تعذر تحميل المستخدمين حالياً." }), { status: 500 }),
    );

    render(<UsersTable users={firstPage} total={26} />);
    await user.type(screen.getByPlaceholderText("ابحث بالاسم، البريد أو الرقم الوظيفي..."), "طارق");
    await vi.advanceTimersByTimeAsync(400);

    expect(await screen.findByText("تعذر تحميل المستخدمين حالياً.")).toBeVisible();
    vi.useRealTimers();
  });
});
