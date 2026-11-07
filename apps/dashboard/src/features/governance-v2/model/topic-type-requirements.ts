export type ScopeKind = "route" | "councils" | "classes";
export type ScheduleKind = "none" | "fixed_date" | "monthly_week" | "seasonal";
export type NamedOption = { id: string; name_ar: string; document_name?: string; reference_number?: string };
/** A season is one day, or a period when an end is given. A period may cross the new year. */
export type SeasonalDate = { month: number; day: number; toMonth?: number; toDay?: number };
const monthNames = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const dayExists = (month: number, day: number) => Number.isInteger(month) && Number.isInteger(day) && month >= 1 && month <= 12 && day >= 1
  && day <= new Date(Date.UTC(2024, month, 0)).getUTCDate(); // 2024 is a leap year, so 29 February is allowed.
/** "15 مارس" for a day, "1 – 30 سبتمبر" or "15 ديسمبر – 15 يناير" for a period. */
export function seasonText(dates: SeasonalDate[]): string {
  return dates.map(item => {
    const start = monthNames[item.month - 1];
    if (!item.toMonth || !item.toDay) return `${item.day} ${start}`;
    return item.toMonth === item.month ? `${item.day} – ${item.toDay} ${start}` : `${item.day} ${start} – ${item.toDay} ${monthNames[item.toMonth - 1]}`;
  }).join("، ");
}
/** Reads a saved rule: the list form, or the older single-day form. */
export function seasonalDatesFromConfig(config: Record<string, unknown>): SeasonalDate[] {
  if (Array.isArray(config.dates) && config.dates.length) {
    return config.dates.map(entry => {
      const item = entry as Record<string, unknown>;
      const season: SeasonalDate = { month: Number(item.month), day: Number(item.day) };
      if (item.to_month != null && item.to_day != null) { season.toMonth = Number(item.to_month); season.toDay = Number(item.to_day); }
      return season;
    });
  }
  return [{ month: Number(config.month ?? 1), day: Number(config.day ?? 1) }];
}
export type Requirements = {
  scopeKind: ScopeKind; scopeIds: string[]; sourceItemIds: string[];
  requiredAttachmentCount: number; automaticAgenda: boolean;
  scheduleKind: ScheduleKind; date: string; startsOn: string; endsOn: string;
  week: number; month: number; day: number; seasonalDates: SeasonalDate[];
  submissionInstructions: string; discussionInstructions: string;
};
export const initialRequirements: Requirements = {
  scopeKind: "route", scopeIds: [], sourceItemIds: [], requiredAttachmentCount: 0,
  automaticAgenda: false, scheduleKind: "none", date: "", startsOn: "", endsOn: "",
  week: 1, month: 1, day: 1, seasonalDates: [{ month: 1, day: 1 }],
  submissionInstructions: "", discussionInstructions: "",
};
export const scheduleNames: Record<ScheduleKind, string> = {
  none: "غير مجدول", fixed_date: "تاريخ محدد", monthly_week: "أسبوع شهري", seasonal: "مواعيد موسمية",
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
    if (!value.seasonalDates.length || value.seasonalDates.length > 24) return "أضف موعدًا موسميًا واحدًا على الأقل، وبحد أقصى 24 موعدًا.";
    const identities = value.seasonalDates.map(item => `${item.month}:${item.day}`);
    if (new Set(identities).size !== identities.length) return "لا تكرر الموعد الموسمي نفسه.";
    if (value.seasonalDates.some(item => (item.toMonth == null) !== (item.toDay == null))) return "حدد شهر ويوم نهاية الفترة الموسمية أو اتركهما فارغين.";
    if (value.seasonalDates.some(item => !dayExists(item.month, item.day) || (item.toMonth != null && !dayExists(item.toMonth, item.toDay as number)))) return "راجع اليوم والشهر في المواعيد الموسمية.";
  }
  return null;
}
export function requirementsPayload(value: Requirements) {
  const ruleConfig = value.scheduleKind === "none" ? {} : value.scheduleKind === "fixed_date" ? { date: value.date }
    : { starts_on: value.startsOn, ends_on: value.endsOn || null,
      ...(value.scheduleKind === "monthly_week" ? { week: value.week } : { dates: value.seasonalDates.map(item => (
        item.toMonth != null && item.toDay != null ? { month: item.month, day: item.day, to_month: item.toMonth, to_day: item.toDay } : { month: item.month, day: item.day })) }) };
  return {
    authoring: { scope_kind: value.scopeKind, scope_ids: value.scopeKind === "route" ? [] : value.scopeIds,
      source_item_ids: value.sourceItemIds, required_attachment_count: value.requiredAttachmentCount,
      submission_mode: value.automaticAgenda ? "automatic_agenda" : "manual",
      submission_instructions: value.submissionInstructions.trim(), discussion_instructions: value.discussionInstructions.trim() },
    schedule: { rule_type: value.scheduleKind, rule_config: ruleConfig, maximum_postponements: 0 },
  };
}
