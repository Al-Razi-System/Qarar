import type { ReactNode } from "react";
import { MemberSeat } from "@/shared/ui/member-seat";
import { cn } from "@/shared/lib/utils";
import type { StageSeat } from "../../model/meeting-stage";

/** Above this many seats an orbit would overlap, so the seats fall back to a grid. */
export const MAX_ORBIT_SEATS = 14;

function orbitPosition(index: number, count: number) {
  const angle = (-90 + (index * 360) / count) * (Math.PI / 180);
  return { left: `${(50 + 45 * Math.cos(angle)).toFixed(2)}%`, top: `${(50 + 41 * Math.sin(angle)).toFixed(2)}%` };
}

type Props = { seats: StageSeat[]; children: ReactNode };

/**
 * The council table: members sit around an oval table and the current stage of
 * the meeting is shown in its middle. On narrow screens, or with many members,
 * the seats are listed in a grid under the table instead of around it.
 */
export function CouncilTable({ seats, children }: Props) {
  const orbit = seats.length > 0 && seats.length <= MAX_ORBIT_SEATS;
  return (
    <div className={cn("relative", orbit && "md:aspect-[2/1] md:min-h-[460px]")}>
      <div
        className={cn(
          "q-stage grid min-h-56 place-items-center rounded-q-card p-6",
          orbit && "md:absolute md:inset-x-[14%] md:inset-y-[20%] md:min-h-0 md:rounded-[50%] md:p-0",
        )}
      >
        <div className={cn("w-full", orbit && "md:max-w-[62%]")} aria-live="polite">{children}</div>
      </div>
      {seats.length === 0 ? (
        <p className="m-0 mt-4 text-center font-sans text-q-ui text-q-text-2">لم يُسجَّل أعضاء في سجل حضور هذا الاجتماع بعد.</p>
      ) : (
        <ul
          aria-label="أعضاء المجلس"
          className={cn(
            "m-0 mt-4 grid list-none grid-cols-3 justify-items-center gap-3 p-0 sm:grid-cols-4",
            orbit ? "md:mt-0 md:block" : "lg:grid-cols-6",
          )}
        >
          {seats.map((seat, index) => (
            <li
              key={seat.id}
              className={cn(orbit && "md:absolute md:-translate-x-1/2 md:-translate-y-1/2")}
              style={orbit ? orbitPosition(index, seats.length) : undefined}
            >
              <MemberSeat name={seat.name} status={seat.status} roleLabel={seat.roleLabel} chair={seat.chair} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
