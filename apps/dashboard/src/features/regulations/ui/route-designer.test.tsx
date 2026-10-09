import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RouteDesigner } from "./route-designer";
import { suggestRouteName } from "../model/route-designer";

const data = { items: [], councils: [{ id: "c1", name_ar: "مجلس القسم", status: "inactive" }], classes: [{ id: "g1", name_ar: "مجلس كلية" }] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("RouteDesigner", () => {
  it("omits unresolved stages and bounds the suggested display name", () => {
    expect(suggestRouteName([{ key: "s1", target_kind: "class", target_id: "" }], data)).toBe("");
    expect(suggestRouteName([{ key: "s1", target_kind: "class", target_id: "g1" }, { key: "s2", target_kind: "council", target_id: "missing" }], data)).toBe("مسار مجلس كلية");
    expect(suggestRouteName([{ key: "s1", target_kind: "class", target_id: "long" }], { councils: [], classes: [{ id: "long", name_ar: "مجلس ".repeat(100) }] })).toHaveLength(300);
  });
  it("suggests a name from ordered stages while preserving manual customization", async () => {
    const user = userEvent.setup();
    render(<RouteDesigner initialData={data} />);
    await user.click(screen.getByRole("button", { name: "إنشاء مسار" }));
    const name = screen.getByLabelText("اسم المسار");
    await user.selectOptions(screen.getByLabelText("جهة المرحلة 1"), "g1");
    expect(name).toHaveValue("مسار مجلس كلية");
    await user.click(screen.getByRole("button", { name: "إضافة مرحلة" }));
    await user.selectOptions(screen.getByLabelText("تحديد الجهة للمرحلة 2"), "council");
    await user.selectOptions(screen.getByLabelText("جهة المرحلة 2"), "c1");
    expect(name).toHaveValue("مسار مجلس كلية ← مجلس القسم");
    await user.click(screen.getByRole("button", { name: "رفع المرحلة 2" }));
    expect(name).toHaveValue("مسار مجلس القسم ← مجلس كلية");
    await user.clear(name);
    await user.type(name, "مسار مخصص");
    await user.click(screen.getByRole("button", { name: "حذف المرحلة 2" }));
    expect(name).toHaveValue("مسار مخصص");
    await user.click(screen.getByRole("button", { name: "استخدام الاسم التلقائي" }));
    expect(name).toHaveValue("مسار مجلس القسم");
  });
  it("preserves a saved name when its stages change", async () => {
    const record = { id: "r1", name_ar: "اسم سابق", revision: "1", version_id: "v1", version_status: "draft" as const, validation_errors: [], payload: { name_ar: "اسم سابق", description: "", steps: [{ key: "s1", target_kind: "class" as const, target_id: "g1" }] } };
    render(<RouteDesigner initialData={{ ...data, items: [record] }} />);
    await userEvent.click(screen.getByRole("button", { name: /اسم سابق/ }));
    await userEvent.selectOptions(screen.getByLabelText("تحديد الجهة للمرحلة 1"), "council");
    await userEvent.selectOptions(screen.getByLabelText("جهة المرحلة 1"), "c1");
    expect(screen.getByLabelText("اسم المسار")).toHaveValue("اسم سابق");
  });
  it("authors routes without identifiers or forcing councils active", async () => {
    render(<RouteDesigner initialData={data} />);
    await userEvent.click(screen.getByRole("button", { name: "إنشاء مسار" }));
    expect(screen.queryByLabelText(/رمز المسار|معرف المسار/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("تحديد الجهة للمرحلة 1"), "council");
    expect(screen.getByRole("option", { name: /مجلس القسم.*غير نشط/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: "تنشيط المسار" })).toBeDisabled();
  });
  it("keeps input and the same request key after server failure", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: { message: "تعذر الحفظ مؤقتًا." } }) });
    vi.stubGlobal("fetch", fetcher);
    render(<RouteDesigner initialData={data} />);
    await userEvent.click(screen.getByRole("button", { name: "إنشاء مسار" }));
    await userEvent.type(screen.getByLabelText("اسم المسار"), "مسار أكاديمي");
    await userEvent.selectOptions(screen.getByLabelText("جهة المرحلة 1"), "g1");
    await userEvent.click(screen.getByRole("button", { name: "حفظ المسودة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر الحفظ مؤقتًا.");
    expect(screen.getByLabelText("اسم المسار")).toHaveValue("مسار أكاديمي");
    await userEvent.click(screen.getByRole("button", { name: "حفظ المسودة" }));
    expect(JSON.parse(fetcher.mock.calls[0][1].body).params.p_client_request_id).toBe(JSON.parse(fetcher.mock.calls[1][1].body).params.p_client_request_id);
  });
  it("only defines council order; policies and referral are not owned by the route", async () => {
    render(<RouteDesigner initialData={data} />);
    await userEvent.click(screen.getByRole("button", { name: "إنشاء مسار" }));
    await userEvent.click(screen.getByRole("button", { name: "إضافة مرحلة" }));
    expect(screen.queryByLabelText(/عند القبول|عند الرفض|الإحالة من|عمل المجلس/)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/جهة المرحلة/)).toHaveLength(2);
  });
});
