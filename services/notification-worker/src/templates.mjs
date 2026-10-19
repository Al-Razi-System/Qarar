const templates = Object.freeze({
  meeting_invitation: ({ title_ar, meeting_title, scheduled_date, start_time }) =>
    `دعوة اجتماع\n${required(title_ar ?? meeting_title, "عنوان الاجتماع")}\nالتاريخ: ${required(scheduled_date, "تاريخ الاجتماع")}${start_time ? `\nالوقت: ${start_time}` : ""}`,
  meeting_reminder: ({ title_ar, scheduled_date, start_time }) =>
    `تذكير بموعد اجتماع\n${required(title_ar, "عنوان الاجتماع")}\nالتاريخ: ${required(scheduled_date, "تاريخ الاجتماع")}${start_time ? `\nالوقت: ${start_time}` : ""}`,
  meeting_cycle_due_soon: ({ title_ar, planned_window_end }) =>
    `تنبيه بقرب انتهاء فترة دورة الاجتماع\n${required(title_ar, "عنوان الاجتماع")}\nتنتهي الفترة في: ${required(planned_window_end, "نهاية الفترة")}`,
  meeting_cycle_overdue: ({ title_ar, planned_window_end }) =>
    `تنبيه: انتهت فترة دورة الاجتماع دون تحديد الموعد\n${required(title_ar, "عنوان الاجتماع")}\nانتهت الفترة في: ${required(planned_window_end, "نهاية الفترة")}`,
  task_created_assignee: ({ action_no, title_ar, due_date }) =>
    `تم إسناد تكليف جديد إليك\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}${due_date ? `\nموعد الإنجاز: ${due_date}` : ""}`,
  task_created_follower: ({ action_no, title_ar, due_date }) =>
    `أُضيف تكليف جديد إلى متابعتك\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}${due_date ? `\nموعد الإنجاز: ${due_date}` : ""}`,
  task_due_soon: ({ action_no, title_ar, due_date }) =>
    `تذكير بقرب استحقاق التكليف\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}\nموعد الإنجاز: ${required(due_date, "موعد الإنجاز")}`,
  task_overdue: ({ action_no, title_ar, due_date }) =>
    `تنبيه: تجاوز التكليف موعده\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}\nكان موعد الإنجاز: ${required(due_date, "موعد الإنجاز")}`,
  task_submitted: ({ action_no, title_ar }) =>
    `تم تسليم تكليف لمراجعتك\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}`,
  task_returned: ({ action_no, title_ar }) =>
    `أُعيد التكليف لاستكماله\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}`,
  task_completed: ({ action_no, title_ar }) =>
    `اكتمل اعتماد إنجاز التكليف\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}`
});

function required(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${label} مطلوب للقالب`);
  return value.trim();
}

export function renderTemplate(templateCode, variables) {
  const render = templates[templateCode];
  if (!render) throw new TypeError(`unsupported template: ${templateCode}`);
  const text = render(variables ?? {});
  if (text.length > 4096) throw new TypeError("rendered message exceeds provider limit");
  return text;
}
