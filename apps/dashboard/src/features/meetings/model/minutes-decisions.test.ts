import { describe, expect, it } from "vitest";
import { decisionsMissingFromMinutes, type MinutesDecision } from "./minutes-decisions";

const decisions: MinutesDecision[] = [
  { id: "d1", decision_no: "DEC-1", decision_text: "اعتماد الخطة بعد تعديل الميزانية." },
  { id: "d2", decision_no: "DEC-2", decision_text: "تشكيل لجنة المراجعة." },
];

describe("decisionsMissingFromMinutes", () => {
  it("returns nothing when the minutes carry every current decision text", () => {
    expect(decisionsMissingFromMinutes("  محضر\nالقرار: اعتماد الخطة بعد تعديل الميزانية.\nالقرار: تشكيل لجنة المراجعة.  ", decisions)).toEqual([]);
  });

  it("returns the decisions whose text changed after the draft", () => {
    expect(decisionsMissingFromMinutes("القرار: اعتماد الخطة كما وردت.\nالقرار: تشكيل لجنة المراجعة.", decisions).map((d) => d.decision_no)).toEqual(["DEC-1"]);
  });

  it("treats a missing decision list as nothing to check", () => {
    expect(decisionsMissingFromMinutes("أي نص", undefined)).toEqual([]);
  });
});
