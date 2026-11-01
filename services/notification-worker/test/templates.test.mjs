import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplate } from "../src/templates.mjs";

const footer = "_نظام قرار - جامعة الرازي_";

test("meeting invitation is a readable Arabic card with agenda, reference, schedule, location and direct link", () => {
  const text = renderTemplate("meeting_invitation", {
    recipient_name_ar: "تركي القباني",
    title_ar: "الاجتماع الدوري لمجلس الجامعة",
    meeting_no: "MTG-2026-000021",
    governance_unit_name_ar: "مجلس الجامعة",
    scheduled_date: "2026-10-21",
    start_time: "10:00:00",
    end_time: "11:30:00",
    location_type: "physical",
    location_details: "قاعة المجلس الرئيسية",
    agenda_titles: ["اعتماد الخطة التشغيلية", "مراجعة تقرير الأداء"],
    meeting_url: "https://devqarar.prideidea.com/admin/meetings/meeting-21"
  });
  assert.match(text, /^\*قرار \| دعوة اجتماع\*/);
  assert.match(text, /مرحبًا تركي القباني/);
  assert.match(text, /\*الرقم المرجعي:\* MTG-2026-000021/);
  assert.match(text, /\*التاريخ:\* الأربعاء، 21 أكتوبر 2026/);
  assert.match(text, /\*الوقت:\* 10:00 ص – 11:30 ص/);
  assert.match(text, /\*المكان:\* قاعة المجلس الرئيسية/);
  assert.match(text, /\*جدول الأعمال:\*\n1\. اعتماد الخطة التشغيلية\n2\. مراجعة تقرير الأداء/);
  assert.match(text, /https:\/\/devqarar\.prideidea\.com\/admin\/meetings\/meeting-21/);
  assert.equal(text.endsWith(footer), true);
  assert.equal(text.includes("2026-10-21"), false);
});

test("task assignment shows full operational context and a direct link", () => {
  const text = renderTemplate("task_created_assignee", {
    recipient_name_ar: "أحمد علي",
    action_no: "TSK-2026-000031",
    decision_no: "DEC-2026-000014",
    title_ar: "إعداد خطة التنفيذ",
    description: "إعداد الخطة التنفيذية ورفعها للمراجعة.",
    due_date: "2026-10-25",
    remaining_days: 3,
    meeting_title_ar: "اجتماع مجلس الجامعة الدوري",
    meeting_no: "MTG-2026-000021",
    meeting_date: "2026-10-20",
    governance_unit_name_ar: "مجلس الجامعة",
    assigned_user_name_ar: "أحمد علي",
    follow_up_user_name_ar: "د. سلمى السنبني",
    requires_evidence: true,
    task_url: "https://devqarar.prideidea.com/admin/tasks?task=task-31"
  });
  assert.match(text, /\*قرار \| تكليف جديد\*/);
  assert.match(text, /\*رقم التكليف:\* TSK-2026-000031/);
  assert.match(text, /\*القرار المرتبط:\* DEC-2026-000014/);
  assert.match(text, /\*صفتك:\* المكلّف بالتنفيذ/);
  assert.match(text, /\*موعد الإنجاز:\* الأحد، 25 أكتوبر 2026/);
  assert.match(text, /\*نص التكليف:\* إعداد الخطة التنفيذية ورفعها للمراجعة\./);
  assert.match(text, /\*الاجتماع المصدر:\* اجتماع مجلس الجامعة الدوري/);
  assert.match(text, /\*مرجع الاجتماع:\* MTG-2026-000021/);
  assert.match(text, /\*تاريخ الاجتماع:\* الثلاثاء، 20 أكتوبر 2026/);
  assert.match(text, /\*المجلس:\* مجلس الجامعة/);
  assert.match(text, /\*المكلّف:\* أحمد علي/);
  assert.match(text, /\*المتابع:\* د\. سلمى السنبني/);
  assert.match(text, /\*المدة المتبقية:\* 3 أيام/);
  assert.match(text, /\*دليل الإنجاز:\* مطلوب/);
  assert.match(text, /https:\/\/devqarar\.prideidea\.com\/admin\/tasks\?task=task-31/);
  assert.equal(text.endsWith(footer), true);
});

test("follower message names the assignee and returned task includes the authoritative reason", () => {
  const follower = renderTemplate("task_created_follower", {
    recipient_name_ar: "د. سلمى",
    action_no: "TSK-2026-000041",
    title_ar: "إعداد تقرير الاعتماد",
    assigned_user_name_ar: "د. أحمد",
    follow_up_user_name_ar: "د. سلمى"
  });
  assert.match(follower, /\*المكلّف:\* د\. أحمد/);

  const returned = renderTemplate("task_returned", {
    recipient_name_ar: "د. أحمد",
    action_no: "TSK-2026-000041",
    title_ar: "إعداد تقرير الاعتماد",
    return_reason: "المرفق لا يتضمن توقيع عميد الكلية."
  });
  assert.match(returned, /\*سبب الإعادة:\* المرفق لا يتضمن توقيع عميد الكلية\./);
});

test("long agenda and task text stay useful and within the provider limit", () => {
  const invitation = renderTemplate("meeting_invitation", {
    title_ar: "اجتماع مجلس الجامعة",
    scheduled_date: "2026-10-21",
    agenda_titles: Array.from({ length: 14 }, (_, index) => `${index + 1} ${"موضوع طويل ".repeat(30)}`)
  });
  assert.match(invitation, /و4 بنود أخرى/);
  assert.ok(invitation.length <= 4096);

  const task = renderTemplate("task_due_soon", {
    action_no: "TSK-2026-000042",
    title_ar: "إعداد الدراسة",
    description: "تفاصيل التكليف ".repeat(500),
    due_date: "2026-10-28",
    remaining_days: 1
  });
  assert.match(task, /\*المدة المتبقية:\* يوم واحد/);
  assert.ok(task.length <= 4096);
});

test("meeting change templates state the change and retain complete meeting context", () => {
  const common = {
    recipient_name_ar: "عضو المجلس",
    title_ar: "اجتماع مجلس الجامعة",
    meeting_no: "MTG-2026-000055",
    scheduled_date: "2026-11-02",
    start_time: "09:00",
    agenda_titles: ["اعتماد الخطة", "مناقشة التقرير"],
    meeting_url: "https://devqarar.prideidea.com/admin/meetings/m55"
  };
  assert.match(renderTemplate("meeting_postponed", common), /تأجيل أو تعديل موعد اجتماع/);
  assert.match(renderTemplate("meeting_cancelled", common), /إلغاء اجتماع/);
  const updated = renderTemplate("meeting_invitation_updated", common);
  assert.match(updated, /تحديث دعوة اجتماع/);
  assert.match(updated, /1\. اعتماد الخطة/);
  assert.match(updated, /MTG-2026-000055/);
});

test("optional legacy metadata is omitted without leaking UUID labels", () => {
  const text = renderTemplate("task_completed", {
    action_no: "TSK-2026-000032",
    title_ar: "اعتماد الخطة"
  });
  assert.equal(text.includes("القرار المرتبط"), false);
  assert.equal(text.includes("undefined"), false);
  assert.equal(text.includes("null"), false);
  assert.equal(text.endsWith(footer), true);
});

test("custom copy preserves authoritative details and the fixed footer",()=>{
  const text=renderTemplate("meeting_invitation",{recipient_name_ar:"تركي",title_ar:"مجلس الجامعة",meeting_no:"MTG-9",scheduled_date:"2026-10-21",custom_intro:"يسرّنا دعوتك:",custom_action:"نرجو تأكيد الحضور."});
  assert.match(text,/يسرّنا دعوتك/);assert.match(text,/MTG-9/);assert.match(text,/نرجو تأكيد الحضور/);assert.equal(text.endsWith(footer),true);
});
