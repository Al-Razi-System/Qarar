import { describe, expect, it } from "vitest";
import { previewSubmissionScope, type ScopeCouncil, type ScopeUnit } from "./submission-scope";
const units: ScopeUnit[] = [
  { id: "u1", parent_unit_id: null, name_ar: "رئاسة", status: "active" },
  { id: "u2", parent_unit_id: "u1", name_ar: "كلية", status: "active" },
  { id: "u3", parent_unit_id: "u2", name_ar: "قسم", status: "active" },
];
const councils: ScopeCouncil[] = [
  { id: "c1", scope_unit_id: "u1", class_id: "university", name_ar: "الجامعة", status: "active" },
  { id: "c2", scope_unit_id: "u2", class_id: "faculty", name_ar: "الكلية", status: "active" },
  { id: "c3", scope_unit_id: "u3", class_id: "department", name_ar: "القسم", status: "active" },
  { id: "c4", scope_unit_id: null, class_id: "university", name_ar: "مستقل", status: "active" },
];
describe("submission scope preview", () => {
  it("includes only the selected council unless descendants are selected", () => {
    expect(previewSubmissionScope([{ kind: "council", target_id: "c2", include_descendants: false }], councils, units).map(c => c.id)).toEqual(["c2"]);
    expect(previewSubmissionScope([{ kind: "council", target_id: "c2", include_descendants: true }], councils, units).map(c => c.id)).toEqual(["c2", "c3"]);
  });
  it("combines a level and a specific council without duplicates", () => {
    expect(previewSubmissionScope([{ kind: "class", target_id: "faculty", include_descendants: true }, { kind: "council", target_id: "c4", include_descendants: true }], councils, units).map(c => c.id)).toEqual(["c2", "c3", "c4"]);
  });
  it("does not infer descendants for an institutional council without a unit", () => {
    expect(previewSubmissionScope([{ kind: "council", target_id: "c4", include_descendants: true }], councils, units).map(c => c.id)).toEqual(["c4"]);
  });
  it("terminates on malformed cyclic hierarchy", () => {
    const cyclic = units.map(u => u.id === "u2" ? { ...u, parent_unit_id: "u3" } : u);
    expect(previewSubmissionScope([{ kind: "council", target_id: "c1", include_descendants: true }], councils, cyclic).map(c => c.id)).toEqual(["c1"]);
  });
});
