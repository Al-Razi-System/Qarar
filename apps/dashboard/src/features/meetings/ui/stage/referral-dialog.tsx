"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { TextArea } from "@/shared/ui/text-area";

const MIN_REASON_LENGTH = 5;

type Props = {
  topicTitle: string;
  /** The active units the item may go to, as the server lists them for the chair. */
  destinations: Array<{ id: string; name_ar: string }>;
  busy: boolean;
  /** The server's answer to the last attempt, shown beside the action. */
  error?: string | null;
  onClose: () => void;
  /** Resolves true when the referral was recorded; the dialog then closes. */
  onSubmit: (toUnitId: string, reason: string) => Promise<boolean>;
};

/**
 * The chair refers an item to another unit instead of a vote. The unit then
 * accepts or rejects it; the room cannot take a referral back.
 */
export function ReferralDialog({ topicTitle, destinations, busy, error, onClose, onSubmit }: Props) {
  const [toUnitId, setToUnitId] = useState("");
  const [reason, setReason] = useState("");
  const clean = reason.trim();
  const missing = !toUnitId ? "اختر الجهة المحال إليها." : clean.length < MIN_REASON_LENGTH ? "اكتب سبب الإحالة بخمسة أحرف على الأقل." : null;

  async function submit() {
    if (missing || busy) return;
    if (await onSubmit(toUnitId, clean)) onClose();
  }

  return (
    <Dialog
      title="إحالة البند"
      description={`يُحال «${topicTitle}» بقرار رئيس المجلس دون تصويت، وينتظر قبول الجهة المحال إليها. لا تُسحب الإحالة من الغرفة بعد إرسالها.`}
      onClose={onClose}
      closeDisabled={busy}
      footer={<>
        {error && <InlineMessage tone="error" className="w-full">{error}</InlineMessage>}
        {!error && missing && <span className="me-auto text-q-caption font-bold text-q-text-2">{missing}</span>}
        <Button variant="ghost" onClick={onClose} disabled={busy}>إلغاء</Button>
        <Button onClick={() => void submit()} disabled={Boolean(missing)} pending={busy} pendingLabel="جارٍ الإحالة…">إحالة البند</Button>
      </>}
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-q-ui font-bold text-q-text">
          الجهة المحال إليها
          <select
            value={toUnitId}
            disabled={busy || destinations.length === 0}
            onChange={(event) => setToUnitId(event.target.value)}
            className="h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal text-q-text"
          >
            <option value="">اختر الجهة</option>
            {destinations.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}
          </select>
          {destinations.length === 0 && <span className="text-q-caption font-normal text-q-text-2">لا توجد جهة نشطة أخرى يُحال إليها البند.</span>}
        </label>
        <TextArea
          label="سبب الإحالة"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={busy}
          maxLength={2000}
        />
      </div>
    </Dialog>
  );
}
