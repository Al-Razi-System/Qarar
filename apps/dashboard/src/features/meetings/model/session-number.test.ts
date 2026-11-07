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

describe("compact titles and Arabic dates", () => {
  it("lead a generated name with the council and keep a custom one", async () => {
    const { meetingCompactTitle, windowRangeLabel } = await import("./meeting-schedule");
    expect(meetingCompactTitle({ title_ar: "الاجتماع الأول لمجلس قسم الصيدلة — نوفمبر 2026", title_is_custom: false, unit_name_ar: "مجلس قسم الصيدلة", session_sequence_no: 1 })).toBe("مجلس قسم الصيدلة · الجلسة 1");
    expect(meetingCompactTitle({ title_ar: "اجتماع طارئ لاعتماد النتائج", title_is_custom: true, unit_name_ar: "مجلس قسم الصيدلة", session_sequence_no: 4 })).toBe("اجتماع طارئ لاعتماد النتائج");
    expect(windowRangeLabel("2026-11-01", "2026-11-07")).toBe("1 – 7 نوفمبر 2026");
    expect(windowRangeLabel("2026-11-29", "2026-12-05")).toBe("29 نوفمبر – 5 ديسمبر 2026");
  });
});

describe("a plan meeting late for its cycle", () => {
  it("says it can still be held, with a reason, until the day before the next cycle", async () => {
    const { lateCycleMessage } = await import("./meeting-schedule");
    const late = { status: "draft", planned_window_end: "2026-10-28", next_cycle_start: "2026-11-22" };
    expect(lateCycleMessage(late, "2026-11-06")).toBe("فاتت الدورة — يحتاج إجراء: انتهت فترة دورة هذا الاجتماع في الأربعاء، 28 أكتوبر 2026. يمكن عقده حتى السبت، 21 نوفمبر 2026 بعد تحديد موعد جديد وكتابة سبب انعقاده خارج الدورة.");
    expect(lateCycleMessage({ ...late, schedule_exception_reason: "سفر رئيس المجلس" }, "2026-11-06")).toBeNull();
    expect(lateCycleMessage(late, "2026-10-20")).toBeNull();
  });
});
