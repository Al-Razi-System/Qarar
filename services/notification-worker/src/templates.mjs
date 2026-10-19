const templates = Object.freeze({
  meeting_invitation: ({ meeting_title, scheduled_date, start_time }) =>
    `دعوة اجتماع\n${required(meeting_title, "عنوان الاجتماع")}\nالتاريخ: ${required(scheduled_date, "تاريخ الاجتماع")}${start_time ? `\nالوقت: ${start_time}` : ""}`,
  task_created_assignee: ({ action_no, title_ar, due_date }) =>
    `تم إسناد تكليف جديد إليك\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}${due_date ? `\nموعد الإنجاز: ${due_date}` : ""}`,
  task_created_follower: ({ action_no, title_ar, due_date }) =>
    `أُضيف تكليف جديد إلى متابعتك\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}${due_date ? `\nموعد الإنجاز: ${due_date}` : ""}`,
  task_due_soon: ({ action_no, title_ar, due_date }) =>
    `تذكير بقرب استحقاق التكليف\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}\nموعد الإنجاز: ${required(due_date, "موعد الإنجاز")}`,
  task_overdue: ({ action_no, title_ar, due_date }) =>
    `تنبيه: تجاوز التكليف موعده\n${required(action_no, "رقم التكليف")} — ${required(title_ar, "عنوان التكليف")}\nكان موعد الإنجاز: ${required(due_date, "موعد الإنجاز")}`
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
