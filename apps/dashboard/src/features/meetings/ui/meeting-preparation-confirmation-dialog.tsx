"use client";

import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";

type Props = {
  pending: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function MeetingPreparationConfirmationDialog({ pending, error, onClose, onConfirm }: Props) {
  return <Dialog
    title="اعتماد جدول الأعمال"
    description="إنهاء مرحلة الدعوة وتجهيز الاجتماع للبدء"
    onClose={onClose}
    closeDisabled={pending}
    footer={<>
      <Button variant="secondary" disabled={pending} onClick={onClose}>العودة دون اعتماد</Button>
      <Button pending={pending} pendingLabel="جارٍ اعتماد جدول الأعمال…" onClick={onConfirm}>تأكيد اعتماد جدول الأعمال</Button>
    </>}
  >
    <InlineMessage tone="info">لن تبدأ الجلسة الآن. بعد الاعتماد ينتقل الاجتماع إلى «جاهز للبدء»، ويظهر للرئيس إجراء مستقل لفتح الجلسة.</InlineMessage>
    <InlineMessage tone="warning">سيُقفل جدول الأعمال عند الاعتماد، ولن يمكن إضافة البنود أو حذفها أو إعادة ترتيبها بعد ذلك.</InlineMessage>
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
  </Dialog>;
}
