"use client";

import { useState } from "react";
import { Building2, CalendarDays, ChevronDown, X } from "lucide-react";
import type { CouncilFormOptions, CouncilFormValues } from "../model/types";

function emptyValues(options: CouncilFormOptions): CouncilFormValues {
  return { nameAr: "", nameEn: "", description: "", unitTypeId: "", scopeUnitId: "", parentCouncilId: "", governanceClassId: "", minimumActiveMembers: 3, allowDualLeadership: false, createMeetingPlan: false, meetingTypeId: options.meeting_types?.[0]?.id ?? "", recurrence: "monthly", firstMeetingDate: "", startTime: "09:00", endTime: "11:00", planEndsOn: "", missedAfterDays: 7 };
}

export function CouncilFormDialog({ options, mode = "create", initialValues, onClose, onSubmit }: { options: CouncilFormOptions; mode?: "create" | "edit"; initialValues?: CouncilFormValues; onClose: () => void; onSubmit: (values: CouncilFormValues) => Promise<void> }) {
  const [values, setValues] = useState(initialValues ?? emptyValues(options));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof CouncilFormValues>(key: K, value: CouncilFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onSubmit(values); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حفظ بيانات المجلس."); } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#06162d]/55 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="council-dialog-title">
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/40 bg-white shadow-[0_28px_80px_rgba(5,24,52,.28)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e5edf4] bg-white/95 px-4 py-4 backdrop-blur sm:px-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0872df] text-white"><Building2 size={21} /></span><div><p className="text-[10px] font-black text-[#f17822]">{mode === "create" ? "تأسيس مجلس" : "تحديث البيانات"}</p><h2 id="council-dialog-title" className="text-base font-black text-[#0a1830]">{mode === "create" ? "إنشاء مجلس جديد" : "تعديل بيانات المجلس"}</h2><p className="mt-1 text-[10px] text-[#718399]">أدخل البيانات الضرورية فقط، ويمكن استكمال القيادة والأعضاء لاحقاً.</p></div><button type="button" onClick={onClose} className="mr-auto grid h-9 w-9 place-items-center rounded-xl text-[#718399] hover:bg-[#f2f6fa]" aria-label="إغلاق"><X size={19} /></button></header>
      <div className="space-y-5 p-4 sm:p-6">
        {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المجلس" className="sm:col-span-2"><input required value={values.nameAr} onChange={(event) => update("nameAr", event.target.value)} className={inputClass} placeholder="مثال: مجلس كلية العلوم" /></Field>
          <Field label="نوع المجلس"><select required value={values.unitTypeId} onChange={(event) => update("unitTypeId", event.target.value)} className={inputClass}><option value="">اختر النوع</option>{options.council_types.map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>
          {mode === "create" && <Field label="النطاق التنظيمي" hint="الكلية أو القسم أو الجهة التي يغطيها المجلس"><select value={values.scopeUnitId} onChange={(event) => update("scopeUnitId", event.target.value)} className={inputClass}><option value="">المؤسسة كاملة</option>{(options.scope_units ?? []).map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>}
        </section>
        {mode === "create" && <section className={`rounded-2xl border p-4 transition ${values.createMeetingPlan ? "border-[#9bc9f2] bg-[#f4f9ff]" : "border-[#dce6ef] bg-[#fbfdff]"}`}>
          <label className={`flex items-start gap-3 ${(options.meeting_types?.length ?? 0) > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-65"}`}><input type="checkbox" disabled={(options.meeting_types?.length ?? 0) === 0} checked={values.createMeetingPlan} onChange={(event) => update("createMeetingPlan", event.target.checked)} className="mt-1 h-4 w-4 accent-[#0872df]"/><span><strong className="block text-xs font-black text-[#223950]">إنشاء خطة اجتماعات لهذا المجلس</strong><span className="mt-1 block text-[10px] leading-5 text-[#718399]">يحفظ النظام الدورية، ولا ينشئ اجتماعات منعقدة تلقائياً.</span>{(options.meeting_types?.length ?? 0) === 0 && <span className="mt-2 block rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800">أضف نوع اجتماع فعالاً أولاً حتى تتمكن من إنشاء الخطة.</span>}</span></label>
          {values.createMeetingPlan && <div className="mt-4 grid gap-4 border-t border-[#dce9f5] pt-4 sm:grid-cols-2">
            {(options.meeting_types?.length ?? 0) > 1 && <Field label="نوع الاجتماع"><select required value={values.meetingTypeId} onChange={(event) => update("meetingTypeId", event.target.value)} className={inputClass}><option value="">اختر النوع</option>{options.meeting_types?.map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>}
            <Field label="الدورية"><select value={values.recurrence} onChange={(event) => update("recurrence", event.target.value as CouncilFormValues["recurrence"])} className={inputClass}><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option><option value="quarterly">كل ثلاثة أشهر</option><option value="semiannual">كل ستة أشهر</option><option value="annual">سنوية</option></select></Field>
            <Field label="موعد أول اجتماع"><input required type="date" value={values.firstMeetingDate} onChange={(event) => update("firstMeetingDate", event.target.value)} className={inputClass}/></Field>
            <Field label="وقت البداية"><input required type="time" value={values.startTime} onChange={(event) => update("startTime", event.target.value)} className={inputClass}/></Field>
            <Field label="وقت النهاية"><input required type="time" value={values.endTime} onChange={(event) => update("endTime", event.target.value)} className={inputClass}/></Field>
          </div>}
        </section>}
        <section className="rounded-2xl border border-[#e1e9f1] bg-white">
          <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)} className="flex min-h-12 w-full items-center gap-2 px-4 text-right text-xs font-black text-[#40566e]">الإعدادات المتقدمة <span className="text-[10px] font-normal text-[#8a99aa]">اختيارية</span><ChevronDown size={16} className={`mr-auto transition ${advancedOpen ? "rotate-180" : ""}`}/></button>
          {advancedOpen && <div className="grid gap-4 border-t border-[#e8eef4] p-4 sm:grid-cols-2">
            <Field label="الاسم الإنجليزي"><input dir="ltr" value={values.nameEn} onChange={(event) => update("nameEn", event.target.value)} className={inputClass}/></Field>
            <Field label="الحد الأدنى للأعضاء"><input type="number" min={1} max={999} value={values.minimumActiveMembers} onChange={(event) => update("minimumActiveMembers", Number(event.target.value))} className={inputClass}/></Field>
            {mode === "create" && <Field label="المجلس الأعلى" hint="اختياري للمجالس التابعة"><select value={values.parentCouncilId} onChange={(event) => update("parentCouncilId", event.target.value)} className={inputClass}><option value="">لا يوجد</option>{options.parent_units.map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>}
            {values.createMeetingPlan && <><Field label="نهاية الخطة" hint="اتركها فارغة إذا كانت الخطة مستمرة"><input type="date" value={values.planEndsOn} onChange={(event) => update("planEndsOn", event.target.value)} className={inputClass}/></Field><Field label="مهلة اعتبار الموعد فائتاً بالأيام" hint="تستخدم للتنبيه ولا تغيّر حالة الاجتماع تلقائياً"><input type="number" min={0} max={90} value={values.missedAfterDays} onChange={(event) => update("missedAfterDays", Number(event.target.value))} className={inputClass}/></Field></>}
            <label className="flex items-center gap-3 rounded-xl border border-[#dbe6ef] bg-[#f8fbfe] p-4 text-xs font-bold text-[#42566f]"><input type="checkbox" checked={values.allowDualLeadership} onChange={(event) => update("allowDualLeadership", event.target.checked)} className="h-4 w-4 accent-[#0872df]"/>السماح للرئيس أن يكون مقرراً</label>
            <Field label="الوصف" className="sm:col-span-2"><textarea rows={3} value={values.description} onChange={(event) => update("description", event.target.value)} className={`${inputClass} h-auto py-3`} placeholder="اختصاص المجلس باختصار..."/></Field>
          </div>}
        </section>
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-[#e5edf4] bg-[#fbfdff] px-4 py-4 sm:px-6"><button type="button" onClick={onClose} className="h-10 rounded-xl border border-[#d8e3ed] px-5 text-xs font-bold text-[#52647a]">إلغاء</button><button disabled={saving} className="h-10 rounded-xl bg-[#0872df] px-6 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.2)] disabled:opacity-60">{saving ? "جارٍ الحفظ…" : mode === "create" ? <span className="inline-flex items-center gap-2"><CalendarDays size={15}/>إنشاء المجلس</span> : "حفظ التعديلات"}</button></footer>
    </form>
  </div>;
}

const inputClass = "h-11 w-full rounded-xl border border-[#d8e3ed] bg-white px-3 text-xs text-[#172a42] outline-none transition focus:border-[#0872df] focus:ring-4 focus:ring-[#0872df]/10";
function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-1.5 block text-xs font-black text-[#31465f]">{label}</span>{children}{hint && <span className="mt-1 block text-[9px] leading-4 text-[#8a99aa]">{hint}</span>}</label>; }
