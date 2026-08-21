"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Edit3, LoaderCircle, Plus, Search, Tags, X } from "lucide-react";

type MeetingType = {
  id: string;
  code: string;
  name_ar: string;
  description?: string | null;
  is_active: boolean;
  meeting_count: number;
  updated_at: string;
};
type Notice = { kind: "success" | "error"; text: string };

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/meetings", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

function Modal({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm">
    <div role="dialog" aria-modal="true" className="relative w-full max-w-xl overflow-hidden rounded-3xl bg-white shadow-2xl">
      {children}
      <button type="button" onClick={onClose} aria-label="إغلاق" className="absolute left-6 top-6 grid h-9 w-9 place-items-center rounded-xl bg-[#f2f6fa] text-[#60748a] hover:bg-[#e6eff8]"><X size={18} /></button>
    </div>
  </div>;
}

export function MeetingTypesWorkspace() {
  const [items, setItems] = useState<MeetingType[]>([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MeetingType | null>(null);
  const activeCount = useMemo(() => items.filter((item) => item.is_active).length, [items]);

  async function load() {
    try {
      const result = await rpc<{ items: MeetingType[] }>("admin_list_meeting_types", {
        p_query: query || null, p_is_active: status === "all" ? null : status === "active",
      });
      setItems(result.items ?? []);
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل أنواع الاجتماعات." });
    } finally { setLoading(false); }
  }
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [query, status]);

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSaving(true); setNotice(null);
    try {
      const result = await rpc<{ code: string }>("admin_create_meeting_type", { p_name_ar: form.get("name_ar"), p_description: form.get("description") || null });
      setCreateOpen(false); setNotice({ kind: "success", text: `تم إنشاء نوع الاجتماع. الرمز الداخلي: ${result.code}` }); await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إنشاء النوع." });
    } finally { setSaving(false); }
  }

  async function update(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setSaving(true); setNotice(null);
    try {
      await rpc("admin_update_meeting_type", {
        p_meeting_type_id: editing.id, p_name_ar: form.get("name_ar"), p_description: form.get("description") || null,
        p_is_active: form.get("is_active") === "on", p_expected_updated_at: editing.updated_at,
      });
      setEditing(null); setNotice({ kind: "success", text: "تم حفظ بيانات نوع الاجتماع." }); await load();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر حفظ التعديل." });
    } finally { setSaving(false); }
  }

  function editor(mode: "create" | "edit") {
    const isEdit = mode === "edit";
    const close = () => isEdit ? setEditing(null) : setCreateOpen(false);
    return <Modal onClose={close}>
      <form onSubmit={isEdit ? update : create}>
        <div className="border-b border-[#e7edf3] px-7 py-6"><p className="text-[10px] font-black text-[#f17822]">إعدادات الاجتماعات</p><h2 className="mt-1 text-lg font-black text-[#0a1330]">{isEdit ? "تعديل نوع اجتماع" : "إضافة نوع اجتماع"}</h2><p className="mt-1 text-xs leading-5 text-[#6e8095]">النوع النشط يظهر تلقائيًا عند إنشاء اجتماع جديد.</p></div>
        <div className="space-y-4 p-7">
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">اسم النوع *</span><input autoFocus required minLength={3} name="name_ar" defaultValue={editing?.name_ar} placeholder="مثال: اجتماع دوري" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-sm outline-none focus:border-[#0066cc]" /><small className="mt-1.5 block text-[10px] text-[#718196]">استخدم اسمًا واضحًا يظهر لمنشئ الاجتماع.</small></label>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">الوصف <em className="not-italic text-[#8392a3]">(اختياري)</em></span><textarea name="description" defaultValue={editing?.description ?? ""} rows={3} placeholder="متى يستخدم هذا النوع؟" className="w-full resize-none rounded-xl border border-[#dbe5ef] p-3 text-sm outline-none focus:border-[#0066cc]" /></label>
          {isEdit ? <label className="flex cursor-pointer items-center justify-between rounded-xl border border-[#dbe5ef] bg-[#f9fbfd] p-3.5"><span><strong className="block text-xs text-[#22354d]">النوع نشط</strong><small className="mt-1 block text-[10px] text-[#718196]">النوع المعطل لا يظهر في قائمة إنشاء الاجتماع.</small></span><input defaultChecked={editing?.is_active} name="is_active" type="checkbox" className="h-4 w-4 accent-[#0066cc]" /></label> : <div className="rounded-xl bg-[#edf7f2] p-3 text-[11px] leading-5 text-[#147453]">سيُنشأ النوع بحالة <strong>نشط</strong> وسيصبح متاحًا فورًا في نموذج إنشاء الاجتماع.</div>}
          <p className="rounded-xl bg-[#f1f7fd] px-3 py-2.5 text-[10px] leading-5 text-[#59718b]">الرمز الداخلي ينشئه النظام تلقائيًا؛ لا تحتاج إلى إدخاله أو مشاركته مع المستخدمين.</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-[#e7edf3] bg-[#fbfcfe] px-7 py-4"><button type="button" onClick={close} className="h-10 rounded-xl border border-[#dbe5ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button><button disabled={saving} className="h-10 rounded-xl bg-[#0066cc] px-5 text-xs font-bold text-white shadow-[0_8px_20px_rgba(0,102,204,.18)] disabled:opacity-60">{saving ? "جارٍ الحفظ…" : isEdit ? "حفظ التعديلات" : "إضافة النوع"}</button></div>
      </form>
    </Modal>;
  }

  return <section className="space-y-5">
    {notice && <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}{notice.text}</div>}
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#e2e9f1] bg-white p-4 shadow-[0_3px_16px_rgba(24,48,80,.035)]"><div className="flex flex-wrap items-center gap-3"><div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8796a9]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم…" className="h-10 w-56 rounded-xl border border-[#dfe7ef] bg-[#fafcfe] pr-9 pl-3 text-xs outline-none focus:border-[#9bc9f2]" /></div><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-xl border border-[#dfe7ef] bg-white px-3 text-xs font-bold text-[#52647a] outline-none"><option value="all">كل الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option></select></div><button onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#0066cc] px-4 text-xs font-black text-white shadow-[0_8px_18px_rgba(0,102,204,.18)]"><Plus size={16} />إضافة نوع اجتماع</button></div>
    <div className="grid gap-4 sm:grid-cols-3"><div className="rounded-2xl border border-[#dce8f3] bg-[#eaf4ff] p-4"><p className="text-[10px] font-bold text-[#3770a6]">الأنواع المعروضة</p><strong className="mt-1 block text-2xl text-[#0066cc]">{items.length}</strong></div><div className="rounded-2xl border border-[#d8eee4] bg-[#effbf5] p-4"><p className="text-[10px] font-bold text-[#248061]">الأنواع النشطة</p><strong className="mt-1 block text-2xl text-[#008d62]">{activeCount}</strong></div><div className="rounded-2xl border border-[#e3e9ef] bg-white p-4"><p className="text-[10px] font-bold text-[#718196]">قاعدة الاستخدام</p><strong className="mt-1 block text-xs text-[#24364e]">النشط فقط يظهر عند إنشاء الاجتماع</strong></div></div>
    <div className="overflow-hidden rounded-2xl border border-[#e2e9f1] bg-white shadow-[0_3px_16px_rgba(24,48,80,.035)]">
      {loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={28} /></div> : items.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><Tags className="mx-auto text-[#87a8c7]" size={34} /><h3 className="mt-3 text-sm font-black text-[#24364e]">لا توجد أنواع اجتماعات</h3><p className="mt-1 text-xs text-[#718196]">أضف أول نوع ليظهر في نموذج إنشاء الاجتماع.</p><button onClick={() => setCreateOpen(true)} className="mt-4 rounded-xl bg-[#0066cc] px-4 py-2 text-xs font-bold text-white">إضافة نوع اجتماع</button></div></div> : <div className="divide-y divide-[#edf1f5]">{items.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-4 p-5"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]"><Tags size={19} /></span><div className="min-w-[220px] flex-1"><div className="flex items-center gap-2"><h3 className="text-sm font-black text-[#0a1330]">{item.name_ar}</h3><span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${item.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{item.is_active ? "نشط" : "غير نشط"}</span></div><p className="mt-1 text-[11px] text-[#718196]">{item.description || "لا يوجد وصف مضاف."}</p></div><div className="min-w-24 text-center"><p className="text-lg font-black text-[#0a1330]">{item.meeting_count}</p><p className="text-[9px] font-bold text-[#8392a3]">اجتماع مرتبط</p></div><div className="min-w-36"><code className="rounded-lg bg-[#f2f6fa] px-2 py-1 text-[10px] text-[#59718b]">{item.code}</code><p className="mt-1 text-[9px] text-[#91a0b2]">رمز داخلي تلقائي</p></div><button onClick={() => setEditing(item)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dbe5ef] px-3 text-[11px] font-bold text-[#52647a] hover:border-[#b9d7f2] hover:text-[#0066cc]"><Edit3 size={14} />تعديل</button></div>)}</div>}
    </div>
    {createOpen && editor("create")}{editing && editor("edit")}
  </section>;
}
