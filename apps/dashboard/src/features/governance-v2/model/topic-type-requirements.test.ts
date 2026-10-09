import { describe, expect, it } from "vitest";
import { initialRequirements, requirementsError, requirementsPayload } from "./topic-type-requirements";
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
});
