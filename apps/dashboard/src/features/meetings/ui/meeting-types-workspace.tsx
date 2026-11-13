"use client";
import { Card } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";

import { Button } from "@/shared/ui/button";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, Edit3, LoaderCircle, Plus, Search, Tags } from "lucide-react";

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
    return <Dialog title={isEdit ? "تعديل نوع اجتماع" : "إضافة نوع اجتماع"} description="النوع النشط يظهر تلقائيًا عند إنشاء اجتماع جديد." onClose={close}>
      <p className="text-q-caption text-q-text-2">إعدادات الاجتماعات</p>
      <form onSubmit={isEdit ? update : create}>

        <div className="space-y-4 p-7">
          <label className="block"><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">اسم النوع *</span><input autoFocus required minLength={3} name="name_ar" defaultValue={editing?.name_ar} placeholder="مثال: اجتماع دوري" className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary" /><small className="mt-1.5 block text-q-caption text-q-text-3">استخدم اسمًا واضحًا يظهر لمنشئ الاجتماع.</small></label>
          <label className="block"><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">الوصف <em className="not-italic text-q-text-2">(اختياري)</em></span><textarea name="description" defaultValue={editing?.description ?? ""} rows={3} placeholder="متى يستخدم هذا النوع؟" className="w-full resize-none rounded-q-control border border-q-border p-3 text-q-ui outline-none focus:border-q-primary" /></label>
          {isEdit ? <label className="flex cursor-pointer items-center justify-between rounded-q-control border border-q-border bg-q-surface-2 p-3.5"><span><strong className="block text-q-caption text-q-text">النوع نشط</strong><small className="mt-1 block text-q-caption text-q-text-3">النوع المعطل لا يظهر في قائمة إنشاء الاجتماع.</small></span><input defaultChecked={editing?.is_active} name="is_active" type="checkbox" className="h-4 w-4 accent-q-primary" /></label> : <div className="rounded-q-control bg-q-success-soft p-3 text-q-caption leading-5 text-q-success">سيُنشأ النوع بحالة <strong>نشط</strong> وسيصبح متاحًا فورًا في نموذج إنشاء الاجتماع.</div>}
          <p className="rounded-q-control bg-q-surface-2 px-3 py-2.5 text-q-caption leading-5 text-q-text-2">الرمز الداخلي ينشئه النظام تلقائيًا؛ لا تحتاج إلى إدخاله أو مشاركته مع المستخدمين.</p>
        </div>
        <div className="flex justify-end gap-3 border-t border-q-border bg-q-surface-2 px-7 py-4"><Button variant="secondary" type="button" onClick={close} className="min-h-11 rounded-q-control border px-4 font-bold ">إلغاء</Button><Button variant="primary" type="submit" disabled={saving} className="min-h-11 rounded-q-control px-5 font-bold disabled:opacity-60">{saving ? "جارٍ الحفظ…" : isEdit ? "حفظ التعديلات" : "إضافة النوع"}</Button></div>
      </form>
    </Dialog>;
  }

  return <section className="space-y-5">
    {notice && <div className={`flex items-center gap-2 rounded-q-control border p-3 text-q-caption font-bold ${notice.kind === "success" ? "border-q-success bg-q-success-soft text-q-success" : "border-q-danger bg-q-danger-soft text-q-danger"}`}>{notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />}{notice.text}</div>}
    <Card className="flex flex-wrap items-center justify-between gap-4 rounded-q-card border border-q-border bg-q-surface p-4 "><div className="flex flex-wrap items-center gap-3"><div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-q-text-2" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم…" className="h-11 w-56 rounded-q-control border border-q-border bg-q-surface-2 pr-9 pl-3 text-q-caption outline-none focus:border-q-primary" /></div><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption font-bold text-q-text-2 outline-none"><option value="all">كل الحالات</option><option value="active">نشط</option><option value="inactive">غير نشط</option></select></div><Button variant="primary" type="submit" onClick={() => setCreateOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-q-control px-4 font-bold "><Plus size={16} />إضافة نوع اجتماع</Button></Card>
    <div className="grid gap-4 sm:grid-cols-3"><Card className="rounded-q-card border border-q-border bg-q-surface-2 p-4"><p className="text-q-caption font-bold text-q-text-2">الأنواع المعروضة</p><strong className="mt-1 block text-q-h2 text-q-primary">{items.length}</strong></Card><Card className="rounded-q-card border border-q-border bg-q-surface-2 p-4"><p className="text-q-caption font-bold text-q-success">الأنواع النشطة</p><strong className="mt-1 block text-q-h2 text-q-success">{activeCount}</strong></Card><Card className="rounded-q-card border border-q-border bg-q-surface p-4"><p className="text-q-caption font-bold text-q-text-3">قاعدة الاستخدام</p><strong className="mt-1 block text-q-caption text-q-text">النشط فقط يظهر عند إنشاء الاجتماع</strong></Card></div>
    <Card className="overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
      {loading ? <div className="grid min-h-64 place-items-center"><LoaderCircle className="animate-spin text-q-primary" size={28} /></div> : items.length === 0 ? <div className="grid min-h-64 place-items-center p-8 text-center"><div><Tags className="mx-auto text-q-link" size={34} /><h3 className="mt-3 text-q-ui font-bold text-q-text">لا توجد أنواع اجتماعات</h3><p className="mt-1 text-q-caption text-q-text-3">أضف أول نوع ليظهر في نموذج إنشاء الاجتماع.</p><Button variant="primary" type="submit" onClick={() => setCreateOpen(true)} className="mt-4 rounded-q-control px-4 py-2 font-bold ">إضافة نوع اجتماع</Button></div></div> : <div className="divide-y divide-q-surface-2">{items.map((item) => <div key={item.id} className="flex flex-wrap items-center gap-4 p-5"><span className="grid h-11 w-11 place-items-center rounded-q-control bg-q-surface-2 text-q-primary"><Tags size={19} /></span><div className="min-w-[220px] flex-1"><div className="flex items-center gap-2"><h3 className="text-q-ui font-bold text-q-text">{item.name_ar}</h3><span className={`rounded-full px-2 py-0.5 text-q-caption font-bold ${item.is_active ? "bg-q-success-soft text-q-success" : "bg-q-surface-2 text-q-text-2"}`}>{item.is_active ? "نشط" : "غير نشط"}</span></div><p className="mt-1 text-q-caption text-q-text-3">{item.description || "لا يوجد وصف مضاف."}</p></div><div className="min-w-24 text-center"><p className="text-q-h3 font-bold text-q-text">{item.meeting_count}</p><p className="text-q-caption font-bold text-q-text-2">اجتماع مرتبط</p></div><div className="min-w-36"><code className="rounded-q-control bg-q-surface-2 px-2 py-1 text-q-caption text-q-link">{item.code}</code><p className="mt-1 text-q-caption text-q-text-2">رمز داخلي تلقائي</p></div><Button variant="secondary" type="submit" onClick={() => setEditing(item)} className="inline-flex h-9 items-center gap-1.5 rounded-q-control border px-3 font-bold "><Edit3 size={14} />تعديل</Button></div>)}</div>}
    </Card>
    {createOpen && editor("create")}{editing && editor("edit")}
  </section>;
}
