"use client";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { Button } from "@/shared/ui/button";

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
        <InlineMessage tone={notice.type === "success" ? "success" : "error"}>
          {notice.text}
        </InlineMessage>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        <Card className="p-6">
          <span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-primary">
            <ShieldCheck size={20} />
          </span>
          <h3 className="mt-4 text-q-ui font-bold text-q-text">
            موفري الدخول الموحد (SSO Providers)
          </h3>
          <p className="mt-1 text-q-caption text-q-text-3">
            إعداد الاتصال مع Microsoft Entra ID أو SAML 2.0.
          </p>
          <Button
            type="button"
            onClick={() => setModal("provider")}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-q-control bg-q-primary px-4 py-2.5 text-q-caption font-bold text-q-on-primary hover:bg-q-primary-hover"
          >
            <Plus size={16} /> تهيئة موفر SSO
          </Button>
        </Card>

        <Card className="p-6">
          <span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-success-soft text-q-success">
            <Globe size={20} />
          </span>
          <h3 className="mt-4 text-q-ui font-bold text-q-text">
            النطاقات المؤسسية (بانتظار التحقق)
          </h3>
          <p className="mt-1 text-q-caption text-q-text-3">
            الدخول الموحد متوقف مؤقتًا؛ يُسجل النطاق في وضع معلّق ولا يُفعّل قبل تحقق موثوق من ملكيته.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled
            title="يتطلب هذا الإجراء خدمة تحقق موثوقة من ملكية النطاق."
            className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-q-control border border-q-border bg-q-surface px-4 py-2.5 text-q-caption font-bold text-q-text-2"
          >
            <Globe size={16} /> التحقق الخلفي مطلوب
          </Button>
        </Card>

        <Card className="p-6">
          <span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-link">
            <Layers size={20} />
          </span>
          <h3 className="mt-4 text-q-ui font-bold text-q-text">
            ربط مجموعات الـ Active Directory
          </h3>
          <p className="mt-1 text-q-caption text-q-text-3">
            مزامنة أدوار ومجالس قرار تلقائياً بحسب مجموعات الـ IdP.
          </p>
          <Button
            type="button"
            variant="secondary"
            disabled
            title="تفعيل مزامنة المجموعات متوقف إلى أن يثبت مصدر مجموعات IdP موثوق."
            className="mt-4 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-q-control border border-q-border bg-q-surface px-4 py-2.5 text-q-caption font-bold text-q-text-2"
          >
            <Layers size={16} /> التفعيل قيد الحوكمة
          </Button>
        </Card>
      </div>

      {modal === "provider" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-q-scrim/55 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleProviderSubmit}
            className="w-full max-w-lg overflow-hidden rounded-q-card bg-q-surface shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-q-border px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-primary">
                  <KeyRound size={20} />
                </span>
                <div>
                  <h2 className="text-q-ui font-bold text-q-text">
                    تهيئة موفر SSO جديد
                  </h2>
                  <p className="text-q-caption text-q-text-3">
                    ربط مزود الهوية الخارجي لحسابات المؤسسة.
                  </p>
                </div>
              </div>
              <Button
                type="button"
                onClick={() => setModal(null)}
                variant="ghost"
                className="h-11 w-11 px-0 text-q-text-2 hover:text-q-text"
              >
                <X size={20} />
              </Button>
            </div>

            <div className="grid gap-4 p-6">
              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  اسم موفر الخدمة *
                </span>
                <input
                  required
                  name="provider_name"
                  placeholder="مثال: University Entra ID"
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-caption outline-none focus:border-q-primary"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  Entity ID الخارجي
                </span>
                <input
                  name="entity_id"
                  placeholder="https://login.microsoftonline.com/..."
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-caption outline-none focus:border-q-primary"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  رابط الـ Metadata
                </span>
                <input
                  name="metadata_url"
                  placeholder="https://login.example.com/federationmetadata.xml"
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-caption outline-none focus:border-q-primary"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  وضع التزويد (Provisioning Mode) *
                </span>
                <select
                  name="provisioning_mode"
                  defaultValue="invited_only"
                  className="h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption outline-none focus:border-q-primary"
                >
                  <option value="invited_only">المستخدمون المدعوون فقط (MANDATORY FOR PRODUCTION)</option>
                  <option value="jit">التزويد التلقائي (Just-In-Time - JIT)</option>
                  <option value="disabled">معطل (Disabled)</option>
                </select>
              </label>
            </div>

            <div className="flex justify-end gap-3 border-t border-q-border bg-q-surface px-6 py-4">
              <Button
                type="button"
                onClick={() => setModal(null)}
                disabled={isSubmitting}
                variant="secondary"
                className="min-h-11 rounded-q-control border border-q-border px-4 text-q-caption font-bold text-q-text-2"
              >
                إلغاء
              </Button>
              <Button type="submit"
                disabled={isSubmitting}
                className="min-h-11 rounded-q-control bg-q-primary px-5 text-q-caption font-bold text-q-on-primary disabled:opacity-60"
              >
                {isSubmitting ? "جارٍ الحفظ…" : "حفظ الموفر"}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
