"use client";

import Image from "next/image";
import { useState } from "react";
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
  /** When given, the seat opens the member's card. */
  onOpen?: () => void;
  /** The member's photo; the initial is shown without one or when it fails to load. */
  photoUrl?: string;
  /** "sm" is the small table beside a member's topic: the name only, no status line. */
  size?: "sm" | "md";
  className?: string;
};

export function initialOf(name: string) {
  const parts = name.trim().split(/\s+/);
  const word = /^(د|أ|م)\.?$/.test(parts[0] ?? "") ? parts[1] : parts[0];
  return (word ?? "").charAt(0) || "؟";
}

/**
 * One member around the council table. A vote is shown only as "voted" or
 * "not yet": the seat never reveals the direction of a vote.
 */
export function MemberSeat({ name, status, roleLabel, chair = false, onOpen, photoUrl, size = "md", className }: Props) {
  const small = size === "sm";
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const photo = photoUrl && failedPhoto !== photoUrl ? photoUrl : null;
  const away = status === "excused" || status === "absent";
  const caption = status === "present" ? roleLabel ?? statusLabel.present : statusLabel[status];
  const avatarClass = cn(
    "relative grid place-items-center rounded-full bg-q-seat p-0 font-sans font-bold text-q-text",
    small ? "h-11 w-11 text-q-ui" : "h-14 w-14 text-q-h3",
    chair && status === "present" ? "border-[3px] border-q-live" : ringClass[status],
    status === "waiting" && "q-seat-waiting",
  );
  const avatar = (
    <>
      {photo
        ? <Image unoptimized src={photo} alt="" width={56} height={56} onError={() => setFailedPhoto(photo)} className="h-full w-full rounded-full object-cover" />
        : initialOf(name)}
      {status === "voted" && (
        <span aria-hidden="true" className="absolute -bottom-1 -left-1 grid h-5 w-5 place-items-center rounded-full bg-q-primary text-q-on-primary">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
        </span>
      )}
    </>
  );

  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", small ? "w-[72px]" : "w-24", away && "opacity-50", className)}>
      {onOpen ? (
        <button type="button" onClick={onOpen} aria-label={`بطاقة ${name}`} className={avatarClass}>{avatar}</button>
      ) : (
        <div className={avatarClass}>{avatar}</div>
      )}
      <span className="max-w-full truncate font-sans text-q-caption font-bold text-q-text" title={name}>{name}</span>
      {small
        ? <span className="sr-only">{caption}</span>
        : <span className={cn("-mt-1 font-sans text-q-caption", status === "waiting" ? "text-q-link" : "text-q-text-2")}>{caption}</span>}
    </div>
  );
}
