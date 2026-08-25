import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Policy } from "../../model/types";
import { PolicyAuthoringWorkspace } from "./policy-authoring-workspace";

const ids = {
  version: "11111111-1111-4111-8111-111111111111",
  item: "22222222-2222-4222-8222-222222222222",
  category: "33333333-3333-4333-8333-333333333333",
  unit: "44444444-4444-4444-8444-444444444444",
  unitClass: "55555555-5555-4555-8555-555555555555",
  unitType: "66666666-6666-4666-8666-666666666666",
};

const policy: Policy = {
  id: "77777777-7777-4777-8777-777777777777",
  code: "REG-1",
  name_ar: "لائحة الاختبار",
  policy_type: "regulation",
  status: "active",
  updated_at: "2026-08-23T00:00:00Z",
  versions: [{
    id: ids.version, version_no: 1, version_label: "1.0", legal_status: "draft", automation_status: "not_configured", scopes: [],
    items: [{ id: ids.item, policy_version_id: ids.version, item_code: "A-1", item_type: "article", title_ar: "المادة الأولى", body_text: "نص المادة", official_text: "نص المادة", sort_order: 10, governance_mode: "regulation_required", match_criteria: {}, is_active: true }],
  }],
};

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ data }), { status: 200, headers: { "Content-Type": "application/json" } }));
}

function installApiMock(contracts: string[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { contract: string };
    contracts.push(body.contract);
    if (body.contract === "admin_list_governance_units") return response({ items: [{ id: ids.unit, code: "UNIT", name_ar: "مجلس كلية الحاسوب" }] });
    if (body.contract === "admin_list_governance_unit_classes") return response({ items: [{ id: ids.unitClass, code: "DEPT", name_ar: "مجالس الأقسام" }] });
    if (body.contract === "admin_list_governance_unit_types") return response({ items: [{ id: ids.unitType, code: "COUNCIL", name_ar: "مجلس" }] });
    if (body.contract === "admin_list_topic_categories") return response({ items: [{ id: ids.category, code: "ACADEMIC", name_ar: "أكاديمي" }] });
    if (body.contract === "get_policy_form_options") return response({ users: [], governance_levels: [{ value: "department", label: "قسم" }] });
    if (body.contract === "admin_get_policy_detail") return response(policy);
    return response({ id: "88888888-8888-4888-8888-888888888888" });
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("PolicyAuthoringWorkspace", () => {
  it("updates an item through content, move, and legal-text contracts", async () => {
    const contracts: string[] = [];
    const user = userEvent.setup();
    installApiMock(contracts);
    render(<PolicyAuthoringWorkspace policy={policy} onPolicyChange={vi.fn()} />);
    await screen.findByText("هيكل الإصدار ومحتواه");
    await user.click(screen.getByRole("button", { name: "تعديل المادة الأولى" }));
    const title = await screen.findByLabelText(/العنوان/);
    await user.clear(title);
    await user.type(title, "المادة الأولى المعدلة");
    await user.click(screen.getByRole("button", { name: "حفظ التعديلات" }));
    await waitFor(() => expect(contracts).toEqual(expect.arrayContaining([
      "admin_update_policy_item",
      "admin_move_policy_item",
      "admin_update_policy_item_legal_text",
      "admin_get_policy_detail",
    ])));
  });

  it("creates a class-wide scope instead of repeating every council", async () => {
    const contracts: string[] = [];
    const user = userEvent.setup();
    installApiMock(contracts);
    render(<PolicyAuthoringWorkspace policy={policy} onPolicyChange={vi.fn()} />);
    await screen.findByText("هيكل الإصدار ومحتواه");
    await user.click(screen.getByRole("tab", { name: /نطاق التطبيق/ }));
    await user.click(screen.getByRole("button", { name: "إضافة أول نطاق" }));
    await user.selectOptions(await screen.findByLabelText(/نوع النطاق/), "governance_class");
    await user.selectOptions(await screen.findByLabelText(/تصنيف المجالس/), ids.unitClass);
    await user.click(screen.getByRole("button", { name: "إضافة النطاق" }));
    await waitFor(() => expect(contracts).toContain("admin_set_policy_scope"));
  });
});
