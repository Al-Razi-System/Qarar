export type ScopeKind = "route" | "councils" | "classes";
export type ScheduleKind = "none" | "fixed_date" | "monthly_week" | "seasonal";
export type NamedOption = { id: string; name_ar: string; document_name?: string; reference_number?: string };
export type Requirements = {
  scopeKind: ScopeKind; scopeIds: string[]; sourceItemIds: string[];
  requiredAttachmentCount: number; automaticAgenda: boolean;
  scheduleKind: ScheduleKind; date: string; startsOn: string; endsOn: string;
  week: number; month: number; day: number;
  submissionInstructions: string; discussionInstructions: string;
};
export const initialRequirements: Requirements = {
  scopeKind: "route", scopeIds: [], sourceItemIds: [], requiredAttachmentCount: 0,
  automaticAgenda: false, scheduleKind: "none", date: "", startsOn: "", endsOn: "",
  week: 1, month: 1, day: 1,
  submissionInstructions: "", discussionInstructions: "",
};
export const scheduleNames: Record<ScheduleKind, string> = {
  none: "غير مجدول", fixed_date: "تاريخ محدد", monthly_week: "أسبوع شهري", seasonal: "موعد سنوي",
};
export function requirementsError(value: Requirements): string | null {
  if (value.submissionInstructions.length > 10000 || value.discussionInstructions.length > 10000) return "التعليمات يجب ألا تتجاوز 10000 حرف لكل قسم.";
  if (value.automaticAgenda && value.scheduleKind === "none") return "حدد جدولة الموضوع قبل إضافته تلقائيًا إلى المقترحات.";
  if (value.scopeKind !== "route" && !value.scopeIds.length) return "اختر مجلسًا أو مستوى مجالس واحدًا على الأقل للنطاق.";
  if (!Number.isInteger(value.requiredAttachmentCount) || value.requiredAttachmentCount < 0 || value.requiredAttachmentCount > 50) return "عدد المرفقات المطلوبة يجب أن يكون بين 1 و50، أو ألغِ اشتراط المرفقات.";
  if (value.scheduleKind === "none") return null;
  const validDate = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
  if (value.scheduleKind === "fixed_date") return validDate(value.date) ? null : "حدد تاريخًا صحيحًا لمناقشة الموضوع.";
  if (!validDate(value.startsOn) || (value.endsOn && (!validDate(value.endsOn) || value.endsOn < value.startsOn))) return "حدد بداية الدورية، واجعل نهايتها بعدها أو اتركها مفتوحة.";
  if (value.scheduleKind === "monthly_week" && ![1, 2, 3, 4].includes(value.week)) return "اختر أسبوع الانعقاد من الأول إلى الرابع.";
  if (value.scheduleKind === "seasonal") {
    const date = `${value.startsOn.slice(0, 4)}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
    if (!validDate(date)) return "اليوم المحدد غير موجود في هذا الشهر.";
  }
  return null;
}
export function requirementsPayload(value: Requirements) {
  const ruleConfig = value.scheduleKind === "none" ? {} : value.scheduleKind === "fixed_date" ? { date: value.date }
    : { starts_on: value.startsOn, ends_on: value.endsOn || null,
      ...(value.scheduleKind === "monthly_week" ? { week: value.week } : { month: value.month, day: value.day }) };
  return {
    authoring: { scope_kind: value.scopeKind, scope_ids: value.scopeKind === "route" ? [] : value.scopeIds,
      source_item_ids: value.sourceItemIds, required_attachment_count: value.requiredAttachmentCount,
      submission_mode: value.automaticAgenda ? "automatic_agenda" : "manual",
      submission_instructions: value.submissionInstructions.trim(), discussion_instructions: value.discussionInstructions.trim() },
    schedule: { rule_type: value.scheduleKind, rule_config: ruleConfig, maximum_postponements: 0 },
  };
}
