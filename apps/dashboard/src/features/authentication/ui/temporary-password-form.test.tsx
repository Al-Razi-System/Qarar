import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { TemporaryPasswordForm } from "./temporary-password-form";
afterEach(() => { vi.restoreAllMocks(); });
function fill() {
  fireEvent.change(screen.getByLabelText("كلمة المرور الحالية"), { target: { value: "TemporaryPassword42!" } });
  fireEvent.change(screen.getByLabelText("كلمة المرور الجديدة"), { target: { value: "NewPassword42!" } });
  fireEvent.change(screen.getByLabelText("تأكيد كلمة المرور الجديدة"), { target: { value: "NewPassword42!" } });
  fireEvent.click(screen.getByRole("button", { name: "حفظ كلمة المرور الجديدة" }));
}
it("shows successful replacement and login link without keeping password inputs", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ changed: true, message: "تم تغيير كلمة المرور" })));
  render(<TemporaryPasswordForm />); fill();
  expect(await screen.findByRole("status")).toHaveTextContent("تم تغيير");
  expect(screen.getByRole("link", { name: "تسجيل الدخول بالكلمة الجديدة" })).toBeVisible();
  expect(screen.queryByLabelText("كلمة المرور الحالية")).not.toBeInTheDocument();
});
it("retains input and allows retry after a known validation rejection", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "كلمة المرور الحالية غير صحيحة" }), { status: 400 }));
  render(<TemporaryPasswordForm />); fill();
  expect(await screen.findByRole("alert")).toHaveTextContent("غير صحيحة");
  expect(screen.getByLabelText("كلمة المرور الجديدة")).toHaveValue("NewPassword42!");
  expect(screen.getByRole("button", { name: "حفظ كلمة المرور الجديدة" })).toBeEnabled();
});
it("prevents a blind retry after a transport failure", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
  render(<TemporaryPasswordForm />); fill();
  expect(await screen.findByRole("alert")).toHaveTextContent("تسجيل الدخول بالكلمة الجديدة");
  expect(screen.getByRole("button", { name: "حفظ كلمة المرور الجديدة" })).toBeDisabled();
});
