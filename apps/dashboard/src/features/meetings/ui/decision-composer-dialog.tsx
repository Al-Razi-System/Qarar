"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, FileCheck2, LoaderCircle, Scale, X } from "lucide-react";
import type { AgendaDiscussionItem, VotingRound } from "../model/live-meeting";

export function DecisionComposerDialog({ item, round, busy, onClose, onSubmit }: {
  item: AgendaDiscussionItem;
  round: VotingRound;
  busy: boolean;
  onClose: () => void;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const suggested = `اعتماد ما ورد في موضوع: ${item.topic?.title_ar ?? "الموضوع"}.`;
  const [text, setText] = useState(suggested);
  const valid = text.trim().length >= 10;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onClose]);

  async function submit() {
    if (!valid || busy) return;
    if (await onSubmit(text.trim())) onClose();
  }

  return <div className="fixed inset-0 z-[80] grid place-items-center bg-[#07162d]/70 p-4 backdrop-blur-md" role="dialog" aria-modal="true" aria-labelledby="decision-dialog-title">
    <div className="w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-white/20 bg-white shadow-[0_30px_90px_rgba(3,23,48,.35)]">
      <header className="relative overflow-hidden bg-gradient-to-l from-[#087ee5] via-[#0869bd] to-[#0a315f] px-6 py-5 text-white sm:px-7">
        <div className="absolute -left-12 -top-20 h-48 w-48 rounded-full border border-white/10" />
        <div className="relative flex items-start justify-between gap-4">
          <div className="flex items-center gap-3"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15"><Scale size={21} /></span><div><p className="text-[9px] font-black text-blue-100">توثيق المخرج النظامي للبند</p><h2 id="decision-dialog-title" className="mt-1 text-lg font-black">صياغة القرار المعتمد</h2><p className="mt-1 text-[10px] text-blue-100">تُحفظ الصياغة كسجل قرار مرتبط بنتيجة التصويت ومحضر الاجتماع.</p></div></div>
          <button type="button" onClick={onClose} disabled={busy} aria-label="إغلاق نافذة القرار" className="grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20 disabled:opacity-40"><X size={18} /></button>
        </div>
      </header>

      <div className="space-y-5 p-6 sm:p-7">
        <section className="space-y-3 rounded-2xl border border-[#dce8f2] bg-[#f7fbff] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[9px] font-black text-[#6f8498]">البند {item.agenda_order}</p><h3 className="mt-1 text-sm font-black leading-6 text-[#132b45]">{item.topic?.title_ar ?? "موضوع الاجتماع"}</h3></div><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-[9px] font-black text-emerald-700">النتيجة النهائية: موافقة</span></div>
          <div className="grid grid-cols-3 gap-2 text-center text-[9px] font-black"><div className="rounded-xl border border-emerald-100 bg-white p-2 text-emerald-700"><strong className="block text-base">{round.approve_count ?? 0}</strong>موافق</div><div className="rounded-xl border border-red-100 bg-white p-2 text-red-700"><strong className="block text-base">{round.reject_count ?? 0}</strong>غير موافق</div><div className="rounded-xl border border-slate-200 bg-white p-2 text-slate-600"><strong className="block text-base">{round.abstain_count ?? 0}</strong>ممتنع</div></div>
          {item.discussion_notes && <div className="rounded-xl bg-white p-3 text-[10px] leading-5 text-[#597086]"><strong className="text-[#29445f]">خلاصة المقرر:</strong> {item.discussion_notes}</div>}
        </section>

        <label className="block"><span className="flex items-center justify-between gap-3"><span className="text-[11px] font-black text-[#1e3852]">نص القرار</span><span className={`text-[9px] font-bold ${valid ? "text-emerald-600" : "text-amber-700"}`}>{text.trim().length} حرفًا · الحد الأدنى 10</span></span>
          <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} disabled={busy} placeholder="اكتب القرار بصياغة واضحة وقابلة للتنفيذ..." className="mt-2 min-h-44 w-full resize-y rounded-2xl border border-[#cadbea] bg-white p-4 text-xs leading-7 text-[#1d334b] outline-none transition focus:border-[#0877d6] focus:ring-4 focus:ring-blue-50 disabled:bg-[#f4f7fa]" />
        </label>

        <div className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50/70 p-3 text-[10px] leading-5 text-emerald-800"><CheckCircle2 size={15} className="mt-0.5 shrink-0" /><p><strong>مسار الاعتماد:</strong> سيُنشأ القرار بحالة جاهز للاعتماد، ويبقى مرتبطًا بالبند وجولة التصويت دون تغيير النتيجة المحتسبة.</p></div>
      </div>

      <footer className="flex flex-wrap justify-end gap-2 border-t border-[#e4ecf3] bg-[#fbfdff] px-6 py-4 sm:px-7">
        <button type="button" onClick={onClose} disabled={busy} className="rounded-xl border border-[#d5e1eb] bg-white px-5 py-2.5 text-[11px] font-black text-[#536b82] disabled:opacity-40">إلغاء</button>
        <button type="button" onClick={() => void submit()} disabled={!valid || busy} className="flex items-center gap-2 rounded-xl bg-[#0877d6] px-6 py-2.5 text-[11px] font-black text-white shadow-[0_8px_20px_rgba(8,119,214,.22)] transition hover:bg-[#0668bd] disabled:cursor-not-allowed disabled:bg-[#a8b8c7]">{busy ? <LoaderCircle size={15} className="animate-spin" /> : <FileCheck2 size={15} />}اعتماد الصياغة وإنشاء القرار</button>
      </footer>
    </div>
  </div>;
}
