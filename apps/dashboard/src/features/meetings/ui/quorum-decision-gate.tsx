"use client";

import { useRef, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { TextArea } from "@/shared/ui/text-area";
import { quorumMet } from "../model/agenda-flow";
import type { LiveMeetingSession } from "../model/live-meeting";

export function QuorumDecisionGate({ session, busy, onChoose }: {
  session: LiveMeetingSession; busy: boolean;
  onChoose: (action: "continue" | "postpone", reason: string) => Promise<boolean>;
}) {
  const needed = session.meeting.status === "in_progress" && session.meeting.attendance_locked && !quorumMet(session) && !session.meeting.quorum_continuation;
  const [dismissed, setDismissed] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  const canChoose = session.viewer.can_decide_quorum === true;
  async function choose(action: "continue" | "postpone") {
    if (busy || sending.current || reason.trim().length < 5) return;
    sending.current = true;
    setError(null);
    try {
      if (!(await onChoose(action, reason.trim()))) setError("تعذر حفظ القرار؛ حدّث الجلسة وتحقق من الصلاحية ثم أعد المحاولة.");
    } catch {
      setError("تعذر الاتصال؛ قرارك لم يُؤكد. حدّث الجلسة قبل إعادة المحاولة.");
    } finally { sending.current = false; }
  }
  if (session.meeting.quorum_continuation) return <InlineMessage tone="warning">انعقد هذا الاجتماع واتُخذت قراراته بنصاب غير مكتمل، بقرار رئيس المجلس. السبب: {session.meeting.quorum_continuation.reason}</InlineMessage>;
  if (!needed) return null;
  return <>
    <InlineMessage tone="warning">النصاب غير مكتمل. لا تبدأ المناقشة قبل اختيار رئيس المجلس تأجيل الاجتماع أو المتابعة مع توثيق نقص النصاب.
      {canChoose && <Button variant="secondary" disabled={busy} onClick={() => setDismissed(false)}>تحديد مصير الاجتماع</Button>}
    </InlineMessage>
    {canChoose && !dismissed && <Dialog title="النصاب غير مكتمل" description={`الحضور المعتمد ${session.quorum?.present_members ?? 0} من ${session.quorum?.eligible_members ?? 0}. اختر تأجيل الاجتماع أو المتابعة على مسؤولية القرار الموثق؛ لا يتغير النصاب أو سجل الحضور.`} onClose={() => { if (!busy) setDismissed(true); }}
      footer={<div className="flex flex-wrap gap-3"><Button disabled={busy || reason.trim().length < 5} onClick={() => void choose("postpone")}>تأجيل الاجتماع</Button><Button variant="secondary" disabled={busy || reason.trim().length < 5} onClick={() => void choose("continue")}>{busy ? "جارٍ حفظ القرار…" : "المتابعة بنصاب غير مكتمل"}</Button></div>}>
      <div className="flex flex-col gap-3"><TextArea label="سبب القرار" value={reason} maxLength={2000} disabled={busy} onChange={event => setReason(event.target.value)} />
        <p className="m-0 text-q-caption text-q-text-2">اكتب السبب بخمسة أحرف على الأقل. عند المتابعة يظهر تنبيه نقص النصاب في الاجتماع وقراراته ومحضره.</p>
        {error && <InlineMessage tone="error">{error}</InlineMessage>}
      </div>
    </Dialog>}
  </>;
}
