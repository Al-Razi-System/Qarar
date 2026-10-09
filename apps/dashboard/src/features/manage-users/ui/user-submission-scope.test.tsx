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
