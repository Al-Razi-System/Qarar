import { describe, expect, it } from "vitest";
import { resolvePolicyScopeUnits } from "./policy-scope-impact";
import type { PolicyScope, ReferenceOption } from "./types";

const classes: ReferenceOption[] = [
  {
    id: "faculty",
    code: "faculty",
    name_ar: "مجالس الكليات",
    governance_level: "faculty",
  },
  {
    id: "department",
    code: "department",
    name_ar: "مجالس الأقسام",
    governance_level: "department",
  },
];
const units: ReferenceOption[] = [
  {
    id: "u",
    code: "university",
    name_ar: "مجلس الجامعة",
    governance_class_id: "university",
  },
  {
    id: "f",
    code: "faculty",
    name_ar: "مجلس كلية الحاسوب",
    governance_class_id: "faculty",
    parent_unit_id: "u",
  },
  {
    id: "d1",
    code: "ai",
    name_ar: "مجلس قسم الذكاء الاصطناعي",
    governance_class_id: "department",
    parent_unit_id: "f",
  },
  {
    id: "d2",
    code: "it",
    name_ar: "مجلس قسم تقنية المعلومات",
    governance_class_id: "department",
    parent_unit_id: "f",
  },
];

function scope(values: Partial<PolicyScope>): PolicyScope {
  return {
    id: "scope",
    policy_version_id: "version",
    scope_type: "organization",
    include_descendants: false,
    priority: 100,
    is_active: true,
    ...values,
  };
}

describe("resolvePolicyScopeUnits", () => {
  it("يعرض المجالس الحالية المطابقة للمستوى التنظيمي", () => {
    expect(
      resolvePolicyScopeUnits(
        scope({
          scope_type: "governance_level",
          governance_level: "department",
        }),
        { units, classes },
      ).map((unit) => unit.id),
    ).toEqual(["d1", "d2"]);
  });

  it("يوسع نطاق الشجرة ليشمل الوحدة والجهات التابعة", () => {
    expect(
      resolvePolicyScopeUnits(
        scope({ scope_type: "unit_subtree", governance_unit_id: "f" }),
        { units, classes },
      ).map((unit) => unit.id),
    ).toEqual(["f", "d1", "d2"]);
  });
});
