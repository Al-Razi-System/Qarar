/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";
import { Clock, Plus, UserCheck, X } from "lucide-react";

export function DelegationsWorkspace() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setNotice(null);

    const formData = new FormData(event.currentTarget);
    const body = {
      action: "create_delegation",
      source_membership_id: formData.get("source_membership_id"),
      delegated_to_user_id: formData.get("delegated_to_user_id"),
      starts_at: new Date(formData.get("starts_at") as string).toISOString(),
      ends_at: new Date(formData.get("ends_at") as string).toISOString(),
      reason: formData.get("reason"),
    };

    try {
      const response = await fetch("/api/admin/delegations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "تعذر إنشاء التفويض.");

      setIsOpen(false);
      setNotice({ type: "success", text: "تم تسجيل التفويض المؤقت بنجاح." });
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "حدث خطأ." });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`rounded-xl border p-4 text-xs font-bold ${
            notice.type === "success"
              ? "border-[#bfe9d9] bg-[#ecfaf4] text-[#167957]"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-[#e2e9f1] bg-white p-6 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
        <div>
          <h2 className="text-base font-black text-[#0a1330]">
            إدارة التفويض المؤقت والإنابة
          </h2>
          <p className="mt-1 text-xs text-[#718196]">
            تفويض صلاحيات مجلس أو لجنة لمستخدم آخر عند الإجازات والتغطية المؤقتة (حتى 90 يوماً كأقصى حد).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 rounded-xl bg-[#0066cc] px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_14px_rgba(0,102,204,.25)] hover:bg-[#0055b3]"
        >
          <Plus size={16} /> تفويض جديد
        </button>
      </div>

      <div className="rounded-2xl border border-[#e2e9f1] bg-white p-8 text-center shadow-[0_3px_16px_rgba(24,48,80,.035)]">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[#edf5fd] text-[#0066cc]">
          <UserCheck size={24} />
        </span>
        <h3 className="mt-4 text-sm font-black text-[#1c2b42]">
          لا توجد تفويضات نشطة حالياً
        </h3>
        <p className="mt-1 text-xs text-[#7c8da0]">
          استخدم زر "تفويض جديد" لتسديد إنابة لمجلس محدد وتأطيرها بمهلة زمنية حوكمية.
        </p>
      </div>

      {isOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleCreate}
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#e7edf3] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]">
                  <Clock size={20} />
                </span>
                <div>
                  <h2 className="text-base font-black text-[#0a1330]">
                    إنشاء تفويض مؤقت / إنابة
                  </h2>
                  <p className="text-xs text-[#718196]">
                    منح صلاحية العضوية لمستخدم بديل لفترة زمنية محددة.
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

            <div className="grid gap-4 p-6">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  معرف العضوية الأصيلة (Source Membership UUID) *
                </span>
                <input
                  required
                  name="source_membership_id"
                  placeholder="أدخل UUID الخاص بعضوية الأصيل"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  المستخدم البديل / المفوض إليه (User UUID) *
                </span>
                <input
                  required
                  name="delegated_to_user_id"
                  placeholder="أدخل UUID للمستخدم البديل"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                    تاريخ ووقت البداية *
                  </span>
                  <input
                    required
                    type="datetime-local"
                    name="starts_at"
                    className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                    تاريخ ووقت النهاية (حتى 90 يوماً) *
                  </span>
                  <input
                    required
                    type="datetime-local"
                    name="ends_at"
                    className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                  />
                </label>
              </div>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  سبب التفويض / التبرير الحوكمي *
                </span>
                <textarea
                  required
                  name="reason"
                  rows={3}
                  placeholder="مثال: تغطية إجازة سنوية لرئيس القسم..."
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
                {isSubmitting ? "جارٍ الحفظ…" : "اعتماد التفويض"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
