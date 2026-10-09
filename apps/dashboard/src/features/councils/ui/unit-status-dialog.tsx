"use client";

import { useRef, useState } from "react";
import { councilRpc } from "../api/councils-client";
import type { OrganizationalUnitRecord } from "./organizational-units-workspace";

export function UnitStatusDialog({ unit, target, onClose, onSaved }: {
  unit: OrganizationalUnitRecord; target: "active" | "inactive" | "archived"; onClose: () => void; onSaved: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const busy = useRef(false);
  const label = target === "archived" ? "الحذف المنطقي" : target === "inactive" ? "التعطيل" : "إعادة التفعيل";
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy.current || saved) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const result = await councilRpc<{ id: string; status: string }>("admin_update_organizational_unit_v2", {
        p_unit_id: unit.id, p_name_ar: unit.name_ar, p_unit_type_id: unit.unit_type_id,
        p_parent_unit_id: unit.parent_unit_id, p_status: target, p_expected_updated_at: unit.updated_at,
      });
      if (result?.id !== unit.id || result.status !== target) throw new Error("تعذر تأكيد العملية؛ حدّث القائمة للتحقق من الحالة.");
      setSaved(true); onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحديث حالة الوحدة."); }
    finally { busy.current = false; setSaving(false); }
  }
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="unit-status-title">
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <h2 id="unit-status-title" className="text-lg font-black text-slate-900">تأكيد {label}</h2><p className="mt-4 break-words text-sm font-bold text-slate-700">{unit.name_ar}</p>
      <p className="mt-3 text-sm leading-7 text-slate-500">{target === "archived" ? "تُزال الوحدة من القوائم والاستخدام الجديد، مع حفظ السجل والعلاقات السابقة. لا يمكن التراجع من هذه النافذة." : target === "inactive" ? "لن تظهر الوحدة للاختيار في ارتباطات جديدة. تبقى السجلات السابقة محفوظة ويمكن إعادة تفعيلها لاحقًا." : "تصبح الوحدة متاحة للاستخدام الجديد؛ يجب أن تكون الجهة التابعة لها نشطة."}</p>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {saved && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">تم {label} بنجاح، مع حفظ السجل والعلاقات السابقة.</p>}
      <footer className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border px-4 text-sm">{saved ? "تم" : "إلغاء"}</button>{!saved && <button disabled={saving} className={`min-h-11 rounded-xl px-4 text-sm font-bold text-white disabled:opacity-50 ${target === "archived" ? "bg-red-600" : "bg-[#0872df]"}`}>{saving ? "جارٍ الحفظ…" : `تأكيد ${label}`}</button>}</footer>
    </form>
  </div>;
}
