"use client";

import { useRef, useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { TextArea } from "@/shared/ui/text-area";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import type { MyVote } from "../../model/live-meeting";

export type VoteValue = "approve" | "reject" | "abstain";

const NOTE_LIMIT = 2000;

type Props = { vote: MyVote; busy: boolean; onCast: (roundId: string, value: VoteValue, note: string | null) => Promise<boolean> | void };

/** The member's ballot for one open round: three large choices and an optional note. */
export function MemberVoteCard({ vote, busy, onCast }: Props) {
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(true);
  const [choice, setChoice] = useState<VoteValue | null>(null);
  const [showNote, setShowNote] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  async function cast() {
    if (!choice || busy || sending.current) return;
    sending.current = true;
    setPending(true);
    setError(null);
    try {
      const saved = await onCast(vote.voting_round_id, choice, note.trim() || null);
      if (saved === false) setError("لم يتأكد تسجيل صوتك. تحقّق من حالة التصويت قبل إعادة المحاولة؛ بقي اختيارك محفوظًا هنا.");
      else setOpen(false);
    } catch {
      setError("لم يتأكد تسجيل صوتك. تحقّق من حالة التصويت قبل إعادة المحاولة؛ بقي اختيارك محفوظًا هنا.");
    } finally { sending.current = false; setPending(false); }
  }

  if (vote.has_voted) return null;
  return (
    <>
    <Card aria-label="بطاقة التصويت" role="region" className="flex flex-wrap items-center justify-between gap-3 border-q-primary">
      <p className="m-0 text-q-ui font-bold">التصويت مفتوح · {vote.title_ar}</p>
      <Button onClick={() => setOpen(true)}>أدلِ بصوتك</Button>
    </Card>
    {open && <Dialog title="التصويت على البند" description="اختر موقفك ثم أكّد إرساله. إغلاق النافذة لا يسجل صوتًا." size="lg" scrollContent closeDisabled={busy || pending} onClose={() => setOpen(false)}
      footer={<>
        {error && <InlineMessage tone="error">{error}</InlineMessage>}
        <Button variant="secondary" disabled={busy || pending} onClick={() => setOpen(false)}>لاحقًا</Button>
        <Button disabled={busy || !choice || Boolean(error)} pending={pending} pendingLabel="جارٍ تسجيل صوتك…" onClick={() => void cast()}>تأكيد التصويت</Button>
      </>}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-q-caption font-bold text-q-link">تصويت مفتوح لك الآن</p>
          <h2 className="m-0 mt-1 text-q-h3 font-bold">{vote.title_ar}</h2>
        </div>
        <Badge tone="info">صوتك سري</Badge>
      </div>
      <div role="radiogroup" aria-label="اختيار التصويت" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {([ ["approve", "موافق"], ["reject", "غير موافق"], ["abstain", "ممتنع"] ] as const).map(([value, label]) => <Button key={value} role="radio" aria-checked={choice === value} size="lg" variant={choice === value ? "primary" : "secondary"} block disabled={busy || pending} onClick={() => setChoice(value)}>{label}</Button>)}
      </div>
      <p className="m-0 text-q-caption text-q-text-2">يظهر للحاضرين أنك أكملت التصويت فقط؛ لا يُكشف اختيارك أو ملاحظتك لهم.</p>
      <Button variant="ghost" disabled={busy || pending} onClick={() => setShowNote(!showNote)}>{showNote ? "إخفاء الملاحظة" : "إضافة ملاحظة اختيارية"}</Button>
      {showNote && <TextArea
        label="ملاحظة مع التصويت"
        aside={`اختيارية · ${note.length}/${NOTE_LIMIT}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={NOTE_LIMIT}
        disabled={busy || pending}
        placeholder="يمكنك توضيح سبب اختيارك أو تسجيل تحفظ مختصر قبل الضغط على صوتك."
        className="min-h-20"
      />}
    </Dialog>}
    </>
  );
}
