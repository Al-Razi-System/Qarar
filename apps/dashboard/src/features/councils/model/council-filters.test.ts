import { describe, expect, it } from "vitest";
import type { CouncilTreeNode } from "./types";
import { filterCouncilTree } from "./council-filters";

const councils: CouncilTreeNode[] = [
  { id: "1", code: "university_council", name_ar: "مجلس الجامعة", status: "active", level_no: 1, parent_unit_id: null, path_ids: ["1"], path_names: ["مجلس الجامعة"] },
  { id: "2", code: "medical_labs", name_ar: "مجلس قسم المختبرات", status: "inactive", level_no: 3, parent_unit_id: "1", path_ids: ["1", "2"], path_names: ["مجلس الجامعة", "كلية الطب", "مجلس قسم المختبرات"] },
  { id: "3", code: "archived_council", name_ar: "مجلس قديم", status: "archived", level_no: 2, parent_unit_id: "1", path_ids: ["1", "3"], path_names: ["مجلس الجامعة", "مجلس قديم"] },
];

describe("filterCouncilTree", () => {
  it("يطبق فلتر الحالة على عناصر الشجرة نفسها", () => {
    expect(filterCouncilTree(councils, "", "inactive").map((item) => item.id)).toEqual(["2"]);
  });

  it("يبحث بالاسم والرمز وأسماء المسار", () => {
    expect(filterCouncilTree(councils, "medical", "").map((item) => item.id)).toEqual(["2"]);
    expect(filterCouncilTree(councils, "كلية الطب", "").map((item) => item.id)).toEqual(["2"]);
  });

  it("يجمع البحث والحالة دون تسريب عناصر غير مطابقة", () => {
    expect(filterCouncilTree(councils, "مجلس", "archived").map((item) => item.id)).toEqual(["3"]);
  });
});
