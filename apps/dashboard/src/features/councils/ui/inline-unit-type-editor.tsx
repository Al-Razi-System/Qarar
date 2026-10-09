"use client";

import { useRef, useState } from "react";
import { councilRpc } from "../api/councils-client";

type Props = {
  onCreated: (type: { id: string; name_ar: string }) => void;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
};

export function InlineUnitTypeEditor({ onCreated, onBusyChange, onClose }: Props) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);

  async function save() {
    if (busy.current) return;
    const normalized = name.trim();
    if (normalized.length < 2 || normalized.length > 100) {
      setError("أدخل اسم النوع بين حرفين و100 حرف.");
      return;
    }
    busy.current = true;
    setSaving(true);
    setError("");
    onBusyChange(true);
    try {
      const type = await councilRpc<{ id: string; name_ar: string }>("admin_create_organizational_unit_type_v2", { p_name_ar: normalized });
      onCreated(type);
      setName("");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "تعذر إضافة النوع. حاول مجددًا.");
    } finally {
      busy.current = false;
      setSaving(false);
      onBusyChange(false);
    }
  }

  return <div className="mt-3 space-y-3 rounded-xl border border-blue-100 bg-blue-50/50 p-3" role="group" aria-label="إضافة نوع الوحدة">
      <label className="block text-sm font-bold text-slate-700">اسم النوع الجديد
        <input autoFocus maxLength={100} disabled={saving} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void save(); }
        }} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100" placeholder="مثال: كلية، قسم، عمادة" />
      </label>
      <p className="text-xs leading-6 text-slate-500">نوع عام مثل «كلية»، وليس اسم جهة مثل «كلية الحاسوب».</p>
      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => void save()} className="min-h-10 rounded-lg bg-[#0872df] px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? "جارٍ حفظ النوع…" : "حفظ النوع"}</button>
        <button type="button" disabled={saving} onClick={onClose} className="min-h-10 rounded-lg border bg-white px-4 text-sm">إلغاء إضافة النوع</button>
      </div>
  </div>;
}
