import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Policy } from "../model/types";
import { PolicyContentExplorer } from "./policy-content-explorer";

const policy: Policy = {
  id: "policy-1",
  code: "REG-001",
  name_ar: "لائحة المجالس",
  policy_type: "regulation",
  status: "active",
  updated_at: "2026-08-23T00:00:00Z",
  versions: [
    {
      id: "version-1",
      version_no: 1,
      version_label: "1.0",
      legal_status: "effective",
      automation_status: "ready",
      items: [
        {
          id: "chapter-1",
          policy_version_id: "version-1",
          item_code: "CH-1",
          item_type: "chapter",
          title_ar: "الفصل الأول",
          sort_order: 1,
          governance_mode: "regulation_required",
          match_criteria: {},
          is_active: true,
        },
        {
          id: "article-1",
          policy_version_id: "version-1",
          item_code: "A-1",
          item_type: "article",
          title_ar: "تشكيل المجلس",
          official_text: "يشكل المجلس بقرار من الجهة المختصة.",
          source_locator: "الباب الأول",
          source_page_from: 3,
          sort_order: 1,
          parent_item_id: "chapter-1",
          governance_mode: "regulation_required",
          match_criteria: {},
          is_active: true,
          rules: [],
          references: [],
        },
        {
          id: "clause-1",
          policy_version_id: "version-1",
          item_code: "A-1-1",
          item_type: "clause",
          title_ar: "النصاب القانوني",
          official_text: "يكتمل النصاب بحضور أغلبية الأعضاء.",
          sort_order: 1,
          parent_item_id: "article-1",
          governance_mode: "regulation_required",
          match_criteria: {},
          is_active: true,
        },
      ],
      scopes: [],
    },
  ],
};

beforeEach(() => {
  window.history.replaceState({}, "", "/admin/regulations/policy-1");
});
afterEach(cleanup);

describe("PolicyContentExplorer", () => {
  it("shows the hierarchy and reads official content without entering edit mode", async () => {
    render(
      <PolicyContentExplorer
        policy={policy}
        onEditContent={vi.fn()}
        onManageRules={vi.fn()}
      />,
    );

    expect(screen.getByRole("tree", { name: "شجرة محتوى اللائحة" })).toBeInTheDocument();
    expect(screen.getByText("3", { selector: "strong" })).toBeInTheDocument();

    await userEvent.click(screen.getByTitle("عرض مادة"));
    expect(screen.getByRole("heading", { name: "تشكيل المجلس" })).toBeInTheDocument();
    expect(screen.getByText("يشكل المجلس بقرار من الجهة المختصة.")).toBeInTheDocument();
    expect(screen.getByText("الباب الأول")).toBeInTheDocument();
    expect(window.location.search).toContain("item=article-1");
  });

  it("searches all materials and opens a matching clause", async () => {
    render(
      <PolicyContentExplorer
        policy={policy}
        onEditContent={vi.fn()}
        onManageRules={vi.fn()}
      />,
    );

    await userEvent.type(
      screen.getByRole("textbox", { name: "البحث في مواد وبنود اللائحة" }),
      "النصاب",
    );
    expect(await screen.findByText("1 نتيجة مطابقة من أصل 3")).toBeInTheDocument();
    const result = screen.getByRole("button", { name: /النصاب القانوني/ });
    expect(within(result).getByText("النصاب القانوني")).toBeInTheDocument();
    await userEvent.click(result);
    expect(screen.getByText("يكتمل النصاب بحضور أغلبية الأعضاء.")).toBeInTheDocument();
  });

  it("routes explicit actions to editing and rules workspaces", async () => {
    const onEditContent = vi.fn();
    const onManageRules = vi.fn();
    render(
      <PolicyContentExplorer
        policy={policy}
        onEditContent={onEditContent}
        onManageRules={onManageRules}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: "تحرير المحتوى" }));
    await userEvent.click(screen.getByRole("button", { name: "القواعد والمسارات" }));
    expect(onEditContent).toHaveBeenCalledOnce();
    expect(onManageRules).toHaveBeenCalledOnce();
  });
});
