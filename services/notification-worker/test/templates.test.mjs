import assert from "node:assert/strict";
import test from "node:test";
import { renderTemplate } from "../src/templates.mjs";

const footer = "_نظام قرار - جامعة الرازي_";

test("meeting invitation is a readable Arabic card with reference, schedule, location and footer", () => {
  const text = renderTemplate("meeting_invitation", {
    recipient_name_ar: "تركي القباني",
    title_ar: "الاجتماع الدوري لمجلس الجامعة",
    meeting_no: "MTG-2026-000021",
    governance_unit_name_ar: "مجلس الجامعة",
    scheduled_date: "2026-10-21",
    start_time: "10:00:00",
    end_time: "11:30:00",
    location_type: "physical",
    location_details: "قاعة المجلس الرئيسية"
  });
  assert.match(text, /^\*قرار \| دعوة اجتماع\*/);
  assert.match(text, /مرحبًا تركي القباني/);
  assert.match(text, /\*الرقم المرجعي:\* MTG-2026-000021/);
  assert.match(text, /\*التاريخ:\* الأربعاء، 21 أكتوبر 2026/);
  assert.match(text, /\*الوقت:\* 10:00 ص – 11:30 ص/);
  assert.match(text, /\*المكان:\* قاعة المجلس الرئيسية/);
  assert.equal(text.endsWith(footer), true);
  assert.equal(text.includes("2026-10-21"), false);
});

test("task assignment shows its identifier, decision, role, due date and summary", () => {
  const text = renderTemplate("task_created_assignee", {
    recipient_name_ar: "أحمد علي",
    action_no: "TSK-2026-000031",
    decision_no: "DEC-2026-000014",
    title_ar: "إعداد خطة التنفيذ",
    description: "إعداد الخطة التنفيذية ورفعها للمراجعة.",
    due_date: "2026-10-25"
  });
  assert.match(text, /\*قرار \| تكليف جديد\*/);
  assert.match(text, /\*رقم التكليف:\* TSK-2026-000031/);
  assert.match(text, /\*القرار المرتبط:\* DEC-2026-000014/);
  assert.match(text, /\*صفتك:\* المكلّف بالتنفيذ/);
  assert.match(text, /\*موعد الإنجاز:\* الأحد، 25 أكتوبر 2026/);
  assert.match(text, /\*ملخص التكليف:\* إعداد الخطة التنفيذية ورفعها للمراجعة\./);
  assert.equal(text.endsWith(footer), true);
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
