/* eslint-disable react/no-unescaped-entities */
"use client";

import { useState } from "react";
import { Clock, Plus, UserCheck } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";

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
      {notice && <InlineMessage tone={notice.type}>{notice.text}</InlineMessage>}

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-q-body font-black text-q-text">
            إدارة التفويض المؤقت والإنابة
          </h2>
          <p className="mt-1 text-q-caption text-q-text-3">
            تفويض صلاحيات مجلس أو لجنة لمستخدم آخر عند الإجازات والتغطية المؤقتة (حتى 90 يوماً كأقصى حد).
          </p>
        </div>
        <Button onClick={() => setIsOpen(true)}>
          <Plus size={16} /> تفويض جديد
        </Button>
      </Card>

      <Card className="p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-q-card bg-q-surface-2 text-q-primary">
          <UserCheck size={24} />
        </span>
        <h3 className="mt-4 text-q-ui font-black text-q-text">
          لا توجد تفويضات نشطة حالياً
        </h3>
        <p className="mt-1 text-q-caption text-q-text-2">
          استخدم زر "تفويض جديد" لتسديد إنابة لمجلس محدد وتأطيرها بمهلة زمنية حوكمية.
        </p>
      </Card>

      {isOpen && (
        <Dialog title="إنشاء تفويض مؤقت / إنابة" description="منح صلاحية العضوية لمستخدم بديل لفترة زمنية محددة." onClose={() => setIsOpen(false)} closeDisabled={isSubmitting} footer={<><Button variant="secondary" disabled={isSubmitting} onClick={() => setIsOpen(false)}>إلغاء</Button><Button type="submit" form="delegation-form" pending={isSubmitting} pendingLabel="جارٍ الحفظ…">اعتماد التفويض</Button></>}>
          <form id="delegation-form" onSubmit={handleCreate} className="grid gap-4">
            <span className="grid h-11 w-11 place-items-center rounded-q-control bg-q-surface-2 text-q-primary"><Clock size={20} /></span>
              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  معرف العضوية الأصيلة (Source Membership UUID) *
                </span>
                <input
                  required
                  name="source_membership_id"
                  placeholder="أدخل UUID الخاص بعضوية الأصيل"
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-caption outline-none focus:border-q-primary"
                />
              </label>

              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  المستخدم البديل / المفوض إليه (User UUID) *
                </span>
                <input
                  required
                  name="delegated_to_user_id"
                  placeholder="أدخل UUID للمستخدم البديل"
                  className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-caption outline-none focus:border-q-primary"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                    تاريخ ووقت البداية *
                  </span>
                  <input
                    required
                    type="datetime-local"
                    name="starts_at"
                    className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-caption outline-none focus:border-q-primary"
                  />
                </label>

                <label>
                  <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                    تاريخ ووقت النهاية (حتى 90 يوماً) *
                  </span>
                  <input
                    required
                    type="datetime-local"
                    name="ends_at"
                    className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-caption outline-none focus:border-q-primary"
                  />
                </label>
              </div>

              <label>
                <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">
                  سبب التفويض / التبرير الحوكمي *
                </span>
                <textarea
                  required
                  name="reason"
                  rows={3}
                  placeholder="مثال: تغطية إجازة سنوية لرئيس القسم..."
                  className="w-full rounded-q-control border border-q-border p-3 text-q-caption outline-none focus:border-q-primary"
                />
              </label>
          </form>
        </Dialog>
      )}
    </div>
  );
}
