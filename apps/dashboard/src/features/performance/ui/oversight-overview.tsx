"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { RhythmLegend, SessionRhythm } from "@/shared/ui/session-rhythm";
import { ExportButton } from "./export-button";
import { overviewCsv, compactRhythm, days, percent, rhythmSentence, stateLabel, stateTone, type CouncilState, type Overview } from "../model/performance";

type Filter = "all" | CouncilState;
const cell = "px-3 py-3.5 align-top";
const head = "px-3 py-2.5 text-start font-semibold";

/** Every council I lead or follow, one row each, the ones needing attention first. */
export function OversightOverview({ data }: { data: Overview }) {
  const [filter, setFilter] = useState<Filter>("all");
  const { summary } = data;
  const options: Array<{ value: Filter; label: string }> = [
    { value: "all", label: `الكل ${summary.total}` },
    { value: "stalled", label: `متعثرة ${summary.stalled}` },
    { value: "attention", label: `تحتاج متابعة ${summary.attention}` },
    { value: "regular", label: `منتظمة ${summary.regular}` },
    ...(summary.inactive > 0 ? [{ value: "inactive" as const, label: `غير مفعّلة ${summary.inactive}` }] : []),
  ];
  const rows = filter === "all" ? data.councils : data.councils.filter((council) => council.state === filter);

  if (summary.total === 0) {
    return <p className="rounded-q-card border border-q-border bg-q-surface p-6 text-q-ui text-q-text-2">لا تقود ولا تتابع أي مجلس حاليًا. تُسند المتابعة من صفحة «إسناد المتابعة» لدى مسؤول الحوكمة.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="تصفية المجالس حسب الحالة" options={options} value={filter} onChange={setFilter} className="flex-wrap" />
        <div className="flex flex-wrap items-center gap-4"><RhythmLegend /><ExportButton filename={`متابعة-المجالس-${data.academic_year_start}`} rows={() => overviewCsv(rows)} /></div>
      </div>
      <section aria-label="المجالس" className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-collapse text-q-ui">
            <thead>
              <tr className="bg-q-surface-2 text-q-text">
                <th scope="col" className={`${head} ps-6`}>المجلس</th>
                <th scope="col" className={head}>إيقاع الانعقاد</th>
                <th scope="col" className={head}>الحضور</th>
                <th scope="col" className={head}>اعتماد المحضر</th>
                <th scope="col" className={head}>القرارات</th>
                <th scope="col" className={head}>الموضوعات</th>
                <th scope="col" className={head}>التكليفات</th>
                <th scope="col" className={`${head} pe-6`}>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((council) => {
                const sentence = rhythmSentence(council.sessions, council.marks);
                return (
                  <tr key={council.id} className="border-t border-q-border">
                    <td className={`${cell} ps-6`}>
                      <Link href={`/admin/performance/${council.id}`} className="inline-flex min-h-11 items-center font-semibold text-q-link hover:underline">{council.name_ar}</Link>
                      {council.parent_name_ar && <div className="text-q-caption text-q-text-3">{council.parent_name_ar}</div>}
                    </td>
                    <td className={cell}>
                      {council.marks.length > 0 && <SessionRhythm sessions={compactRhythm(council)} summary={`إيقاع الانعقاد: ${sentence}`} className="mb-1" />}
                      <div className="text-q-caption text-q-text-3">{sentence}</div>
                    </td>
                    <td className={cell}>{percent(council.attendance.present, council.attendance.recorded)}</td>
                    <td className={cell}>
                      {council.minutes.avg_days == null ? "—" : days(Math.round(council.minutes.avg_days))}
                      {council.minutes.pending > 0 && <div className="text-q-caption text-q-accent-text">{council.minutes.pending} بانتظار الاعتماد</div>}
                    </td>
                    <td className={cell}>
                      {council.decision_stats.total > 0 ? council.decision_stats.total : "—"}
                      {council.decision_stats.needs_execution > 0 && <div className="text-q-caption text-q-text-3">نُفّذ {council.decision_stats.executed} من {council.decision_stats.needs_execution}</div>}
                    </td>
                    <td className={cell}>
                      {council.topics.total > 0 ? council.topics.total : "—"}
                      {council.topics.ungoverned > 0 && <Link href={`/admin/performance/topics?council=${council.id}&governance=ungoverned`} className="block text-q-caption font-semibold text-q-accent-text hover:underline">{council.topics.ungoverned} غير محوكمة</Link>}
                    </td>
                    <td className={cell}>
                      {council.tasks.total > 0 ? `${council.tasks.done} من ${council.tasks.total}` : "—"}
                      {council.tasks.overdue > 0 && <div className="text-q-caption text-q-accent-text">{council.tasks.overdue} متأخرة</div>}
                    </td>
                    <td className={`${cell} pe-6`}><Badge tone={stateTone[council.state]}>{stateLabel[council.state]}</Badge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <p className="border-t border-q-border p-6 text-q-ui text-q-text-2">لا مجالس بهذه الحالة.</p>}
      </section>
    </div>
  );
}
