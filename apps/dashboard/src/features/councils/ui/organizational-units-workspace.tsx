"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Building2, Plus, Search, X } from "lucide-react";
import { councilRpc } from "../api/councils-client";
import { InlineUnitTypeEditor } from "./inline-unit-type-editor";
import { UnitStatusDialog } from "./unit-status-dialog";

type Option = { id: string; name_ar: string };
export type OrganizationalUnitRecord = Option & { code: string; reference_number: string | null; type_name_ar: string; parent_name_ar: string | null; parent_unit_id: string | null; unit_type_id: string; status: "active" | "inactive"; updated_at: string };
export type OrganizationalUnitsData = {
  items: OrganizationalUnitRecord[];
  total: number; limit: number; offset: number; types: Option[]; parents: Option[];
};
const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

export function OrganizationalUnitDialog({ options, onClose, onCreated, canManageTypes = false, onTypeCreated, initialUnit }: {
  options: Pick<OrganizationalUnitsData, "types" | "parents">;
  onClose: () => void;
  onCreated: (reference: string) => void;
  canManageTypes?: boolean;
  onTypeCreated?: (type: Option) => void;
  initialUnit?: OrganizationalUnitRecord;
}) {
  const [types, setTypes] = useState(options.types);
  const [typeSaving, setTypeSaving] = useState(false);
  const [addingType, setAddingType] = useState(false);
  const [typeNotice, setTypeNotice] = useState("");
  const [name, setName] = useState(initialUnit?.name_ar ?? "");
  const [typeId, setTypeId] = useState(initialUnit?.unit_type_id ?? "");
  const [parentId, setParentId] = useState(initialUnit?.parent_unit_id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef<string | null>(null);
  const busy = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || typeSaving || addingType) return;
    busy.current = true; setSaving(true); setError("");
    try {
      requestId.current ??= crypto.randomUUID();
      const result = initialUnit ? await councilRpc<{ reference_number: string }>("admin_update_organizational_unit_v2", {
        p_unit_id: initialUnit.id, p_name_ar: name.trim(), p_unit_type_id: typeId, p_parent_unit_id: parentId || null,
        p_status: initialUnit.status, p_expected_updated_at: initialUnit.updated_at,
      }) : await councilRpc<{ reference_number: string }>("admin_create_organizational_unit_v2", {
        p_name_ar: name.trim(), p_unit_type_id: typeId, p_parent_unit_id: parentId || null, p_client_request_id: requestId.current,
      });
      if (!result || (!initialUnit && typeof result.reference_number !== "string")) throw new Error("تعذر تأكيد الحفظ؛ حدّث القائمة للتحقق من حالة الوحدة.");
      onCreated(result.reference_number || initialUnit?.reference_number || initialUnit?.code || "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر إضافة الوحدة. حاول مجددًا."); }
    finally { busy.current = false; setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="unit-dialog-title">
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <header className="mb-6 flex items-start justify-between gap-3"><div><h2 id="unit-dialog-title" className="text-lg font-black text-slate-900">{initialUnit ? "تعديل الوحدة التنظيمية" : "إضافة وحدة تنظيمية"}</h2><p className="mt-2 text-xs leading-6 text-slate-500">كلية أو قسم أو إدارة؛ يُنشأ المرجع تلقائيًا دون إدخاله.</p></div><button type="button" disabled={saving || typeSaving} onClick={onClose} aria-label="إغلاق" className="rounded-xl p-2 text-slate-500 disabled:opacity-50"><X size={20} /></button></header>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <fieldset disabled={saving} className="space-y-4">
        <label className="block text-sm font-bold text-slate-700">اسم الوحدة<input required minLength={2} maxLength={300} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="مثال: كلية الحاسوب" /></label>
        <div><label className="block text-sm font-bold text-slate-700">نوع الوحدة<select required disabled={typeSaving} value={typeId} onChange={(e) => {
          if (e.target.value === "__add_type__") { if (canManageTypes) setAddingType(true); }
          else setTypeId(e.target.value);
        }} className={inputClass}><option value="">اختر النوع</option>{[...types, ...(initialUnit && !types.some((type) => type.id === initialUnit.unit_type_id) ? [{ id: initialUnit.unit_type_id, name_ar: initialUnit.type_name_ar }] : [])].map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}{canManageTypes && <option value="__add_type__">＋ إضافة نوع جديد…</option>}</select></label>
          {canManageTypes && addingType && <InlineUnitTypeEditor onBusyChange={setTypeSaving} onClose={() => setAddingType(false)} onCreated={(type) => {
            setTypes((current) => [...current.filter((item) => item.id !== type.id), type]);
            setTypeId(type.id); setTypeNotice(`أضيف نوع «${type.name_ar}» وتم اختياره.`); onTypeCreated?.(type);
          }} />}
          {typeNotice && <p role="status" className="mt-2 text-xs text-emerald-700">{typeNotice}</p>}
        </div>
        <label className="block text-sm font-bold text-slate-700">الجهة التابعة لها<select value={parentId} onChange={(e) => setParentId(e.target.value)} className={inputClass}><option value="">المؤسسة مباشرة</option>{initialUnit?.parent_unit_id && !options.parents.some((unit) => unit.id === initialUnit.parent_unit_id) && <option value={initialUnit.parent_unit_id}>{initialUnit.parent_name_ar || "الجهة الحالية"} — الارتباط الحالي</option>}{options.parents.filter((unit) => unit.id !== initialUnit?.id).map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}</select><span className="mt-2 block text-xs font-normal text-slate-500">اختياري؛ مثل تبعية القسم للكلية. هذا ليس المجلس الأب.</span></label>
      </fieldset>
      <footer className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={saving || typeSaving} onClick={onClose} className="min-h-11 rounded-xl border px-5 text-sm">إلغاء</button><button disabled={saving || typeSaving || addingType || (!types.length && !initialUnit)} className="min-h-11 rounded-xl bg-[#0872df] px-5 text-sm font-bold text-white disabled:opacity-60">{saving ? "جارٍ الحفظ…" : initialUnit ? "حفظ التعديلات" : "إضافة الوحدة"}</button></footer>
    </form>
  </div>;
}

export function OrganizationalUnitsWorkspace({ initialData, canManage, canManageTypes = false }: { initialData: OrganizationalUnitsData; canManage: boolean; canManageTypes?: boolean }) {
  const [data, setData] = useState(initialData);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<OrganizationalUnitRecord | null>(null);
  const [statusAction, setStatusAction] = useState<{ unit: OrganizationalUnitRecord; target: "active" | "inactive" | "archived" } | null>(null);
  const busy = useRef(false);
  async function load(nextQuery: string, offset: number) {
    if (busy.current) return;
    busy.current = true; setLoading(true); setError("");
    try {
      setData(await councilRpc<OrganizationalUnitsData>("admin_list_organizational_units_v2", { p_query: nextQuery || null, p_limit: 20, p_offset: offset }));
      setAppliedQuery(nextQuery);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل الوحدات. حاول مجددًا."); }
    finally { busy.current = false; setLoading(false); }
  }
  return <div className="space-y-5">
    <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:p-7"><div><p className="text-xs font-bold text-orange-600">تجهيز الهيكل التنظيمي</p><h1 className="mt-2 flex items-center gap-2 text-xl font-black text-slate-900"><Building2 size={23} />الوحدات التنظيمية</h1><p className="mt-2 max-w-xl text-sm leading-7 text-slate-500">أضف الكليات والأقسام والإدارات، ثم اخترها كنطاق للمجلس. الوحدات التنظيمية ليست مجالس.</p></div>{canManage && <button disabled={loading || (!data.types.length && !canManageTypes)} onClick={() => { setSuccess(""); setCreating(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#0872df] px-4 text-sm font-bold text-white disabled:opacity-50"><Plus size={17} />إضافة وحدة</button>}</header>
    {success && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{success} <Link href="/admin/councils" className="font-bold underline">الانتقال إلى إنشاء المجلس</Link></p>}
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</p>}
    {!data.types.length && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">لا توجد أنواع وحدات تنظيمية نشطة. يلزم تجهيز أنواع الوحدات قبل الإضافة.</p>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5" aria-busy={loading}>
      <form onSubmit={(e) => { e.preventDefault(); void load(query.trim(), 0); }} className="mb-5 flex flex-wrap gap-2"><input aria-label="البحث عن وحدة تنظيمية" className="min-h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالاسم أو المرجع…" /><button disabled={loading} className="inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 text-sm"><Search size={16} />بحث</button><button type="button" disabled={loading} onClick={() => void load(appliedQuery, data.offset)} className="min-h-11 rounded-xl border px-4 text-sm">تحديث</button></form>
      {loading && <p role="status" className="mb-4 text-sm text-slate-500">جارٍ تحميل الوحدات…</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data.items.map((unit) => <article key={unit.id} className="min-w-0 rounded-2xl border border-slate-200 p-4"><p className="text-xs font-bold text-[#0872df]">{unit.type_name_ar}</p><h2 className="mt-2 break-words text-base font-black text-slate-800">{unit.name_ar}</h2><p className="mt-2 break-words text-xs text-slate-500">{unit.parent_name_ar ? `تتبع: ${unit.parent_name_ar}` : "تتبع المؤسسة مباشرة"}</p><p dir="ltr" className="mt-3 break-all text-right font-mono text-xs text-slate-400">{unit.reference_number || unit.code}</p><p className="mt-3 text-xs font-bold text-slate-600">{unit.status === "active" ? "نشطة" : "معطلة — لا تُستخدم في ارتباطات جديدة"}</p>{canManage && <div className="mt-4 flex flex-wrap gap-2"><button disabled={loading} onClick={() => setEditing(unit)} className="min-h-10 rounded-xl border px-3 text-xs">تعديل</button><button disabled={loading} onClick={() => setStatusAction({ unit, target: unit.status === "active" ? "inactive" : "active" })} className="min-h-10 rounded-xl border px-3 text-xs">{unit.status === "active" ? "تعطيل" : "إعادة تفعيل"}</button><button disabled={loading} onClick={() => setStatusAction({ unit, target: "archived" })} className="min-h-10 rounded-xl border border-red-200 px-3 text-xs text-red-700">حذف</button></div>}</article>)}</div>
      {!data.items.length && !loading && <p className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">{appliedQuery ? "لا توجد وحدات مطابقة للبحث." : "لا توجد وحدات تنظيمية بعد. ابدأ بإضافة كلية أو إدارة."}</p>}
      <footer className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500"><span>{data.total} وحدة · الصفحة {Math.floor(data.offset / data.limit) + 1}</span><div className="flex gap-2"><button disabled={loading || data.offset === 0} onClick={() => void load(appliedQuery, Math.max(0, data.offset - data.limit))} className="min-h-10 rounded-lg border px-4 disabled:opacity-40">السابق</button><button disabled={loading || data.offset + data.limit >= data.total} onClick={() => void load(appliedQuery, data.offset + data.limit)} className="min-h-10 rounded-lg border px-4 disabled:opacity-40">التالي</button></div></footer>
    </section>
    {creating && <OrganizationalUnitDialog options={data} canManageTypes={canManageTypes} onTypeCreated={(type) => setData((current) => ({ ...current, types: [...current.types.filter((item) => item.id !== type.id), type] }))} onClose={() => setCreating(false)} onCreated={(reference) => { setCreating(false); setSuccess(`تمت إضافة الوحدة بنجاح: ${reference}.`); setQuery(""); void load("", 0); }} />}
    {editing && <OrganizationalUnitDialog initialUnit={editing} options={data} onClose={() => setEditing(null)} onCreated={(reference) => { setEditing(null); setSuccess(`حُفظت تعديلات الوحدة: ${reference}.`); void load(appliedQuery, data.offset); }} />}
    {statusAction && <UnitStatusDialog unit={statusAction.unit} target={statusAction.target} onClose={() => setStatusAction(null)} onSaved={() => { setSuccess("تم تحديث حالة الوحدة مع حفظ سجلها وعلاقاتها."); void load(appliedQuery, 0); }} />}
  </div>;
}

