"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { TextArea } from "@/shared/ui/text-area";
import type { AgendaDiscussionItem } from "../../model/live-meeting";

export type DiscussionStatus = "under_discussion" | "discussed" | "postponed";
export type UpdateDiscussion = (item: AgendaDiscussionItem, status: DiscussionStatus, notes: string | null) => Promise<boolean>;

type Props = {
  item: AgendaDiscussionItem;
  /** True once a voting round on this item has closed: the summary becomes the final one. */
  votingFinished: boolean;
  role: "rapporteur" | "chair" | "member";
  busy: boolean;
  /** The rapporteur's unsaved text, kept by the parent so it survives a change of the item on screen. */
  draft?: string;
  onDraftChange: (text: string) => void;
  onUpdate: UpdateDiscussion;
};

/**
 * The rapporteur's notes on one item. Preliminary during discussion, final
 * after the vote. The chair follows them read-only; members see them once final.
 */
export function DiscussionSummary({ item, votingFinished, role, busy, draft, onDraftChange, onUpdate }: Props) {
  const saved = (item.discussion_notes ?? "").trim();
  const notes = draft ?? item.discussion_notes ?? "";
  const [editingPhase, setEditingPhase] = useState<"preliminary" | "final" | null>(null);
  const [savedPhase, setSavedPhase] = useState<"preliminary" | "final" | null>(null);

  const status = item.agenda_status ?? "pending";
  const recorder = role === "rapporteur";
  const phase = votingFinished ? "final" : "preliminary";
  const visibleToViewer = recorder || role === "chair" || (Boolean(saved) && (votingFinished || !item.requires_voting || status === "postponed"));
  if (!visibleToViewer || !(status === "under_discussion" || status === "discussed" || Boolean(saved))) return null;

  const canEdit = recorder && ["under_discussion", "discussed"].includes(status);
  const valid = notes.trim().length >= 5;
  const changed = notes.trim() !== saved;
  const editorOpen = editingPhase === phase || !saved || changed;
  const title = votingFinished ? "ملخص النتائج والتوصيات النهائي" : "ملاحظات المناقشة الأولية";
  const explanation = recorder
    ? votingFinished ? "أكمل النتيجة النهائية بعد التصويت لتغذية مسودة المحضر." : "يمكن حفظ ملاحظات أولية الآن، ولا تعيق فتح التصويت."
    : role === "chair" ? "نسخة متابعة للرئيس؛ التحرير من اختصاص مقرر المجلس." : "النتيجة النهائية المعتمدة لهذا البند.";

  async function save() {
    if (!(await onUpdate(item, status as DiscussionStatus, notes.trim()))) return;
    setSavedPhase(phase);
    setEditingPhase(null);
  }

  return (
    <section aria-label="ملخص المقرر للبند" className="flex flex-col gap-3 border-t border-q-border pt-4">
      {recorder && editorOpen ? (
        <TextArea
          label={title}
          aside={changed ? <Badge tone="warning">غير محفوظ</Badge> : undefined}
          hint={explanation}
          value={notes}
          onChange={(event) => { onDraftChange(event.target.value); setSavedPhase(null); }}
          disabled={!canEdit || busy}
          placeholder={votingFinished ? "اكتب خلاصة المناقشة ونتيجة التصويت والتوصية النهائية..." : "دوّن ملاحظات المناقشة الأولية إن وجدت..."}
        />
      ) : (
        <div>
          <h4 className="m-0 text-q-ui font-bold">{title}</h4>
          <p className="m-0 text-q-caption text-q-text-2">{explanation}</p>
          <p className="m-0 mt-2 whitespace-pre-wrap rounded-q-control bg-q-surface-2 p-3 text-q-body">{saved || "لم يحفظ المقرر ملاحظات بعد، وهذا لا يمنع فتح التصويت."}</p>
        </div>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-3">
          {editorOpen ? (
            <>
              <Button onClick={() => void save()} disabled={busy || !valid || !changed}>{votingFinished ? "حفظ الملخص النهائي" : "حفظ ملاحظات المقرر"}</Button>
              {!valid && <span className="text-q-caption text-q-text-2">اكتب خمسة أحرف على الأقل ليُفعَّل الحفظ.</span>}
            </>
          ) : (
            <Button variant="secondary" onClick={() => setEditingPhase(phase)}>تعديل الملخص</Button>
          )}
          {savedPhase === phase && !editorOpen && <InlineMessage tone="success">تم الحفظ بنجاح</InlineMessage>}
        </div>
      )}
    </section>
  );
}
