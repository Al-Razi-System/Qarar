"use client";

import { useState } from "react";
import { Globe, KeyRound, Layers, Plus, ShieldCheck, X } from "lucide-react";

export function SsoWorkspace() {
  const [modal, setModal] = useState<"provider" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleProviderSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setNotice(null);

    const formData = new FormData(event.currentTarget);
    const body = {
      action: "upsert_provider",
      provider_name: formData.get("provider_name"),
      entity_id: formData.get("entity_id") || null,
      metadata_url: formData.get("metadata_url") || null,
      provisioning_mode: formData.get("provisioning_mode"),
      status: "active",
    };

    try {
      const response = await fetch("/api/admin/sso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "تعذر إضافة موفر الـ SSO.");

      setModal(null);
      setNotice({ type: "success", text: "تم تسجيل موفر الدخول الموحد بنجاح." });
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

      <div className="grid gap-6 md:grid-cols-3">
        <div className="rounded-2xl border border-[#e2e9f1] bg-white p-6 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]">
            <ShieldCheck size={20} />
          </span>
          <h3 className="mt-4 text-sm font-black text-[#0a1330]">
            موفري الدخول الموحد (SSO Providers)
          </h3>
          <p className="mt-1 text-xs text-[#718196]">
            إعداد الاتصال مع Microsoft Entra ID أو SAML 2.0.
          </p>
          <button
            type="button"
            onClick={() => setModal("provider")}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0066cc] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#0055b3]"
          >
            <Plus size={16} /> تهيئة موفر SSO
          </button>
        </div>

        <div className="rounded-2xl border border-[#e2e9f1] bg-white p-6 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#eef8f1] text-[#16835f]">
            <Globe size={20} />
          </span>
          <h3 className="mt-4 text-sm font-black text-[#0a1330]">
            النطاقات المؤسسية (بانتظار التحقق)
          </h3>
          <p className="mt-1 text-xs text-[#718196]">
            الدخول الموحد متوقف مؤقتًا؛ يُسجل النطاق في وضع معلّق ولا يُفعّل قبل تحقق موثوق من ملكيته.
          </p>
          <button
            type="button"
            disabled
            title="يتطلب هذا الإجراء خدمة تحقق موثوقة من ملكية النطاق."
            className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-[#dfe7ef] bg-[#f6f8fa] px-4 py-2.5 text-xs font-bold text-[#8493a6]"
          >
            <Globe size={16} /> التحقق الخلفي مطلوب
          </button>
        </div>

        <div className="rounded-2xl border border-[#e2e9f1] bg-white p-6 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#fff2e8] text-[#ff7a00]">
            <Layers size={20} />
          </span>
          <h3 className="mt-4 text-sm font-black text-[#0a1330]">
            ربط مجموعات الـ Active Directory
          </h3>
          <p className="mt-1 text-xs text-[#718196]">
            مزامنة أدوار ومجالس قرار تلقائياً بحسب مجموعات الـ IdP.
          </p>
          <button
            type="button"
            disabled
            title="تفعيل مزامنة المجموعات متوقف إلى أن يثبت مصدر مجموعات IdP موثوق."
            className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl border border-[#dfe7ef] bg-[#f6f8fa] px-4 py-2.5 text-xs font-bold text-[#8493a6]"
          >
            <Layers size={16} /> التفعيل قيد الحوكمة
          </button>
        </div>
      </div>

      {modal === "provider" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleProviderSubmit}
            className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-[#e7edf3] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]">
                  <KeyRound size={20} />
                </span>
                <div>
                  <h2 className="text-base font-black text-[#0a1330]">
                    تهيئة موفر SSO جديد
                  </h2>
                  <p className="text-xs text-[#718196]">
                    ربط مزود الهوية الخارجي لحسابات المؤسسة.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="text-[#73849a] hover:text-[#0a1330]"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-4 p-6">
              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  اسم موفر الخدمة *
                </span>
                <input
                  required
                  name="provider_name"
                  placeholder="مثال: University Entra ID"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  Entity ID الخارجي
                </span>
                <input
                  name="entity_id"
                  placeholder="https://login.microsoftonline.com/..."
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  رابط الـ Metadata
                </span>
                <input
                  name="metadata_url"
                  placeholder="https://login.example.com/federationmetadata.xml"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">
                  وضع التزويد (Provisioning Mode) *
                </span>
                <select
                  name="provisioning_mode"
                  defaultValue="invited_only"
                  className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs outline-none focus:border-[#0066cc]"
                >
                  <option value="invited_only">المستخدمون المدعوون فقط (MANDATORY FOR PRODUCTION)</option>
                  <option value="jit">التزويد التلقائي (Just-In-Time - JIT)</option>
                  <option value="disabled">معطل (Disabled)</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-[#e7edf3] bg-[#fbfcfe] px-6 py-4">
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={isSubmitting}
                className="h-10 rounded-xl border border-[#dbe5ef] px-4 text-xs font-bold text-[#52647a]"
              >
                إلغاء
              </button>
              <button
                disabled={isSubmitting}
                className="h-10 rounded-xl bg-[#0066cc] px-5 text-xs font-bold text-white shadow-[0_8px_20px_rgba(0,102,204,.18)] disabled:opacity-60"
              >
                {isSubmitting ? "جارٍ الحفظ…" : "حفظ الموفر"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
