"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/shared/ui/badge";
import { MetricStrip } from "@/shared/ui/metric-strip";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { StepTrack } from "@/shared/ui/step-track";
import { days, governanceLabel, isGoverned, outcomeLabel, topicStateLabel, topicStateTone, topicsMetrics, type TopicState, type TopicsFollowUp } from "../model/performance";

type StateFilter = "all" | TopicState;
type GovernanceFilter = "all" | "governed" | "ungoverned";
export type TopicsFilter = { state: StateFilter; governance: GovernanceFilter; councilId: string };

const cell = "px-3 py-3.5 align-top";
const head = "px-3 py-2.5 text-start font-semibold";
const panel = "rounded-q-card border border-q-border bg-q-surface";

/** Where every topic stands, how long it has waited there, and what became of it. */
export function TopicsFollowUpView({ data, initial }: { data: TopicsFollowUp; initial?: Partial<TopicsFilter> }) {
  const [filter, setFilter] = useState<TopicsFilter>({ state: "all", governance: "all", councilId: "", ...initial });
  const { summary } = data;

  if (summary.total === 0) {
    return <p className={`${panel} p-6 text-q-ui text-q-text-2`}>لا موضوعات في المجالس التي تقودها أو تتابعها.</p>;
  }

  const rows = data.topics.filter((topic) =>
    (filter.state === "all" || topic.state === filter.state) &&
    (filter.governance === "all" || isGoverned(topic.governance_source) === (filter.governance === "governed")) &&
    (!filter.councilId || topic.at_council_id === filter.councilId));
  const picked = data.by_council.find((council) => council.id === filter.councilId);
  const longest = Math.max(1, ...data.by_council.map((council) => council.longest_wait));

  return (
    <div className="flex flex-col gap-6">
      <MetricStrip label="مؤشرات الموضوعات" metrics={topicsMetrics(data)} />

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section aria-labelledby="standing-title" className={`${panel} flex flex-col gap-3 p-5`}>
          <h2 id="standing-title" className="m-0 text-q-h3 font-semibold text-q-text">أين تقف الموضوعات الآن</h2>
          {data.by_council.length === 0 ? <p className="m-0 text-q-ui text-q-text-2">لا موضوعات قيد المعالجة.</p> : (
            <ul className="m-0 flex list-none flex-col p-0">
              {data.by_council.map((council) => (
                <li key={council.id} className="border-b border-q-border py-1 last:border-b-0">
                  <button type="button" aria-pressed={filter.councilId === council.id} onClick={() => setFilter({ ...filter, councilId: filter.councilId === council.id ? "" : council.id })}
                    className={`flex min-h-11 w-full cursor-pointer flex-col gap-1 rounded-q-control border-0 px-2 py-2 text-start font-sans hover:bg-q-bg ${filter.councilId === council.id ? "bg-q-surface-2" : "bg-transparent"}`}>
                    <span className="flex w-full flex-wrap items-baseline justify-between gap-2 text-q-ui">
                      <span className="font-semibold text-q-link">{council.name_ar}</span>
                      <span className="text-q-text-2">{council.open} {council.stalled > 0 && <span className="font-semibold text-q-accent-text">، {council.stalled} متوقف</span>}</span>
                    </span>
                    <span aria-hidden="true" className="block h-1.5 w-full rounded-full bg-q-surface-2">
                      <span className={`block h-full rounded-full ${council.stalled > 0 ? "bg-q-accent" : "bg-q-primary"}`} style={{ width: `${Math.max(4, (council.longest_wait / longest) * 100)}%` }} />
                    </span>
                    <span className="text-q-caption text-q-text-3">أطول انتظار: {days(council.longest_wait)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="categories-title" className={`${panel} overflow-hidden`}>
          <h2 id="categories-title" className="m-0 px-5 py-4 text-q-h3 font-semibold text-q-text">حسب التصنيف</h2>
          <table className="w-full border-collapse text-q-ui">
            <thead><tr className="bg-q-surface-2 text-q-text"><th scope="col" className={`${head} ps-5`}>التصنيف</th><th scope="col" className={head}>العدد</th><th scope="col" className={head}>حُسم</th><th scope="col" className={`${head} pe-5`}>متوسط الحسم</th></tr></thead>
            <tbody>
              {data.by_category.map((category) => (
                <tr key={category.name_ar} className="border-t border-q-border">
                  <td className={`${cell} ps-5`}>{category.name_ar}</td><td className={cell}>{category.total}</td><td className={cell}>{category.finished}</td>
                  <td className={`${cell} pe-5`}>{category.avg_days_to_finish == null ? "—" : days(Math.round(category.avg_days_to_finish))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section aria-label="الموضوعات" className={`${panel} overflow-hidden`}>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <SegmentedControl label="تصفية حسب الحالة" value={filter.state} onChange={(state) => setFilter({ ...filter, state })} className="flex-wrap"
            options={[{ value: "all", label: `الكل ${summary.total}` }, { value: "stalled", label: `متوقفة ${summary.stalled}` }, { value: "returned", label: `مُعادة ${summary.returned}` },
              { value: "in_progress", label: `قيد المعالجة ${summary.in_progress}` }, { value: "finished", label: `محسومة ${summary.finished}` }]} />
          <SegmentedControl label="تصفية حسب الحوكمة" value={filter.governance} onChange={(governance) => setFilter({ ...filter, governance })}
            options={[{ value: "all", label: "الكل" }, { value: "governed", label: "محوكمة" }, { value: "ungoverned", label: "غير محوكمة" }]} />
        </div>
        {picked && (
          <div className="flex flex-wrap items-center gap-3 border-t border-q-border bg-q-bg px-6 py-2 text-q-ui text-q-text-2">
            <span>تعرض ما يقف عند: <span className="font-semibold text-q-text">{picked.name_ar}</span></span>
            <button type="button" onClick={() => setFilter({ ...filter, councilId: "" })} className="min-h-11 cursor-pointer border-0 bg-transparent font-sans text-q-ui font-semibold text-q-link hover:underline">عرض كل المجالس</button>
          </div>
        )}
        {rows.length === 0 ? <p className="m-0 border-t border-q-border p-6 text-q-ui text-q-text-2">لا موضوعات بهذه التصفية.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-q-ui">
              <thead>
                <tr className="bg-q-surface-2 text-q-text">
                  <th scope="col" className={`${head} ps-6`}>الموضوع</th><th scope="col" className={head}>الحوكمة</th><th scope="col" className={head}>أين يقف الآن</th>
                  <th scope="col" className={head}>المسار</th><th scope="col" className={head}>العمر</th><th scope="col" className={head}>ما تقرر</th><th scope="col" className={`${head} pe-6`}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((topic) => (
                  <tr key={topic.id} className="border-t border-q-border">
                    <td className={`${cell} max-w-sm ps-6`}>
                      <Link href={topic.link} className="font-semibold text-q-link hover:underline">{topic.title_ar}</Link>
                      <div className="text-q-caption text-q-text-3">{[topic.topic_no, topic.category_name_ar].filter(Boolean).join("، ")}</div>
                    </td>
                    <td className={cell}><Badge tone={isGoverned(topic.governance_source) ? "info" : "warning"}>{governanceLabel(topic.governance_source)}</Badge></td>
                    <td className={cell}>
                      {topic.at_council_name_ar ?? "—"}
                      {topic.waiting_days != null && <div className={`text-q-caption ${topic.state === "stalled" ? "font-semibold text-q-accent-text" : "text-q-text-3"}`}>منذ {days(topic.waiting_days)}</div>}
                    </td>
                    <td className={cell}>
                      {topic.steps_total > 0 ? <>
                        <StepTrack total={topic.steps_total} done={topic.steps_done} held={topic.state === "stalled"} label={`أُنجزت ${topic.steps_done} من ${topic.steps_total} مراحل`} className="mb-1" />
                        <span className="text-q-caption text-q-text-3">{topic.steps_done} من {topic.steps_total}</span>
                      </> : <span className="text-q-caption text-q-text-3">بلا مسار</span>}
                    </td>
                    <td className={cell}>{days(topic.age_days)}{topic.listed_count > 0 && <div className="text-q-caption text-q-text-3">أُدرج {topic.listed_count === 1 ? "مرة" : `${topic.listed_count} مرات`}</div>}</td>
                    <td className={cell}>
                      {topic.decision_no ? <>{outcomeLabel(topic.outcome_kind)}<div className="text-q-caption text-q-text-3">{topic.tasks > 0 ? `نُفّذ ${topic.tasks_done} من ${topic.tasks}` : topic.decision_no}</div></> : "لم يصدر قرار"}
                    </td>
                    <td className={`${cell} pe-6`}><Badge tone={topicStateTone[topic.state]}>{topicStateLabel[topic.state]}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
