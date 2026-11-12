import assert from "node:assert/strict";
import test from "node:test";
import { runDispatchBatch, templateFor } from "../src/dispatcher.mjs";
import { renderTemplate } from "../src/templates.mjs";

test("maps oversight events to their own templates", () => {
  assert.equal(templateFor({ event_type: "oversight.violation.detected", payload: {} }), "oversight_violation");
  assert.equal(templateFor({ event_type: "oversight.violation.escalated", payload: {} }), "oversight_escalation");
  assert.equal(templateFor({ event_type: "oversight.digest", payload: {} }), "oversight_digest");
});

test("a violation tells the council's leader what is late and where to act", () => {
  const text = renderTemplate("oversight_violation", {
    recipient_name_ar: "رئيس القسم", rule_name_ar: "محضر لم يُعتمد بعد", governance_unit_name_ar: "مجلس قسم الذكاء الاصطناعي",
    subject_label: "اجتماع أكتوبر", due_since: "2026-11-05", violation_url: "https://devqarar.prideidea.com/admin/meetings/m1",
  });
  assert.match(text, /^\*قرار \| تجاوز في مجلسك\*/);
  assert.match(text, /\*نوع التجاوز:\* محضر لم يُعتمد بعد/);
  assert.match(text, /\*المجلس:\* مجلس قسم الذكاء الاصطناعي/);
  assert.match(text, /\*البند:\* اجتماع أكتوبر/);
  assert.match(text, /\*متأخر منذ:\*/);
  assert.match(text, /\*للمعالجة:\* https:\/\/devqarar\.prideidea\.com\/admin\/meetings\/m1/);
});

test("an escalation names the level, the council and how long it has been open", () => {
  const text = renderTemplate("oversight_escalation", {
    recipient_name_ar: "العميد", rule_name_ar: "تكليف متأخر عن موعده", governance_unit_name_ar: "مجلس قسم أ1",
    subject_label: "TSK-1 رفع الخطة", days_open: 6, escalation_level: 1, due_since: "2026-11-06",
  });
  assert.match(text, /^\*قرار \| تصعيد تجاوز\*/);
  assert.match(text, /لم يُعالَج في المجلس خلال المهلة/);
  assert.match(text, /\*مدة التأخر:\* 6 أيام/);
  assert.match(text, /\*مستوى التصعيد:\* أقرب متابع/);
});

test("the daily digest summarises a follower's scope in one message", () => {
  const text = renderTemplate("oversight_digest", {
    recipient_name_ar: "طارق", digest_date: "2026-11-12", total_open: 42, council_count: 18,
    by_rule: [{ name_ar: "اجتماع دوري لم ينعقد في موعده", count: 25 }, { name_ar: "موضوع متوقف في المجلس", count: 16 }, { name_ar: "تكليف متأخر عن موعده", count: 1 }],
    oldest: [{ council_name_ar: "مجلس قسم التسويق", rule_name_ar: "موضوع متوقف في المجلس", subject_label: "T-9 خطة", days_open: 61 }],
    violations_url: "https://devqarar.prideidea.com/admin/violations",
  });
  assert.match(text, /^\*قرار \| ملخص المتابعة اليومي\*/);
  assert.match(text, /\*التجاوزات المفتوحة:\* 42 في 18 مجلسًا/);
  assert.match(text, /• اجتماع دوري لم ينعقد في موعده: 25/);
  assert.match(text, /الأقدم:\n1\. مجلس قسم التسويق — موضوع متوقف في المجلس: T-9 خطة \(61 يومًا\)/);
  assert.match(text, /\*عرض الكل:\* https:\/\/devqarar\.prideidea\.com\/admin\/violations/);
  assert.ok(text.length <= 4096);
});

test("links are built from the application origin; a payload link outside /admin is dropped", async () => {
  const variables = [];
  const client = {
    claimEvents: async () => [{ id: "good", lock_token: "l1" }, { id: "evil", lock_token: "l2" }],
    getDispatchContext: async id => ({ event_type: "oversight.violation.escalated", recipient_active: true, mobile: "+967771234567",
      payload: { subject_link: id === "good" ? "/admin/tasks?task=t1" : "https://evil.example/x", violation_url: "https://evil.example/leak" } }),
    materializeDelivery: async (_id, _lock, _code, _destination, value) => variables.push(value),
    skipDelivery: async () => {}, failEvent: async () => {},
  };
  await runDispatchBatch({ client, appBaseUrl: "https://devqarar.prideidea.com/" });
  assert.equal(variables[0].violation_url, "https://devqarar.prideidea.com/admin/tasks?task=t1");
  assert.equal(variables[1].violation_url, undefined);
  assert.equal(variables[0].violations_url, "https://devqarar.prideidea.com/admin/violations");
});
