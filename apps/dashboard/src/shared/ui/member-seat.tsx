"use client";

import { cn } from "@/shared/lib/utils";

export type SeatStatus = "pending" | "present" | "voted" | "waiting" | "excused" | "absent";

const statusLabel: Record<SeatStatus, string> = {
  pending: "لم يثبت حضوره",
  present: "حاضر",
  voted: "صوّت",
  waiting: "لم يصوّت بعد",
  excused: "معتذر",
  absent: "غائب",
};

const ringClass: Record<SeatStatus, string> = {
  pending: "border-2 border-dashed border-q-border-strong",
  present: "border-2 border-q-border-strong",
  voted: "border-[3px] border-q-primary",
  waiting: "border-2 border-dashed border-q-primary",
  excused: "border-2 border-dashed border-q-border-strong",
  absent: "border-2 border-dashed border-q-border-strong",
};

type Props = {
  name: string;
  status: SeatStatus;
  /** Council role shown under the name instead of the status, e.g. «الرئيس». */
  roleLabel?: string;
  /** Marks the chair's seat with the live colour while no vote state applies. */
  chair?: boolean;
  /** When given, the seat opens the member's contact card. */
  onOpen?: () => void;
  className?: string;
};

function initialOf(name: string) {
  const parts = name.trim().split(/\s+/);
  const word = /^(د|أ|م)\.?$/.test(parts[0] ?? "") ? parts[1] : parts[0];
  return (word ?? "").charAt(0) || "؟";
}

/**
 * One member around the council table. A vote is shown only as "voted" or
 * "not yet": the seat never reveals the direction of a vote.
 */
export function MemberSeat({ name, status, roleLabel, chair = false, onOpen, className }: Props) {
  const away = status === "excused" || status === "absent";
  const caption = status === "present" ? roleLabel ?? statusLabel.present : statusLabel[status];
  const avatarClass = cn(
    "relative grid h-14 w-14 place-items-center rounded-full bg-q-seat font-sans text-q-h3 font-bold text-q-text",
    chair && status === "present" ? "border-[3px] border-q-live" : ringClass[status],
    status === "waiting" && "q-seat-waiting",
  );
  const avatar = (
    <>
      {initialOf(name)}
      {status === "voted" && (
        <span aria-hidden="true" className="absolute -bottom-1 -left-1 grid h-5 w-5 place-items-center rounded-full bg-q-primary text-q-on-primary">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      )}
    </>
  );

  return (
    <div className={cn("flex w-24 flex-col items-center gap-1 text-center", away && "opacity-50", className)}>
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={`بطاقة ${name}`} className={avatarClass}>{avatar}</button>
      ) : (
        <div className={avatarClass}>{avatar}</div>
      )}
      <span className="max-w-full truncate font-sans text-q-caption font-bold text-q-text" title={name}>{name}</span>
      <span className={cn("-mt-1 font-sans text-q-caption", status === "waiting" ? "text-q-link" : "text-q-text-2")}>{caption}</span>
    </div>
  );
}
