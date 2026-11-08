"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarPlus, ExternalLink, Settings2 } from "lucide-react";
import { meetingRpc } from "@/features/meetings/api/meetings-client";
import { meetingStatusLabels, meetingStatusTone } from "@/features/meetings/model/meeting";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";
import type { CouncilDetail } from "../model/types";

type CouncilMeeting = {
  id: string; meeting_no?: string | null; title_ar: string; status: string;
  scheduled_date?: string | null; planned_window_start?: string | null; planned_window_end?: string | null;
  schedule_date_confirmed?: boolean; start_time?: string | null; end_time?: string | null; session_sequence_no?: number | null;
};

const recurrenceLabels: Record<string, string> = { weekly: "أسبوعية", monthly: "شهرية", quarterly: "ربع سنوية", semiannual: "نصف سنوية", yearly: "سنوية" };
const dayFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" });
const parse = (value: string) => new Date(`${value}T00:00:00`);

function whenOf(meeting: CouncilMeeting) {
  if (meeting.schedule_date_confirmed === false && meeting.planned_window_start && meeting.planned_window_end) {
    return `خلال ${shortFormat.format(parse(meeting.planned_window_start))} – ${shortFormat.format(parse(meeting.planned_window_end))}`;
  }
  const day = meeting.scheduled_date ?? meeting.planned_window_start;
  const time = meeting.start_time ? ` · ${meeting.start_time.slice(0, 5)}` : "";
  return day ? `${dayFormat.format(parse(day))}${time}` : "موعد غير محدد";
}
const sortKey = (meeting: CouncilMeeting) => meeting.scheduled_date ?? meeting.planned_window_start ?? "9999-12-31";
const FINISHED = ["closed", "archived", "cancelled", "not_held", "postponed"];

/** The council's meetings and the settings of its plan, so the council can be run from one place. */
export function CouncilMeetingsPanel({ council, detail, archived, onEditPlan }: { council: { id: string; status: string }; detail: CouncilDetail | null; archived: boolean; onEditPlan: () => void }) {
  const [meetings, setMeetings] = useState<CouncilMeeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFinished, setShowFinished] = useState(false);
  const plan = detail?.meeting_plan ?? null;

  const request = { p_query: null, p_stage: null, p_unit_id: council.id, p_from_date: null, p_to_date: null, p_limit: 100, p_offset: 0 };
  const failure = (cause: unknown) => cause instanceof Error ? cause.message : "تعذر تحميل اجتماعات المجلس.";
  const load = useCallback(() => {
    setError(null);
    meetingRpc<{ items: CouncilMeeting[] }>("search_meetings_v2", { p_query: null, p_stage: null, p_unit_id: council.id, p_from_date: null, p_to_date: null, p_limit: 100, p_offset: 0 })
      .then((result) => setMeetings(result.items ?? []))
      .catch((cause) => { setMeetings(null); setError(failure(cause)); });
  }, [council.id]);
  useEffect(() => {
    let live = true;
    meetingRpc<{ items: CouncilMeeting[] }>("search_meetings_v2", request)
      .then((result) => { if (live) setMeetings(result.items ?? []); })
      .catch((cause) => { if (live) { setMeetings(null); setError(failure(cause)); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the request depends only on the council
  }, [council.id]);

  const current = (meetings ?? []).filter((meeting) => !FINISHED.includes(meeting.status)).sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const finished = (meetings ?? []).filter((meeting) => FINISHED.includes(meeting.status)).sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  const shownCurrent = current.slice(0, 6);

  return <div className="grid gap-4 bg-[#f8fbfe] p-5">
    <section aria-label="خطة الاجتماعات" className="rounded-2xl border border-[#dce7f1] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 flex items-center gap-2 text-sm font-black text-[#1b314b]"><Settings2 size={16} aria-hidden="true" />خطة الاجتماعات</h3>
        {!archived && (plan || detail?.can_create_meeting_plan) && <Button variant="secondary" onClick={onEditPlan}>{plan ? "تعديل الخطة" : "إنشاء خطة اجتماعات"}</Button>}
      </div>
      {plan ? <dl className="m-0 mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="الدورية" value={`${recurrenceLabels[plan.recurrence] ?? plan.recurrence}${plan.monthly_week ? ` · الأسبوع ${plan.monthly_week}` : ""}`} />
        <Fact label="أول اجتماع" value={dayFormat.format(parse(plan.first_meeting_date))} />
        <Fact label="النصاب" value={plan.quorum_percentage != null ? `${plan.quorum_percentage}٪` : "—"} />
        <Fact label="نهاية الخطة" value={plan.ends_on ? dayFormat.format(parse(plan.ends_on)) : "مستمرة"} />
      </dl> : <InlineMessage tone="warning" className="mt-3">لا توجد خطة اجتماعات لهذا المجلس، ولذلك لا تظهر له اجتماعات في قائمة الاجتماعات.{detail?.can_create_meeting_plan ? " أنشئ الخطة ليولّد النظام اجتماعاته." : ""}</InlineMessage>}
    </section>

    <section aria-label="اجتماعات المجلس" className="rounded-2xl border border-[#dce7f1] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="m-0 flex items-center gap-2 text-sm font-black text-[#1b314b]"><CalendarClock size={16} aria-hidden="true" />الاجتماعات {meetings ? `(${meetings.length})` : ""}</h3>
        <Link href={`/admin/meetings?council=${encodeURIComponent(council.id)}`} className="inline-flex items-center gap-1 text-xs font-bold text-[#0872df]"><ExternalLink size={13} aria-hidden="true" />فتحها في صفحة الاجتماعات</Link>
      </div>
      {error && <InlineMessage tone="error" className="mt-3">{error}<Button variant="secondary" onClick={load}>إعادة المحاولة</Button></InlineMessage>}
      {!error && meetings === null && <p role="status" className="m-0 mt-3 text-xs text-[#7c8da0]">جارٍ تحميل الاجتماعات…</p>}
      {meetings && meetings.length === 0 && <p className="m-0 mt-3 flex items-center gap-2 text-xs text-[#7c8da0]"><CalendarPlus size={15} aria-hidden="true" />لا اجتماعات لهذا المجلس بعد.</p>}
      {shownCurrent.length > 0 && <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">{shownCurrent.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} />)}</ul>}
      {current.length > shownCurrent.length && <p className="m-0 mt-2 text-xs text-[#7c8da0]">و{current.length - shownCurrent.length} اجتماعات قادمة أخرى في صفحة الاجتماعات.</p>}
      {finished.length > 0 && <div className="mt-4">
        <Button variant="ghost" onClick={() => setShowFinished(!showFinished)} aria-expanded={showFinished}>{showFinished ? "إخفاء" : "عرض"} الاجتماعات المنتهية ({finished.length})</Button>
        {showFinished && <ul className="m-0 mt-2 flex list-none flex-col gap-2 p-0">{finished.slice(0, 12).map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} />)}</ul>}
      </div>}
    </section>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-[#f4f8fc] p-3"><dt className="text-[11px] text-[#7c8da0]">{label}</dt><dd className="m-0 mt-1 text-xs font-bold text-[#1b314b]">{value}</dd></div>;
}

function MeetingRow({ meeting }: { meeting: CouncilMeeting }) {
  return <li><Link href={`/admin/meetings/${meeting.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5edf4] px-3 py-2.5 hover:border-[#b8d1e9] hover:bg-[#f5f9fd]">
    <span className="min-w-0"><strong className="block text-xs text-[#172a42]">{meeting.title_ar}</strong><span className="text-[11px] text-[#7c8da0]">{whenOf(meeting)}{meeting.meeting_no ? ` · ${meeting.meeting_no}` : ""}</span></span>
    <Badge tone={meetingStatusTone[meeting.status] ?? "neutral"}>{meetingStatusLabels[meeting.status] ?? "اجتماع"}</Badge>
  </Link></li>;
}
