"use client";

import { useRef, useState } from "react";
import type { MeetingDetail } from "../model/meeting";
import { meetingRpc } from "../api/meetings-client";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { TextArea } from "@/shared/ui/text-area";

const field = "mt-1.5 h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 font-sans text-q-ui font-normal text-q-text outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary/20";
const label = "block text-q-caption font-bold text-q-text-2";

function parse(key: string) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }
function dayMonth(key: string) { return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long" }).format(parse(key)); }

/** The day the plan intended, as a sentence: a week «8 – 14 أكتوبر» or one day. */
function plannedLabel(meeting: MeetingDetail) {
  if (meeting.planned_window_start && meeting.planned_window_end) {
    const start = parse(meeting.planned_window_start); const end = parse(meeting.planned_window_end);
    return `أسبوع الدورة المخطط: ${start.getMonth() === end.getMonth() ? `${start.getDate()} – ${dayMonth(meeting.planned_window_end)}` : `${dayMonth(meeting.planned_window_start)} – ${dayMonth(meeting.planned_window_end)}`}`;
  }
  return meeting.planned_date ? `يوم الدورة المخطط: ${dayMonth(meeting.planned_date)}` : null;
}

function offPlan(meeting: MeetingDetail, date: string) {
  if (!date) return false;
  if (meeting.planned_window_start && meeting.planned_window_end) return date < meeting.planned_window_start || date > meeting.planned_window_end;
  return Boolean(meeting.planned_date) && date !== meeting.planned_date;
}

/**
 * A session's time and place, and nothing else: the quorum and the meeting type
 * belong to the council's plan or the meeting's creation. A planned meeting may
 * move off its planned day, with a reason kept on the meeting and in the audit.
 */
export function MeetingScheduleDialog({ meeting, onClose, onSaved }: { meeting: MeetingDetail; onClose: () => void; onSaved: (meeting: MeetingDetail) => void }) {
  const unconfirmed = meeting.schedule_date_confirmed === false;
  const [date, setDate] = useState(unconfirmed ? "" : meeting.scheduled_date ?? "");
  const [start, setStart] = useState(meeting.start_time?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(meeting.end_time?.slice(0, 5) ?? "");
  const [locationType, setLocationType] = useState(meeting.location_type ?? "onsite");
  const [details, setDetails] = useState(meeting.location_details ?? "");
  const [reason, setReason] = useState(meeting.schedule_exception_reason ?? "");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const sending = useRef(false);
  const planned = plannedLabel(meeting);
  const outside = offPlan(meeting, date);
  const reasonError = problem === "reason" ? "اكتب سبب الانعقاد خارج أسبوع الدورة (5 أحرف على الأقل)." : null;

  async function save() {
    if (sending.current) return;
    if (!date || !start || !end) { setProblem("حدد التاريخ ووقتي البداية والنهاية."); return; }
    if (end <= start) { setProblem("يجب أن يكون وقت النهاية بعد وقت البداية."); return; }
    if (outside && reason.trim().length < 5) { setProblem("reason"); return; }
    sending.current = true; setPending(true); setProblem(null);
    try {
      const saved = await meetingRpc<MeetingDetail>("reschedule_meeting_session_v2", {
        p_meeting_id: meeting.id, p_scheduled_date: date, p_start_time: start, p_end_time: end,
        p_location_type: locationType, p_location_details: details.trim() || null,
        p_off_plan_reason: outside ? reason.trim() : null, p_expected_updated_at: meeting.updated_at ?? null,
      });
      onSaved(saved);
    } catch (cause) {
      setProblem(cause instanceof Error && cause.message ? cause.message : "تعذر حفظ الموعد. أعد المحاولة.");
    } finally { sending.current = false; setPending(false); }
  }

  return <Dialog title="موعد الجلسة ومكانها" description="يحدد يوم انعقاد هذه الجلسة ووقتها ومكانها. النصاب ونوع الاجتماع من إعدادات المجلس." onClose={onClose} closeDisabled={pending}
    footer={<>
      {problem && problem !== "reason" && <InlineMessage tone="error" className="w-full">{problem}</InlineMessage>}
      <Button variant="secondary" disabled={pending} onClick={onClose}>إلغاء</Button>
      <Button pending={pending} pendingLabel="جارٍ حفظ الموعد…" onClick={() => void save()}>حفظ الموعد والمكان</Button>
    </>}>
    <div className="grid gap-4 font-sans">
      {planned && <p className="m-0 rounded-q-control bg-q-surface-2 px-3 py-2 text-q-caption text-q-text-2">{planned}</p>}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className={label}>تاريخ الانعقاد<input type="date" required value={date} onChange={(event) => { setDate(event.target.value); setProblem(null); }} className={field}/></label>
        <label className={label}>وقت البداية<input type="time" required value={start} onChange={(event) => { setStart(event.target.value); setProblem(null); }} className={field}/></label>
        <label className={label}>وقت النهاية<input type="time" required value={end} onChange={(event) => { setEnd(event.target.value); setProblem(null); }} className={field}/></label>
      </div>
      {outside && <div className="grid gap-3 rounded-q-control border border-q-warning bg-q-warning-soft p-3">
        <p className="m-0 text-q-ui font-bold text-q-warning">هذا اليوم خارج أسبوع الدورة المخطط. سيُحفظ مع سبب الانعقاد فيه ويظهر في تفاصيل الاجتماع.</p>
        <TextArea label="سبب الانعقاد خارج أسبوع الدورة" value={reason} onChange={(event) => { setReason(event.target.value); setProblem(null); }} maxLength={1000} rows={2} error={reasonError}/>
      </div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={label}>نوع المكان<select value={locationType} onChange={(event) => setLocationType(event.target.value)} className={field}>
          <option value="onsite">حضوري</option><option value="online">عن بُعد</option><option value="hybrid">هجين</option>
        </select></label>
        <label className={label}>تفاصيل المكان<input value={details} maxLength={300} onChange={(event) => setDetails(event.target.value)} placeholder="مثال: قاعة 102" className={field}/></label>
      </div>
    </div>
  </Dialog>;
}
