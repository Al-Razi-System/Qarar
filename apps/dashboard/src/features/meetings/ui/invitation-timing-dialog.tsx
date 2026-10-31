"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Download, Send, X } from "lucide-react";
import { meetingRpc } from "../api/meetings-client";
import type { MeetingInvitationSummary } from "../model/meeting";
import { InlineMessage } from "@/shared/ui/inline-message";

export function InvitationTimingDialog({ meetingId, expectedUpdatedAt, startTime, endTime, invitationSummary, onClose, onSent }: {
  meetingId: string; expectedUpdatedAt: string; startTime?: string | null; endTime?: string | null;
  invitationSummary?: MeetingInvitationSummary;
  onClose: () => void; onSent: (queued: number) => void;
}) {
  const [start, setStart] = useState(startTime?.slice(0, 5) ?? "");
  const [end, setEnd] = useState(endTime?.slice(0, 5) ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [queued, setQueued] = useState<number | null>(null);
  const prepared = invitationSummary?.prepared === true;
  const busy = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (busy.current || queued !== null || prepared) return;
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
  const inputClass = "mt-2 min-h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary-soft";
  const validTiming = Boolean(start && end && end > start);
  const query = new URLSearchParams({ start, end }).toString();
  const previewUrl = `/api/admin/meetings/${encodeURIComponent(meetingId)}/invitation/image?${query}`;
  const pdfUrl = `/api/admin/meetings/${encodeURIComponent(meetingId)}/invitation/pdf?${query}`;
  return <div className="fixed inset-0 z-50 grid place-items-center bg-q-text/50 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="invitation-title">
    <form onSubmit={submit} className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-q-card bg-q-surface p-5 shadow-xl sm:p-7">
      <header className="flex items-start justify-between gap-3"><div><h2 id="invitation-title" className="text-q-h2 font-black text-q-text">موعد الاجتماع والدعوات</h2><p className="mt-2 text-q-ui leading-7 text-q-text-2">حدد الوقت المخطط لعرضه في الدعوة. هذا ليس وقت فتح الجلسة الفعلي.</p></div><button type="button" aria-label="إغلاق" disabled={saving} onClick={onClose} className="rounded-q-control p-2 text-q-text-2 hover:bg-q-surface-2 disabled:opacity-50"><X size={20} /></button></header>
      <div className="mt-5 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="overflow-hidden rounded-q-card border border-q-border bg-q-surface-2">
          <div className="flex items-center justify-between gap-3 border-b border-q-border px-4 py-3"><div><p className="m-0 text-q-ui font-bold text-q-text">معاينة الدعوة الرسمية</p><p className="m-0 mt-1 text-q-caption text-q-text-2">هذه الصورة نفسها ترسل عبر واتساب وتستخدم داخل ملف PDF.</p></div>{validTiming && <a href={pdfUrl} className="inline-flex min-h-11 items-center gap-2 rounded-q-control border border-q-border bg-q-surface px-4 text-q-ui font-bold text-q-link"><Download size={17} />تنزيل PDF</a>}</div>
          <div className="relative mx-auto aspect-[4/5] w-full max-w-xl bg-q-surface p-3">{validTiming ? <Image key={previewUrl} src={previewUrl} alt="معاينة دعوة الاجتماع" fill unoptimized className="object-contain p-3" /> : <div className="grid h-full place-items-center px-8 text-center text-q-ui text-q-text-2">أدخل وقت بداية ونهاية صحيحين لعرض الدعوة قبل إرسالها.</div>}</div>
        </div>
        <div>
          <fieldset disabled={saving || queued !== null || prepared} className="grid gap-4">
            <label className="text-q-ui font-bold text-q-text">وقت البداية<input required type="time" value={start} onChange={(event) => setStart(event.target.value)} className={inputClass} /></label>
            <label className="text-q-ui font-bold text-q-text">وقت النهاية<input required type="time" value={end} onChange={(event) => setEnd(event.target.value)} className={inputClass} /></label>
          </fieldset>
          <div className="mt-5 rounded-q-control border border-q-border bg-q-surface-2 p-4 text-q-caption leading-6 text-q-text-2">راجع الموعد والمكان وجدول الأعمال في المعاينة. عند التجهيز، تُنشأ دعوة مستقلة لكل عضو وتظهر نتيجة الإرسال في سجل الإشعارات.</div>
        </div>
      </div>
      {!validTiming && start && end && <p role="alert" className="mt-4 rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-ui text-q-danger">يجب أن يكون وقت النهاية بعد البداية.</p>}
      {error && <p role="alert" className="mt-4 rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-ui text-q-danger">{error}</p>}
      {prepared && invitationSummary && <InvitationStatus summary={invitationSummary} className="mt-4"/>}
      {!prepared && queued !== null && <InlineMessage tone="success" className="mt-4">تم حفظ الوقت وتجهيز الدعوات في قائمة الإرسال ({queued} دعوة جديدة). لا يعني ذلك تأكيد وصولها.</InlineMessage>}
      <footer className="mt-5 flex flex-wrap justify-end gap-3"><button type="button" disabled={saving} onClick={onClose} className="min-h-11 rounded-q-control border border-q-border px-4 text-q-ui">{queued !== null || prepared ? "تم" : "إلغاء"}</button>{queued === null && !prepared && <button disabled={saving || !validTiming} className="inline-flex min-h-11 items-center gap-2 rounded-q-control bg-q-primary px-4 text-q-ui font-bold text-q-on-primary disabled:opacity-50"><Send size={17} />{saving ? "جارٍ تجهيز الدعوات…" : "حفظ الوقت وتجهيز الدعوات"}</button>}</footer>
    </form>
  </div>;
}

export function InvitationStatus({ summary, className = "" }: { summary: MeetingInvitationSummary; className?: string }) {
  if (summary.failed_count > 0) return <InlineMessage tone="error" className={className}>تم تجهيز {summary.requested_count} دعوات، لكن تعذر تسليم {summary.failed_count} دعوات. راجع سجل إشعارات واتساب لمعالجة سبب الإرسال.</InlineMessage>;
  if (summary.pending_count > 0) return <InlineMessage tone="warning" className={className}>تم تجهيز {summary.requested_count} دعوات، وما زالت {summary.pending_count} منها في قائمة الإرسال.</InlineMessage>;
  return <InlineMessage tone="success" className={className}>تم تجهيز {summary.requested_count} دعوات{summary.delivered_count > 0 ? `، وتأكد وصول ${summary.delivered_count} منها` : ""}.</InlineMessage>;
}
