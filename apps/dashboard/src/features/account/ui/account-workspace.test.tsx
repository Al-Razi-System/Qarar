import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { AccountWorkspace } from "./account-workspace";
const fetchMock = vi.fn();
const account = { id: "self", email: "self@example.test", full_name_ar: "المستخدم", mobile: "", job_title: "" };
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal("fetch", fetchMock); });
it("saves self details with local success feedback", async () => {
  fetchMock.mockResolvedValue(Response.json({ saved: true, account: { ...account, full_name_ar: "الاسم الجديد" } }));
  render(<AccountWorkspace account={account} />);
  fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "الاسم الجديد" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ بياناتي" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("تم حفظ"));
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).not.toHaveProperty("user_id");
});
it("preserves entered name on server failure", async () => {
  fetchMock.mockResolvedValue(new Response("unavailable", { status: 503 }));
  render(<AccountWorkspace account={account} />);
  fireEvent.change(screen.getByLabelText("الاسم الكامل"), { target: { value: "الاسم الجديد" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ بياناتي" }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تعذر"));
  expect(screen.getByLabelText("الاسم الكامل")).toHaveValue("الاسم الجديد");
});
it("does not submit mismatched password confirmation", () => {
  render(<AccountWorkspace account={account} />);
  fireEvent.change(screen.getByLabelText("كلمة المرور الحالية"), { target: { value: "old" } });
  fireEvent.change(screen.getByLabelText("كلمة المرور الجديدة"), { target: { value: "NewSecurePassword42!" } });
  fireEvent.change(screen.getByLabelText("تأكيد كلمة المرور الجديدة"), { target: { value: "different" } });
  fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }));
  expect(screen.getByRole("alert")).toHaveTextContent("غير متطابقتين");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("blocks a second password mutation after an uncertain response", async () => {
  fetchMock.mockResolvedValue(Response.json({ uncertain: true, message: "تعذر تأكيد النتيجة" }, { status: 503 }));
  render(<AccountWorkspace account={account} />);
  for (const [label, value] of [["كلمة المرور الحالية", "old"], ["كلمة المرور الجديدة", "NewSecurePassword42!"], ["تأكيد كلمة المرور الجديدة", "NewSecurePassword42!"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name: "تغيير كلمة المرور" }));
  await waitFor(() => expect(screen.getByRole("link", { name: "تسجيل الدخول" })).toBeVisible());
  expect(screen.queryByRole("button", { name: "تغيير كلمة المرور" })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
