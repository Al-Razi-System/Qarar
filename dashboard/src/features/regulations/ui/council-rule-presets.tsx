"use client";

import { useState } from "react";
import { AlertCircle, CalendarClock, Check, FileSignature, Scale, ShieldCheck, Users } from "lucide-react";
import type { Policy, PolicyItem } from "../model/types";

type Preset = "conflict" | "quorum" | "vote" | "notice" | "absence" | "minutes" | "monthly";
const presets: Array<{ id: Preset; title: string; description: string; icon: React.ReactNode }> = [
  { id: "conflict", title: "تعارض المصالح", description: "الإفصاح والانسحاب ومنع التصويت", icon: <Scale size={17}/> },
  { id: "quorum", title: "النصاب", description: "منع بدء الاجتماع قبل اكتمال الحضور", icon: <Users size={17}/> },
  { id: "vote", title: "نسبة القرار", description: "احتساب نسبة الأصوات المطلوبة", icon: <ShieldCheck size={17}/> },
  { id: "notice", title: "مهلة الدعوة", description: "التحقق من إرسال الدعوة قبل الاجتماع", icon: <CalendarClock size={17}/> },
  { id: "absence", title: "الغياب المتكرر", description: "تنبيه طلب استبدال العضو", icon: <AlertCircle size={17}/> },
  { id: "minutes", title: "محضر الاجتماع", description: "إلزام المحضر والتوقيعات والحفظ", icon: <FileSignature size={17}/> },
  { id: "monthly", title: "الاجتماع الدوري", description: "مرة واحدة على الأقل كل شهر", icon: <CalendarClock size={17}/> },
];
const input = "h-10 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-[10px] outline-none focus:border-[#0066cc]";

async function rpc(contract: string, params: Record<string, unknown>) {
  const response = await fetch("/api/admin/regulations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params }) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر حفظ القاعدة.");
  return payload.data;
}

function ruleFor(preset: Preset, item: PolicyItem, threshold: number, days: number, priority: number) {
  const safeItemCode = item.item_code.toLowerCase().replace(/[^a-z0-9_.-]+/g, "-").replace(/^[^a-z]+/, "rule-");
  const base = { code: `${safeItemCode}.${preset}`, name_ar: `${presets.find((x) => x.id === preset)?.title} - ${item.title_ar}`, rule_type: "requirement", status: "active", priority, applies_when: {}, effect_payload: {}, requires_workflow: false, conditions: [] as Record<string, unknown>[], requirements: [] as Record<string, unknown>[], authorities: [], actions: [] as Record<string, unknown>[], workflow_bindings: [] };
  if (preset === "conflict") return { ...base, rule_type: "prohibition", conditions: [{ code: "member.conflict", field_path: "meeting.member_has_conflict", operator: "eq", expected_value: false, failure_action: "block", failure_message_ar: "يجب الإفصاح عن تعارض المصالح والانسحاب من المناقشة والتصويت." }], actions: [{ code: "withdraw", label_ar: "انسحاب من المناقشة والتصويت", action_type: "return", is_terminal: false, requires_reason: true, result_payload: { excluded_from_vote: true } }] };
  if (preset === "quorum") return { ...base, rule_type: "eligibility", conditions: [{ code: "meeting.quorum", field_path: "meeting.attendance_ratio", operator: "gte", expected_value: threshold / 100, failure_action: "block", failure_message_ar: `لا يمكن بدء الاجتماع قبل اكتمال النصاب (${threshold}%).` }], actions: [{ code: "open_session", label_ar: "بدء الاجتماع", action_type: "execute", is_terminal: false, requires_reason: false, result_payload: { quorum_verified: true } }] };
  if (preset === "vote") return { ...base, rule_type: "calculation", conditions: [{ code: "vote.threshold", field_path: "vote.approval_ratio", operator: "gte", expected_value: threshold / 100, failure_action: "reject", failure_message_ar: `لم تتحقق نسبة الأصوات المطلوبة (${threshold}%).` }], actions: [{ code: "approved", label_ar: "اعتماد القرار", action_type: "approve", is_terminal: true, requires_reason: false, result_payload: { decision: "approved" } }] };
  if (preset === "notice") return { ...base, rule_type: "deadline", conditions: [{ code: "meeting.notice", field_path: "meeting.notice_days", operator: "gte", expected_value: days, failure_action: "return_for_completion", failure_message_ar: `يجب إرسال الدعوة قبل الاجتماع بـ ${days} يوم على الأقل.` }] };
  if (preset === "absence") return { ...base, conditions: [{ code: "member.absence", field_path: "member.consecutive_unexcused_absences", operator: "lt", expected_value: 3, failure_action: "warn", failure_message_ar: "بلغ العضو ثلاث حالات غياب متوالية دون عذر؛ يلزم طلب الاستبدال." }], actions: [{ code: "replace_member", label_ar: "طلب استبدال العضو", action_type: "refer", is_terminal: false, requires_reason: true, result_payload: { membership_review_required: true } }] };
  if (preset === "minutes") return { ...base, requirements: [{ code: "signed_minutes", name_ar: "محضر اجتماع موقع من الرئيس والمقرر", requirement_type: "document", is_mandatory: true, timing: "after_decision", validation_spec: { allowed_mime_types: ["application/pdf"], required_signatures: ["chair", "rapporteur"] } }] };
  return { ...base, rule_type: "deadline", conditions: [{ code: "meeting.monthly", field_path: "meeting.days_since_previous", operator: "lte", expected_value: 31, failure_action: "warn", failure_message_ar: "يجب عقد اجتماع دوري مرة واحدة على الأقل كل شهر." }] };
}

export function CouncilRulePresets({ policy }: { policy: Policy }) {
  const drafts = policy.versions?.filter((version) => version.legal_status === "draft") ?? [];
  const [versionId, setVersionId] = useState(drafts[0]?.id ?? "");
  const version = drafts.find((entry) => entry.id === versionId);
  const items = version?.items.filter((item) => ["article", "clause", "procedure"].includes(item.item_type)) ?? [];
  const [itemId, setItemId] = useState(items[0]?.id ?? "");
  const [preset, setPreset] = useState<Preset>("quorum");
  const [threshold, setThreshold] = useState(67);
  const [days, setDays] = useState(2);
  const [priority, setPriority] = useState(100);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "success"|"error"; text: string }|null>(null);
  if (!drafts.length) return null;
  const item = items.find((entry) => entry.id === itemId);
  async function save() {
    if (!item) return;
    setBusy(true);setNotice(null);
    try {
      await rpc("admin_update_policy_item_legal_text", { p_policy_item_id: item.id, p_official_text: item.official_text ?? item.body_text ?? null, p_interpretation_text: item.interpretation_text ?? null, p_source_page_from: item.source_page_from ?? null, p_source_page_to: item.source_page_to ?? null, p_source_locator: item.source_locator ?? null, p_legal_status: item.legal_status ?? "active", p_amendment_note: item.amendment_note ?? null, p_requires_executable_rule: true, p_supersedes_item_id: item.supersedes_item_id ?? null });
      await rpc("admin_save_policy_rule", { p_policy_item_id: item.id, p_rule: ruleFor(preset, item, threshold, days, priority) });
      setNotice({ kind: "success", text: "تم إنشاء القاعدة بكل شروطها ورسائلها ونتائجها. حدّث النموذج التشريعي لمراجعتها." });
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر حفظ القاعدة." }); }
    finally { setBusy(false); }
  }
  return <section className="overflow-hidden rounded-2xl border border-[#d8e4ef] bg-white shadow-sm">
    <header className="border-b border-[#e7edf4] bg-gradient-to-l from-[#082451] to-[#0066cc] p-5 text-white"><p className="text-[9px] font-black text-orange-200">قوالب المجالس الذكية</p><h2 className="mt-1 text-lg font-black">منشئ قواعد الاجتماعات والنصاب والتصويت</h2><p className="mt-2 text-[10px] text-blue-100">اختر المادة ثم طبّق قاعدة قانونية جاهزة مع رسالة فشل ونتيجة قابلة للتدقيق.</p></header>
    <div className="space-y-4 p-5">{notice&&<div role="status" className={`rounded-xl border p-3 text-[10px] font-bold ${notice.kind==="success"?"border-emerald-200 bg-emerald-50 text-emerald-800":"border-red-200 bg-red-50 text-red-800"}`}>{notice.kind==="success"?<Check className="ml-2 inline" size={14}/>:<AlertCircle className="ml-2 inline" size={14}/>} {notice.text}</div>}
      <div className="grid gap-3 md:grid-cols-2"><label className="text-[9px] font-black text-[#344861]">الإصدار<select className={`${input} mt-1`} value={versionId} onChange={(e)=>{setVersionId(e.target.value);setItemId("");}}>{drafts.map((entry)=><option key={entry.id} value={entry.id}>{entry.version_label||entry.version_no}</option>)}</select></label><label className="text-[9px] font-black text-[#344861]">المادة<select className={`${input} mt-1`} value={itemId} onChange={(e)=>setItemId(e.target.value)}><option value="">اختر المادة</option>{items.map((entry)=><option key={entry.id} value={entry.id}>{entry.item_code} · {entry.title_ar}</option>)}</select></label></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{presets.map((entry)=><button type="button" key={entry.id} onClick={()=>setPreset(entry.id)} className={`rounded-xl border p-3 text-right transition ${preset===entry.id?"border-[#69adf0] bg-[#edf6ff] text-[#0066cc]":"border-[#e1e9f1] text-[#40546b]"}`}><span className="mb-2 grid h-8 w-8 place-items-center rounded-lg bg-white shadow-sm">{entry.icon}</span><strong className="block text-[10px]">{entry.title}</strong><small className="mt-1 block text-[8px] opacity-75">{entry.description}</small></button>)}</div>
      <div className="grid gap-3 rounded-xl bg-[#f7fafc] p-4 sm:grid-cols-3"><label className="text-[9px] font-bold">النسبة المطلوبة %<input type="number" min="1" max="100" className={`${input} mt-1`} value={threshold} onChange={(e)=>setThreshold(Number(e.target.value))}/></label><label className="text-[9px] font-bold">المهلة بالأيام<input type="number" min="0" className={`${input} mt-1`} value={days} onChange={(e)=>setDays(Number(e.target.value))}/></label><label className="text-[9px] font-bold">أولوية القاعدة<input type="number" min="0" className={`${input} mt-1`} value={priority} onChange={(e)=>setPriority(Number(e.target.value))}/></label></div>
      <button type="button" disabled={busy||!item} onClick={()=>void save()} className="h-10 rounded-xl bg-[#0066cc] px-5 text-[10px] font-black text-white disabled:opacity-50">{busy?"جارٍ إنشاء القاعدة...":"إنشاء القاعدة وربطها بالمادة"}</button>
    </div>
  </section>;
}
