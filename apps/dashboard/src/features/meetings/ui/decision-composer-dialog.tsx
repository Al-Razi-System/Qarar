"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { TextArea } from "@/shared/ui/text-area";
import type { AgendaDiscussionItem, Decision, VotingRound } from "../model/live-meeting";

const MIN_DECISION_LENGTH = 10;

/**
 * Drafts the decision of an approved round, or edits the text of a saved one
 * when `decision` is given. Editing changes the text only, never the result.
 */
export function DecisionComposerDialog({ item, round, decision, busy, error, isRapporteur, onClose, onSubmit }: {
  item: AgendaDiscussionItem;
  round: VotingRound | null;
  decision?: Decision;
  busy: boolean;
  error?: string | null;
  isRapporteur: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState(decision?.decision_text ?? `اعتماد ما ورد في موضوع: ${item.topic?.title_ar ?? "الموضوع"}.`);
  const length = text.trim().length;
  const unchanged = Boolean(decision) && text.trim() === decision?.decision_text.trim();
  const valid = length >= MIN_DECISION_LENGTH && !unchanged;

  async function submit() {
    if (!valid || busy) return;
    if (await onSubmit(text.trim())) onClose();
  }

  const hint = length < MIN_DECISION_LENGTH
    ? "اكتب عشرة أحرف على الأقل ليُفعَّل الحفظ."
    : decision
      ? unchanged ? "لم يتغير النص بعد." : "يُحفظ النص الجديد ويُسجَّل النص السابق في سجل التدقيق. يبقى التعديل متاحاً إلى اعتماد المحضر."
      : "سيُنشأ القرار بحالة «جاهز للاعتماد» ويبقى مرتبطاً بالبند وجولة التصويت.";

  return (
    <Dialog
      title={decision ? `تعديل القرار ${decision.decision_no}` : "صياغة القرار المعتمد"}
      description={decision
        ? "يتغير نص القرار وحده، وتبقى نتيجة التصويت وحالة القرار كما هي."
        : "تُحفظ الصياغة كسجل قرار مرتبط بنتيجة التصويت ومحضر الاجتماع، دون تغيير النتيجة المحتسبة."}
      size="lg"
      onClose={onClose}
      closeDisabled={busy}
      footer={<>
        {error && <InlineMessage tone="error" className="w-full">{error}</InlineMessage>}
        <Button variant="ghost" onClick={onClose} disabled={busy}>إلغاء</Button>
        <Button onClick={() => void submit()} disabled={!valid} pending={busy} pendingLabel="جارٍ الحفظ…">
          {decision ? "حفظ التعديل" : isRapporteur ? "حفظ الصياغة وإرسالها للاعتماد" : "إنشاء القرار وإرساله للاعتماد"}
        </Button>
      </>}
    >
      <section className="flex flex-col gap-3 rounded-q-control bg-q-surface-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="m-0 text-q-caption font-bold text-q-text-2">البند {item.agenda_order}</p>
            <h3 className="m-0 text-q-ui font-bold">{item.topic?.title_ar ?? "موضوع الاجتماع"}</h3>
          </div>
          {round && <Badge tone="success">النتيجة النهائية: موافقة</Badge>}
        </div>
        {round && <p className="m-0 text-q-ui">موافق {round.approve_count ?? 0} · غير موافق {round.reject_count ?? 0} · ممتنع {round.abstain_count ?? 0}</p>}
        {item.discussion_notes && <p className="m-0 text-q-ui text-q-text-2"><strong className="text-q-text">خلاصة المقرر:</strong> {item.discussion_notes}</p>}
      </section>
      <TextArea
        label="نص القرار"
        aside={`${length} حرفاً · الحد الأدنى ${MIN_DECISION_LENGTH}`}
        autoFocus
        value={text}
        onChange={(event) => setText(event.target.value)}
        disabled={busy}
        placeholder="اكتب القرار بصياغة واضحة وقابلة للتنفيذ..."
        hint={hint}
        className="min-h-44 text-q-body"
      />
    </Dialog>
  );
}
