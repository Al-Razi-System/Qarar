import type { ReactNode } from "react";
import { MemberSeat } from "@/shared/ui/member-seat";
import { cn } from "@/shared/lib/utils";
import type { StageSeat } from "../../model/meeting-stage";

/** Above this many seats an orbit would overlap, so the seats fall back to a grid. */
export const MAX_ORBIT_SEATS = 14;

function orbitPosition(index: number, count: number, compact: boolean) {
  const angle = (-90 + (index * 360) / count) * (Math.PI / 180);
  const [rx, ry] = compact ? [41, 40] : [45, 41];
  // Each seat's name sits under its avatar, so the orbit is lifted a little to keep the bottom names inside the table's box.
  const cy = compact ? 50 : 46;
  return { left: `${(50 + rx * Math.cos(angle)).toFixed(2)}%`, top: `${(cy + ry * Math.sin(angle)).toFixed(2)}%` };
}

type Props = {
  seats: StageSeat[];
  children: ReactNode;
  /** The small table beside a member's topic. */
  compact?: boolean;
};

/**
 * The council table: members sit around an oval table and the current stage of
 * the meeting is shown in its middle. On narrow screens, or with many members,
 * the seats are listed in a grid under the table instead of around it.
 */
export function CouncilTable({ seats, children, compact = false }: Props) {
  const orbit = seats.length > 0 && seats.length <= MAX_ORBIT_SEATS;
  return (
    <div className={cn("relative", orbit && (compact ? "aspect-[1/1.02]" : "md:mx-auto md:aspect-[6/5] md:max-h-full md:max-w-full md:min-h-[440px] lg:h-full lg:min-h-[480px]"))}>
      <div
        className={cn(
          "q-stage grid place-items-center rounded-q-card p-6",
          compact ? "min-h-0" : "min-h-56",
          orbit && compact && "absolute inset-x-[19%] inset-y-[21%] rounded-[50%] p-2",
          orbit && !compact && "md:absolute md:inset-x-[16%] md:top-[16%] md:bottom-[24%] md:min-h-0 md:rounded-[50%] md:p-0",
        )}
      >
        <div className={cn("w-full", orbit && "md:max-w-[64%]")} aria-live="polite">{children}</div>
      </div>
      {seats.length === 0 ? (
        <p className="m-0 mt-4 text-center font-sans text-q-ui text-q-text-2">لم يُسجَّل أعضاء في سجل حضور هذا الاجتماع بعد.</p>
      ) : (
        <ul
          aria-label="أعضاء المجلس"
          className={cn(
            "m-0 list-none p-0",
            orbit && compact ? "block" : "mt-4 grid grid-cols-3 justify-items-center gap-3 sm:grid-cols-4",
            orbit && !compact && "md:mt-0 md:block",
            !orbit && "lg:grid-cols-6",
          )}
        >
          {seats.map((seat, index) => (
            <li
              key={seat.id}
              className={cn(orbit && (compact ? "absolute -translate-x-1/2 -translate-y-1/2" : "md:absolute md:-translate-x-1/2 md:-translate-y-1/2"))}
              style={orbit ? orbitPosition(index, seats.length, compact) : undefined}
            >
              <MemberSeat name={seat.name} status={seat.status} roleLabel={seat.roleLabel} chair={seat.chair} size={compact ? "sm" : "md"} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
