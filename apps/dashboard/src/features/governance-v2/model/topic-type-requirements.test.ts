import { describe, expect, it } from "vitest";
import { initialRequirements, requirementsError, requirementsPayload, seasonText, seasonalDatesFromConfig } from "./topic-type-requirements";
describe("topic type requirements", () => {
  it("saves optional guidance separately from evidence requirements", () => {
    const value = { ...initialRequirements, submissionInstructions: "  أرفق خطة البرنامج\nوقدّم الطلب مبكرًا  ", discussionInstructions: "ناقش مخرجات البرنامج" };
    expect(requirementsPayload(value).authoring).toMatchObject({ submission_instructions: "أرفق خطة البرنامج\nوقدّم الطلب مبكرًا", discussion_instructions: "ناقش مخرجات البرنامج", required_attachment_count: 0 });
    expect(requirementsError({ ...value, submissionInstructions: "ن".repeat(10001) })).toMatch(/التعليمات/);
    expect(requirementsError(initialRequirements)).toBeNull();
  });
  it("requires a selection for restricted origins", () => {
    expect(requirementsError({ ...initialRequirements, scopeKind: "councils" })).toMatch(/اختر/);
    expect(requirementsError(initialRequirements)).toBeNull();
  });
  it("rejects automatic agenda suggestions without a schedule", () => {
    expect(requirementsError({ ...initialRequirements, automaticAgenda: true })).toMatch(/جدولة/);
  });
  it("serializes scope, sources and a bounded monthly schedule without identity", () => {
    const value = { ...initialRequirements, scopeKind: "councils" as const, scopeIds: ["council"], sourceItemIds: ["item"], requiredAttachmentCount: 2, automaticAgenda: true, scheduleKind: "monthly_week" as const, startsOn: "2026-10-01", endsOn: "2026-12-31", week: 2 };
    expect(requirementsError(value)).toBeNull();
    expect(requirementsPayload(value)).toEqual({ authoring: { scope_kind: "councils", scope_ids: ["council"], source_item_ids: ["item"], required_attachment_count: 2, submission_mode: "automatic_agenda", submission_instructions: "", discussion_instructions: "" }, schedule: { rule_type: "monthly_week", rule_config: { starts_on: "2026-10-01", ends_on: "2026-12-31", week: 2 }, maximum_postponements: 0 } });
  });
  it("rejects impossible dates, reversed bounds and invalid attachment counts", () => {
    expect(requirementsError({ ...initialRequirements, scheduleKind: "fixed_date", date: "2026-02-31" })).toMatch(/تاريخ/);
    expect(requirementsError({ ...initialRequirements, scheduleKind: "monthly_week", startsOn: "2026-10-01", endsOn: "2026-09-01" })).toMatch(/بداية/);
    expect(requirementsError({ ...initialRequirements, requiredAttachmentCount: 51 })).toMatch(/المرفقات/);
  });
  it("serializes several fixed annual seasonal dates and rejects duplicates", () => {
    const value = { ...initialRequirements, scheduleKind: "seasonal" as const, startsOn: "2026-01-01", seasonalDates: [{ month: 3, day: 15 }, { month: 9, day: 1 }] };
    expect(requirementsError(value)).toBeNull();
    expect(requirementsPayload(value).schedule.rule_config).toEqual({ starts_on: "2026-01-01", ends_on: null, dates: [{ month: 3, day: 15 }, { month: 9, day: 1 }] });
    expect(requirementsError({ ...value, seasonalDates: [{ month: 3, day: 15 }, { month: 3, day: 15 }] })).toMatch(/تكرر/);
  });
  it("serializes a season with an end and keeps single days as they were", () => {
    const value = { ...initialRequirements, scheduleKind: "seasonal" as const, startsOn: "2026-01-01", seasonalDates: [{ month: 3, day: 15 }, { month: 9, day: 1, toMonth: 9, toDay: 30 }] };
    expect(requirementsError(value)).toBeNull();
    expect(requirementsPayload(value).schedule.rule_config).toEqual({ starts_on: "2026-01-01", ends_on: null,
      dates: [{ month: 3, day: 15 }, { month: 9, day: 1, to_month: 9, to_day: 30 }] });
  });
  it("accepts a season that crosses the new year and 29 February in any start year", () => {
    const crossing = { ...initialRequirements, scheduleKind: "seasonal" as const, startsOn: "2027-01-01", seasonalDates: [{ month: 12, day: 15, toMonth: 1, toDay: 15 }, { month: 2, day: 29 }] };
    expect(requirementsError(crossing)).toBeNull();
  });
  it("refuses an end with only a month or a day that never exists", () => {
    const base = { ...initialRequirements, scheduleKind: "seasonal" as const, startsOn: "2026-01-01" };
    expect(requirementsError({ ...base, seasonalDates: [{ month: 9, day: 1, toMonth: 9 }] })).toMatch(/نهاية/);
    expect(requirementsError({ ...base, seasonalDates: [{ month: 4, day: 31 }] })).toMatch(/اليوم/);
    expect(requirementsError({ ...base, seasonalDates: [{ month: 9, day: 1, toMonth: 11, toDay: 31 }] })).toMatch(/اليوم/);
  });
  it("reads saved seasons in both the list form and the single-day form", () => {
    expect(seasonalDatesFromConfig({ dates: [{ month: 3, day: 15 }, { month: 12, day: 15, to_month: 1, to_day: 15 }] }))
      .toEqual([{ month: 3, day: 15 }, { month: 12, day: 15, toMonth: 1, toDay: 15 }]);
    expect(seasonalDatesFromConfig({ month: 5, day: 2 })).toEqual([{ month: 5, day: 2 }]);
  });
  it("describes seasons in Arabic instead of raw numbers", () => {
    expect(seasonText([{ month: 3, day: 15 }, { month: 9, day: 1, toMonth: 9, toDay: 30 }])).toBe("15 مارس، 1 – 30 سبتمبر");
    expect(seasonText([{ month: 12, day: 15, toMonth: 1, toDay: 15 }])).toBe("15 ديسمبر – 15 يناير");
  });
});
