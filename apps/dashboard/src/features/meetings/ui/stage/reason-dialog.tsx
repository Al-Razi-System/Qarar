"use client";

import { useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { TextArea } from "@/shared/ui/text-area";

const MIN_REASON_LENGTH = 5;

type Props = {
  title: string;
  description: string;
  label: string;
  initialValue?: string;
  confirmLabel: string;
  busy: boolean;
  /** The server's answer to the last attempt, shown beside the action. */
  error?: string | null;
  onClose: () => void;
  /** Resolves true when the action succeeded; the dialog then closes. */
  onSubmit: (reason: string) => Promise<boolean>;
};

/** Asks for a documented reason (at least five characters) before an action the minutes must explain. */
export function ReasonDialog({ title, description, label, initialValue = "", confirmLabel, busy, error, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState(initialValue);
  const clean = reason.trim();
  const valid = clean.length >= MIN_REASON_LENGTH;

  async function submit() {
    if (!valid || busy) return;
    if (await onSubmit(clean)) onClose();
  }

  return (
    <Dialog
      title={title}
      description={description}
      onClose={onClose}
      closeDisabled={busy}
      footer={<>
        {error && <InlineMessage tone="error" className="w-full">{error}</InlineMessage>}
        <Button variant="ghost" onClick={onClose} disabled={busy}>إلغاء</Button>
        <Button onClick={() => void submit()} disabled={!valid} pending={busy} pendingLabel="جارٍ الحفظ…">{confirmLabel}</Button>
      </>}
    >
      <TextArea
        label={label}
        autoFocus
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        disabled={busy}
        hint={valid ? undefined : "اكتب خمسة أحرف على الأقل ليُفعَّل الزر."}
      />
    </Dialog>
  );
}
