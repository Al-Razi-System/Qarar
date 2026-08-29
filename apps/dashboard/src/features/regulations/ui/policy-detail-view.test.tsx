import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Policy } from "../model/types";

vi.mock("./policy-management-workspace", () => ({
  PolicyManagementWorkspace: () => <div>مساحة التحرير التجريبية</div>,
}));
vi.mock("./authoring/policy-authoring-workspace", () => ({
  PolicyAuthoringWorkspace: () => <div>مساحة التأليف الجديدة</div>,
}));
vi.mock("./legislative-model-workspace", () => ({
  LegislativeModelWorkspace: () => <div>مساحة القواعد التجريبية</div>,
}));
vi.mock("./council-rule-presets", () => ({
  CouncilRulePresets: () => <div>قواعد الاجتماعات التجريبية</div>,
}));
vi.mock("./approval-chain", () => ({
  ApprovalChain: () => <div>رحلة الاعتماد التجريبية</div>,
}));

import { PolicyDetailView } from "./policy-detail-view";

const policy: Policy = {
  id: "policy-1",
  code: "REG-1",
  name_ar: "لائحة الاختبار",
  policy_type: "regulation",
  status: "active",
  updated_at: "2026-08-23T00:00:00Z",
  versions: [
    {
      id: "version-1",
      version_no: 1,
      legal_status: "draft",
      automation_status: "not_configured",
      items: [
        {
          id: "article-1",
          policy_version_id: "version-1",
          item_code: "1",
          item_type: "article",
          title_ar: "المادة الأولى",
          official_text: "النص الرسمي للمادة.",
          sort_order: 1,
          governance_mode: "regulation_required",
          match_criteria: {},
          is_active: true,
        },
      ],
      scopes: [],
    },
  ],
};

afterEach(cleanup);

describe("PolicyDetailView", () => {
  it("opens content by default and keeps specialized operations reachable", async () => {
    window.history.replaceState({}, "", "/admin/regulations/policy-1");
    render(<PolicyDetailView policy={policy} />);

    expect(screen.getByText("مستكشف المحتوى النظامي")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /المحتوى/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.click(screen.getByRole("tab", { name: /التحرير والنطاق/ }));
    expect(screen.getByText("مساحة التأليف الجديدة")).toBeInTheDocument();
    expect(window.location.search).toContain("view=management");

    await userEvent.click(screen.getByRole("tab", { name: /القواعد والمسارات/ }));
    expect(screen.getByText("مساحة القواعد التجريبية")).toBeInTheDocument();
    expect(window.location.search).toContain("view=legislative");
  });
});
