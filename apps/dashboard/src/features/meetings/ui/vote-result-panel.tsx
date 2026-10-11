import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { VotingRound } from "../model/live-meeting";

type Person = { user_id: string; full_name_ar: string };

/**
 * A voting round as numbers. While the round is open (`live`) it shows only who
 * has voted, never a direction or an option total. After it closes it shows the
 * frozen totals and the final status.
 */
export function VoteResultPanel({ round, live = false }: { round: VotingRound; live?: boolean }) {
  const approve = round.approve_count ?? 0;
  const reject = round.reject_count ?? 0;
  const abstain = round.abstain_count ?? 0;
  const participation = round.participation ?? [];

  if (live) {
    const voted = participation.filter((person) => person.has_voted);
    const waiting = participation.filter((person) => !person.has_voted);
    const cast = round.votes_cast_count ?? voted.length;
    const eligible = round.eligible_voter_count ?? participation.length;
    const percentage = eligible ? Math.round((cast / eligible) * 100) : 0;
    return (
      <section aria-label="متابعة المشاركة في التصويت" className="flex flex-col gap-3 rounded-q-card border border-q-border bg-q-surface-2 p-4 font-sans text-q-text">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="m-0 text-q-ui font-bold">متابعة المشاركة في الوقت الفعلي</p>
            <p className="m-0 text-q-caption text-q-text-2">تظهر المشاركة فقط؛ تبقى خيارات الأعضاء سرية حتى إغلاق الجولة.</p>
          </div>
          <Badge tone="info">{cast} من {eligible} صوّتوا</Badge>
        </div>
        <div role="progressbar" aria-label="نسبة المشاركة" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percentage} className="h-2 overflow-hidden rounded-full bg-q-neutral-soft">
          <div className="h-full rounded-full bg-q-primary transition-all duration-500" style={{ width: `${percentage}%` }} />
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <ParticipationGroup title="أدلوا بأصواتهم" people={voted} />
          <ParticipationGroup title="بانتظار تصويتهم" people={waiting} />
        </div>
      </section>
    );
  }

  const cast = round.votes_cast_count ?? approve + reject + abstain;
  const base = Math.max(cast, 1);
  const approved = round.result === "approved";
  const rejected = round.result === "rejected";
  const chairVoteLabel = round.chair_vote === "approve" ? "موافق" : round.chair_vote === "reject" ? "غير موافق" : "ممتنع";
  const totals = [
    { label: "موافق", value: approve, className: "bg-q-success-soft text-q-success" },
    { label: "غير موافق", value: reject, className: "bg-q-danger-soft text-q-danger" },
    { label: "ممتنع", value: abstain, className: "bg-q-neutral-soft text-q-text-2" },
  ];

  return (
    <section aria-label="النتيجة النهائية للتصويت" className="flex flex-col gap-3 rounded-q-card border border-q-border bg-q-surface-2 p-4 font-sans text-q-text">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="m-0 text-q-ui font-bold">النتيجة النهائية للتصويت</p>
          <p className="m-0 text-q-caption text-q-text-2">{cast} صوتاً محتسباً · دون عرض هويات المصوّتين</p>
        </div>
        <Badge tone={approved ? "success" : rejected ? "danger" : "neutral"}>الحالة النهائية: {finalStatusLabel(round.result)}</Badge>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {totals.map((total) => (
          <div key={total.label} className={cn("rounded-q-control p-3 text-center", total.className)}>
            <strong className="block text-q-h2 font-bold tabular-nums">{total.value}</strong>
            <span className="block text-q-caption font-bold">{total.label}</span>
            <span className="block text-q-caption">{Math.round((total.value / base) * 100)}%</span>
          </div>
        ))}
      </div>
      {round.tie_break_applied && (
        <p className="m-0 rounded-q-control bg-q-warning-soft p-3 text-q-caption text-q-warning">
          <strong className="block text-q-ui">تم تطبيق قاعدة ترجيح صوت رئيس المجلس</strong>
          تعادلت أصوات الموافقة والرفض ({approve} مقابل {reject})، وكان صوت رئيس المجلس «{chairVoteLabel}»، لذلك أصبحت الحالة النهائية «{finalStatusLabel(round.result)}».
        </p>
      )}
    </section>
  );
}

function ParticipationGroup({ title, people }: { title: string; people: Person[] }) {
  return (
    <div className="rounded-q-control border border-q-border bg-q-surface p-3">
      <p className="m-0 mb-2 flex items-center justify-between gap-2 text-q-caption font-bold text-q-text-2">{title}<span className="tabular-nums">{people.length}</span></p>
      {people.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
          {people.map((person) => <li key={person.user_id} className="rounded-full bg-q-neutral-soft px-3 py-1 text-q-caption font-bold text-q-text">{person.full_name_ar}</li>)}
        </ul>
      ) : <p className="m-0 text-q-caption text-q-text-2">لا يوجد.</p>}
    </div>
  );
}

function finalStatusLabel(result?: string) {
  if (result === "approved") return "موافقة";
  if (result === "rejected") return "رفض";
  if (result === "no_votes") return "لم يصوّت أحد";
  return "تعادل";
}
