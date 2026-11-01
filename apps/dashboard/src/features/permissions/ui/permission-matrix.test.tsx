import { afterEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { PermissionMatrix } from "./permission-matrix";
const roles = [
  {
    id: "r1",
    code: "council_member",
    name_ar: "عضو المجلس",
    role_scope: "governance_unit",
    permission_count: 1,
  },
];
const permissions = [
  {
    id: "p1",
    code: "meetings.read",
    name_ar: "عرض الاجتماعات",
    module: "meetings",
    context_scope: "governance_unit",
  },
  {
    id: "p2",
    code: "topics.read",
    name_ar: "عرض الموضوعات",
    module: "topics",
    context_scope: "governance_unit",
  },
];
const access = { canManageRoles: true, canManagePermissions: true };
function mockFetch(fail = false) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options) => {
      const operation = options?.body ? JSON.parse(options.body).operation : "";
      return new Response(
        JSON.stringify(
          fail
            ? { message: "تعذر قراءة الدور" }
            : operation === "roleDetail"
              ? { ...roles[0], permissions: [permissions[0]] }
              : "new-id",
        ),
        { status: fail ? 500 : 200 },
      );
    }),
  );
}
afterEach(() => vi.unstubAllGlobals());
it("offers direct saving to the system administrator without an approval request", async () => {
  mockFetch();
  render(<PermissionMatrix roles={roles} permissions={permissions} {...access} />);
  await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ });
  fireEvent.click(screen.getByRole("heading", { name: /الموضوعات/ }).querySelector("button")!);
  fireEvent.click(screen.getByRole("checkbox", { name: /عرض الموضوعات/ }));
  fireEvent.click(screen.getByRole("button", { name: "مراجعة التغييرات" }));
  expect(screen.getByRole("button", { name: "حفظ الصلاحيات" })).toBeEnabled();
  expect(screen.queryByRole("button", { name: "إرسال طلب التغيير" })).not.toBeInTheDocument();
});
it("does not mistake loaded permissions for unsaved edits while another role loads", async () => {
  mockFetch();
  render(
    <PermissionMatrix
      roles={[...roles, { ...roles[0], id: "r2", name_ar: "مقرر المجلس" }]}
      permissions={permissions}
      {...access}
    />,
  );
  await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ });
  vi.mocked(fetch).mockImplementationOnce(() => new Promise(() => {}));
  fireEvent.click(screen.getByRole("button", { name: /مقرر المجلس/ }));
  await screen.findByRole("status");
  fireEvent.click(screen.getByRole("button", { name: /عضو المجلس/ }));
  expect(
    screen.queryByRole("button", { name: "متابعة التعديل" }),
  ).not.toBeInTheDocument();
  await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ });
});
it("offers grouped Arabic capabilities without technical creation or codes", async () => {
  mockFetch();
  render(
    <PermissionMatrix roles={roles} permissions={permissions} {...access} />,
  );
  await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ });
  expect(
    screen.queryByText(/meetings.read|council_member/),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "إنشاء صلاحية" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "الاجتماعات" }),
  ).toBeInTheDocument();
});
it("creates a role using only administrative fields", async () => {
  mockFetch();
  render(
    <PermissionMatrix roles={roles} permissions={permissions} {...access} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "إضافة دور" }));
  expect(
    screen.queryByLabelText(/رمز|الموديول|بالإنجليزية/),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("اسم الدور"), {
    target: { value: "منسق الاجتماعات" },
  });
  fireEvent.click(screen.getByRole("button", { name: "حفظ بيانات الدور" }));
  await screen.findByText(/تم حفظ بيانات الدور/);
  const call = vi
    .mocked(fetch)
    .mock.calls.find(
      ([, options]) =>
        JSON.parse(options?.body as string).operation === "upsertRole",
    );
  expect(JSON.parse(call?.[1]?.body as string).payload).not.toHaveProperty(
    "p_code",
  );
});
it("shows added and removed capabilities before submitting approval", async () => {
  mockFetch();
  render(
    <PermissionMatrix roles={roles} permissions={permissions} {...access} />,
  );
  await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ });
  fireEvent.click(
    screen.getByRole("heading", { name: /الموضوعات/ }).querySelector("button")!,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /عرض الموضوعات/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: /عرض الاجتماعات/ }));
  fireEvent.click(screen.getByRole("button", { name: "مراجعة التغييرات" }));
  expect(
    screen.getByRole("heading", { name: "صلاحيات ستُضاف" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "صلاحيات ستُسحب" }),
  ).toBeInTheDocument();
});
it("does not render stale editable data when reading fails", async () => {
  mockFetch(true);
  render(<PermissionMatrix roles={roles} permissions={permissions} />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "إعادة المحاولة" }),
  ).toBeInTheDocument();
});
it("keeps readers read-only without showing administrative actions", async () => {
  mockFetch();
  render(<PermissionMatrix roles={roles} permissions={permissions} />);
  expect(
    await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "إضافة دور" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "مراجعة التغييرات" }),
  ).not.toBeInTheDocument();
});
it("protects unsaved choices when changing roles", async () => {
  mockFetch();
  render(
    <PermissionMatrix
      roles={[...roles, { ...roles[0], id: "r2", name_ar: "مقرر المجلس" }]}
      permissions={permissions}
      {...access}
    />,
  );
  await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ });
  fireEvent.click(
    screen.getByRole("heading", { name: /الموضوعات/ }).querySelector("button")!,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /عرض الموضوعات/ }));
  fireEvent.click(screen.getByRole("button", { name: /مقرر المجلس/ }));
  expect(
    screen.getByRole("button", { name: "متابعة التعديل" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /عرض الموضوعات/ })).toBeChecked();
});
it("preserves selections and reason and blocks repeat submission on server failure", async () => {
  mockFetch();
  render(
    <PermissionMatrix roles={roles} permissions={permissions} {...access} />,
  );
  await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ });
  fireEvent.click(
    screen.getByRole("heading", { name: /الموضوعات/ }).querySelector("button")!,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /عرض الموضوعات/ }));
  fireEvent.click(screen.getByRole("button", { name: "مراجعة التغييرات" }));
  fireEvent.change(screen.getByLabelText("سبب التغيير"), {
    target: { value: "توسيع الاطلاع داخل المجلس" },
  });
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ message: "تعذر حفظ الطلب" }), {
      status: 503,
    }),
  );
  fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر حفظ الطلب");
  expect(screen.getByLabelText("سبب التغيير")).toHaveValue(
    "توسيع الاطلاع داخل المجلس",
  );
  expect(
    screen.getByRole("button", { name: "حفظ الصلاحيات" }),
  ).toBeDisabled();
});
it("saves permissions directly and updates the applied selections from a verified receipt", async () => {
  mockFetch();
  render(
    <PermissionMatrix roles={roles} permissions={permissions} {...access} />,
  );
  await screen.findByRole("checkbox", { name: /عرض الاجتماعات/ });
  fireEvent.click(
    screen.getByRole("heading", { name: /الموضوعات/ }).querySelector("button")!,
  );
  fireEvent.click(screen.getByRole("checkbox", { name: /عرض الموضوعات/ }));
  fireEvent.click(screen.getByRole("button", { name: "مراجعة التغييرات" }));
  fireEvent.change(screen.getByLabelText("سبب التغيير"), {
    target: { value: "عرض الموضوعات" },
  });
  vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ saved: true, role_id: "r1", permission_codes: ["meetings.read", "topics.read"] })));
  fireEvent.click(screen.getByRole("button", { name: "حفظ الصلاحيات" }));
  await screen.findByText("تم حفظ الصلاحيات وتطبيقها مباشرة.");
  expect(
    screen.getByRole("checkbox", { name: /عرض الموضوعات/ }),
  ).toBeChecked();
  const lastBody = JSON.parse(vi.mocked(fetch).mock.calls.at(-1)![1]!.body as string);
  expect(lastBody.operation).toBe("saveRolePermissions");
  expect(lastBody.payload.p_expected_permission_codes).toEqual(["meetings.read"]);
  expect(lastBody.payload.p_request_id).toEqual(expect.any(String));
});
