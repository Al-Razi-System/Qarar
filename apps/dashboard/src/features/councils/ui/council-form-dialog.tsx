"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { councilRpc } from "../api/councils-client";
import { Building2, CalendarDays, ChevronDown, X } from "lucide-react";
import type { CouncilFormOptions, CouncilFormValues } from "../model/types";

function emptyValues(options: CouncilFormOptions): CouncilFormValues {
  return { nameAr: "", nameEn: "", description: "", unitTypeId: "", scopeUnitId: "", governanceClassId: "", minimumActiveMembers: 3, allowDualLeadership: false, createMeetingPlan: false, meetingTypeId: options.meeting_types?.[0]?.id ?? "", recurrence: "monthly", firstMeetingDate: "", planEndsOn: "", missedAfterDays: 7 };
}

export function CouncilFormDialog({ options: initialOptions, mode = "create", initialValues, onClose, onSubmit }: { options: CouncilFormOptions; mode?: "create" | "edit"; initialValues?: CouncilFormValues; onClose: () => void; onSubmit: (values: CouncilFormValues) => Promise<void> }) {
  const [options, setOptions] = useState(initialOptions);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");
  const [values, setValues] = useState(initialValues ?? emptyValues(options));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const update = <K extends keyof CouncilFormValues>(key: K, value: CouncilFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  async function refreshOptions() {
    if (refreshing) return;
    setRefreshing(true); setError(""); setRefreshNotice("");
    try {
      const next = await councilRpc<CouncilFormOptions>("get_council_form_options");
      setOptions(next);
      setValues((current) => ({ ...current, meetingTypeId: current.meetingTypeId || next.meeting_types?.[0]?.id || "" }));
      setRefreshNotice("تم تحديث القوائم، ومدخلاتك محفوظة.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحديث القوائم."); }
    finally { setRefreshing(false); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy.current) return; busy.current = true; setSaving(true); setError("");
    try { await onSubmit(values); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حفظ بيانات المجلس."); } finally { busy.current = false; setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#06162d]/55 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="council-dialog-title">
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-white/40 bg-white shadow-[0_28px_80px_rgba(5,24,52,.28)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e5edf4] bg-white/95 px-4 py-4 backdrop-blur sm:px-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0872df] text-white"><Building2 size={21} /></span><div><p className="text-[10px] font-black text-[#f17822]">{mode === "create" ? "تأسيس مجلس" : "تحديث البيانات"}</p><h2 id="council-dialog-title" className="text-base font-black text-[#0a1830]">{mode === "create" ? "إنشاء مجلس جديد" : "تعديل بيانات المجلس"}</h2><p className="mt-1 text-[10px] text-[#718399]">أدخل البيانات الضرورية فقط، ويمكن استكمال القيادة والأعضاء لاحقاً.</p></div><button type="button" disabled={saving} onClick={onClose} className="mr-auto grid h-9 w-9 place-items-center rounded-xl text-[#718399] hover:bg-[#f2f6fa]" aria-label="إغلاق"><X size={19} /></button></header>
      <div className="space-y-5 p-4 sm:p-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المجلس" className="sm:col-span-2"><input required value={values.nameAr} onChange={(event) => update("nameAr", event.target.value)} className={inputClass} placeholder="مثال: مجلس كلية العلوم" /></Field>
          <Field label="نوع المجلس"><select required value={values.unitTypeId} onChange={(event) => update("unitTypeId", event.target.value)} className={inputClass}><option value="">اختر النوع</option>{options.council_types.map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>
          {mode === "create" && <Field label="الوحدة التنظيمية" hint="اختر الكلية أو القسم أو الإدارة؛ الوحدة المختارة تحدد نطاق المجلس دون اختيار نطاق آخر"><select value={values.scopeUnitId} onChange={(event) => update("scopeUnitId", event.target.value)} className={inputClass}><option value="">المؤسسة كاملة — دون وحدة محددة</option>{(options.scope_units ?? []).map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>}
        </section>
        {mode === "create" && <div className="flex flex-wrap items-center gap-3 text-xs"><Link href="/admin/organizational-units" target="_blank" rel="noopener noreferrer" className="font-bold text-[#0872df] underline">إدارة الوحدات التنظيمية</Link><button type="button" disabled={refreshing || saving} onClick={() => void refreshOptions()} className="rounded-lg border px-3 py-2 text-[#40566e] disabled:opacity-60">{refreshing ? "جارٍ تحديث القوائم…" : "تحديث القوائم بعد الإضافة"}</button>{refreshNotice && <p role="status" className="text-emerald-700">{refreshNotice}</p>}</div>}
        {mode === "create" && <section className={`rounded-2xl border p-4 transition ${values.createMeetingPlan ? "border-[#9bc9f2] bg-[#f4f9ff]" : "border-[#dce6ef] bg-[#fbfdff]"}`}>
          <label className={`flex items-start gap-3 ${(options.meeting_types?.length ?? 0) > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-65"}`}><input type="checkbox" disabled={(options.meeting_types?.length ?? 0) === 0} checked={values.createMeetingPlan} onChange={(event) => update("createMeetingPlan", event.target.checked)} className="mt-1 h-4 w-4 accent-[#0872df]"/><span><strong className="block text-xs font-black text-[#223950]">إنشاء خطة اجتماعات لهذا المجلس</strong><span className="mt-1 block text-[10px] leading-5 text-[#718399]">يحفظ النظام الدورية وينشئ أول اجتماع كمسودة؛ لا يبدأ انعقاده تلقائياً.</span>{(options.meeting_types?.length ?? 0) === 0 && <span className="mt-2 block rounded-lg bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-800">أضف نوع اجتماع فعالاً أولاً حتى تتمكن من إنشاء الخطة.</span>}</span></label>
          {(options.meeting_types?.length ?? 0) === 0 && <p className="mt-3 text-xs text-[#52647a]">نوع الاجتماع تصنيف مثل «اجتماع دوري»، وليس حالة انعقاده. <Link href="/admin/settings/meeting-types" target="_blank" rel="noopener noreferrer" className="font-bold text-[#0872df] underline">إعداد أنواع الاجتماعات</Link> ثم حدّث القوائم أعلاه.</p>}
          {values.createMeetingPlan && <div className="mt-4 grid gap-4 border-t border-[#dce9f5] pt-4 sm:grid-cols-2">
            {(options.meeting_types?.length ?? 0) > 1 && <Field label="نوع الاجتماع"><select required value={values.meetingTypeId} onChange={(event) => update("meetingTypeId", event.target.value)} className={inputClass}><option value="">اختر النوع</option>{options.meeting_types?.map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>}
            <Field label="الدورية"><select value={values.recurrence} onChange={(event) => update("recurrence", event.target.value as CouncilFormValues["recurrence"])} className={inputClass}><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option><option value="quarterly">كل ثلاثة أشهر</option><option value="semiannual">كل ستة أشهر</option><option value="annual">سنوية</option></select></Field>
            <Field label="موعد أول اجتماع"><input required type="date" value={values.firstMeetingDate} onChange={(event) => update("firstMeetingDate", event.target.value)} className={inputClass}/></Field>
          </div>}
        </section>}
        <section className="rounded-2xl border border-[#e1e9f1] bg-white">
          <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)} className="flex min-h-12 w-full items-center gap-2 px-4 text-right text-xs font-black text-[#40566e]">الإعدادات المتقدمة <span className="text-[10px] font-normal text-[#8a99aa]">اختيارية</span><ChevronDown size={16} className={`mr-auto transition ${advancedOpen ? "rotate-180" : ""}`}/></button>
          {advancedOpen && <div className="grid gap-4 border-t border-[#e8eef4] p-4 sm:grid-cols-2">
            <Field label="الاسم الإنجليزي"><input dir="ltr" value={values.nameEn} onChange={(event) => update("nameEn", event.target.value)} className={inputClass}/></Field>
            <Field label="الحد الأدنى للأعضاء"><input type="number" min={1} max={999} value={values.minimumActiveMembers} onChange={(event) => update("minimumActiveMembers", Number(event.target.value))} className={inputClass}/></Field>
            {values.createMeetingPlan && <><Field label="نهاية الخطة" hint="اتركها فارغة إذا كانت الخطة مستمرة"><input type="date" value={values.planEndsOn} onChange={(event) => update("planEndsOn", event.target.value)} className={inputClass}/></Field><Field label="مهلة اعتبار الموعد فائتاً بالأيام" hint="تستخدم للتنبيه ولا تغيّر حالة الاجتماع تلقائياً"><input type="number" min={0} max={90} value={values.missedAfterDays} onChange={(event) => update("missedAfterDays", Number(event.target.value))} className={inputClass}/></Field></>}
            <label className="flex items-center gap-3 rounded-xl border border-[#dbe6ef] bg-[#f8fbfe] p-4 text-xs font-bold text-[#42566f]"><input type="checkbox" checked={values.allowDualLeadership} onChange={(event) => update("allowDualLeadership", event.target.checked)} className="h-4 w-4 accent-[#0872df]"/>السماح للرئيس أن يكون مقرراً</label>
            <Field label="الوصف" className="sm:col-span-2"><textarea rows={3} value={values.description} onChange={(event) => update("description", event.target.value)} className={`${inputClass} h-auto py-3`} placeholder="اختصاص المجلس باختصار..."/></Field>
          </div>}
        </section>
      </div>
      <footer className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-3 border-t border-[#e5edf4] bg-[#fbfdff] px-4 py-4 sm:px-6">{error && <div role="alert" className="w-full rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}<button type="button" disabled={saving} onClick={onClose} className="h-10 rounded-xl border border-[#d8e3ed] px-5 text-xs font-bold text-[#52647a]">إلغاء</button><button disabled={saving} className="h-10 rounded-xl bg-[#0872df] px-6 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.2)] disabled:opacity-60">{saving ? "جارٍ الحفظ…" : mode === "create" ? <span className="inline-flex items-center gap-2"><CalendarDays size={15}/>إنشاء المجلس</span> : "حفظ التعديلات"}</button></footer>
    </form>
  </div>;
}

const inputClass = "h-11 w-full rounded-xl border border-[#d8e3ed] bg-white px-3 text-xs text-[#172a42] outline-none transition focus:border-[#0872df] focus:ring-4 focus:ring-[#0872df]/10";
function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-1.5 block text-xs font-black text-[#31465f]">{label}</span>{children}{hint && <span className="mt-1 block text-[9px] leading-4 text-[#8a99aa]">{hint}</span>}</label>; }
