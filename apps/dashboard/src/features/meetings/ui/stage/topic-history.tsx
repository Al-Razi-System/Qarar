import { Badge } from "@/shared/ui/badge";
import { voteResultLabel } from "../../model/agenda-flow";
import type { TopicGovernanceHistory } from "../../model/live-meeting";

function dateLabel(value?: string) {
  return value ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`)) : "دون تاريخ";
}

function decisionTypeLabel(value: string) {
  return ({ approved: "موافقة", recommended: "توصية بالموافقة", rejected: "رفض", deferred: "تأجيل", returned: "إعادة للاستكمال" } as Record<string, string>)[value] ?? "قرار موثق";
}

export function hasTopicHistory(history?: TopicGovernanceHistory) {
  return Boolean(history && (history.meetings.length > 0 || (history.priorRoute?.steps.length ?? 0) > 0));
}

/** What earlier councils decided on this topic, so it is in front of the council during discussion. */
export function TopicHistory({ history }: { history: TopicGovernanceHistory }) {
  return (
    <section aria-label="سجل الموضوع في المجالس السابقة" className="flex flex-col gap-3">
      {(history.priorRoute?.steps ?? []).map((step) => (
        <article key={step.id} className="flex flex-col gap-3 rounded-q-card border border-q-border bg-q-surface-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="m-0 text-q-ui font-bold">{step.responsible_unit_name_ar || step.step_title}</h4>
              <p className="m-0 text-q-caption text-q-text-2">{step.meeting_reference || "اجتماع سابق خارج النظام"} · {dateLabel(step.meeting_date)}</p>
            </div>
            <Badge tone="success">{decisionTypeLabel(step.decision_type)}</Badge>
          </div>
          <div>
            <p className="m-0 text-q-caption font-bold text-q-text-2">القرار أو التوصية</p>
            <p className="m-0 text-q-body">{step.decision_text}</p>
          </div>
          <div>
            <p className="m-0 text-q-caption font-bold text-q-text-2">سبب احتساب المرحلة مكتملة</p>
            <p className="m-0 text-q-ui">{step.bypass_reason}</p>
          </div>
          {step.attachments.length > 0 && (
            <div>
              <p className="m-0 mb-2 text-q-caption font-bold text-q-text-2">محضر المجلس والمرفقات ({step.attachments.length})</p>
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {step.attachments.map((file) => (
                  <li key={file.id} className="max-w-full">
                    <a href={file.file_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 max-w-full items-center rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption font-bold text-q-link">
                      <span className="truncate">{file.file_name}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </article>
      ))}
      {history.meetings.map((entry) => (
        <article key={entry.agenda_item_id} className="flex flex-col gap-3 rounded-q-card border border-q-border bg-q-surface-2 p-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h4 className="m-0 text-q-ui font-bold">{entry.meeting.title}</h4>
              <p className="m-0 text-q-caption text-q-text-2">{entry.meeting.meeting_no || "اجتماع سابق"} · {entry.meeting.unit_name || "المجلس المختص"} · {dateLabel(entry.meeting.scheduled_date)}</p>
            </div>
            <Badge tone="info">اجتماع سابق داخل النظام</Badge>
          </div>
          {entry.discussion_notes && (
            <div>
              <p className="m-0 text-q-caption font-bold text-q-text-2">ملخص المناقشة والتوصيات</p>
              <p className="m-0 text-q-ui">{entry.discussion_notes}</p>
            </div>
          )}
          <div className="grid gap-3 lg:grid-cols-2">
            <div>
              <p className="m-0 mb-1 text-q-caption font-bold text-q-text-2">نتائج التصويت</p>
              {entry.voting_rounds.length ? entry.voting_rounds.map((round) => (
                <p key={round.id} className="m-0 text-q-ui"><strong>{voteResultLabel(round.result)}</strong> · موافق {round.approve_count ?? 0} · غير موافق {round.reject_count ?? 0} · ممتنع {round.abstain_count ?? 0}</p>
              )) : <p className="m-0 text-q-ui text-q-text-2">لا توجد جولة تصويت مسجلة.</p>}
            </div>
            <div>
              <p className="m-0 mb-1 text-q-caption font-bold text-q-text-2">القرارات الصادرة</p>
              {entry.decisions.length ? entry.decisions.map((decision) => (
                <p key={decision.id} className="m-0 text-q-ui"><strong>{decision.decision_no}</strong> · {decision.decision_text}</p>
              )) : <p className="m-0 text-q-ui text-q-text-2">لا يوجد قرار صادر.</p>}
            </div>
          </div>
        </article>
      ))}
    </section>
  );
}
