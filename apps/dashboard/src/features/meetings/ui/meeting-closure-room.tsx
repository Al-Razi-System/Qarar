"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowRight, Check, CheckCircle2, FileSignature, LoaderCircle, PenLine, Radio, RefreshCw, Send } from "lucide-react";
import { meetingRpc } from "../api/meetings-client";
import type { MeetingDetail, MeetingMinutes, MinuteApproval, SignatureStrokes } from "../model/meeting";
import { MeetingMinutesWorkspace } from "./meeting-minutes-workspace";

type Notice = { kind: "success" | "error"; text: string };

export function MeetingClosureRoom({ meetingId }: { meetingId: string }) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const dirtyRef = useRef(false);
  const refresh = useEffectEvent((silent = false, forceText = false) => load(silent, forceText));

  useEffect(() => { void refresh(false, true); }, [meetingId]);

  useEffect(() => {
    const intervalMs = meeting?.status === "waiting_for_approval" ? 3_000 : meeting?.status === "waiting_for_minutes" ? 8_000 : 15_000;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !busy) void refresh(true, false);
    }, intervalMs);
    const refreshVisible = () => {
      if (document.visibilityState === "visible" && !busy) void refresh(true, false);
    };
    window.addEventListener("focus", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [busy, meeting?.status]);

  async function load(silent = false, forceText = false) {
    if (!silent) setLoading(true);
    try {
      const [detail, minute] = await Promise.all([
        meetingRpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId }),
        meetingRpc<MeetingMinutes>("get_meeting_minutes", { p_meeting_id: meetingId }),
      ]);
      setMeeting(detail);
      setMinutes(minute);
      if (forceText || !dirtyRef.current || detail.status !== "waiting_for_minutes") {
        setText(minute?.content_final ?? minute?.content_draft ?? "");
        dirtyRef.current = false;
      }
      setLastUpdatedAt(new Date());
    } catch (error) {
      if (!silent) setNotice({ kind: "error", text: messageOf(error, "تعذر تحميل مساحة المحضر.") });
    } finally { if (!silent) setLoading(false); }
  }

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true); setNotice(null);
    try {
      await action();
      await load(true, true);
      setNotice({ kind: "success", text: success });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: messageOf(error, "تعذر تنفيذ العملية.") });
      return false;
    } finally { setBusy(false); }
  }

  async function sign(approval: MinuteApproval, signature: SignatureStrokes) {
    const ok = await perform(() => meetingRpc("sign_meeting_minutes_approval", { p_approval_id: approval.id, p_signature_strokes: signature, p_expected_updated_at: approval.updated_at }), "حُفظ توقيعك وربط ببصمة النسخة النهائية.");
    if (!ok) throw new Error("تعذر حفظ التوقيع.");
  }

  async function returnForRevision(approval: MinuteApproval, reason: string) {
    const ok = await perform(() => meetingRpc("respond_meeting_minutes_approval", { p_approval_id: approval.id, p_decision: "return", p_notes: reason, p_expected_updated_at: approval.updated_at }), "أُعيد المحضر إلى المقرر مع الملاحظة المسجلة.");
    if (!ok) throw new Error("تعذر إعادة المحضر.");
  }

  if (loading && !meeting) return <div className="grid min-h-[520px] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-[#0877d6]" size={34} /><p className="mt-3 text-xs font-bold text-[#718399]">جارٍ تجهيز مساحة المحضر...</p></div></div>;
  if (!meeting) return <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-bold text-red-800">تعذر فتح الاجتماع أو أنك لا تملك صلاحية الاطلاع على محضره.</div>;

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/admin/meetings" className="flex items-center gap-2 rounded-xl border border-[#d6e2ec] bg-white px-4 py-2.5 text-[11px] font-black text-[#526a81] transition hover:border-[#9bc7e9] hover:text-[#0877d6]"><ArrowRight size={15} />العودة إلى الاجتماعات</Link><div className="flex items-center gap-2"><span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-[9px] font-black text-emerald-700"><Radio size={12} className="animate-pulse" />تحديث حي{lastUpdatedAt ? ` · ${formatTime(lastUpdatedAt)}` : ""}</span><button type="button" onClick={() => void load(false, false)} disabled={loading || busy} title="تحديث الآن" className="grid h-8 w-8 place-items-center rounded-full border border-[#d6e2ec] bg-white text-[#587087] transition hover:text-[#0877d6] disabled:opacity-40"><RefreshCw size={13} className={loading ? "animate-spin" : ""} /></button><span className="rounded-full bg-[#edf6ff] px-3 py-1.5 text-[10px] font-black text-[#0877d6]">{meeting.meeting_no ?? "اجتماع"}</span></div></div>

    {notice && <div className={`flex items-start gap-2 rounded-xl border p-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`} role="status">{notice.kind === "success" ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}{notice.text}</div>}

    <section className="relative overflow-hidden rounded-[1.8rem] bg-gradient-to-l from-[#087ee5] via-[#0869bd] to-[#092b58] p-6 text-white shadow-[0_18px_55px_rgba(6,54,104,.18)] sm:p-7"><div className="absolute -left-14 -top-20 h-56 w-56 rounded-full border border-white/10" /><div className="relative flex flex-wrap items-center justify-between gap-5"><div className="flex items-center gap-4"><span className="grid h-14 w-14 place-items-center rounded-2xl bg-white/12"><FileSignature size={27} /></span><div><p className="text-[10px] font-black text-blue-100">مرحلة التوثيق الختامي</p><h1 className="mt-1 text-xl font-black sm:text-2xl">{meeting.title_ar}</h1><p className="mt-1 text-xs text-blue-100">إعداد المحضر، تثبيت النسخة النهائية، ثم مصادقة جميع الحاضرين.</p></div></div><ClosureProgress status={meeting.status} /></div></section>

    <MeetingMinutesWorkspace meeting={meeting} minutes={minutes} text={text} loading={loading || busy} onTextChange={(value) => { dirtyRef.current = true; setText(value); }}
      onGenerate={() => void perform(() => meetingRpc("generate_meeting_minutes_draft", { p_meeting_id: meeting.id }), "جُهزت مسودة منظمة من بيانات الجلسة.")}
      onSave={() => void perform(() => meetingRpc("save_meeting_minutes_draft", { p_meeting_id: meeting.id, p_content: text, p_expected_updated_at: minutes?.updated_at ?? null }), "حُفظت مسودة المحضر بنجاح.")}
      onSubmit={() => void perform(() => meetingRpc("submit_meeting_minutes", { p_meeting_id: meeting.id, p_content_final: text, p_expected_updated_at: minutes?.updated_at ?? null }), "ثُبتت النسخة النهائية وأُرسلت إلى جميع الحاضرين للمصادقة.")}
      onSign={sign} onReturn={returnForRevision} />
  </div>;
}

function ClosureProgress({ status }: { status: string }) {
  const current = status === "closed" ? 3 : status === "waiting_for_approval" ? 2 : 1;
  const steps = [{ label: "إعداد المسودة", icon: PenLine }, { label: "مصادقات الحاضرين", icon: Send }, { label: "اعتماد وإغلاق", icon: CheckCircle2 }];
  return <div className="flex min-w-[280px] items-center gap-1 rounded-2xl border border-white/15 bg-white/10 p-2 backdrop-blur">{steps.map((step, index) => { const complete = index + 1 < current; const active = index + 1 === current; const Icon = step.icon; return <div key={step.label} className={`flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-[9px] font-black ${active ? "bg-white text-[#0869bd]" : complete ? "text-emerald-200" : "text-blue-100"}`}><Icon size={13} />{step.label}</div>; })}</div>;
}

function messageOf(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback; }
function formatTime(value: Date) { return new Intl.DateTimeFormat("ar-SA", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(value); }
