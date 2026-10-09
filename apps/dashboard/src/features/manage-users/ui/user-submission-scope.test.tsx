import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { UserSubmissionScope } from "./user-submission-scope";
const scope = { revision: 0, home_unit_id: null, rules: [], classes: [], units: [], councils: [{ id: "c1", name_ar: "مجلس الاختبار", status: "active", scope_unit_id: null, class_id: null }] };
afterEach(() => { vi.restoreAllMocks(); });
it("preserves selections on a failed save and reuses the receipt on retry", async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(scope)))
    .mockResolvedValueOnce(new Response(JSON.stringify({ message: "تعذر الحفظ مؤقتًا." }), { status: 503 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ saved: true, revision: 1 })));
  render(<UserSubmissionScope userId="user" />);
  await user.click(await screen.findByRole("checkbox", { name: "مجلس الاختبار" }));
  await user.click(screen.getByRole("button", { name: "حفظ جهة العمل والنطاق" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الحفظ");
  expect(screen.getByRole("checkbox", { name: "مجلس الاختبار" })).toBeChecked();
  await user.click(screen.getByRole("button", { name: "حفظ جهة العمل والنطاق" }));
  expect(await screen.findByRole("status")).toHaveTextContent("حُفظت");
  const first = JSON.parse(fetchMock.mock.calls[1][1]?.body as string);
  const retry = JSON.parse(fetchMock.mock.calls[2][1]?.body as string);
  expect(first.requestId).toBe(retry.requestId);
  expect(retry.rules).toEqual([{ kind: "council", target_id: "c1", include_descendants: false }]);
});
it("shows a safe local loading failure with a retry action", async () => {
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
  render(<UserSubmissionScope userId="user" />);
  expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل النطاق");
  expect(screen.getByRole("button", { name: "إعادة المحاولة" })).toBeVisible();
});
it("does not show archived councils as new selections", async () => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ ...scope, councils: [{ ...scope.councils[0], status: "archived" }] })));
  render(<UserSubmissionScope userId="user" />);
  await waitFor(() => expect(screen.queryByText("جارٍ تحميل جهة العمل والمجالس…")).not.toBeInTheDocument());
  expect(screen.queryByRole("checkbox", { name: "مجلس الاختبار" })).not.toBeInTheDocument();
});
it("disables the submitter role without clearing its selections",async()=>{
 const user=userEvent.setup();const rules=[{kind:"council",target_id:"c1",include_descendants:false}];
 const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response(JSON.stringify({...scope,revision:1,submission_enabled:true,rules}))).mockResolvedValueOnce(new Response(JSON.stringify({saved:true,revision:2,submission_enabled:false})));
 render(<UserSubmissionScope userId="user"/>);
 await user.click(await screen.findByRole("button",{name:"تعطيل دور المقدم"}));
 expect(await screen.findByRole("button",{name:"تفعيل دور المقدم"})).toBeEnabled();
 expect(screen.getByRole("checkbox",{name:"مجلس الاختبار"})).toBeChecked();
 expect(fetchMock.mock.calls[1][1]?.method).toBe("PATCH");
});
it("requires saving changed scope before changing the submitter role",async()=>{
 const user=userEvent.setup();vi.spyOn(globalThis,"fetch").mockResolvedValue(new Response(JSON.stringify({...scope,revision:1,submission_enabled:true})));
 render(<UserSubmissionScope userId="user"/>);
 await user.click(await screen.findByRole("checkbox",{name:"مجلس الاختبار"}));
 expect(screen.getByRole("button",{name:"تعطيل دور المقدم"})).toBeDisabled();
 expect(screen.getByText("احفظ تعديلات النطاق أو أعد تحميله قبل تغيير حالة الدور.")).toBeVisible();
});
it("asks inline before discarding unsaved selections after a failure",async()=>{
 const user=userEvent.setup();vi.spyOn(globalThis,"fetch").mockResolvedValueOnce(new Response(JSON.stringify(scope))).mockResolvedValueOnce(new Response(JSON.stringify({message:"تعذر حفظ النطاق"}),{status:503}));
 render(<UserSubmissionScope userId="user"/>);
 await user.click(await screen.findByRole("checkbox",{name:"مجلس الاختبار"}));
 await user.click(screen.getByRole("button",{name:"حفظ جهة العمل والنطاق"}));
 await user.click(await screen.findByRole("button",{name:"إعادة تحميل النطاق"}));
 expect(screen.getByRole("group",{name:"تأكيد إعادة تحميل النطاق"})).toBeVisible();
 await user.click(screen.getByRole("button",{name:"إبقاء الاختيارات"}));
 expect(screen.getByRole("checkbox",{name:"مجلس الاختبار"})).toBeChecked();
});
