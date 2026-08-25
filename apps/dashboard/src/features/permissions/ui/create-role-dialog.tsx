"use client";

import { useState } from "react";
import { Plus, Shield, X } from "lucide-react";

export function CreateRoleDialog({
  onSuccess,
}: {
  onSuccess: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const body = {
      action: "upsert_role",
      code: formData.get("code"),
      name_ar: formData.get("name_ar"),
      name_en: formData.get("name_en") || null,
      description: formData.get("description") || null,
      role_scope: formData.get("role_scope"),
      is_active: true,
    };

    try {
      const response = await fetch("/api/admin/roles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "تعذر إضافة الدور.");

      setIsOpen(false);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ غير متوقع.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex items-center gap-2 rounded-xl bg-[#0066cc] px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_14px_rgba(0,102,204,.25)] hover:bg-[#0055b3]"
      >
        <Plus size={16} /> إضافة دور مخصص
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSubmit}
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#e7edf3] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]">
                  <Shield size={20} />
                </span>
                <div>
                  <h2 className="text-base font-black text-[#0a1330]">
                    إضافة دور حوكمي جديد
                  </h2>
                  <p className="text-xs text-[#718196]">
                    تعريف دور جديد وتحديد نطاق صلاحياته.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[#73849a] hover:text-[#0a1330]"
              >
                <X size={20} />
              </button>
            </div>

            {error && (
              <div className="mx-6 mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="grid gap-4 p-6">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  رمز الدور (Immutable Key) *
                </span>
                <input
                  required
                  name="code"
                  placeholder="مثال: agenda_reviewer"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  الاسم بالعربية *
                </span>
                <input
                  required
                  name="name_ar"
                  placeholder="مثال: مراجع جدول الأعمال"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  الاسم بالإنجليزية
                </span>
                <input
                  name="name_en"
                  placeholder="Agenda Reviewer"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  نطاق الدور (Role Scope) *
                </span>
                <select
                  name="role_scope"
                  defaultValue="governance_unit"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs outline-none focus:border-[#0066cc]"
                >
                  <option value="governance_unit">مجلس / لجنة (Governance Unit)</option>
                  <option value="organization">المنظمة ككل (Organization)</option>
                  <option value="system">نظام (System)</option>
                </select>
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  الوصف الحوكمي
                </span>
                <textarea
                  name="description"
                  rows={3}
                  placeholder="توضيح مهام ومسؤوليات هذا الدور..."
                  className="w-full rounded-xl border border-[#dbe5ef] p-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#e7edf3] bg-[#fbfcfe] px-6 py-4">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
                className="h-10 rounded-xl border border-[#dbe5ef] px-4 text-xs font-bold text-[#52647a]"
              >
                إلغاء
              </button>
              <button
                disabled={isSubmitting}
                className="h-10 rounded-xl bg-[#0066cc] px-5 text-xs font-bold text-white shadow-[0_8px_20px_rgba(0,102,204,.18)] disabled:opacity-60"
              >
                {isSubmitting ? "جارٍ الحفظ…" : "إنشاء الدور"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
