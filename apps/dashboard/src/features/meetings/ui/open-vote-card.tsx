"use client";

import { useState } from "react";
import { CircleDot, MessageSquareText, ThumbsDown, ThumbsUp, Vote } from "lucide-react";
import type { MyVote } from "../model/live-meeting";

export type VoteValue = "approve" | "reject" | "abstain";

export function OpenVoteCard({ vote, busy, onCast }: {
  vote: MyVote;
  busy: boolean;
  onCast: (roundId: string, value: VoteValue, note: string | null) => void;
}) {
  const [note, setNote] = useState("");
  const cleanNote = note.trim();

  function cast(value: VoteValue) {
    onCast(vote.voting_round_id, value, cleanNote || null);
  }

  return <section className="overflow-hidden rounded-[1.6rem] border-2 border-[#0877d6] bg-white shadow-[0_16px_45px_rgba(8,119,214,.12)]">
    <header className="flex items-center gap-3 bg-gradient-to-l from-[#eaf5ff] to-white px-5 py-4">
      <span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0877d6] text-white"><Vote size={21} /></span>
      <div className="flex-1">
        <p className="text-[10px] font-black text-[#0877d6]">تصويت مفتوح لك الآن</p>
        <h2 className="mt-1 text-sm font-black text-[#0a1b35]">{vote.title_ar}</h2>
      </div>
      <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" />
    </header>
    <div className="space-y-3 p-4">
      <label className="block rounded-xl border border-[#d9e5ef] bg-[#f8fbfe] p-3">
        <span className="flex items-center gap-2 text-[10px] font-black text-[#31475e]"><MessageSquareText size={14} className="text-[#0877d6]" />ملاحظة مع التصويت <span className="font-bold text-[#8496a8]">(اختيارية)</span></span>
        <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} disabled={busy} placeholder="يمكنك توضيح سبب اختيارك أو تسجيل تحفظ مختصر..." className="mt-2 min-h-20 w-full resize-y rounded-lg border border-[#dce6ee] bg-white p-3 text-[11px] leading-5 text-[#243a52] outline-none focus:border-[#0877d6] focus:ring-2 focus:ring-blue-100 disabled:opacity-60" />
        <span className="mt-1 block text-left text-[9px] font-bold text-[#8a9bad]">{note.length}/2000</span>
      </label>
      <p className="text-[9px] font-bold text-[#718499]">اختر صوتك لتسجيله فوراً. لا يمكن التصويت مرتين في الجولة نفسها.</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <VoteButton label="موافق" icon={ThumbsUp} tone="emerald" onClick={() => cast("approve")} disabled={busy} />
        <VoteButton label="غير موافق" icon={ThumbsDown} tone="red" onClick={() => cast("reject")} disabled={busy} />
        <VoteButton label="ممتنع" icon={CircleDot} tone="slate" onClick={() => cast("abstain")} disabled={busy} />
      </div>
    </div>
  </section>;
}

function VoteButton({ label, icon: Icon, tone, onClick, disabled }: {
  label: string;
  icon: typeof Vote;
  tone: "emerald" | "red" | "slate";
  onClick: () => void;
  disabled: boolean;
}) {
  const style = {
    emerald: "bg-emerald-600 hover:bg-emerald-700",
    red: "bg-red-600 hover:bg-red-700",
    slate: "bg-[#526477] hover:bg-[#405163]",
  }[tone];
  return <button onClick={onClick} disabled={disabled} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-[11px] font-black text-white transition disabled:opacity-50 ${style}`}><Icon size={15} />{label}</button>;
}
