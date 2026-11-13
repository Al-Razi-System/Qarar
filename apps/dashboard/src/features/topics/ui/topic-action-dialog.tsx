import { InlineMessage } from "@/shared/ui/inline-message";
import { Dialog } from "@/shared/ui/dialog";

import { Card } from "@/shared/ui/card";

import { Button } from "@/shared/ui/button";
import { AlertTriangle, Check, Clock, LoaderCircle, X } from "lucide-react";
import type { ReviewAction, TopicDetail } from "../model/topic-view";

type Props = {
  action: Exclude<ReviewAction, "approve"> | null;
  topic: TopicDetail | null;
  reason: string;
  busy: boolean;
  onReasonChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

const config = {
  reject: {
    title: "رفض الموضوع",
    description: "سيُغلق الطلب بهذه النتيجة، وسيظهر السبب لمقدم الموضوع في سجل الحالة.",
    label: "سبب الرفض",
    placeholder: "وضّح سبب الرفض بشكل محدد وقابل للفهم...",
    button: "تأكيد الرفض",
    icon: X,
    tone: "red",
  },
  return: {
    title: "طلب استكمال الموضوع",
    description: "سيعود الموضوع إلى مقدمه لاستكمال البيانات، ويختفي من قائمة المراجعة حتى إعادة إرساله.",
    label: "المعلومات المطلوب استكمالها",
    placeholder: "حدّد البيانات أو المرفقات الناقصة بوضوح...",
    button: "إرسال طلب الاستكمال",
    icon: Clock,
    tone: "amber",
  },
} as const;

export function TopicActionDialog({ action, topic, reason, busy, onReasonChange, onClose, onConfirm }: Props) {
  if (!action || !topic) return null;
  const current = config[action];
  const valid = reason.trim().length >= 5;
  const isReject = current.tone === "red";

  return <Dialog title={current.title} description={current.description} onClose={onClose} closeDisabled={busy} footer={
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" type="submit" onClick={onClose} disabled={busy} className="min-h-11 rounded-q-control border px-5 font-bold ">إلغاء</Button>
        <Button variant={isReject ? "danger" : "primary"} type="submit" onClick={onConfirm} disabled={busy || !valid}>
          {busy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} {busy ? "جارٍ التنفيذ..." : current.button}
        </Button>
      </div>
  }>
      <div className="p-6">
        <Card className="rounded-q-card border border-q-border bg-q-surface-2 px-4 py-3"><p className="text-q-caption font-bold text-q-text-2">الموضوع</p><strong className="mt-1 block text-q-caption leading-6 text-q-text">{topic.title_ar}</strong></Card>
        <label className="mt-5 block"><span className="mb-2 block text-q-caption font-bold text-q-link">{current.label} <span className="text-q-danger">*</span></span>
          <textarea autoFocus value={reason} onChange={(event) => onReasonChange(event.target.value)} rows={4} maxLength={2000} placeholder={current.placeholder} className="w-full resize-none rounded-q-control border border-q-border bg-q-surface p-4 text-q-caption leading-6 outline-none transition focus:border-q-primary focus:ring-4 focus:ring-q-primary/10" />
          <span className={`mt-1.5 block text-q-caption ${reason.length > 0 && !valid ? "text-q-danger" : "text-q-text-2"}`}>الحد الأدنى 5 أحرف · {reason.length}/2000</span>
        </label>
        {!valid && reason.length > 0 && <InlineMessage tone="error" className="mt-3 flex items-center gap-2"><AlertTriangle size={13} /> اكتب سبباً واضحاً من 5 أحرف على الأقل.</InlineMessage>}
      </div>
  </Dialog>;
}
