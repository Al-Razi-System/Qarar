import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Policy } from "../model/types";
import { LegislativeModelWorkspace } from "./legislative-model-workspace";

const policy: Policy = {
  id: "policy-1",
  code: "department-councils-regulation",
  name_ar: "لائحة مجالس الأقسام",
  policy_type: "regulation",
  status: "active",
  updated_at: "2026-08-06T00:00:00Z",
  versions: [{
    id: "version-1",
    version_no: 1,
    version_label: "1.0",
    legal_status: "draft",
    automation_status: "not_configured",
    automation_readiness_pct: 0,
    items: [],
    scopes: [],
  }],
};

function response(data: unknown) {
  return Promise.resolve(new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  }));
}

afterEach(() => vi.restoreAllMocks());

describe("LegislativeModelWorkspace", () => {
  it("يعرض النص الرسمي والقواعد والإحالات وفحص الجاهزية", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.contract === "admin_get_policy_legislative_model") return response({
        ...policy.versions![0],
        items: [{
          id: "item-1",
          policy_version_id: "version-1",
          item_code: "33",
          item_type: "article",
          title_ar: "تشكيل مجلس القسم",
          body_text: "ينشأ في كل قسم أكاديمي مجلس.",
          official_text: "ينشأ في كل قسم أكاديمي مجلس.",
          sort_order: 1,
          governance_mode: "regulation_required",
          match_criteria: {},
          is_active: true,
          rules: [],
          references: [],
        }],
      });
      if (body.contract === "admin_list_workflow_templates") return response({ items: [] });
      return response({ items: [] });
    });

    render(<LegislativeModelWorkspace policy={policy}/>);
    expect(await screen.findByText("النموذج التشريعي التنفيذي")).toBeInTheDocument();
    expect(await screen.findByText("33 · تشكيل مجلس القسم")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("ينشأ في كل قسم أكاديمي مجلس.")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "2. ماذا تنفذ المادة؟" }));
    await waitFor(() => expect(screen.getByText("لا توجد قواعد تنفيذية لهذه المادة.")).toBeInTheDocument());

    await userEvent.click(screen.getByRole("tab", { name: "العلاقات القانونية" }));
    expect(screen.getByText(/الإحالة هنا علاقة بين نصوص قانونية/)).toBeInTheDocument();
    expect(screen.getByText("لا توجد إحالات مسجلة.")).toBeInTheDocument();
  });

  it("يعرض أسباب الحالات الفارغة بدل المساحات البيضاء", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.contract === "admin_get_policy_legislative_model") return response({
        ...policy.versions![0],
        source_document_hash: null,
        items: [],
        scopes: [],
      });
      if (body.contract === "admin_list_workflow_templates") return response({ items: [] });
      return response({ items: [] });
    });

    const view = render(<LegislativeModelWorkspace policy={policy}/>);
    const workspace = within(view.container);
    expect(await workspace.findByText("لم يُضف محتوى تشريعي بعد")).toBeInTheDocument();

    await userEvent.click(workspace.getByRole("tab", { name: "2. ماذا تنفذ المادة؟" }));
    expect(workspace.getByText("لا يمكن إنشاء قاعدة قبل إضافة مادة")).toBeInTheDocument();

    await userEvent.click(workspace.getByRole("tab", { name: "العلاقات القانونية" }));
    expect(workspace.getByText("لا توجد مادة لربط الإحالات بها")).toBeInTheDocument();

    await userEvent.click(workspace.getByRole("tab", { name: "هل الإصدار جاهز؟" }));
    expect(workspace.getByText("الاعتماد قرار مستخدم مخوّل بعد الفحص")).toBeInTheDocument();
    expect(workspace.getByText("الفحص متاح ولا توجد نتيجة محفوظة بعد")).toBeInTheDocument();

    await userEvent.click(workspace.getByRole("tab", { name: "ما الذي تغيّر؟" }));
    expect(workspace.getByText("لا يوجد إصدار سابق للمقارنة")).toBeInTheDocument();
  });

  it("يتضمن ترحيل محرك القواعد جميع الكيانات والعقود الحرجة", () => {
    const migration = readFileSync(join(process.cwd(), "../../supabase/migrations/20260806010000_legislative_rules_engine.sql"), "utf8");
    for (const table of ["policy_rules", "rule_conditions", "rule_requirements", "rule_authorities", "rule_actions", "rule_workflow_bindings", "policy_references"]) {
      expect(migration).toContain(`qarar_governance.${table}`);
    }
    expect(migration).toContain("admin_validate_policy_version_readiness");
    expect(migration).toContain("admin_compare_policy_versions");
    expect(migration).toContain("admin_get_policy_legislative_model");
  });
});
