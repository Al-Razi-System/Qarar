import type { ReactNode } from "react";
import { MemberSeat } from "@/shared/ui/member-seat";
import { cn } from "@/shared/lib/utils";
import type { StageSeat } from "../../model/meeting-stage";

export const MAX_ORBIT_SEATS = 14;
type Props = { seats: StageSeat[]; children: ReactNode; compact?: boolean; onOpenSeat?: (seat: StageSeat) => void };

/** Separate grid tracks own seats and table: captions cannot occupy the table. */
export function CouncilTable({ seats, children, compact = false, onOpenSeat }: Props) {
  const around = seats.length >= 4 && seats.length <= MAX_ORBIT_SEATS;
  const cap = Math.ceil(seats.length / 4);
  const top = seats.slice(0, cap);
  const bottom = seats.slice(-cap);
  const sides = seats.slice(cap, seats.length - cap);
  const left = sides.slice(0, Math.ceil(sides.length / 2));
  const right = sides.slice(Math.ceil(sides.length / 2));
  function row(entries: StageSeat[], vertical = false) {
    return <ul aria-label="أعضاء المجلس" className={cn("m-0 flex list-none items-center justify-around gap-2 p-0", vertical ? "flex-col" : "flex-wrap")}>
      {entries.map(seat => <li key={seat.id} className="min-w-0"><MemberSeat name={seat.name} status={seat.status} roleLabel={seat.roleLabel} chair={seat.chair} photoUrl={seat.photoUrl} size={compact ? "sm" : "md"} onOpen={onOpenSeat ? () => onOpenSeat(seat) : undefined} /></li>)}
    </ul>;
  }
  const table = <div data-testid="council-table-surface" className="q-stage grid min-h-56 min-w-0 place-items-center overflow-hidden rounded-[50%] p-4"><div className="w-full min-w-0" aria-live="polite">{children}</div></div>;
  return <div className="mx-auto flex w-full min-w-0 flex-col gap-4 p-2">
    {around ? <>
      {row(top)}
      <div className={cn("grid items-stretch gap-2", compact ? "grid-cols-[4.5rem_minmax(0,1fr)_4.5rem]" : "grid-cols-[4.5rem_minmax(0,1fr)_4.5rem] @md:grid-cols-[6rem_minmax(0,1fr)_6rem]")}>
        {row(left, true)}{table}{row(right, true)}
      </div>
      {row(bottom)}
    </> : <>{table}{seats.length ? row(seats) : <p className="m-0 text-center text-q-ui text-q-text-2">لم يُسجَّل أعضاء في سجل حضور هذا الاجتماع بعد.</p>}</>}
  </div>;
}
