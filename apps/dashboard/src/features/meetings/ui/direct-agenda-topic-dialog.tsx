"use client";

import { useState } from "react";
import { CircleDot, FileText, MessageSquareText } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";

type DirectTopicInput = {
  requestId: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  requiresVoting: boolean;
};

export function DirectAgendaTopicDialog({ pending, error, onClose, onSubmit }: {
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: DirectTopicInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [requestId] = useState(() => crypto.randomUUID());
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<DirectTopicInput["priority"]>("medium");
  const [requiresVoting, setRequiresVoting] = useState(false);
  const valid = title.trim().length >= 5;

  return <Dialog
    title="إضافة موضوع مباشر"
    description="موضوع خاص بهذا الاجتماع، من دون لائحة أو تصنيف أو مسار مجالس."
    size="lg"
    scrollContent
    closeDisabled={pending}
    onClose={onClose}
    footer={<>
      <Button variant="secondary" disabled={pending} onClick={onClose}>إلغاء</Button>
      <Button pending={pending} pendingLabel="جارٍ الإضافة…" disabled={!valid} onClick={() => onSubmit({ requestId, title: title.trim(), description: description.trim(), priority, requiresVoting })}>إضافة إلى جدول الأعمال</Button>
    </>}
  >
    {error && <InlineMessage tone="error">تعذر حفظ الموضوع: {error}</InlineMessage>}
    <div className="rounded-q-card border border-q-border bg-q-surface-2 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-q-control bg-q-info-soft text-q-link"><FileText size={20}/></span>
        <div><h3 className="text-q-h3 font-bold text-q-text">بيانات البند</h3><p className="mt-1 text-q-caption leading-6 text-q-text-2">سيُنشأ رقم موضوع تلقائي، ويبقى البند داخل هذا الاجتماع فقط.</p></div>
      </div>
    </div>
    <label className="grid gap-2 text-q-ui font-bold text-q-text">عنوان الموضوع
      <input aria-label="عنوان الموضوع" autoFocus value={title} onChange={(event) => setTitle(event.target.value)} maxLength={300} placeholder="مثال: إحاطة المجلس بنتائج الربع الأول" className="min-h-11 rounded-q-control border border-q-border bg-q-surface px-3 font-normal outline-none focus:border-q-primary"/>
      <span className="text-q-caption font-normal text-q-text-2">خمسة أحرف على الأقل · {title.length}/300</span>
    </label>
    <label className="grid gap-2 text-q-ui font-bold text-q-text">وصف الموضوع
      <textarea aria-label="وصف الموضوع" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={10000} placeholder="اكتب الخلفية والمعلومات التي يحتاجها أعضاء المجلس…" className="min-h-32 resize-y rounded-q-control border border-q-border bg-q-surface p-3 font-normal leading-7 outline-none focus:border-q-primary"/>
    </label>
    <label className="grid gap-2 text-q-ui font-bold text-q-text">الأولوية
      <select value={priority} onChange={(event) => setPriority(event.target.value as DirectTopicInput["priority"])} className="min-h-11 rounded-q-control border border-q-border bg-q-surface px-3 font-normal outline-none focus:border-q-primary">
        <option value="low">منخفضة</option><option value="medium">متوسطة</option><option value="high">عالية</option><option value="urgent">عاجلة</option>
      </select>
    </label>
    <label className="flex cursor-pointer items-start gap-3 rounded-q-card border border-q-border bg-q-surface p-4">
      <input type="checkbox" checked={requiresVoting} onChange={(event) => setRequiresVoting(event.target.checked)} aria-label="يتطلب تصويت المجلس" className="mt-1 h-5 w-5 accent-q-primary"/>
      <span className="min-w-0"><strong className="flex items-center gap-2 text-q-ui text-q-text"><CircleDot size={18}/>يتطلب تصويت المجلس</strong><span className="mt-1 block text-q-caption leading-6 text-q-text-2">اتركه غير محدد إذا كان البند للإحاطة أو المناقشة فقط. عند اختياره لن تُغلق الجلسة قبل اكتمال التصويت أو تأجيل البند.</span></span>
    </label>
    <div className="flex items-center gap-2 rounded-q-control bg-q-success-soft px-3 py-2 text-q-caption text-q-success"><MessageSquareText size={17}/>{requiresVoting ? "سيظهر التصويت بعد مناقشة البند." : "سيكتمل البند بالمناقشة من دون تصويت إلزامي."}</div>
  </Dialog>;
}
