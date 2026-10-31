"use client";

import { useEffect, useState } from "react";
import { Maximize2, Minimize2, Moon, Presentation, Sun } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import { OverflowMenu } from "@/shared/ui/overflow-menu";
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
      <circle cx="18" cy="18" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" className="text-q-text-2" />
      <circle cx="18" cy="18" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"
        strokeDasharray={`${RING_LENGTH * fraction} ${RING_LENGTH}`} className={met ? "text-q-success" : "text-q-warning"} />
    </svg>
  );
}

const barButton = "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-q-control border border-q-border bg-q-surface px-3 font-sans text-q-caption font-bold text-q-link hover:bg-q-surface-2";

type Props = {
  session: LiveMeetingSession;
  /** When the session was opened (from the meeting's status history). */
  startedAt?: string | null;
  dark: boolean;
  onToggleTheme: () => void;
  /** Hall view keeps the chair's next-step controls, but never their private ballot. */
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

  const required = quorum && quorum.required_percentage !== undefined
    ? `المطلوب ${Math.ceil(eligible * quorum.required_percentage / 100)} من ${eligible} · النصاب ${quorum.required_percentage}٪`
    : null;

  return (
    <header className="relative z-20 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 rounded-q-card border border-q-border border-t-4 border-t-q-primary bg-q-surface px-4 py-2.5 font-sans text-q-text sm:px-5">
      <div className="flex min-w-0 grow basis-56 items-center gap-3">
        <h1 className="m-0 line-clamp-2 min-w-0 text-q-h3 font-bold leading-snug lg:truncate" title={session.meeting.title_ar}>{session.meeting.title_ar}</h1>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-q-live-soft px-3 py-1 text-q-caption font-bold text-q-live" role="status" aria-label={clock ? `جلسة حية منذ ${clock}` : "جلسة حية"}>
          <span aria-hidden="true" className="q-live-dot inline-block h-2 w-2 rounded-full bg-q-live" />
          مباشر{clock && <> · <span dir="ltr">{clock}</span></>}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2" title={required ?? undefined}>
          <QuorumRing present={present} eligible={eligible} met={met} />
          <div className="flex flex-col leading-tight">
            <span className={cn("text-q-ui font-bold", met ? "text-q-success" : "text-q-warning")}>{met ? "النصاب مكتمل" : "النصاب غير مكتمل"}</span>
            <span className="text-q-caption text-q-text-2">{present} حاضرون من {eligible}{required && <span className="sr-only"> · {required}</span>}</span>
          </div>
        </div>
        {session.viewer.is_roster_member && !checkedIn && !presentation?.active && (
          <span className="rounded-full bg-q-warning-soft px-3 py-1 text-q-caption font-bold text-q-warning">لم يثبت حضورك بعد</span>
        )}
        <div className="flex items-center gap-2">
          {fullscreen && (
            <button type="button" onClick={fullscreen.onToggle} aria-pressed={fullscreen.active} className={barButton}>
              {fullscreen.active ? <Minimize2 size={16} aria-hidden="true" /> : <Maximize2 size={16} aria-hidden="true" />}
              {fullscreen.active ? "الخروج من ملء الشاشة" : "ملء الشاشة"}
            </button>
          )}
          {presentation && (
            <button type="button" onClick={presentation.onToggle} aria-pressed={presentation.active} aria-label={presentation.active ? "إنهاء وضع العرض" : "وضع العرض على الشاشة"} className={barButton}>
              <Presentation size={16} aria-hidden="true" />
              {presentation.active ? "إنهاء العرض" : "وضع العرض"}
            </button>
          )}
          <OverflowMenu
            label="إعدادات العرض"
            header={(
              <div className="flex flex-col leading-snug">
                <span className="text-q-caption font-bold">{roleLabel}</span>
                <span className="text-q-caption text-q-text-2">{session.viewer.full_name_ar}</span>
                {session.viewer.is_roster_member && checkedIn && <span className="text-q-caption font-bold text-q-success">حضورك مثبت</span>}
              </div>
            )}
            items={[{ key: "theme", label: "الوضع الليلي", icon: dark ? <Sun size={16} /> : <Moon size={16} />, checked: dark, onSelect: onToggleTheme }]}
          />
        </div>
      </div>
    </header>
  );
}
