"use client";

import { useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { MetricStrip } from "@/shared/ui/metric-strip";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { peopleMetrics, percent, personReasons, personStateLabel, personStateTone, type PeopleFollowUp, type PersonState } from "../model/performance";

type StateFilter = "all" | PersonState;
const cell = "px-3 py-3.5 align-top";
const head = "px-3 py-2.5 text-start font-semibold";
const of = (part: number, whole: number) => (whole > 0 ? `${part} من ${whole}` : "—");

/** Every member of the councils I lead or follow: do they attend, vote, sign and deliver? */
export function PeopleFollowUpView({ data, initialCouncilId = "" }: { data: PeopleFollowUp; initialCouncilId?: string }) {
  const [state, setState] = useState<StateFilter>("all");
  const [councilId, setCouncilId] = useState(initialCouncilId);
  const { summary } = data;

  if (summary.total === 0) {
    return <p className="rounded-q-card border border-q-border bg-q-surface p-6 text-q-ui text-q-text-2">لا أعضاء في المجالس التي تقودها أو تتابعها.</p>;
  }

  const rows = data.people.filter((person) => (state === "all" || person.state === state) && (!councilId || person.councils.some((council) => council.id === councilId)));

  return (
    <div className="flex flex-col gap-6">
      <MetricStrip label="مؤشرات الأعضاء" metrics={peopleMetrics(data)} />
      <section aria-label="الأعضاء" className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
        <div className="flex flex-wrap items-end justify-between gap-3 p-4">
          <SegmentedControl label="تصفية حسب الحالة" value={state} onChange={setState} className="flex-wrap"
            options={[{ value: "all", label: `الكل ${summary.total}` }, { value: "attention", label: `يحتاجون متابعة ${summary.attention}` },
              { value: "regular", label: `منتظمون ${summary.regular}` }, { value: "no_activity", label: `بلا نشاط ${summary.no_activity}` }]} />
          <label className="flex flex-col gap-1 text-q-caption text-q-text-2">
            المجلس
            <select value={councilId} onChange={(event) => setCouncilId(event.target.value)} className="h-11 min-w-56 rounded-q-control border border-q-border-strong bg-q-surface px-3 font-sans text-q-ui text-q-text">
              <option value="">كل المجالس</option>
              {data.councils.map((council) => <option key={council.id} value={council.id}>{council.name_ar}</option>)}
            </select>
          </label>
        </div>
        {rows.length === 0 ? <p className="m-0 border-t border-q-border p-6 text-q-ui text-q-text-2">لا أعضاء بهذه التصفية.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-q-ui">
              <thead>
                <tr className="bg-q-surface-2 text-q-text">
                  <th scope="col" className={`${head} ps-6`}>العضو</th><th scope="col" className={head}>الحضور</th><th scope="col" className={head}>التصويت</th>
                  <th scope="col" className={head}>توقيع المحاضر</th><th scope="col" className={head}>التكليفات</th><th scope="col" className={head}>موضوعات قدّمها</th><th scope="col" className={`${head} pe-6`}>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((person) => {
                  const reasons = personReasons(person);
                  const [first, ...rest] = person.councils;
                  return (
                    <tr key={person.user_id} className="border-t border-q-border">
                      <td className={`${cell} max-w-xs ps-6`}>
                        <span className="font-semibold text-q-text">{person.full_name_ar}</span>
                        <div className="text-q-caption text-q-text-3">{first.role_name_ar}، {first.name_ar}{rest.length > 0 ? `، و${rest.length === 1 ? "مجلس آخر" : `${rest.length} مجالس أخرى`}` : ""}</div>
                      </td>
                      <td className={cell}>{percent(person.attendance.present, person.attendance.recorded)}<div className="text-q-caption text-q-text-3">{of(person.attendance.present, person.attendance.recorded)}</div></td>
                      <td className={cell}>{of(person.votes.voted, person.votes.eligible)}</td>
                      <td className={cell}>{of(person.minutes.signed, person.minutes.total)}{person.minutes.pending > 0 && <div className="text-q-caption font-semibold text-q-accent-text">{person.minutes.pending} بانتظاره</div>}</td>
                      <td className={cell}>{of(person.tasks.done, person.tasks.total)}{person.tasks.overdue > 0 && <div className="text-q-caption font-semibold text-q-accent-text">{person.tasks.overdue} متأخرة</div>}</td>
                      <td className={cell}>{person.topics_submitted > 0 ? person.topics_submitted : "—"}</td>
                      <td className={`${cell} pe-6`}>
                        <Badge tone={personStateTone[person.state]}>{personStateLabel[person.state]}</Badge>
                        {reasons.length > 0 && <div className="mt-1 text-q-caption text-q-text-2">{reasons.join("، ")}</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
