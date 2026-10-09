"use client";

import { useRef, useState } from "react";
import { X } from "lucide-react";
import { meetingRpc } from "../api/meetings-client";

export function InvitationTimingDialog({ meetingId, expectedUpdatedAt, startTime, endTime, onClose, onSent }: {
  meetingId: string; expectedUpdatedAt: string; startTime?: string | null; endTime?: string | null;
  onClose: () => void; onSent: (queued: number) => void;
}) {
  const [start, setStart] = useState(startTime?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(endTime?.slice(0, 5) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState<number | null>(null);
  const busy = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy.current || queued !== null) return;
    setError("");
    if (!start || !end || end <= start) { setError("حدد الوقتين؛ يجب أن تكون النهاية بعد البداية."); return; }
    busy.current = true; setSaving(true);
    try {
      const result = await meetingRpc<{ queued: number }>("send_meeting_invitations_v2", {
        p_meeting_id: meetingId, p_start_time: start, p_end_time: end, p_expected_updated_at: expectedUpdatedAt,
      });
      if (!result || !Number.isInteger(result.queued) || result.queued < 0) throw new Error("تعذر تأكيد تجهيز الدعوات. حدّث الاجتماع للتحقق من حالته.");
      setQueued(result.queued); onSent(result.queued);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تجهيز الدعوات. حاول مجددًا."); }
    finally { busy.current = false; setSaving(false); }
  }
  const inputClass = "mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100";
  return <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="invitation-title">
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl sm:p-7">
      <header className="flex items-start justify-between gap-3"><div><h2 id="invitation-title" className="text-lg font-black text-slate-900">موعد الاجتماع والدعوات</h2><p className="mt-2 text-sm leading-7 text-slate-500">حدد الوقت المخطط لعرضه في الدعوة. هذا ليس وقت فتح الجلسة الفعلي.</p></div><button type="button" aria-label="إغلاق" disabled={saving} onClick={onClose} className="rounded-xl p-2 disabled:opacity-50"><X size={20} /></button></header>
      <fieldset disabled={saving || queued !== null} className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">وقت البداية<input required type="time" value={start} onChange={(event) => setStart(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-bold text-slate-700">وقت النهاية<input required type="time" value={end} onChange={(event) => setEnd(event.target.value)} className={inputClass} /></label>
      </fieldset>
      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {queued !== null && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">تم حفظ الوقت وتجهيز الدعوات في قائمة الإرسال ({queued} دعوة جديدة). لا يعني ذلك تأكيد وصولها.</p>}
      <footer className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-xl border px-4 text-sm">{queued !== null ? "تم" : "إلغاء"}</button>{queued === null && <button disabled={saving} className="min-h-11 rounded-xl bg-[#0872df] px-4 text-sm font-bold text-white disabled:opacity-50">{saving ? "جارٍ تجهيز الدعوات…" : "حفظ الوقت وتجهيز الدعوات"}</button>}</footer>
    </form>
  </div>;
}
