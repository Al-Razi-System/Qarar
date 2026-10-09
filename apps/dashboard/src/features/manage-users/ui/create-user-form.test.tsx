import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { CreateUserForm } from "./create-user-form";
const userId = "83000000-0000-0000-0000-000000000003";
vi.mock("./user-submission-scope", () => ({ UserSubmissionScope: ({ userId, onSaved }: { userId: string; onSaved: () => void }) => <section aria-label="إعداد نطاق الحساب"><p>{userId}</p><button onClick={onSaved}>حفظ نطاق الاختبار</button></section> }));
afterEach(() => { vi.restoreAllMocks(); });
it("creates directly with a temporary password and accepts a no-invitation receipt", async () => {
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ account_created: true, invitation_sent: false, must_change_password: true, user_id: userId }), { status: 201 }));
  render(<CreateUserForm roles={[]} units={[]} canManageSubmissionScopes />);
  const user = userEvent.setup();
  await user.click(screen.getByLabelText("كلمة مرور مؤقتة — دون دعوة"));
  await user.type(screen.getByLabelText("كلمة المرور المؤقتة"), "TemporaryPassword42!");
  await completeBasicForm();
  expect(await screen.findByRole("region", { name: "إعداد نطاق الحساب" })).toBeVisible();
  expect(JSON.parse(request.mock.calls[0][1]?.body as string)).toMatchObject({ creation_mode: "temporary_password", temporary_password: "TemporaryPassword42!" });
  expect(screen.getByRole("status")).toHaveTextContent("تغيير كلمة المرور");
});
async function completeBasicForm() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("الاسم الكامل بالعربية"), "مستخدم الاختبار");
  await user.type(screen.getByLabelText("البريد الإلكتروني المؤسسي"), "new@example.test");
  await user.click(screen.getByRole("button", { name: "التالي" }));
  await user.click(screen.getByRole("button", { name: "التالي" }));
  await user.click(screen.getByRole("checkbox", { name: /أؤكد/ }));
  await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
  return user;
}
it("continues to the same created account scope instead of recreating the identity", async () => {
  const done = vi.fn();
  const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ account_created: true, invitation_sent: true, user_id: userId }), { status: 201 }));
  render(<CreateUserForm roles={[]} units={[]} canManageSubmissionScopes onComplete={done} />);
  const user = await completeBasicForm();
  expect(await screen.findByRole("region", { name: "إعداد نطاق الحساب" })).toHaveTextContent(userId);
  expect(screen.queryByRole("button", { name: "إنشاء الحساب" })).not.toBeInTheDocument();
  expect(request).toHaveBeenCalledOnce();
  expect(done).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "حفظ نطاق الاختبار" }));
  expect(done).toHaveBeenCalledOnce();
});
it("does not give a delegated user manager a scope management step", async () => {
  const done = vi.fn();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ account_created: true, invitation_sent: true, user_id: userId }), { status: 201 }));
  render(<CreateUserForm roles={[]} units={[]} onComplete={done} />);
  await completeBasicForm();
  expect(done).toHaveBeenCalledOnce();
  expect(screen.queryByRole("region", { name: "إعداد نطاق الحساب" })).not.toBeInTheDocument();
});
it("blocks blind retries when successful HTTP does not confirm account creation", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
  render(<CreateUserForm roles={[]} units={[]} canManageSubmissionScopes />);
  await completeBasicForm();
  expect(await screen.findByRole("alert")).toHaveTextContent("قائمة المستخدمين");
  expect(screen.getByRole("button", { name: "إنشاء الحساب" })).toBeDisabled();
});
it("shows optional fields collapsed and omits fields unsupported by the creation contract", () => {
  render(<CreateUserForm roles={[]} units={[]} />);
  expect(screen.getByLabelText("الاسم الكامل بالعربية")).toBeVisible();
  expect(screen.getByLabelText("البريد الإلكتروني المؤسسي")).toBeVisible();
  expect(screen.getByLabelText("رقم الجوال")).not.toBeVisible();
  expect(screen.queryByLabelText("الاسم الكامل بالإنجليزية")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("تاريخ بدء العضوية")).not.toBeInTheDocument();
});
it("keeps a known validation rejection retryable without discarding input", async () => {
  const request = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "راجع الاسم والبريد." }), { status: 400 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ account_created: true, invitation_sent: true, user_id: userId }), { status: 201 }));
  render(<CreateUserForm roles={[]} units={[]} canManageSubmissionScopes />);
  const user = await completeBasicForm();
  expect(await screen.findByRole("alert")).toHaveTextContent("راجع الاسم والبريد");
  await user.click(screen.getByRole("button", { name: "إنشاء الحساب" }));
  expect(await screen.findByRole("region", { name: "إعداد نطاق الحساب" })).toBeVisible();
  expect(JSON.parse(request.mock.calls[1][1]?.body as string)).toMatchObject({ full_name_ar: "مستخدم الاختبار", email: "new@example.test" });
});
it("does not blindly retry an ambiguous server failure", async () => {
  const done = vi.fn();
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ message: "تعذر إكمال العملية." }), { status: 500 }));
  render(<CreateUserForm roles={[]} units={[]} onComplete={done} />);
  const user = await completeBasicForm();
  expect(await screen.findByRole("alert")).toHaveTextContent("قد تكون الهوية أُنشئت");
  expect(screen.getByRole("button", { name: "إنشاء الحساب" })).toBeDisabled();
  expect(screen.getByRole("link", { name: /فتح قائمة المستخدمين/ })).toBeVisible();
  await user.click(screen.getByRole("link", { name: /فتح قائمة المستخدمين/ }));
  expect(done).toHaveBeenCalledOnce();
});
it("maps a non-JSON response to a safe Arabic verification state", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("<html>upstream failed</html>", { status: 502 }));
  render(<CreateUserForm roles={[]} units={[]} />);
  await completeBasicForm();
  expect(await screen.findByRole("alert")).toHaveTextContent("قائمة المستخدمين");
  expect(screen.getByRole("alert")).not.toHaveTextContent("upstream");
  expect(screen.getByRole("button", { name: "إنشاء الحساب" })).toBeDisabled();
});
