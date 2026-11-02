import { describe, expect, it } from "vitest";
import { academicYearLabel, sessionNumberLabel } from "./meeting-schedule";

describe("session numbers", () => {
  it("name the academic year by its two calendar years", () => {
    expect(academicYearLabel("2026-09-01")).toBe("2026/2027");
    expect(academicYearLabel(null)).toBeNull();
  });
  it("show the number with its year, and nothing without both", () => {
    expect(sessionNumberLabel({ session_sequence_no: 3, academic_year_start: "2026-09-01" })).toBe("الجلسة 3 · العام الجامعي 2026/2027");
    expect(sessionNumberLabel({ session_sequence_no: null, academic_year_start: "2026-09-01" })).toBeNull();
  });
});
