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

  return <div className="mt-3 space-y-3 rounded-q-control border border-q-primary bg-q-surface-2/50 p-3" role="group" aria-label="إضافة نوع الوحدة">
      <label className="block text-q-ui font-bold text-q-text-2">اسم النوع الجديد
        <input autoFocus maxLength={100} disabled={saving} value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); event.stopPropagation(); void save(); }
        }} className="mt-2 min-h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui outline-none focus:border-q-primary focus:ring-2 focus:ring-q-focus" placeholder="مثال: كلية، قسم، عمادة" />
      </label>
      <p className="text-q-caption leading-6 text-q-text-2">نوع عام مثل «كلية»، وليس اسم جهة مثل «كلية الحاسوب».</p>
      {error && <p role="alert" className="rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-ui text-q-danger">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={saving} onClick={() => void save()} className="min-h-11 rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary disabled:opacity-50">{saving ? "جارٍ حفظ النوع…" : "حفظ النوع"}</button>
        <button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-q-control border bg-q-surface px-4 text-q-ui">إلغاء إضافة النوع</button>
      </div>
  </div>;
}
