"use client";

import { useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ChevronLeft, Clock, FileText, ListChecks, MapPin, Play, RefreshCw, Users } from "lucide-react";
import { meetingRpc } from "../api/meetings-client";
import { meetingJourney, type MeetingJourneyKey } from "../model/meeting-journey";
import { meetingStatusLabels, type MeetingDetail, type MeetingReadiness, type MeetingStartTiming } from "../model/meeting";
import { meetingLocationLabel, meetingScheduleLabel } from "../model/meeting-schedule";
import { InvitationStatus, InvitationTimingDialog } from "./invitation-timing-dialog";
import { MeetingStartConfirmationDialog } from "./meeting-start-confirmation-dialog";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { JourneyRail } from "@/shared/ui/journey-rail";

export function MeetingDetailsJourney({ meetingId }: { meetingId: string }) {
  const router = useRouter();
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [readiness, setReadiness] = useState<MeetingReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationOpen, setInvitationOpen] = useState(false);
  const [startTiming, setStartTiming] = useState<MeetingStartTiming | null>(null);
  const [selectedStageKey, setSelectedStageKey] = useState<MeetingJourneyKey | null>(null);

  async function load() {
    setLoading(true); setError(null);
    try {
      const detail = await meetingRpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId }, { timeoutMs: 12_000 });
      setMeeting(detail);
      setSelectedStageKey(meetingJourney(detail.status).find((step) => step.state === "current")?.key ?? "setup");
      if (["draft", "scheduled", "ready_to_start"].includes(detail.status)) {
        try { setReadiness(await meetingRpc<MeetingReadiness>("get_meeting_readiness", { p_meeting_id: meetingId }, { timeoutMs: 12_000 })); }
        catch (cause) { setReadiness(null); setError(cause instanceof Error ? `تعذر فحص جاهزية الاجتماع: ${cause.message}` : "تعذر فحص جاهزية الاجتماع."); }
      } else setReadiness(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تحميل تفاصيل الاجتماع."); }
    finally { setLoading(false); }
  }

  const loadMeeting = useEffectEvent(load);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadMeeting(), 0);
    return () => window.clearTimeout(timer);
  }, [meetingId]);

  async function transition(toStatus: string) {
    if (!meeting) return;
    setBusy(true); setError(null);
    try {
      await meetingRpc("transition_meeting", { p_meeting_id: meeting.id, p_to_status: toStatus, p_reason: null, p_expected_updated_at: meeting.updated_at ?? null });
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ الخطوة التالية."); }
    finally { setBusy(false); }
  }

  async function startSession(confirmedOffSchedule: boolean) {
    if (!meeting) return;
    setBusy(true); setError(null);
    try {
      if (!confirmedOffSchedule) {
        const timing = await meetingRpc<MeetingStartTiming>("get_meeting_session_start_timing_v2", { p_meeting_id: meeting.id });
        if (timing.requires_confirmation) { setStartTiming(timing); return; }
      }
      await meetingRpc("open_meeting_session", { p_meeting_id: meeting.id, p_expected_updated_at: meeting.updated_at, p_confirmed_off_schedule: confirmedOffSchedule });
      router.push(`/admin/meetings/${meeting.id}/live`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر فتح الجلسة."); }
    finally { setBusy(false); }
  }

  // Only the first load replaces the page. A refresh after an action keeps the
  // page and any open dialog, so a confirmation stays on screen and an action
  // cannot be repeated by mistake.
  if (loading && !meeting) return <Card aria-busy="true" className="grid min-h-72 place-items-center"><p className="text-q-ui text-q-text-2">جارٍ تحميل رحلة الاجتماع…</p></Card>;
  if (!meeting) return <Card><InlineMessage tone="error">{error ?? "تعذر تحميل تفاصيل الاجتماع."}</InlineMessage><Button className="mt-4" variant="secondary" onClick={() => void load()}><RefreshCw size={17}/>إعادة المحاولة</Button></Card>;

  const journey = meetingJourney(meeting.status);
  const current = journey.find((step) => step.state === "current")!;
  const selectedIndex = Math.max(0, journey.findIndex((step) => step.key === selectedStageKey));
  const selected = journey[selectedIndex] ?? current;
  const viewingCurrent = selected.key === current.key;
  const unmet = readiness?.checks.filter((check) => !check.complete) ?? [];
  const ready = readiness?.ready !== false;
  const invitationPrepared = meeting.invitation_summary?.prepared === true;
  const hasSecondaryActions = Boolean(
    meeting.capabilities?.can_manage
      || meeting.capabilities?.can_cancel
      || meeting.capabilities?.can_archive
      || (meeting.status === "scheduled" && meeting.capabilities?.can_prepare_session),
  );

  const primary = (() => {
    if (meeting.status === "draft") return <Link href={`/admin/meetings?manage=${meeting.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-q-control bg-q-primary px-5 text-q-ui font-bold text-q-on-primary"><ListChecks size={18}/>استكمال الإعداد وجدول الأعمال</Link>;
    if (meeting.status === "scheduled" && meeting.capabilities?.can_send_invitations) return <Button variant={invitationPrepared ? "secondary" : "primary"} disabled={!ready} onClick={() => setInvitationOpen(true)}><Users size={18}/>{invitationPrepared ? "عرض الدعوة المجهزة" : "معاينة الدعوة وتجهيزها"}</Button>;
    if (meeting.status === "ready_to_start" && meeting.capabilities?.can_start_session) return <Button variant="success" pending={busy} pendingLabel="جارٍ التحقق من الموعد…" onClick={() => void startSession(false)}><Play size={18}/>فتح الجلسة</Button>;
    if (meeting.status === "in_progress") return <Link href={`/admin/meetings/${meeting.id}/live`} className="inline-flex min-h-11 items-center gap-2 rounded-q-control bg-q-success px-5 text-q-ui font-bold text-q-on-success"><Play size={18}/>متابعة الجلسة الحية</Link>;
    if (["waiting_for_minutes", "waiting_for_approval"].includes(meeting.status)) return <Link href={`/admin/meetings/${meeting.id}/minutes`} className="inline-flex min-h-11 items-center gap-2 rounded-q-control bg-q-primary px-5 text-q-ui font-bold text-q-on-primary"><FileText size={18}/>فتح المحضر والمصادقات</Link>;
    if (["closed", "archived"].includes(meeting.status)) return <Link href="/admin/follow-up" className="inline-flex min-h-11 items-center gap-2 rounded-q-control bg-q-primary px-5 text-q-ui font-bold text-q-on-primary"><ListChecks size={18}/>متابعة القرارات والتكليفات</Link>;
    return null;
  })();

  return <div className="space-y-5" aria-busy={loading}>
    <Card className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex flex-wrap items-center gap-2"><Badge tone={meeting.status === "cancelled" ? "danger" : "info"}>{meetingStatusLabels[meeting.status] ?? "حالة الاجتماع"}</Badge><span className="text-q-caption text-q-text-2">{meeting.meeting_no ?? "اجتماع"}</span></div><h1 className="mt-3 text-q-h1 font-bold">{meeting.title_ar}</h1><p className="mt-2 text-q-ui text-q-text-2">{meeting.unit_name_ar ?? meeting.governance_unit_name_ar ?? "المجلس"}</p></div><Link href="/admin/meetings" className="inline-flex min-h-11 items-center gap-2 rounded-q-control border border-q-border px-4 text-q-ui font-bold text-q-link"><ChevronLeft size={18}/>كل الاجتماعات</Link></div>
      <div className="overflow-x-auto pb-2">
        <JourneyRail
          className="min-w-[36rem]"
          label="رحلة الاجتماع"
          selectedIndex={selectedIndex}
          onSelect={(index) => { if (journey[index]?.state !== "locked") setSelectedStageKey(journey[index].key); }}
          steps={journey.map((step) => ({ label: step.label, detail: step.description, state: step.state === "locked" ? "upcoming" : step.state }))}
        />
      </div>
      {journey.some((step) => step.state === "locked") && <p className="text-q-caption text-q-text-2">تُفتح المراحل اللاحقة بعد إكمال {current.label}.</p>}
    </Card>

    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,.7fr)]">
      <Card live={meeting.status === "in_progress"}>
        <p className="text-q-caption font-bold text-q-live">{viewingCurrent ? "المرحلة الحالية" : "مرحلة مكتملة للقراءة"}</p><h2 className="mt-1 text-q-h2 font-bold">{selected.label}</h2><p className="mt-2 text-q-ui leading-7 text-q-text-2">{selected.description}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2"><Fact icon={CalendarDays} label="الموعد" value={meetingScheduleLabel(meeting)}/><Fact icon={Clock} label="الوقت" value={`${meeting.start_time ?? "غير محدد"} – ${meeting.end_time ?? "غير محدد"}`}/><Fact icon={MapPin} label="المكان" value={meetingLocationLabel(meeting)}/><Fact icon={ListChecks} label="جدول الأعمال" value={`${meeting.agenda_items?.length ?? 0} بند`}/></div>
        <StageReadingSummary stage={selected.key} meeting={meeting} viewingCurrent={viewingCurrent}/>
        {viewingCurrent && selected.key === "invitation" && meeting.invitation_summary?.prepared && <InvitationStatus summary={meeting.invitation_summary} className="mt-4"/>}
        {viewingCurrent && <div className="mt-6 border-t border-q-border pt-5"><div className="flex flex-wrap items-center gap-3">{primary}{hasSecondaryActions && <details><summary className="flex min-h-11 cursor-pointer items-center rounded-q-control border border-q-border px-4 text-q-ui font-bold text-q-link">إجراءات أخرى</summary><div className="mt-2 grid gap-2 rounded-q-card border border-q-border bg-q-surface p-3">{meeting.status === "scheduled" && meeting.capabilities?.can_prepare_session && <Button variant="secondary" pending={busy} disabled={!ready} onClick={() => void transition("ready_to_start")}>إغلاق التحضير وتجهيز الجلسة</Button>}{(meeting.capabilities?.can_manage || meeting.capabilities?.can_cancel || meeting.capabilities?.can_archive) && <Link href={`/admin/meetings?manage=${meeting.id}`} className="inline-flex min-h-11 items-center justify-center rounded-q-control border border-q-border px-4 text-q-ui font-bold text-q-link">تعديل الموعد أو الإلغاء أو الأرشفة</Link>}</div></details>}</div>{!primary && <p className="text-q-ui text-q-text-2">لا يوجد إجراء مطلوب منك في هذه المرحلة.</p>}{!ready && unmet.length > 0 && <p className="mt-3 text-q-caption text-q-warning">قبل المتابعة: {unmet.map((check) => check.label).join("، ")}.</p>}</div>}
      </Card>
      <Card><h2 className="text-q-h3 font-bold">ملخص جدول الأعمال</h2>{meeting.agenda_items?.length ? <ol className="mt-4 space-y-3">{meeting.agenda_items.map((item, index) => <li key={item.id} className="flex gap-3 rounded-q-control bg-q-surface-2 p-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-q-primary text-q-caption font-bold text-q-on-primary">{index + 1}</span><div><p className="text-q-ui font-bold">{item.topic?.title_ar ?? "بند اجتماع"}</p>{item.topic?.topic_no && <p className="mt-1 text-q-caption text-q-text-2">{item.topic.topic_no}</p>}</div></li>)}</ol> : <p className="mt-3 text-q-ui text-q-text-2">لم تُضف بنود إلى جدول الأعمال بعد.</p>}</Card>
    </div>
    {invitationOpen && meeting.updated_at && <InvitationTimingDialog meetingId={meeting.id} expectedUpdatedAt={meeting.updated_at} startTime={meeting.start_time} endTime={meeting.end_time} invitationSummary={meeting.invitation_summary} onClose={() => setInvitationOpen(false)} onSent={() => void load()}/>}
    {startTiming && <MeetingStartConfirmationDialog timing={startTiming} pending={busy} error={error} onClose={() => setStartTiming(null)} onConfirm={() => void startSession(true)}/>} 
  </div>;
}

function StageReadingSummary({ stage, meeting, viewingCurrent }: { stage: MeetingJourneyKey; meeting: MeetingDetail; viewingCurrent: boolean }) {
  const finished = !viewingCurrent;
  const itemCount = meeting.agenda_items?.length ?? 0;
  const labels: Record<MeetingJourneyKey, string> = {
    setup: `${itemCount} بند في جدول الأعمال، وبيانات الموعد والمكان مثبتة أعلاه.`,
    invitation: finished ? "انتهت مرحلة الدعوة وانتقل الاجتماع إلى المرحلة التالية." : "راجع بيانات الموعد والمدعوين قبل تجهيز الدعوة.",
    session: finished ? `انتهت الجلسة بعد معالجة ${itemCount} بند.` : "تُدار الحضور والمناقشة والتصويت من الغرفة الحية.",
    minutes: finished ? "اكتملت مرحلة المحضر والمصادقات، ويمكن الرجوع إلى سجلها." : "يُعد المحضر وتُجمع المصادقات والتواقيع في هذه المرحلة.",
    follow_up: "تعرض المتابعة القرارات والتكليفات الناتجة عن الاجتماع بعد اعتماد المحضر.",
  };
  return <div className="mt-5 rounded-q-control bg-q-surface-2 p-4"><p className="text-q-ui leading-7 text-q-text-2">{labels[stage]}</p>{stage === "minutes" && <Link href={`/admin/meetings/${meeting.id}/minutes`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-q-ui font-bold text-q-link"><FileText size={18}/>عرض سجل المحضر والمصادقات</Link>}{stage === "session" && meeting.status === "in_progress" && <Link href={`/admin/meetings/${meeting.id}/live`} className="mt-3 inline-flex min-h-11 items-center gap-2 text-q-ui font-bold text-q-link"><Play size={18}/>فتح الغرفة الحية</Link>}</div>;
}

function Fact({ icon: Icon, label, value }: { icon: typeof CalendarDays; label: string; value: string }) {
  return <div className="flex items-start gap-3 rounded-q-control bg-q-surface-2 p-3"><Icon className="mt-0.5 shrink-0 text-q-link" size={19}/><div><p className="text-q-caption text-q-text-2">{label}</p><p className="mt-1 text-q-ui font-bold text-q-text">{value}</p></div></div>;
}
