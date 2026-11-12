const FOOTER = "_نظام قرار - جامعة الرازي_";
const RIYADH_DATE = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Riyadh"
});

function clean(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function required(value, label) {
  const result = clean(value);
  if (!result) throw new TypeError(`${label} مطلوب للقالب`);
  return result;
}

function formatDate(value, label) {
  const raw = required(value, label);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new TypeError(`${label} غير صالح للقالب`);
  const parsed = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) throw new TypeError(`${label} غير صالح للقالب`);
  return RIYADH_DATE.format(parsed);
}

function formatTime(value) {
  const match = clean(value)?.match(/^(\d{2}):(\d{2})/);
  if (!match || Number(match[1]) > 23) return null;
  const hour = Number(match[1]);
  return `${String(hour % 12 || 12).padStart(2, "0")}:${match[2]} ${hour < 12 ? "ص" : "م"}`;
}

const recipient = value => clean(value) ? `مرحبًا ${clean(value)}،` : "مرحبًا،";
const field = (label, value) => clean(value) ? `*${label}:* ${clean(value)}` : null;

function compactDescription(value, limit = 1200) {
  const shown = clean(value)?.replace(/\s+/g, " ");
  if (!shown) return null;
  return shown.length <= limit ? shown : `${shown.slice(0, limit - 1)}…`;
}

function location(variables) {
  if (clean(variables.location_details)) return clean(variables.location_details);
  return ({ onsite: "حضوري", physical: "حضوري", online: "عن بُعد", hybrid: "هجين" })[clean(variables.location_type)] ?? null;
}

function schedule(startValue, endValue) {
  const start = formatTime(startValue);
  const end = formatTime(endValue);
  return start && end ? `${start} – ${end}` : start;
}

function message(title, greeting, intro, fields, action) {
  return [`*قرار | ${title}*`, "", greeting, intro, "", ...fields.filter(Boolean), "", action, "", FOOTER]
    .filter((line, index, lines) => line !== "" || (index > 0 && lines[index - 1] !== ""))
    .join("\n");
}

const custom = (value, fallback) => clean(value) ?? fallback;

function meetingFields(variables, cycle = false) {
  const fields = [
    field("الاجتماع", required(variables.title_ar ?? variables.meeting_title, "عنوان الاجتماع")),
    field("الرقم المرجعي", variables.meeting_no),
    field("المجلس", variables.governance_unit_name_ar)
  ];
  if (cycle) {
    fields.push(field("بداية الفترة", variables.planned_window_start ? formatDate(variables.planned_window_start, "بداية الفترة") : null));
    fields.push(field("نهاية الفترة", formatDate(variables.planned_window_end, "نهاية الفترة")));
  } else {
    fields.push(field("التاريخ", formatDate(variables.scheduled_date, "تاريخ الاجتماع")));
    fields.push(field("الوقت", schedule(variables.start_time, variables.end_time)));
    fields.push(field("المكان", location(variables)));
    const agenda = agendaList(variables.agenda_titles);
    if (agenda) fields.push(`*جدول الأعمال:*\n${agenda}`);
    fields.push(field("رابط الاجتماع", variables.meeting_url));
  }
  return fields;
}

function agendaList(value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const visible = value.slice(0, 10).map((entry, index) => {
    const title = typeof entry === "string" ? entry : entry?.title_ar;
    return clean(title) ? `${index + 1}. ${compactDescription(title, 160)}` : null;
  }).filter(Boolean);
  if (visible.length === 0) return null;
  if (value.length > 10) visible.push(`… و${value.length - 10} بنود أخرى`);
  return visible.join("\n");
}

function remainingDuration(value) {
  if (!Number.isInteger(value)) return null;
  if (value < 0) {
    const days = Math.abs(value);
    return days === 1 ? "متأخر يومًا واحدًا" : `متأخر ${days} أيام`;
  }
  if (value === 0) return "يستحق اليوم";
  if (value === 1) return "يوم واحد";
  if (value === 2) return "يومان";
  return `${value} أيام`;
}

function taskFields(variables, role, dueLabel = "موعد الإنجاز") {
  return [
    field("التكليف", required(variables.title_ar, "عنوان التكليف")),
    field("رقم التكليف", required(variables.action_no, "رقم التكليف")),
    field("نص التكليف", compactDescription(variables.description ?? variables.description_ar)),
    field("القرار المرتبط", variables.decision_no),
    field("الاجتماع المصدر", variables.meeting_title_ar),
    field("مرجع الاجتماع", variables.meeting_no),
    field("تاريخ الاجتماع", variables.meeting_date ? formatDate(variables.meeting_date, "تاريخ الاجتماع") : null),
    field("المجلس", variables.governance_unit_name_ar),
    field("صفتك", role),
    field("المكلّف", variables.assigned_user_name_ar ?? variables.assigned_unit_name_ar),
    field("المتابع", variables.follow_up_user_name_ar),
    field(dueLabel, variables.due_date ? formatDate(variables.due_date, "موعد الإنجاز") : null),
    field("المدة المتبقية", remainingDuration(variables.remaining_days)),
    field("دليل الإنجاز", typeof variables.requires_evidence === "boolean" ? (variables.requires_evidence ? "مطلوب" : "غير مطلوب") : null),
    field("رابط المهمة", variables.task_url)
  ];
}


function daysText(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 0) return null;
  if (days === 0) return "اليوم";
  if (days === 1) return "يوم واحد";
  if (days === 2) return "يومان";
  return days % 100 >= 3 && days % 100 <= 10 ? `${days} أيام` : `${days} يومًا`;
}

function councilsText(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1) return null;
  if (count === 1) return "مجلس واحد";
  if (count === 2) return "مجلسين";
  return count % 100 >= 3 && count % 100 <= 10 ? `${count} مجالس` : `${count} مجلسًا`;
}

function violationFields(variables) {
  return [
    field("نوع التجاوز", required(variables.rule_name_ar, "نوع التجاوز")),
    field("المجلس", required(variables.governance_unit_name_ar, "المجلس")),
    field("البند", required(variables.subject_label, "البند")),
    field("متأخر منذ", variables.due_since ? formatDate(variables.due_since, "تاريخ التأخر") : null),
  ];
}

const escalationLevel = level => (Number(level) === 1 ? "أقرب متابع" : Number(level) > 1 ? `المستوى ${Number(level)}` : null);

function digestFields(variables) {
  const total = Number(variables.total_open);
  if (!Number.isInteger(total) || total < 1) throw new TypeError("عدد التجاوزات مطلوب للقالب");
  const rules = Array.isArray(variables.by_rule) ? variables.by_rule.filter(rule => clean(rule?.name_ar) && Number.isInteger(rule?.count)) : [];
  const oldest = Array.isArray(variables.oldest) ? variables.oldest.slice(0, 5).map((item, index) =>
    `${index + 1}. ${clean(item?.council_name_ar) ?? "مجلس"} — ${clean(item?.rule_name_ar) ?? "تجاوز"}: ${compactDescription(item?.subject_label, 120) ?? ""} (${daysText(item?.days_open) ?? "—"})`) : [];
  return [
    field("التجاوزات المفتوحة", `${total}${councilsText(variables.council_count) ? ` في ${councilsText(variables.council_count)}` : ""}`),
    rules.length ? rules.map(rule => `• ${clean(rule.name_ar)}: ${rule.count}`).join("\n") : null,
    oldest.length ? `الأقدم:\n${oldest.join("\n")}` : null,
    field("عرض الكل", variables.violations_url),
  ];
}

const templates = Object.freeze({
  meeting_invitation: variables => message("دعوة اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"ندعوك لحضور الاجتماع التالي:"), meetingFields(variables), custom(variables.custom_action,"يرجى الدخول إلى نظام قرار للاطلاع على جدول الأعمال وتأكيد حضورك.")),
  meeting_reminder: variables => message("تذكير باجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"نذكّرك بقرب موعد الاجتماع التالي:"), meetingFields(variables), custom(variables.custom_action,"يرجى التأكد من جاهزيتك والاطلاع على جدول الأعمال قبل الموعد.")),
  meeting_cycle_due_soon: variables => message("قرب انتهاء دورة اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"اقتربت نهاية فترة الاجتماع ولم يُثبت موعده بعد:"), meetingFields(variables, true), custom(variables.custom_action,"يرجى تحديد موعد الاجتماع في نظام قرار قبل انتهاء الفترة.")),
  meeting_cycle_overdue: variables => message("انتهاء دورة اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"انتهت فترة الاجتماع التالية دون تثبيت موعد:"), meetingFields(variables, true), custom(variables.custom_action,"يرجى مراجعة الاجتماع في نظام قرار وتحديد الإجراء المناسب.")),
  meeting_postponed: variables => message("تأجيل أو تعديل موعد اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تغيّر موعد الاجتماع المدعو إليه، وهذه بياناته المحدّثة:"), meetingFields(variables), custom(variables.custom_action,"يرجى اعتماد الموعد المحدّث ومراجعة تفاصيل الاجتماع.")),
  meeting_cancelled: variables => message("إلغاء اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"أُلغي الاجتماع التالي:"), meetingFields(variables), custom(variables.custom_action,"لا يلزم الحضور، ويمكنك مراجعة سجل الاجتماع في نظام قرار.")),
  meeting_invitation_updated: variables => message("تحديث دعوة اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تحدّث جدول أعمال الاجتماع المدعو إليه:"), meetingFields(variables), custom(variables.custom_action,"يرجى مراجعة جدول الأعمال المحدّث قبل موعد الاجتماع.")),
  task_created_assignee: variables => message("تكليف جديد", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تم إسناد تكليف جديد إليك:"), taskFields(variables, "المكلّف بالتنفيذ"), custom(variables.custom_action,"يرجى الدخول إلى نظام قرار للاطلاع على التفاصيل وبدء التنفيذ.")),
  task_created_follower: variables => message("متابعة تكليف جديد", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"أُضيف تكليف جديد إلى قائمة متابعتك:"), taskFields(variables, "المتابع"), custom(variables.custom_action,"يرجى متابعة تقدم التنفيذ من خلال نظام قرار.")),
  task_due_soon: variables => message("قرب استحقاق تكليف", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"اقترب موعد إنجاز التكليف التالي:"), taskFields(variables, variables.recipient_role === "follower" ? "المتابع" : "المكلّف بالتنفيذ"), custom(variables.custom_action,"يرجى تحديث نسبة الإنجاز وإرفاق الأدلة المطلوبة في نظام قرار.")),
  task_overdue: variables => message("تكليف متأخر", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تجاوز التكليف التالي موعد إنجازه:"), taskFields(variables, variables.recipient_role === "follower" ? "المتابع" : "المكلّف بالتنفيذ", "موعد الإنجاز السابق"), custom(variables.custom_action,"يرجى تحديث حالة التكليف واتخاذ الإجراء اللازم في نظام قرار.")),
  task_submitted: variables => message("تكليف بانتظار التحقق", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"سلّم المكلّف إنجاز التكليف التالي للمراجعة:"), taskFields(variables, "المتابع"), custom(variables.custom_action,"يرجى مراجعة الإنجاز والأدلة واتخاذ قرار التحقق في نظام قرار.")),
  task_returned: variables => message("إعادة تكليف للاستكمال", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"أُعيد التكليف التالي إليك لاستكماله:"), [...taskFields(variables, "المكلّف بالتنفيذ"), field("سبب الإعادة", required(variables.return_reason, "سبب الإعادة"))], custom(variables.custom_action,"يرجى مراجعة ملاحظات المتابع واستكمال المطلوب في نظام قرار.")),
  task_completed: variables => message("اكتمال تكليف", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تم اعتماد إنجاز التكليف التالي:"), taskFields(variables, variables.recipient_role === "follower" ? "المتابع" : "المكلّف بالتنفيذ"), custom(variables.custom_action,"يمكنك الاطلاع على سجل الإنجاز الكامل في نظام قرار.")),
  oversight_violation: variables => message("تجاوز في مجلسك", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"رُصد في مجلسك تأخر يحتاج إلى معالجة:"), [...violationFields(variables), field("للمعالجة", variables.violation_url)], custom(variables.custom_action,"يُغلق التنبيه تلقائيًا عند المعالجة. إن لم يُعالج خلال المهلة يُصعَّد إلى المتابع الأعلى.")),
  oversight_escalation: variables => message("تصعيد تجاوز", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تجاوز في مجلس تتابعه لم يُعالَج في المجلس خلال المهلة:"), [...violationFields(variables), field("مدة التأخر", daysText(variables.days_open)), field("مستوى التصعيد", escalationLevel(variables.escalation_level)), field("التفاصيل", variables.violation_url)], custom(variables.custom_action,"يرجى المتابعة مع رئاسة المجلس.")),
  oversight_digest: variables => message("ملخص المتابعة اليومي", recipient(variables.recipient_name_ar), custom(variables.custom_intro,`حال المجالس التي تتابعها${clean(variables.digest_date) ? ` في ${formatDate(variables.digest_date, "تاريخ الملخص")}` : ""}:`), digestFields(variables), custom(variables.custom_action,"يصلك هذا الملخص صباح كل يوم فيه تجاوزات مفتوحة في نطاقك.")),
});

export function renderTemplate(templateCode, variables) {
  const render = templates[templateCode];
  if (!render) throw new TypeError(`unsupported template: ${templateCode}`);
  const text = render(variables ?? {});
  if (text.length > 4096) throw new TypeError("rendered message exceeds provider limit");
  return text;
}
