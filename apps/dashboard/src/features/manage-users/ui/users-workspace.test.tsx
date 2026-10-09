import { renderToString } from "react-dom/server";
import { render, screen, fireEvent } from "@testing-library/react";
import { expect, it, vi } from "vitest";
vi.mock("./users-table", () => ({ UsersTable: () => <div/> }));
vi.mock("./create-user-form", () => ({ CreateUserForm: () => <p>نموذج إنشاء الاختبار</p> }));
import { UsersWorkspace } from "./users-workspace";
const props = { users: [], total: 0, roles: [], units: [], canManageSubmissionScopes: true };
it("disables the creation button in server HTML until hydration is ready", () => {
  expect(renderToString(<UsersWorkspace {...props} />)).toMatch(/<button[^>]*disabled=""/);
});
it("opens the form after client hydration", () => {
  render(<UsersWorkspace {...props} />);
  fireEvent.click(screen.getByRole("button", { name: /^إنشاء حساب جديد$/ }));
  expect(screen.getByRole("dialog")).toHaveTextContent("نموذج إنشاء الاختبار");
});
