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

function compactDescription(value) {
  const shown = clean(value)?.replace(/\s+/g, " ");
  if (!shown) return null;
  return shown.length <= 360 ? shown : `${shown.slice(0, 357)}…`;
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
  }
  return fields;
}

function taskFields(variables, role, dueLabel = "موعد الإنجاز") {
  return [
    field("التكليف", required(variables.title_ar, "عنوان التكليف")),
    field("رقم التكليف", required(variables.action_no, "رقم التكليف")),
    field("القرار المرتبط", variables.decision_no),
    field("صفتك", role),
    field(dueLabel, variables.due_date ? formatDate(variables.due_date, "موعد الإنجاز") : null),
    field("ملخص التكليف", compactDescription(variables.description ?? variables.description_ar))
  ];
}

const templates = Object.freeze({
  meeting_invitation: variables => message("دعوة اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"ندعوك لحضور الاجتماع التالي:"), meetingFields(variables), custom(variables.custom_action,"يرجى الدخول إلى نظام قرار للاطلاع على جدول الأعمال وتأكيد حضورك.")),
  meeting_reminder: variables => message("تذكير باجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"نذكّرك بقرب موعد الاجتماع التالي:"), meetingFields(variables), custom(variables.custom_action,"يرجى التأكد من جاهزيتك والاطلاع على جدول الأعمال قبل الموعد.")),
  meeting_cycle_due_soon: variables => message("قرب انتهاء دورة اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"اقتربت نهاية فترة الاجتماع ولم يُثبت موعده بعد:"), meetingFields(variables, true), custom(variables.custom_action,"يرجى تحديد موعد الاجتماع في نظام قرار قبل انتهاء الفترة.")),
  meeting_cycle_overdue: variables => message("انتهاء دورة اجتماع", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"انتهت فترة الاجتماع التالية دون تثبيت موعد:"), meetingFields(variables, true), custom(variables.custom_action,"يرجى مراجعة الاجتماع في نظام قرار وتحديد الإجراء المناسب.")),
  task_created_assignee: variables => message("تكليف جديد", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تم إسناد تكليف جديد إليك:"), taskFields(variables, "المكلّف بالتنفيذ"), custom(variables.custom_action,"يرجى الدخول إلى نظام قرار للاطلاع على التفاصيل وبدء التنفيذ.")),
  task_created_follower: variables => message("متابعة تكليف جديد", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"أُضيف تكليف جديد إلى قائمة متابعتك:"), taskFields(variables, "المتابع"), custom(variables.custom_action,"يرجى متابعة تقدم التنفيذ من خلال نظام قرار.")),
  task_due_soon: variables => message("قرب استحقاق تكليف", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"اقترب موعد إنجاز التكليف التالي:"), taskFields(variables, variables.recipient_role === "follower" ? "المتابع" : "المكلّف بالتنفيذ"), custom(variables.custom_action,"يرجى تحديث نسبة الإنجاز وإرفاق الأدلة المطلوبة في نظام قرار.")),
  task_overdue: variables => message("تكليف متأخر", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تجاوز التكليف التالي موعد إنجازه:"), taskFields(variables, variables.recipient_role === "follower" ? "المتابع" : "المكلّف بالتنفيذ", "موعد الإنجاز السابق"), custom(variables.custom_action,"يرجى تحديث حالة التكليف واتخاذ الإجراء اللازم في نظام قرار.")),
  task_submitted: variables => message("تكليف بانتظار التحقق", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"سلّم المكلّف إنجاز التكليف التالي للمراجعة:"), taskFields(variables, "المتابع"), custom(variables.custom_action,"يرجى مراجعة الإنجاز والأدلة واتخاذ قرار التحقق في نظام قرار.")),
  task_returned: variables => message("إعادة تكليف للاستكمال", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"أُعيد التكليف التالي إليك لاستكماله:"), taskFields(variables, "المكلّف بالتنفيذ"), custom(variables.custom_action,"يرجى مراجعة ملاحظات المتابع واستكمال المطلوب في نظام قرار.")),
  task_completed: variables => message("اكتمال تكليف", recipient(variables.recipient_name_ar), custom(variables.custom_intro,"تم اعتماد إنجاز التكليف التالي:"), taskFields(variables, variables.recipient_role === "follower" ? "المتابع" : "المكلّف بالتنفيذ"), custom(variables.custom_action,"يمكنك الاطلاع على سجل الإنجاز الكامل في نظام قرار."))
});

export function renderTemplate(templateCode, variables) {
  const render = templates[templateCode];
  if (!render) throw new TypeError(`unsupported template: ${templateCode}`);
  const text = render(variables ?? {});
  if (text.length > 4096) throw new TypeError("rendered message exceeds provider limit");
  return text;
}
