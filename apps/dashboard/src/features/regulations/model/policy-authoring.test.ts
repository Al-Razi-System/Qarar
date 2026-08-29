import { describe, expect, it } from "vitest";
import {
  policyItemDescendantIds,
  policyItemDraftSchema,
  policyScopeDraftSchema,
  versionDraftSchema,
} from "./policy-authoring";
import type { PolicyItem } from "./types";

function item(id: string, parent?: string): PolicyItem {
  return { id, policy_version_id: "11111111-1111-4111-8111-111111111111", item_code: id, item_type: "article", title_ar: id, sort_order: 1, parent_item_id: parent, governance_mode: "regulation_required", match_criteria: {}, is_active: true };
}

describe("policy authoring validation", () => {
  it("rejects invalid version and reversed scope dates", () => {
    expect(versionDraftSchema.safeParse({ label: "", summary: "x" }).success).toBe(false);
    expect(policyScopeDraftSchema.safeParse({ type: "governance_class", targetId: "", governanceLevel: "", includeDescendants: false, priority: "100", validFrom: "2026-12-01", validTo: "2026-01-01" }).success).toBe(false);
  });

  it("rejects malformed matching criteria and reversed source pages", () => {
    const result = policyItemDraftSchema.safeParse({
      code: "A-1", title: "مادة تجريبية", type: "article", parentId: "", sortOrder: "10",
      body: "", officialText: "", interpretationText: "", sourceLocator: "", sourcePageFrom: "10", sourcePageTo: "2",
      governanceMode: "regulation_required", topicCategoryId: "", criteriaText: "[]", isActive: true, requiresExecutableRule: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.path[0])).toEqual(expect.arrayContaining(["sourcePageTo", "criteriaText"]));
  });

  it("finds all descendants used to prevent cyclic moves", () => {
    const descendants = policyItemDescendantIds([item("a"), item("b", "a"), item("c", "b"), item("d")], "a");
    expect(descendants).toEqual(new Set(["b", "c"]));
  });
});
