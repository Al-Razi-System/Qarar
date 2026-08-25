import { CheckCircle2, Clock3, Scale, Users, XCircle } from "lucide-react";
import type { VotingRound } from "../model/live-meeting";

export function VoteResultPanel({ round, live = false }: { round: VotingRound; live?: boolean }) {
  const approve = round.approve_count ?? 0;
  const reject = round.reject_count ?? 0;
  const abstain = round.abstain_count ?? 0;
  const cast = round.votes_cast_count ?? approve + reject + abstain;
  const eligible = round.eligible_voter_count ?? cast;
  const waiting = Math.max(0, eligible - cast);
  const approved = round.result === "approved";
  const rejected = round.result === "rejected";
  const chairVoteLabel = round.chair_vote === "approve" ? "موافق" : round.chair_vote === "reject" ? "غير موافق" : "ممتنع";

  const totals = [
    { label: "موافق", value: approve, icon: CheckCircle2, tone: "border-emerald-200 bg-emerald-50 text-emerald-800" },
    { label: "غير موافق", value: reject, icon: XCircle, tone: "border-red-200 bg-red-50 text-red-800" },
    { label: "ممتنع", value: abstain, icon: Scale, tone: "border-slate-200 bg-slate-50 text-slate-700" },
    ...(live ? [{ label: "لم يصوّت", value: waiting, icon: Clock3, tone: "border-amber-200 bg-amber-50 text-amber-800" }] : []),
  ];

  return <section className={`rounded-2xl border p-4 ${live ? "border-blue-200 bg-blue-50/50" : approved ? "border-emerald-200 bg-emerald-50/45" : rejected ? "border-red-200 bg-red-50/35" : "border-slate-200 bg-slate-50"}`} aria-label={live ? "النتائج الحية المجمعة" : "النتيجة النهائية للتصويت"}>
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-[10px] font-black text-[#172a42]">{live ? "النتائج الحية المجمعة" : "النتيجة النهائية للتصويت"}</p>
        <p className="mt-1 text-[9px] text-[#71869a]">{live ? `${cast} من ${eligible} أدلوا بأصواتهم` : `${cast} صوتاً محتسباً`} · دون عرض هويات المصوّتين</p>
      </div>
      {!live && <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[10px] font-black ${approved ? "bg-emerald-600 text-white" : rejected ? "bg-red-600 text-white" : "bg-slate-700 text-white"}`}>
        {approved ? <CheckCircle2 size={13} /> : rejected ? <XCircle size={13} /> : <Scale size={13} />}الحالة النهائية: {voteResultLabel(round.result)}
      </span>}
    </div>
    <div className={`grid gap-2 ${live ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
      {totals.map(({ label, value, icon: Icon, tone }) => <div key={label} className={`rounded-xl border px-3 py-3 ${tone}`}>
        <div className="flex items-center justify-between gap-2"><Icon size={15} /><strong className="text-xl font-black tabular-nums">{value}</strong></div>
        <span className="mt-1 block text-[9px] font-bold">{label}</span>
      </div>)}
    </div>
    {!live && round.tie_break_applied && <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[9px] font-bold leading-5 text-amber-900"><Users size={14} className="mt-0.5 shrink-0" /><span><strong className="block text-[10px]">تم تطبيق قاعدة ترجيح صوت رئيس المجلس</strong>تعادلت أصوات الموافقة والرفض ({approve} مقابل {reject})، وكان صوت رئيس المجلس «{chairVoteLabel}»، لذلك أصبحت الحالة النهائية «{voteResultLabel(round.result)}».</span></div>}
  </section>;
}

function voteResultLabel(result?: string) {
  if (result === "approved") return "موافقة";
  if (result === "rejected") return "رفض";
  if (result === "no_votes") return "لم يصوّت أحد";
  return "تعادل";
}
