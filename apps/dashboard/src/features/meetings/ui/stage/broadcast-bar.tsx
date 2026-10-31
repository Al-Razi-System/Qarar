"use client";

import { Button } from "@/shared/ui/button";
import type { MeetingBroadcast } from "../../model/live-meeting";

type Props = {
  broadcast: MeetingBroadcast;
  /** A handover is on its way to the server. */
  pending: boolean;
  /** Why the last broadcast change failed, for the viewer. */
  error?: string | null;
  onHandOver: (toRole: "chair" | "rapporteur") => void;
};

const controllerName = { chair: "رئيس المجلس", rapporteur: "مقرر المجلس" } as const;

/**
 * Who drives the council's screens right now, and the handover the viewer may
 * make. Only one person controls the broadcast at a time; everyone else follows.
 */
export function BroadcastBar({ broadcast, pending, error, onHandOver }: Props) {
  const action = broadcast.can_hand_over
    ? { label: "تسليم التحكم للمقرر", to: "rapporteur" as const }
    : broadcast.can_take_back
      ? { label: "استرجاع التحكم", to: "chair" as const }
      : broadcast.can_return
        ? { label: "إعادة التحكم للرئيس", to: "chair" as const }
        : null;
  return (
    <section aria-label="بث الجلسة" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-q-control bg-q-surface-2 px-3 py-1.5 font-sans text-q-text">
      <p className="m-0 flex items-start gap-2 text-q-caption font-bold" role="status">
        <span aria-hidden="true" className="q-live-dot mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-q-live" />
        {broadcast.viewer_controls
          ? "أنت تتحكم في البث، وتتبع شاشات الأعضاء ما تختاره."
          : `تتابع شاشة ${controllerName[broadcast.controller_role]}.`}
      </p>
      {(action || error) && (
        <div className="flex flex-wrap items-center gap-2">
          {error && <span role="alert" className="text-q-caption font-bold text-q-danger">{error}</span>}
          {pending && <span role="status" className="text-q-caption font-bold text-q-text-2">جارٍ التسليم…</span>}
          {action && (
            <Button variant="ghost" disabled={pending} onClick={() => onHandOver(action.to)}>{action.label}</Button>
          )}
        </div>
      )}
    </section>
  );
}
