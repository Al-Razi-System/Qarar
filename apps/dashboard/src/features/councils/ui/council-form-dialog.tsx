"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { councilRpc } from "../api/councils-client";
import { Building2, CalendarDays, ChevronDown, X } from "lucide-react";
import { Button } from "@/shared/ui/button";
import type { CouncilDetail, CouncilFormOptions, CouncilFormValues } from "../model/types";

const recurrenceNames: Record<string, string> = {weekly:"أسبوعية",monthly:"شهرية",quarterly:"كل ثلاثة أشهر",semiannual:"كل ستة أشهر",annual:"سنوية"};

function emptyValues(options: CouncilFormOptions): CouncilFormValues {
  return { nameAr: "", nameEn: "", description: "", unitTypeId: "", scopeUnitId: "", governanceClassId: "", minimumActiveMembers: 3, allowDualLeadership: false, createMeetingPlan: false, meetingTypeId: options.meeting_types?.[0]?.id ?? "", recurrence: "monthly", firstMeetingDate: "", planEndsOn: "", missedAfterDays: 7 };
}

export function CouncilFormDialog({ options: initialOptions, mode = "create", initialValues, existingPlan, canCreateMeetingPlan = true, onClose, onSubmit }: { options: CouncilFormOptions; mode?: "create" | "edit"; initialValues?: CouncilFormValues; existingPlan?: CouncilDetail["meeting_plan"]; canCreateMeetingPlan?: boolean; onClose: () => void; onSubmit: (values: CouncilFormValues) => Promise<void> }) {
  const [options, setOptions] = useState(initialOptions);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");
  const [values, setValues] = useState({... (initialValues ?? emptyValues(options)), meetingTypeId: initialValues?.meetingTypeId || options.meeting_types?.[0]?.id || ""});
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
  return <div className="fixed inset-0 z-50 grid place-items-center bg-q-header/60 p-3 backdrop-blur-sm sm:p-4" role="dialog" aria-modal="true" aria-labelledby="council-dialog-title">
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-q-card border border-q-border bg-q-surface shadow-xl">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-q-border bg-q-surface px-4 py-4 backdrop-blur sm:px-6"><span className="grid h-11 w-11 place-items-center rounded-q-card bg-q-primary text-q-on-primary"><Building2 size={21} /></span><div><p className="text-q-caption font-black text-q-text-2">{mode === "create" ? "تأسيس مجلس" : "تحديث البيانات"}</p><h2 id="council-dialog-title" className="text-q-h3 font-black text-q-text-2">{mode === "create" ? "إنشاء مجلس جديد" : "تعديل بيانات المجلس"}</h2><p className="mt-1 text-q-caption text-q-text-2">أدخل البيانات الضرورية فقط، ويمكن استكمال القيادة والأعضاء لاحقاً.</p></div><button type="button" disabled={saving} onClick={onClose} className="mr-auto grid h-9 w-9 place-items-center rounded-q-control text-q-text-2 hover:bg-q-surface-2" aria-label="إغلاق"><X size={19} /></button></header>
      <div className="space-y-5 p-4 sm:p-6">
        <section className="grid gap-4 sm:grid-cols-2">
          <Field label="اسم المجلس" className="sm:col-span-2"><input required value={values.nameAr} onChange={(event) => update("nameAr", event.target.value)} className={inputClass} placeholder="مثال: مجلس كلية العلوم" /></Field>
          <Field label="نوع المجلس"><select required value={values.unitTypeId} onChange={(event) => update("unitTypeId", event.target.value)} className={inputClass}><option value="">اختر النوع</option>{options.council_types.map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>
          {mode === "create" && <Field label="الوحدة التنظيمية" hint="اختر الكلية أو القسم أو الإدارة؛ الوحدة المختارة تحدد نطاق المجلس دون اختيار نطاق آخر"><select value={values.scopeUnitId} onChange={(event) => update("scopeUnitId", event.target.value)} className={inputClass}><option value="">المؤسسة كاملة — دون وحدة محددة</option>{(options.scope_units ?? []).map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>}
        </section>
        {<div className="flex flex-wrap items-center gap-3 text-q-ui"><Link href="/admin/organizational-units" target="_blank" rel="noopener noreferrer" className="font-bold text-q-link underline">إدارة الوحدات التنظيمية</Link><button type="button" disabled={refreshing || saving} onClick={() => void refreshOptions()} className="rounded-q-control border px-3 py-2 text-q-text-2 disabled:opacity-60">{refreshing ? "جارٍ تحديث القوائم…" : "تحديث القوائم بعد الإضافة"}</button>{refreshNotice && <p role="status" className="text-q-success">{refreshNotice}</p>}</div>}
        {!existingPlan && <section className={`rounded-q-card border p-4 transition ${values.createMeetingPlan ? "border-q-primary bg-q-neutral-soft" : "border-q-border bg-q-surface-2"}`}>
          <label className={`flex items-start gap-3 ${(options.meeting_types?.length ?? 0) > 0 ? "cursor-pointer" : "cursor-not-allowed opacity-65"}`}><input type="checkbox" disabled={!canCreateMeetingPlan || (options.meeting_types?.length ?? 0) === 0} checked={values.createMeetingPlan} onChange={(event) => update("createMeetingPlan", event.target.checked)} className="mt-1 h-4 w-4 accent-q-primary"/><span><strong className="block text-q-ui font-black text-q-text-2">إنشاء خطة اجتماعات لهذا المجلس</strong><span className="mt-1 block text-q-caption leading-5 text-q-text-2">يحفظ النظام الدورية وينشئ أول اجتماع كمسودة؛ لا يبدأ انعقاده تلقائياً.</span>{(options.meeting_types?.length ?? 0) === 0 && <span className="mt-2 block rounded-q-control bg-q-surface-2 px-2 py-1.5 text-q-caption font-bold text-q-text-2">أضف نوع اجتماع فعالاً أولاً حتى تتمكن من إنشاء الخطة.</span>}</span></label>
          {!canCreateMeetingPlan && <p className="text-q-caption text-q-text-2">إنشاء خطة الاجتماع يتطلب صلاحية إدارة المجالس على مستوى المؤسسة.</p>}
          {(options.meeting_types?.length ?? 0) === 0 && <p className="mt-3 text-q-ui text-q-text-2">نوع الاجتماع تصنيف مثل «اجتماع دوري»، وليس حالة انعقاده. <Link href="/admin/settings/meeting-types" target="_blank" rel="noopener noreferrer" className="font-bold text-q-link underline">إعداد أنواع الاجتماعات</Link> ثم حدّث القوائم أعلاه.</p>}
          {values.createMeetingPlan && <div className="mt-4 grid gap-4 border-t border-q-border pt-4 sm:grid-cols-2">
            {(options.meeting_types?.length ?? 0) > 1 && <Field label="نوع الاجتماع"><select required value={values.meetingTypeId} onChange={(event) => update("meetingTypeId", event.target.value)} className={inputClass}><option value="">اختر النوع</option>{options.meeting_types?.map((option) => <option key={option.id} value={option.id}>{option.name_ar}</option>)}</select></Field>}
            <Field label="الدورية"><select value={values.recurrence} onChange={(event) => { update("recurrence", event.target.value as CouncilFormValues["recurrence"]); update("monthlyWeek", null); }} className={inputClass}><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option><option value="quarterly">كل ثلاثة أشهر</option><option value="semiannual">كل ستة أشهر</option><option value="annual">سنوية</option></select></Field>
            {values.recurrence === "monthly" && <Field label="موعد الاجتماع الشهري" hint="اختيار الأسبوع يترك تحديد يوم الانعقاد للمجلس"><select value={values.monthlyWeek ?? ""} onChange={event => update("monthlyWeek", event.target.value ? Number(event.target.value) : null)} className={inputClass}><option value="">يوم محدد</option><option value="1">الأسبوع الأول — من 1 إلى 7</option><option value="2">الأسبوع الثاني — من 8 إلى 14</option><option value="3">الأسبوع الثالث — من 15 إلى 21</option><option value="4">الأسبوع الرابع — من 22 إلى 28</option></select></Field>}
            {values.monthlyWeek ? <Field label="شهر البداية"><input required type="month" value={values.firstMeetingDate.slice(0,7)} onChange={event => update("firstMeetingDate", event.target.value ? `${event.target.value}-01` : "")} className={inputClass}/></Field> : <Field label="موعد أول اجتماع"><input required type="date" value={values.firstMeetingDate} onChange={(event) => update("firstMeetingDate", event.target.value)} className={inputClass}/></Field>}
          </div>}
        </section>}
        {existingPlan && <section className="space-y-3 rounded-q-card border border-q-border bg-q-surface-2 p-4">
          <h3 className="text-q-ui font-bold">خطة اجتماعات المجلس</h3>
          <p className="text-q-body">{existingPlan.meeting_type_name_ar} · {recurrenceNames[existingPlan.recurrence] ?? "دورية محفوظة"}</p>
          <p className="text-q-caption text-q-text-2">{existingPlan.monthly_week ? `الأسبوع ${["", "الأول", "الثاني", "الثالث", "الرابع", "الخامس"][existingPlan.monthly_week]} من كل شهر · بداية الخطة: ${existingPlan.first_meeting_date.slice(0,7)}` : `موعد أول اجتماع: ${existingPlan.first_meeting_date}`}</p>
          <p className="text-q-caption text-q-text-2">تعديل بيانات المجلس لا يغيّر مواعيد الاجتماعات القائمة.</p>
          <Link href="/admin/meetings" className="text-q-ui font-bold text-q-link underline">عرض الاجتماعات</Link>
        </section>}
        <section className="rounded-q-card border border-q-border bg-q-surface">
          <button type="button" aria-expanded={advancedOpen} onClick={() => setAdvancedOpen((open) => !open)} className="flex min-h-12 w-full items-center gap-2 px-4 text-right text-q-ui font-black text-q-text-2">الإعدادات المتقدمة <span className="text-q-caption font-normal text-q-text-2">اختيارية</span><ChevronDown size={16} className={`mr-auto transition ${advancedOpen ? "rotate-180" : ""}`}/></button>
          {advancedOpen && <div className="grid gap-4 border-t border-q-border p-4 sm:grid-cols-2">
            <Field label="الاسم الإنجليزي"><input dir="ltr" value={values.nameEn} onChange={(event) => update("nameEn", event.target.value)} className={inputClass}/></Field>
            <Field label="الحد الأدنى للأعضاء"><input type="number" min={1} max={999} value={values.minimumActiveMembers} onChange={(event) => update("minimumActiveMembers", Number(event.target.value))} className={inputClass}/></Field>
            {values.createMeetingPlan && <><Field label="نهاية الخطة" hint="اتركها فارغة إذا كانت الخطة مستمرة"><input type="date" value={values.planEndsOn} onChange={(event) => update("planEndsOn", event.target.value)} className={inputClass}/></Field><Field label="مهلة اعتبار الموعد فائتاً بالأيام" hint="تستخدم للتنبيه ولا تغيّر حالة الاجتماع تلقائياً"><input type="number" min={0} max={90} value={values.missedAfterDays} onChange={(event) => update("missedAfterDays", Number(event.target.value))} className={inputClass}/></Field></>}
            <label className="flex items-center gap-3 rounded-q-control border border-q-border bg-q-surface-2 p-4 text-q-ui font-bold text-q-text-2"><input type="checkbox" checked={values.allowDualLeadership} onChange={(event) => update("allowDualLeadership", event.target.checked)} className="h-4 w-4 accent-q-primary"/>السماح للرئيس أن يكون مقرراً</label>
            <Field label="الوصف" className="sm:col-span-2"><textarea rows={3} value={values.description} onChange={(event) => update("description", event.target.value)} className={`${inputClass} h-auto py-3`} placeholder="اختصاص المجلس باختصار..."/></Field>
          </div>}
        </section>
      </div>
      <footer className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-3 border-t border-q-border bg-q-surface-2 px-4 py-4 sm:px-6">{error && <div role="alert" className="w-full rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-ui font-bold text-q-danger">{error}</div>}<button type="button" disabled={saving} onClick={onClose} className="h-10 rounded-q-control border border-q-border px-5 text-q-ui font-bold text-q-text-2">إلغاء</button><Button type="submit" pending={saving} pendingLabel="جارٍ الحفظ…">{saving ? "جارٍ الحفظ…" : mode === "create" ? <span className="inline-flex items-center gap-2"><CalendarDays size={15}/>إنشاء المجلس</span> : "حفظ التعديلات"}</Button></footer>
    </form>
  </div>;
}

const inputClass = "h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text-2 outline-none transition focus:border-q-primary focus:ring-4 focus:ring-q-primary";
function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-1.5 block text-q-ui font-black text-q-text-2">{label}</span>{children}{hint && <span className="mt-1 block text-q-caption leading-4 text-q-text-2">{hint}</span>}</label>; }
