"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { TextArea } from "@/shared/ui/text-area";
import type { MyVote } from "../../model/live-meeting";

export type VoteValue = "approve" | "reject" | "abstain";

const NOTE_LIMIT = 2000;

type Props = { vote: MyVote; busy: boolean; onCast: (roundId: string, value: VoteValue, note: string | null) => void };

/** The member's ballot for one open round: three large choices and an optional note. */
export function MemberVoteCard({ vote, busy, onCast }: Props) {
  const [note, setNote] = useState("");

  function cast(value: VoteValue) {
    onCast(vote.voting_round_id, value, note.trim() || null);
  }

  return (
    <Card aria-label="بطاقة التصويت" role="region" className="flex flex-col gap-4 border-2 border-q-primary">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="m-0 text-q-caption font-bold text-q-link">تصويت مفتوح لك الآن</p>
          <h2 className="m-0 mt-1 text-q-h3 font-bold">{vote.title_ar}</h2>
        </div>
        <Badge tone="info">صوتك سري</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Button size="lg" variant="success" block disabled={busy} onClick={() => cast("approve")}>موافق</Button>
        <Button size="lg" variant="danger" block disabled={busy} onClick={() => cast("reject")}>غير موافق</Button>
        <Button size="lg" variant="secondary" block disabled={busy} onClick={() => cast("abstain")}>ممتنع</Button>
      </div>
      <p className="m-0 text-q-caption text-q-text-2">يُسجَّل صوتك فور اختيارك، ولا يمكن التصويت مرتين في الجولة نفسها.</p>
      <TextArea
        label="ملاحظة مع التصويت"
        aside={`اختيارية · ${note.length}/${NOTE_LIMIT}`}
        value={note}
        onChange={(event) => setNote(event.target.value)}
        maxLength={NOTE_LIMIT}
        disabled={busy}
        placeholder="يمكنك توضيح سبب اختيارك أو تسجيل تحفظ مختصر قبل الضغط على صوتك."
        className="min-h-20"
      />
    </Card>
  );
}
