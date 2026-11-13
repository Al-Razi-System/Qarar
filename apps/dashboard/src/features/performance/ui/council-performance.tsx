import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { MetricStrip } from "@/shared/ui/metric-strip";
import { RhythmLegend, SessionRhythm } from "@/shared/ui/session-rhythm";
import { ShareBar } from "@/shared/ui/share-bar";
import { councilMetrics, days, decisionShares, executorsText, topicShares, fullRhythm, outcomeCaption, rhythmSentence, shortDate, stateLabel, stateTone, type CouncilPerformance, type SessionRow } from "../model/performance";

const cell = "px-3 py-3.5 align-top";
const head = "px-3 py-2.5 text-start font-semibold";
const panel = "rounded-q-card border border-q-border bg-q-surface";

function heldText(session: SessionRow) {
  if (session.outcome === "on_time" && session.held_on) return `${shortDate(session.held_on)}، في موعدها`;
  if (session.outcome === "late" && session.held_on) return `${shortDate(session.held_on)}، بعد ${days(session.late_days)}`;
  return outcomeCaption(session);
}

const heldTone: Record<SessionRow["outcome"], string> = {
  on_time: "text-q-text", late: "font-semibold text-q-accent-text", missed: "font-semibold text-q-danger",
  overdue: "font-semibold text-q-danger", cancelled: "text-q-text-3", upcoming: "text-q-text-3",
};

function minutesText(session: SessionRow) {
  if (!session.held_on) return "—";
  if (!session.minutes_approved_on) return session.status === "in_progress" ? "الجلسة جارية" : "لم يُعتمد بعد";
  const gap = Math.round((new Date(session.minutes_approved_on).getTime() - new Date(session.held_on).getTime()) / 86_400_000);
  return gap <= 0 ? "اعتُمد يوم الجلسة" : `اعتُمد بعد ${days(gap)}`;
}

/** One council in full: its rhythm, four indicators against target, every session, and what needs follow-up now. */
export function CouncilPerformanceView({ data }: { data: CouncilPerformance }) {
  const { council, sessions, violations } = data;
  const { decision_stats: decisions, topics } = council;
  const sentence = rhythmSentence(council.sessions, council.marks);
  // Newest first in the ledger: the follower acts on the latest sessions.
  const ledger = sessions.filter((session) => session.outcome !== "upcoming").slice().reverse();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-q-ui text-q-text-2">
        <Badge tone={stateTone[council.state]}>{stateLabel[council.state]}</Badge>
        {council.chair_name_ar && <span>يرأسه {council.chair_name_ar}</span>}
        <span>عدد الأعضاء: {council.member_count}</span>
      </div>

      <section aria-labelledby="rhythm-title" className={`${panel} flex flex-col gap-4 p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="rhythm-title" className="m-0 text-q-h3 font-semibold text-q-text">إيقاع الانعقاد</h2>
          <p className="m-0 text-q-ui text-q-text-2">{sentence}</p>
        </div>
        {sessions.length > 0
          ? <SessionRhythm variant="full" sessions={fullRhythm(sessions)} summary={`إيقاع الانعقاد: ${sentence}`} />
          : <p className="m-0 text-q-ui text-q-text-2">لا جلسات مسجلة لهذا المجلس في هذا العام الجامعي.</p>}
        <RhythmLegend />
      </section>

      <MetricStrip label="مؤشرات المجلس" metrics={councilMetrics(council)} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="decisions-title" className={`${panel} flex flex-col gap-4 p-5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="decisions-title" className="m-0 text-q-h3 font-semibold text-q-text">القرارات الصادرة</h2>
            <span className="text-q-h3 font-semibold text-q-text">{decisions.total}</span>
          </div>
          {decisions.total === 0 ? <p className="m-0 text-q-ui text-q-text-2">لم يصدر المجلس قرارًا في هذا العام الجامعي.</p> : <>
            <ShareBar label="القرارات حسب نتيجتها" shares={decisionShares(decisions)} />
            {decisions.by_type.length > 0 && (
              <p className="m-0 text-q-ui text-q-text-2">
                حسب النوع: {decisions.by_type.map((type) => `${type.name_ar} ${type.count}`).join("، ")}{decisions.untyped > 0 ? `، بلا نوع ${decisions.untyped}` : ""}.
              </p>
            )}
            <dl className="m-0 grid gap-x-6 gap-y-3 border-t border-q-border pt-4 sm:grid-cols-3">
              <div><dt className="text-q-caption text-q-text-3">تحتاج تنفيذًا</dt><dd className="m-0 text-q-ui font-semibold text-q-text">{decisions.needs_execution} من {decisions.total}</dd></div>
              <div>
                <dt className="text-q-caption text-q-text-3">نُفّذت كاملة</dt>
                <dd className="m-0 text-q-ui font-semibold text-q-text">{decisions.executed} من {decisions.needs_execution}</dd>
                {decisions.overdue_execution > 0 && <dd className="m-0 text-q-caption text-q-accent-text">{decisions.overdue_execution} تأخر تنفيذها</dd>}
              </div>
              <div><dt className="text-q-caption text-q-text-3">المنفّذون</dt><dd className="m-0 text-q-ui font-semibold text-q-text">{executorsText(decisions.executors)}</dd></div>
            </dl>
          </>}
        </section>

        <section aria-labelledby="topics-title" className={`${panel} flex flex-col gap-4 p-5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="topics-title" className="m-0 text-q-h3 font-semibold text-q-text">الموضوعات في جدول المجلس</h2>
            <span className="text-q-h3 font-semibold text-q-text">{topics.total}</span>
          </div>
          {topics.total === 0 ? <p className="m-0 text-q-ui text-q-text-2">لم يُدرج موضوع في جلسات هذا العام الجامعي.</p> : <>
            <ShareBar label="الموضوعات حسب مصدر حوكمتها" shares={topicShares(topics)} />
            <dl className="m-0 grid gap-x-6 gap-y-3 border-t border-q-border pt-4 sm:grid-cols-2">
              <div>
                <dt className="text-q-caption text-q-text-3">غير محوكمة</dt>
                <dd className={`m-0 text-q-ui font-semibold ${topics.ungoverned > 0 ? "text-q-accent-text" : "text-q-text"}`}>{topics.ungoverned} من {topics.total}</dd>
              </div>
              <div><dt className="text-q-caption text-q-text-3">نوقشت</dt><dd className="m-0 text-q-ui font-semibold text-q-text">{topics.discussed} من {topics.total}</dd></div>
            </dl>
          </>}
        </section>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,1.2fr)]">
        <section aria-labelledby="ledger-title" className={`${panel} overflow-hidden`}>
          <h2 id="ledger-title" className="m-0 px-6 py-4 text-q-h3 font-semibold text-q-text">سجل الجلسات</h2>
          {ledger.length === 0 ? <p className="m-0 border-t border-q-border p-6 text-q-ui text-q-text-2">لم يحِن موعد أي جلسة بعد.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-q-ui">
                <thead>
                  <tr className="bg-q-surface-2 text-q-text">
                    <th scope="col" className={`${head} ps-6`}>الجلسة</th>
                    <th scope="col" className={head}>الموعد المخطط</th>
                    <th scope="col" className={head}>الانعقاد</th>
                    <th scope="col" className={head}>الحضور</th>
                    <th scope="col" className={head}>المحضر</th>
                    <th scope="col" className={`${head} pe-6`}>القرارات</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.map((session) => (
                    <tr key={session.meeting_id} className="border-t border-q-border">
                      <td className={`${cell} ps-6`}><Link href={session.link} className="font-semibold text-q-link hover:underline">{session.title_ar}</Link></td>
                      <td className={cell}>{shortDate(session.planned_on)}</td>
                      <td className={`${cell} ${heldTone[session.outcome]}`}>{heldText(session)}</td>
                      <td className={cell}>{session.recorded ? `${session.present ?? 0} من ${session.recorded}` : "—"}</td>
                      <td className={cell}>{minutesText(session)}</td>
                      <td className={`${cell} pe-6`}>{session.held_on ? session.decisions : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section aria-labelledby="attention-title" className={`${panel} flex flex-col gap-3 p-5`}>
          <h2 id="attention-title" className="m-0 text-q-h3 font-semibold text-q-text">يحتاج متابعة</h2>
          {violations.length === 0 ? <p className="m-0 text-q-ui text-q-text-2">لا شيء مفتوح على هذا المجلس الآن.</p> : (
            <ul className="m-0 flex list-none flex-col p-0">
              {violations.map((violation) => (
                <li key={violation.id} className="flex flex-col gap-1 border-b border-q-border py-3 first:pt-0 last:border-b-0 last:pb-0">
                  <span className="font-semibold text-q-text">{violation.rule_name_ar}</span>
                  <span className="text-q-caption text-q-text-2">{violation.subject_label}</span>
                  <span className="text-q-caption text-q-text-3">
                    منذ {shortDate(violation.due_since.slice(0, 10))}{violation.escalation_level > 0 ? "، وصُعّد إلى المتابعين" : ""}
                  </span>
                  {violation.link && <Link href={violation.link} aria-label={`فتح: ${violation.subject_label}`} className="inline-flex min-h-11 items-center font-semibold text-q-link hover:underline">فتح</Link>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
