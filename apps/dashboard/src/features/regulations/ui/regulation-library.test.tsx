import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Policy } from "../model/types";
import { RegulationLibrary } from "./regulation-library";

const records: Policy[] = [
  { id: "one", code: "REG-1", name_ar: "اللائحة الأكاديمية", policy_type: "regulation", status: "active", updated_at: "2026-10-07", version_count: 2 },
  { id: "two", code: "REG-2", name_ar: "اللائحة المالية", policy_type: "regulation", status: "active", updated_at: "2026-10-07" },
];
const detail: Policy = { ...records[0], versions: [
  { id: "v2", version_no: 2, legal_status: "draft", automation_status: "not_configured", scopes: [], items: [
    { id: "a", policy_version_id: "v2", item_code: "ART-2", item_type: "article", title_ar: "قبول الطلاب", official_text: "النص الرسمي للقبول.", interpretation_text: "تفسير المصدر", sort_order: 1, governance_mode: "regulation_required", match_criteria: {}, is_active: true },
  ] },
  { id: "v1", version_no: 1, legal_status: "effective", automation_status: "ready", scopes: [], items: [
    { id: "b", policy_version_id: "v1", item_code: "ART-1", item_type: "clause", title_ar: "البند السابق", body_text: "نص الإصدار السابق", sort_order: 1, governance_mode: "regulation_required", match_criteria: {}, is_active: true },
  ] },
] };
const envelope = (policy: Policy) => ({ policy, revision: "rev-1", capabilities: { can_manage: true, can_approve: true }, editable_version_ids: ["v2"], approvable_version_ids: [] });
function respond(data: unknown, ok = true) { return { ok, json: async () => ok ? { data: (data as Policy)?.id ? envelope(data as Policy) : data } : { error: { message: "تعذر تحميل البيانات." } } }; }
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("RegulationLibrary", () => {
  it("activates only the selected item inside its header, without a whole-text publication button", async () => {
    const draft = { ...detail, versions: [{ ...detail.versions![0], library_mode: true }] };
    const fetcher = vi.fn().mockResolvedValue(respond({ ...envelope(draft), selected_version_id: "v2" }));
    vi.stubGlobal("fetch", fetcher);
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} initialDetail={{ ...envelope(draft), capabilities: { can_manage: true, can_approve: false } }} />);
    expect(screen.queryByRole("button", { name: "إرسال للمراجعة" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تنشيط النص" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "تنشيط البند" }));
    await userEvent.click(screen.getByRole("button", { name: "تأكيد التنشيط" }));
    await waitFor(() => expect(JSON.parse(fetcher.mock.calls[0][1].body).params).toMatchObject({ p_action: "set_item_publication", p_payload: { version_id: "v2", item_id: "a", is_active: true } }));
  });
  it("toggles a current item directly and retains a failed operation in its dialog", async () => {
    const source = { ...detail, versions: [{ ...detail.versions![1], library_mode: true }] };
    const fetcher = vi.fn().mockResolvedValue(respond(null, false));
    vi.stubGlobal("fetch", fetcher);
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} initialDetail={{ ...envelope(source), direct_activation_version_ids: ["v1"] }} />);
    await userEvent.click(screen.getByRole("button", { name: "تعطيل البند" }));
    await userEvent.click(screen.getByRole("button", { name: "تأكيد التعطيل" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل البيانات.");
    expect(screen.getByRole("dialog")).toContainElement(screen.getByRole("alert"));
    expect(JSON.parse(fetcher.mock.calls[0][1].body).params).toMatchObject({ p_action: "set_item_publication", p_payload: { version_id: "v1", item_id: "b", is_active: false } });
  });
  it("opens an old queued library draft for direct activation, without starting another review", async () => {
    const queued = { ...detail, versions: [{ ...detail.versions![0], legal_status: "under_review" as const, library_mode: true }, detail.versions![1]] };
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} initialDetail={{ ...envelope(queued), editable_version_ids: [], direct_activation_version_ids: ["v2"] }} />);
    await userEvent.click(screen.getByRole("button", { name: "فتح التعديل المحفوظ" }));
    expect(screen.getByRole("button", { name: "تنشيط البند" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "اعتماد النص" })).not.toBeInTheDocument();
  });
  it("reads legal text without displaying workflow or topic requirement controls", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(detail)));
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} />);
    await userEvent.click(screen.getByRole("button", { name: /اللائحة الأكاديمية/ }));
    expect(await screen.findByText("نص الإصدار السابق")).toBeInTheDocument();
    expect(screen.getByLabelText("النسخ المحفوظة")).not.toBeVisible();
    expect(screen.queryByText("شروط المطابقة")).not.toBeInTheDocument();
    expect(screen.queryByText("مسار الاعتماد")).not.toBeInTheDocument();
    expect(screen.queryByText("يتطلب مرفقًا")).not.toBeInTheDocument();
    await userEvent.click(screen.getByText("النسخ السابقة والتعديلات"));
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "النسخ المحفوظة" }), "v2");
    expect(screen.getByText("النص الرسمي للقبول.")).toBeInTheDocument();
    expect(screen.getByText("مسودة تعديل")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "العودة للنص الحالي" }));
    expect(screen.getByText("نص الإصدار السابق")).toBeInTheDocument();
  });
  it("searches on the server and can navigate beyond the first page", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({ items: records, total: 65 }));
    vi.stubGlobal("fetch", fetcher);
    render(<RegulationLibrary initialPolicies={records} initialTotal={65} />);
    await userEvent.click(screen.getByRole("button", { name: "التالي" }));
    await waitFor(() => expect(JSON.parse(fetcher.mock.calls[0][1].body).params.p_offset).toBe(30));
    await userEvent.type(screen.getByLabelText("البحث في اللوائح"), "مالية");
    await userEvent.click(screen.getByRole("button", { name: "بحث" }));
    await waitFor(() => expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body).params).toMatchObject({ p_query: "مالية", p_offset: 0 }));
  });
  it("shows a read error at the reader and supports retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(respond(null, false)).mockResolvedValueOnce(respond(detail)));
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} />);
    await userEvent.click(screen.getByRole("button", { name: /اللائحة الأكاديمية/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل البيانات.");
    await userEvent.click(screen.getByRole("button", { name: "إعادة تحميل اللائحة" }));
    expect(await screen.findByText("نص الإصدار السابق")).toBeInTheDocument();
  });
  it("retries the failed search at its requested offset instead of the previous page", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(respond({ items: records, total: 65 })).mockResolvedValueOnce(respond(null, false)).mockResolvedValueOnce(respond({ items: [], total: 0 }));
    vi.stubGlobal("fetch", fetcher);
    render(<RegulationLibrary initialPolicies={records} initialTotal={65} />);
    await userEvent.click(screen.getByRole("button", { name: "التالي" }));
    await userEvent.type(screen.getByLabelText("البحث في اللوائح"), "غير موجودة");
    await userEvent.click(screen.getByRole("button", { name: "بحث" }));
    await userEvent.click(await screen.findByRole("button", { name: "إعادة تحميل القائمة" }));
    await waitFor(() => expect(JSON.parse(fetcher.mock.calls.at(-1)![1].body).params).toMatchObject({ p_query: "غير موجودة", p_offset: 0 }));
  });
  it("never shows a late response under the next selected policy", async () => {
    let resolveFirst!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockReturnValueOnce(new Promise((resolve) => { resolveFirst = resolve; })).mockResolvedValueOnce(respond({ ...records[1], versions: [] })));
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} />);
    await userEvent.click(screen.getByRole("button", { name: /اللائحة الأكاديمية/ }));
    await userEvent.click(screen.getByRole("button", { name: /اللائحة المالية/ }));
    expect(await screen.findByText("لم يُضف نص لهذه اللائحة بعد.")).toBeInTheDocument();
    resolveFirst(respond(detail));
    await waitFor(() => expect(screen.queryByText("النص الرسمي للقبول.")).not.toBeInTheDocument());
  });
  it("creates from an empty library without exposing codes or versions", async () => {
    const fetcher = vi.fn().mockResolvedValue(respond({ ...envelope(detail), selected_version_id: "v2" }));
    vi.stubGlobal("fetch", fetcher);
    render(<RegulationLibrary initialPolicies={[]} initialTotal={0} initialCanManage />);
    expect(screen.getByText("لا توجد لوائح في هذه القائمة.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "إضافة لائحة" }));
    await userEvent.type(screen.getByLabelText("اسم اللائحة"), "اللائحة الأكاديمية");
    expect(screen.queryByLabelText("رمز اللائحة")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "حفظ اللائحة" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalled());
    expect(JSON.parse(fetcher.mock.calls[0][1].body).params).toMatchObject({ p_action: "create", p_policy_id: null, p_payload: { name_ar: "اللائحة الأكاديمية" }, p_expected_revision: null });
    expect(await screen.findByText("تم حفظ اللائحة.")).toBeInTheDocument();
  });
  it("keeps save failures in the dialog and keeps input for retry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(null, false)));
    render(<RegulationLibrary initialPolicies={[]} initialTotal={0} initialCanManage />);
    await userEvent.click(screen.getByRole("button", { name: "إضافة لائحة" }));
    await userEvent.type(screen.getByLabelText("اسم اللائحة"), "لائحة جديدة");
    await userEvent.click(screen.getByRole("button", { name: "حفظ اللائحة" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("تعذر تحميل البيانات.");
    expect(screen.getByRole("dialog")).toContainElement(screen.getByRole("alert"));
    expect(screen.getByLabelText("اسم اللائحة")).toHaveValue("لائحة جديدة");
  });
  it("does not require a version choice for a single draft", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond({ ...detail, versions: [detail.versions![0]] })));
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} />);
    await userEvent.click(screen.getByRole("button", { name: /اللائحة الأكاديمية/ }));
    expect(await screen.findByText("النص الرسمي للقبول.")).toBeInTheDocument();
    expect(screen.getByText("مسودة اللائحة")).toBeInTheDocument();
    expect(screen.queryByText("النسخ السابقة والتعديلات")).not.toBeInTheDocument();
  });
  it("edits text and source in one command without exposing workflow fields", async () => {
    const draft = { ...detail, versions: [detail.versions![0]] };
    const fetcher = vi.fn().mockResolvedValue(respond(draft));
    vi.stubGlobal("fetch", fetcher);
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} initialCanManage initialDetail={envelope(draft)} />);
    await userEvent.click(screen.getByRole("button", { name: "تعديل البند" }));
    await userEvent.clear(screen.getByLabelText("النص النظامي"));
    await userEvent.type(screen.getByLabelText("النص النظامي"), "نص جديد محفوظ");
    await userEvent.click(screen.getByText("تنظيم النص وبيانات المصدر · اختياري"));
    await userEvent.type(screen.getByLabelText("موضع النص في المصدر"), "المادة الأولى");
    expect(screen.queryByLabelText("يتطلب مرفقًا")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "حفظ البند" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    expect(JSON.parse(fetcher.mock.calls[0][1].body).params).toMatchObject({ p_action: "save_item", p_payload: { item_id: "a", version_id: "v2", body_text: "نص جديد محفوظ", source_locator: "المادة الأولى" }, p_expected_revision: "rev-1" });
  });
  it("does not offer mutations to a read-only contextual role", () => {
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} initialDetail={{ ...envelope(detail), capabilities: { can_manage: false, can_approve: false }, editable_version_ids: [] }} />);
    expect(screen.queryByRole("button", { name: "إضافة لائحة" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "إضافة بند" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تعديل البند" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تعطيل البند" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تنشيط النص" })).not.toBeInTheDocument();
  });
  it("reuses the same request key after an uncertain failure", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(respond(null, false)).mockResolvedValueOnce(respond({ ...envelope(detail), selected_version_id: "v2" }));
    vi.stubGlobal("fetch", fetcher);
    render(<RegulationLibrary initialPolicies={[]} initialTotal={0} initialCanManage />);
    await userEvent.click(screen.getByRole("button", { name: "إضافة لائحة" }));
    await userEvent.type(screen.getByLabelText("اسم اللائحة"), "لائحة جديدة");
    await userEvent.click(screen.getByRole("button", { name: "حفظ اللائحة" }));
    await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "حفظ اللائحة" }));
    await screen.findByText("تم حفظ اللائحة.");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).params.p_client_request_id).toBe(JSON.parse(fetcher.mock.calls[1][1].body).params.p_client_request_id);
  });
  it("reloads a conflict inside the dialog without losing the user's text", async () => {
    const draft = { ...detail, versions: [detail.versions![0]] };
    const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, json: async () => ({ error: { code: "PT409", message: "يوجد تعديل أحدث على اللائحة." } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ data: { ...envelope(draft), revision: "rev-2" } }) })
      .mockResolvedValueOnce(respond(draft));
    vi.stubGlobal("fetch", fetcher);
    render(<RegulationLibrary initialPolicies={records} initialTotal={2} initialCanManage initialDetail={envelope(draft)} />);
    await userEvent.click(screen.getByRole("button", { name: "تعديل البند" }));
    await userEvent.clear(screen.getByLabelText("النص النظامي"));
    await userEvent.type(screen.getByLabelText("النص النظامي"), "مدخلاتي محفوظة");
    await userEvent.click(screen.getByRole("button", { name: "حفظ البند" }));
    await userEvent.click(await screen.findByRole("button", { name: "تحميل التعديل الأحدث مع الاحتفاظ بمدخلاتي" }));
    expect(screen.getByLabelText("النص النظامي")).toHaveValue("مدخلاتي محفوظة");
    await userEvent.click(screen.getByRole("button", { name: "حفظ البند" }));
    await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(3));
    expect(JSON.parse(fetcher.mock.calls[2][1].body).params).toMatchObject({ p_expected_revision: "rev-2", p_payload: { body_text: "مدخلاتي محفوظة" } });
  });
});
