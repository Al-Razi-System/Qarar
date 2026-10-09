import { renderToString } from "react-dom/server";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LoginForm } from "./login-form";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); push.mockReset(); });

it("prevents credentials from submitting as GET before hydration", () => {
  const html = renderToString(<LoginForm />);
  expect(html).toContain('method="post"');
  expect(html).toContain('<fieldset disabled=""');
});

it("submits credentials by JSON POST and continues to MFA", async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ mfa_required: true }) });
  vi.stubGlobal("fetch", fetchMock);
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), { target: { value: "admin@example.test" } });
  fireEvent.change(screen.getByLabelText("كلمة المرور"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/mfa"));
  expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", expect.objectContaining({ method: "POST", body: JSON.stringify({ email: "admin@example.test", password: "test-password" }) }));
});
it("routes a temporary account to replacement instead of the application", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ password_change_required: true }) }));
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), { target: { value: "temp@example.test" } });
  fireEvent.change(screen.getByLabelText("كلمة المرور"), { target: { value: "temporary" } });
  fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/change-password"));
  expect(push).not.toHaveBeenCalledWith("/admin");
});

it.each([
  ["network", "تعذر الاتصال بخدمة تسجيل الدخول."],
  ["rejection", "بيانات الدخول غير صحيحة."],
])("shows %s failure inside the form and allows retry", async (failure, message) => {
  const fetchMock = failure === "network"
    ? vi.fn().mockRejectedValue(new Error("offline"))
    : vi.fn().mockResolvedValue({ ok: false, json: async () => ({ message }) });
  vi.stubGlobal("fetch", fetchMock);
  render(<LoginForm />);
  fireEvent.change(screen.getByLabelText("البريد الإلكتروني"), { target: { value: "admin@example.test" } });
  fireEvent.change(screen.getByLabelText("كلمة المرور"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "تسجيل الدخول" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(message);
  expect(screen.getByRole("button", { name: "تسجيل الدخول" })).toBeEnabled();
  expect(push).not.toHaveBeenCalled();
});
