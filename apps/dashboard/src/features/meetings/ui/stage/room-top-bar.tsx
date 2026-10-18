"use client";

import { useEffect, useState } from "react";
import type { LiveMeetingSession } from "../../model/live-meeting";

const RING_RADIUS = 15;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Minutes and seconds since the session opened, as the hall clock shows it. */
export function elapsedClock(startedAt: string | null | undefined, now: number) {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start) || now < start) return null;
  const seconds = Math.floor((now - start) / 1000);
  const pad = (value: number) => String(value).padStart(2, "0");
  const hours = Math.floor(seconds / 3600);
  const clock = `${pad(Math.floor((seconds % 3600) / 60))}:${pad(seconds % 60)}`;
  return hours > 0 ? `${hours}:${clock}` : clock;
}

function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function QuorumRing({ present, eligible, met }: { present: number; eligible: number; met: boolean }) {
  const fraction = eligible > 0 ? Math.min(1, present / eligible) : 0;
  return (
    <svg width="34" height="34" viewBox="0 0 36 36" aria-hidden="true" className="-rotate-90 shrink-0">
      <circle cx="18" cy="18" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" className="text-q-on-header" />
      <circle cx="18" cy="18" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${RING_LENGTH * fraction} ${RING_LENGTH}`} className={met ? "text-q-stage-yes" : "text-q-live-on-header"} />
    </svg>
  );
}

const barButton = "min-h-11 shrink-0 rounded-q-control border border-q-on-header/40 bg-transparent px-3 font-sans text-q-caption font-bold text-q-on-header hover:bg-q-on-header/10";

type Props = {
  session: LiveMeetingSession;
  /** When the session was opened (from the meeting's status history). */
  startedAt?: string | null;
  dark: boolean;
  onToggleTheme: () => void;
  /** Given to whoever runs the session: shows the room on the hall screen without controls. */
  presentation?: { active: boolean; onToggle: () => void };
  /** Given to everyone else: fills the screen with the meeting they follow. */
  fullscreen?: { active: boolean; onToggle: () => void };
};

/**
 * One compact bar above the room: the meeting, the live clock, the quorum and
 * who is looking. Everything else on the screen belongs to the meeting itself.
 */
export function RoomTopBar({ session, startedAt, dark, onToggleTheme, presentation, fullscreen }: Props) {
  const now = useNow(Boolean(startedAt));
  const clock = elapsedClock(startedAt, now);
  const manager = session.viewer.can_manage_session;
  const rapporteur = session.viewer.mode === "rapporteur";
  const roleLabel = manager ? "لوحة رئيس المجلس" : rapporteur ? "لوحة مقرر المجلس" : "بوابة عضو المجلس";
  const quorum = session.quorum;
  const present = quorum?.present_members ?? 0;
  const eligible = quorum?.eligible_members ?? 0;
  const met = quorum?.quorum_status === "met" || (quorum?.actual_percentage ?? 0) >= (quorum?.required_percentage ?? 100);
  const myAttendance = session.my_attendance;
  const checkedIn = myAttendance?.verification_status === "verified" && ["present", "late"].includes(myAttendance.status);

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-q-card bg-q-header px-4 py-3 font-sans text-q-on-header sm:px-6">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
        <h1 className="m-0 min-w-0 text-q-h3 font-bold">{session.meeting.title_ar}</h1>
        <span className="inline-flex items-center gap-2 rounded-full border border-q-live-on-header px-3 py-1 text-q-caption font-bold text-q-live-on-header" role="status" aria-label={clock ? `جلسة حية منذ ${clock}` : "جلسة حية"}>
          <span aria-hidden="true" className="q-live-dot inline-block h-2 w-2 rounded-full bg-q-live-on-header" />
          مباشر{clock && <> · <span dir="ltr">{clock}</span></>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex items-center gap-2">
          <QuorumRing present={present} eligible={eligible} met={met} />
          <div className="flex flex-col leading-tight">
            <span className="text-q-ui font-bold">{met ? "النصاب مكتمل" : "النصاب غير مكتمل"}</span>
            <span className="text-q-caption opacity-80">{present} حاضرون من {eligible}</span>
            {quorum && <span className="text-q-caption opacity-80">المطلوب {Math.ceil(eligible * quorum.required_percentage / 100)} من {eligible} · النصاب {quorum.required_percentage}٪</span>}
          </div>
        </div>
        <div className="flex flex-col leading-tight">
          <span className="text-q-caption font-bold">{roleLabel}</span>
          <span className="text-q-caption opacity-80">{session.viewer.full_name_ar}</span>
        </div>
        {session.viewer.is_roster_member && (
          <span className={checkedIn ? "rounded-full bg-q-success-soft px-3 py-1 text-q-caption font-bold text-q-success" : "rounded-full bg-q-warning-soft px-3 py-1 text-q-caption font-bold text-q-warning"}>
            {checkedIn ? "حضورك مثبت" : "لم يثبت حضورك بعد"}
          </span>
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onToggleTheme} aria-pressed={dark} className={barButton}>
            {dark ? "الوضع الفاتح" : "الوضع الليلي"}
          </button>
          {fullscreen && (
            <button type="button" onClick={fullscreen.onToggle} aria-pressed={fullscreen.active} className={barButton}>
              {fullscreen.active ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
            </button>
          )}
          {presentation && (
            <button type="button" onClick={presentation.onToggle} aria-pressed={presentation.active} className={barButton}>
              {presentation.active ? "إنهاء وضع العرض" : "وضع العرض على الشاشة"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
