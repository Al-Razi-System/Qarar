"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { topicsRpc } from "../api/topics-client";
import { dayLabel, windowRangeLabel } from "@/features/meetings/model/meeting-schedule";
import { localDateKey } from "@/features/meetings/model/meeting-operational-state";
import { Badge } from "@/shared/ui/badge";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";

export type TopicScheduleOccurrence = {
  id: string;
  reference_number: string;
  available_from: string;
  due_on: string;
  status: "due" | "scheduled" | "completed" | "waived";
  execution_timing: "within_window" | "late" | null;
  discussed_on: string | null;
  meeting: { id: string; meeting_no: string | null; title_ar: string } | null;
  decision: { id: string; decision_no: string; decision_status: string } | null;
};

type Tone = "neutral" | "info" | "success" | "warning" | "danger";

/** The six states of a periodic obligation, in the words the council uses. */
export function occurrenceState(occurrence: Pick<TopicScheduleOccurrence, "status" | "execution_timing" | "available_from" | "due_on">, today: string): { label: string; tone: Tone } {
  if (occurrence.status === "completed") return occurrence.execution_timing === "late"
    ? { label: "مكتمل خارج الموعد", tone: "warning" }
    : { label: "مكتمل في موعده", tone: "success" };
  if (occurrence.status === "scheduled") return { label: "مدرج في جدول الأعمال", tone: "info" };
  if (occurrence.status === "waived") return { label: "مُعفى", tone: "neutral" };
  if (occurrence.available_from > today) return { label: "مستقبلي", tone: "neutral" };
  if (occurrence.due_on < today) return { label: "متأخر عن دورته", tone: "danger" };
  return { label: "مستحق", tone: "info" };
}

/**
 * A periodic topic's obligations: each period with its reference, its state,
 * and once discussed, the meeting, the day of the discussion and the decision.
 * Shown only for topics that fulfil a periodic obligation.
 */
export function TopicScheduleOccurrences({ topicId }: { topicId: string }) {
  const [items, setItems] = useState<TopicScheduleOccurrence[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    topicsRpc<TopicScheduleOccurrence[]>("get_topic_schedule_occurrences_v2", { p_topic_id: topicId })
      .then((value) => { if (live) setItems(value ?? []); })
      .catch((cause: unknown) => { if (live) setError(cause instanceof Error && cause.message ? cause.message : "تعذر تحميل الاستحقاق الدوري."); });
    return () => { live = false; };
  }, [topicId]);

  if (error) return <InlineMessage tone="error">{error}</InlineMessage>;
  if (!items?.length) return null;
  const today = localDateKey();
  return <Card className="space-y-3">
    <h3 className="m-0 flex items-center gap-2 text-q-h3 font-bold text-q-text"><CalendarClock size={18} aria-hidden="true"/>الاستحقاق الدوري</h3>
    <ul className="m-0 grid list-none gap-3 p-0">{items.map((item) => {
      const state = occurrenceState(item, today);
      return <li key={item.id} className="rounded-q-control border border-q-border bg-q-surface p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-q-ui font-bold text-q-text"><bdi>{item.reference_number}</bdi> · {item.available_from === item.due_on ? dayLabel(item.due_on) : windowRangeLabel(item.available_from, item.due_on)}</span>
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
        {(item.meeting || item.discussed_on || item.decision) && <dl className="m-0 mt-2 grid gap-1 text-q-caption text-q-text-2 sm:grid-cols-3">
          {item.meeting && <div><dt className="font-bold">الاجتماع</dt><dd className="m-0"><Link href={`/admin/meetings/${item.meeting.id}`} className="text-q-link underline">{item.meeting.title_ar}</Link></dd></div>}
          {item.discussed_on && <div><dt className="font-bold">تاريخ المناقشة</dt><dd className="m-0">{dayLabel(item.discussed_on)}</dd></div>}
          <div><dt className="font-bold">القرار</dt><dd className="m-0">{item.decision ? <bdi>{item.decision.decision_no}</bdi> : item.status === "completed" ? "يصدر مع اعتماد المحضر" : "لم يصدر بعد"}</dd></div>
        </dl>}
      </li>;
    })}</ul>
  </Card>;
}
