import type { StagePhase } from "../../model/meeting-stage";
import type { VotingRound } from "../../model/live-meeting";

const RING_RADIUS = 80;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

function titleOf(phase: Extract<StagePhase, { item: unknown }>) {
  return phase.item?.topic?.title_ar ?? null;
}

function VoteRing({ cast, eligible }: { cast: number; eligible: number }) {
  const fraction = eligible > 0 ? Math.min(1, cast / eligible) : 0;
  return (
    <div className="relative grid h-44 w-44 place-items-center" role="img" aria-label={`صوّت ${cast} من ${eligible}`}>
      <svg viewBox="0 0 180 180" className="absolute inset-0 h-full w-full -rotate-90 text-q-on-stage" aria-hidden="true">
        <circle cx="90" cy="90" r={RING_RADIUS} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="11" />
        <circle className="q-ring-progress" cx="90" cy="90" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="11" strokeLinecap="round" strokeDasharray={`${RING_LENGTH * fraction} ${RING_LENGTH}`} />
      </svg>
      <div className="flex flex-col items-center">
        <span dir="ltr" className="text-q-h1 font-bold leading-none">{cast}<span className="text-q-h3 opacity-80"> / {eligible}</span></span>
        <span className="mt-1 text-q-caption font-bold">صوّتوا حتى الآن</span>
      </div>
    </div>
  );
}

const verdictLabel: Record<string, string> = {
  approved: "موافقة",
  rejected: "رفض",
  tied: "تعادل الأصوات",
  no_votes: "لم يُدلَ بأي صوت",
  cancelled: "أُلغيت الجولة",
};

function VoteResult({ round }: { round: VotingRound }) {
  const approve = round.approve_count ?? 0;
  const reject = round.reject_count ?? 0;
  const abstain = round.abstain_count ?? 0;
  const total = approve + reject + abstain;
  const parts = [
    { key: "yes", label: "موافق", value: approve, stroke: "text-q-stage-yes", dot: "bg-q-stage-yes" },
    { key: "no", label: "غير موافق", value: reject, stroke: "text-q-stage-no", dot: "bg-q-stage-no" },
    { key: "abstain", label: "ممتنع", value: abstain, stroke: "text-q-stage-abstain", dot: "bg-q-stage-abstain" },
  ];
  const segments = parts.reduce<Array<(typeof parts)[number] & { length: number; offset: number }>>((list, part) => {
    const offset = list.reduce((sum, previous) => sum + previous.length, 0);
    return [...list, { ...part, length: total > 0 ? (part.value / total) * RING_LENGTH : 0, offset }];
  }, []);

  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      {total > 0 && (
        <svg viewBox="0 0 180 180" className="h-36 w-36 -rotate-90" aria-hidden="true">
          {segments.filter((segment) => segment.length > 0).map((segment) => (
            <circle key={segment.key} className={segment.stroke} cx="90" cy="90" r={RING_RADIUS} fill="none" stroke="currentColor" strokeWidth="20" strokeDasharray={`${segment.length} ${RING_LENGTH}`} strokeDashoffset={-segment.offset} />
          ))}
        </svg>
      )}
      <div className="flex flex-col gap-1 text-right">
        <span className="text-q-h2 font-bold">{verdictLabel[round.result ?? ""] ?? "أُغلقت الجولة"}</span>
        {round.tie_break_applied && <span className="text-q-caption font-bold">رُجّح بصوت رئيس المجلس</span>}
        {parts.map((part) => (
          <span key={part.key} className="flex items-center gap-2 text-q-ui font-bold">
            <span aria-hidden="true" className={`inline-block h-3 w-3 rounded-sm ${part.dot}`} />
            {part.label} {part.value}
          </span>
        ))}
      </div>
    </div>
  );
}

/** What is happening right now, shown in the middle of the council table. */
export function StageCenter({ phase }: { phase: StagePhase }) {
  if (phase.kind === "attendance") {
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-q-ui font-bold">تثبيت الحضور</span>
        <span dir="ltr" className="text-q-h1 font-bold leading-tight">{phase.present}<span className="text-q-h3 opacity-80"> / {phase.total}</span></span>
        <span className="text-q-caption">أعضاء ثبت حضورهم</span>
      </div>
    );
  }

  if (phase.kind === "voting") {
    const title = titleOf(phase);
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        {phase.cast !== null && phase.eligible !== null
          ? <VoteRing cast={phase.cast} eligible={phase.eligible} />
          : <><span className="text-q-h2 font-bold">التصويت مفتوح</span><span className="text-q-caption">تظهر النتيجة للجميع بعد إغلاق الجولة</span></>}
        {title && <span className="max-w-full text-q-ui font-bold">{title}</span>}
      </div>
    );
  }

  if (phase.kind === "result") {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <VoteResult round={phase.round} />
        {titleOf(phase) && <span className="text-q-ui font-bold">{titleOf(phase)}</span>}
      </div>
    );
  }

  if (phase.kind === "discussion") {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-q-ui font-bold">قيد المناقشة</span>
        <span className="text-q-h2 font-bold">{titleOf(phase) ?? "بند جدول الأعمال"}</span>
      </div>
    );
  }

  if (phase.kind === "finished") {
    return (
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-q-h2 font-bold">اكتملت بنود الجلسة</span>
        <span className="text-q-caption">يمكن لرئيس المجلس إنهاء الجلسة والانتقال إلى المحضر</span>
      </div>
    );
  }

  const title = titleOf(phase);
  return (
    <div className="flex flex-col items-center gap-2 text-center">
      <span className="text-q-ui font-bold">{title ? "البند التالي" : "لا بنود في جدول الأعمال"}</span>
      {title && <span className="text-q-h2 font-bold">{title}</span>}
    </div>
  );
}
