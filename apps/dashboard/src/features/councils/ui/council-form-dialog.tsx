"use client";

import { useState } from "react";
import { Building2, X } from "lucide-react";
import type { CouncilFormOptions, CouncilFormValues } from "../model/types";

const initial: CouncilFormValues = { code: "", nameAr: "", nameEn: "", description: "", unitTypeId: "", parentUnitId: "", governanceClassId: "", minimumActiveMembers: 3, allowDualLeadership: false };

export function CouncilFormDialog({ options, mode = "create", initialValues, onClose, onSubmit }: { options: CouncilFormOptions; mode?: "create" | "edit"; initialValues?: CouncilFormValues; onClose: () => void; onSubmit: (values: CouncilFormValues) => Promise<void> }) {
  const [values, setValues] = useState(initialValues ?? initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = <K extends keyof CouncilFormValues>(key: K, value: CouncilFormValues[K]) => setValues((current) => ({ ...current, [key]: value }));
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try { await onSubmit(values); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر حفظ بيانات المجلس."); } finally { setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#06162d]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="council-dialog-title">
    <form onSubmit={submit} className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-white/40 bg-white shadow-[0_28px_80px_rgba(5,24,52,.28)]">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-[#e5edf4] bg-white/95 px-6 py-5 backdrop-blur"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#0872df] text-white"><Building2 size={21} /></span><div><p className="text-[10px] font-black text-[#f17822]">{mode === "create" ? "تأسيس وحدة حوكمية" : "تحديث البيانات الإدارية"}</p><h2 id="council-dialog-title" className="text-base font-black text-[#0a1830]">{mode === "create" ? "إنشاء مجلس جديد" : "تعديل بيانات المجلس"}</h2></div><button type="button" onClick={onClose} className="mr-auto grid h-9 w-9 place-items-center rounded-xl text-[#718399] hover:bg-[#f2f6fa]" aria-label="إغلاق"><X size={19} /></button></header>
      <div className="grid gap-5 p-6 sm:grid-cols-2">
        {error && <div className="sm:col-span-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">{error}</div>}
        <Field label="رمز المجلس" hint={mode === "create" ? "حروف إنجليزية صغيرة وأرقام وشرطة سفلية" : "الرمز ثابت بعد الإنشاء لحماية التكاملات"}><input required disabled={mode === "edit"} dir="ltr" pattern="[a-z][a-z0-9_]*" value={values.code} onChange={(e) => update("code", e.target.value)} className={`${inputClass} disabled:cursor-not-allowed disabled:bg-[#f2f5f8] disabled:text-[#8292a4]`} placeholder="college_council" /></Field>
        <Field label="الاسم العربي"><input required value={values.nameAr} onChange={(e) => update("nameAr", e.target.value)} className={inputClass} placeholder="مجلس الكلية" /></Field>
        <Field label="الاسم الإنجليزي"><input dir="ltr" value={values.nameEn} onChange={(e) => update("nameEn", e.target.value)} className={inputClass} /></Field>
        <Field label="نوع المجلس"><select required value={values.unitTypeId} onChange={(e) => update("unitTypeId", e.target.value)} className={inputClass}><option value="">اختر النوع</option>{options.council_types.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></Field>
        <Field label="المجلس أو الوحدة الأب"><select value={values.parentUnitId} onChange={(e) => update("parentUnitId", e.target.value)} className={inputClass}><option value="">دون مجلس أب</option>{options.parent_units.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></Field>
        <Field label="التصنيف الحوكمي"><select value={values.governanceClassId} onChange={(e) => update("governanceClassId", e.target.value)} className={inputClass}><option value="">دون تصنيف</option>{options.governance_classes.map((o) => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></Field>
        <Field label="الحد الأدنى للأعضاء"><input required type="number" min={1} max={999} value={values.minimumActiveMembers} onChange={(e) => update("minimumActiveMembers", Number(e.target.value))} className={inputClass} /></Field>
        <label className="flex items-center gap-3 rounded-xl border border-[#dbe6ef] bg-[#f8fbfe] p-4 text-xs font-bold text-[#42566f]"><input type="checkbox" checked={values.allowDualLeadership} onChange={(e) => update("allowDualLeadership", e.target.checked)} className="h-4 w-4 accent-[#0872df]" />السماح للرئيس أن يكون مقرراً</label>
        <Field label="الوصف" className="sm:col-span-2"><textarea rows={4} value={values.description} onChange={(e) => update("description", e.target.value)} className={`${inputClass} h-auto py-3`} placeholder="اختصاص المجلس ونطاق عمله..." /></Field>
      </div>
      <footer className="sticky bottom-0 flex justify-end gap-3 border-t border-[#e5edf4] bg-[#fbfdff] px-6 py-4"><button type="button" onClick={onClose} className="h-10 rounded-xl border border-[#d8e3ed] px-5 text-xs font-bold text-[#52647a]">إلغاء</button><button disabled={saving} className="h-10 rounded-xl bg-[#0872df] px-6 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.2)] disabled:opacity-60">{saving ? "جارٍ الحفظ..." : mode === "create" ? "إنشاء المجلس" : "حفظ التعديلات"}</button></footer>
    </form>
  </div>;
}

const inputClass = "h-11 w-full rounded-xl border border-[#d8e3ed] bg-white px-3 text-xs text-[#172a42] outline-none transition focus:border-[#0872df] focus:ring-4 focus:ring-[#0872df]/10";
function Field({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) { return <label className={className}><span className="mb-1.5 block text-xs font-black text-[#31465f]">{label}</span>{children}{hint && <span className="mt-1 block text-[9px] text-[#8a99aa]">{hint}</span>}</label>; }
