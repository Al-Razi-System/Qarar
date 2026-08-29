import { describe, expect, it } from "vitest";
import type { PolicyItem } from "./types";
import {
  buildPolicyContentTree,
  countPolicyContent,
  flattenPolicyContent,
  searchPolicyContent,
} from "./policy-content";

function item(
  id: string,
  type: string,
  order: number,
  parent?: string,
  title = id,
): PolicyItem {
  return {
    id,
    policy_version_id: "version-1",
    item_code: id,
    item_type: type,
    title_ar: title,
    sort_order: order,
    parent_item_id: parent,
    governance_mode: "regulation_required",
    match_criteria: {},
    is_active: true,
  };
}

describe("policy content model", () => {
  it("builds a sorted hierarchy and preserves orphaned content", () => {
    const tree = buildPolicyContentTree([
      item("article-2", "article", 20, "chapter-1"),
      item("orphan", "article", 30, "missing"),
      item("chapter-1", "chapter", 10),
      item("article-1", "article", 10, "chapter-1"),
    ]);

    expect(tree.map((node) => node.item.id)).toEqual(["chapter-1", "orphan"]);
    expect(tree[0].children.map((node) => node.item.id)).toEqual([
      "article-1",
      "article-2",
    ]);
  });

  it("recovers cyclic content without recursive failure", () => {
    const tree = buildPolicyContentTree([
      item("a", "section", 1, "b"),
      item("b", "article", 2, "a"),
    ]);
    const entries = flattenPolicyContent(tree);
    expect(new Set(entries.map((entry) => entry.item.id))).toEqual(
      new Set(["a", "b"]),
    );
  });

  it("searches Arabic text without being affected by hamza or diacritics", () => {
    const entries = flattenPolicyContent(
      buildPolicyContentTree([
        item("1", "article", 1, undefined, "إجراءات اعتماد الموضوع"),
        item("2", "clause", 2, undefined, "النصاب القانوني"),
      ]),
    );
    expect(searchPolicyContent(entries, "اجراءات")[0].item.id).toBe("1");
    expect(searchPolicyContent(entries, "النِّصاب")[0].item.id).toBe("2");
  });

  it("counts content types and executable rules", () => {
    const article = item("1", "article", 1);
    article.rules = [
      {
        id: "rule-1",
        policy_item_id: article.id,
        rule_code: "R-1",
        name_ar: "قاعدة",
        rule_type: "routing",
        status: "active",
        priority: 1,
        applies_when: {},
        effect_payload: {},
        requires_workflow: false,
        conditions: [],
        requirements: [],
        authorities: [],
        actions: [],
        workflow_bindings: [],
      },
    ];
    expect(countPolicyContent([article, item("2", "clause", 2)])).toMatchObject({
      total: 2,
      articles: 1,
      clauses: 1,
      rules: 1,
    });
  });
});
