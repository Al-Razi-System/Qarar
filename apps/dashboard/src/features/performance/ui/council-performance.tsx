"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { MetricStrip } from "@/shared/ui/metric-strip";
import { RhythmLegend, SessionRhythm } from "@/shared/ui/session-rhythm";
import { ShareBar } from "@/shared/ui/share-bar";
import { councilMetrics, decisionShares, executorsText, fullRhythm, rhythmSentence, shortDate, stateLabel, stateTone, topicShares, type Activity, type CouncilPerformance } from "../model/performance";
import { CouncilExplorer, initialView, type ExplorerView } from "./council-explorer";

const panel = "rounded-q-card border border-q-border bg-q-surface";
const figure = "cursor-pointer border-0 bg-transparent p-0 text-start font-sans text-q-ui font-semibold text-q-link hover:underline";

/** One council in full: its rhythm, indicators against target, decisions and topics, and everything behind the figures. */
export function CouncilPerformanceView({ data, activity = null }: { data: CouncilPerformance; activity?: Activity | null }) {
  const { council, sessions, violations } = data;
  const { decision_stats: decisions, topics } = council;
  const sentence = rhythmSentence(council.sessions, council.marks);
  const [view, setView] = useState<ExplorerView>(initialView);
  // A figure opens the list behind it, and the list is brought into view.
  const open = (next: Partial<ExplorerView>) => {
    setView({ ...view, meetingId: null, ...next });
    document.getElementById("council-explorer")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-q-ui text-q-text-2">
        <Badge tone={stateTone[council.state]}>{stateLabel[council.state]}</Badge>
        {council.chair_name_ar && <span>يرأسه {council.chair_name_ar}</span>}
        <Link href={`/admin/performance/people?council=${council.id}`} className="font-semibold text-q-link hover:underline">عدد الأعضاء: {council.member_count}</Link>
      </div>

      <section aria-labelledby="rhythm-title" className={`${panel} flex flex-col gap-4 p-5`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="rhythm-title" className="m-0 text-q-h3 font-semibold text-q-text">إيقاع الانعقاد</h2>
          <p className="m-0 text-q-ui text-q-text-2">{sentence}</p>
        </div>
        {sessions.length > 0
          ? <SessionRhythm variant="full" sessions={fullRhythm(sessions)} summary={`إيقاع الانعقاد: ${sentence}`} selectedKey={view.meetingId}
              onSelect={(key) => open({ tab: view.tab, meetingId: view.meetingId === key ? null : key })} />
          : <p className="m-0 text-q-ui text-q-text-2">لا جلسات مسجلة لهذا المجلس في هذا العام الجامعي.</p>}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <RhythmLegend />
          {sessions.length > 0 && <span className="text-q-caption text-q-text-3">اختر جلسة لترى موضوعاتها وقراراتها وتكليفاتها.</span>}
        </div>
      </section>

      <MetricStrip label="مؤشرات المجلس" metrics={councilMetrics(council)} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="decisions-title" className={`${panel} flex flex-col gap-4 p-5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="decisions-title" className="m-0 text-q-h3 font-semibold text-q-text">القرارات الصادرة</h2>
            <span className="text-q-h2 font-semibold text-q-text">{decisions.total}</span>
          </div>
          {decisions.total === 0 ? <p className="m-0 text-q-ui text-q-text-2">لم يصدر المجلس قرارًا في هذا العام الجامعي.</p> : <>
            <ShareBar label="القرارات حسب نتيجتها" shares={decisionShares(decisions)} />
            {decisions.by_type.length > 0 && (
              <p className="m-0 text-q-ui text-q-text-2">
                حسب النوع: {decisions.by_type.map((type) => `${type.name_ar} ${type.count}`).join("، ")}{decisions.untyped > 0 ? `، بلا نوع ${decisions.untyped}` : ""}.
              </p>
            )}
            <dl className="m-0 grid gap-x-6 gap-y-3 border-t border-q-border pt-4 sm:grid-cols-3">
              <div><dt className="text-q-caption text-q-text-3">تحتاج تنفيذًا</dt><dd className="m-0"><button type="button" className={figure} onClick={() => open({ tab: "decisions" })}>{decisions.needs_execution} من {decisions.total}</button></dd></div>
              <div>
                <dt className="text-q-caption text-q-text-3">نُفّذت كاملة</dt>
                <dd className="m-0"><button type="button" className={figure} onClick={() => open({ tab: "tasks", tasks: "done" })}>{decisions.executed} من {decisions.needs_execution}</button></dd>
                {decisions.overdue_execution > 0 && <dd className="m-0"><button type="button" className={`${figure} text-q-caption text-q-accent-text`} onClick={() => open({ tab: "tasks", tasks: "overdue" })}>{decisions.overdue_execution} تأخر تنفيذها</button></dd>}
              </div>
              <div><dt className="text-q-caption text-q-text-3">المنفّذون</dt><dd className="m-0"><button type="button" className={figure} onClick={() => open({ tab: "tasks", tasks: "all" })}>{executorsText(decisions.executors)}</button></dd></div>
            </dl>
          </>}
        </section>

        <section aria-labelledby="topics-title" className={`${panel} flex flex-col gap-4 p-5`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="topics-title" className="m-0 text-q-h3 font-semibold text-q-text">الموضوعات في جدول المجلس</h2>
            <span className="text-q-h2 font-semibold text-q-text">{topics.total}</span>
          </div>
          {topics.total === 0 ? <p className="m-0 text-q-ui text-q-text-2">لم يُدرج موضوع في جلسات هذا العام الجامعي.</p> : <>
            <ShareBar label="الموضوعات حسب مصدر حوكمتها" shares={topicShares(topics)} />
            <dl className="m-0 grid gap-x-6 gap-y-3 border-t border-q-border pt-4 sm:grid-cols-2">
              <div><dt className="text-q-caption text-q-text-3">غير محوكمة</dt><dd className="m-0"><button type="button" className={`${figure} ${topics.ungoverned > 0 ? "text-q-accent-text" : ""}`} onClick={() => open({ tab: "topics", topics: "ungoverned" })}>{topics.ungoverned} من {topics.total}</button></dd></div>
              <div><dt className="text-q-caption text-q-text-3">نوقشت</dt><dd className="m-0"><button type="button" className={figure} onClick={() => open({ tab: "topics", topics: "all" })}>{topics.discussed} من {topics.total}</button></dd></div>
            </dl>
          </>}
        </section>
      </div>

      <div id="council-explorer" className="grid scroll-mt-20 items-start gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,1.1fr)]">
        <CouncilExplorer sessions={sessions} activity={activity} view={view} onChange={setView} />

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
