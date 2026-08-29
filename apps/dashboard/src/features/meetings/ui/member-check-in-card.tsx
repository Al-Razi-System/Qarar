"use client";

import { FormEvent, useState } from "react";
import { AlertCircle, Camera, CheckCircle2, Fingerprint, KeyRound, LoaderCircle, ScanLine } from "lucide-react";
import type { Attendance } from "../model/live-meeting";
import { tokenForMeeting } from "../model/check-in-token";
import { liveMeetingRpc } from "../api/live-meeting-client";
import { QrCheckInScanner } from "./qr-check-in-scanner";

export function MemberCheckInCard({ meetingId, attendance, canCheckIn, compact = false, onCompleted }: {
  meetingId: string;
  attendance: Attendance | null;
  canCheckIn: boolean;
  compact?: boolean;
  onCompleted: (message: string) => Promise<void>;
}) {
  const [tokenInput, setTokenInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitted = attendance?.verification_status === "pending_verification";
  const verified = attendance?.verification_status === "verified";

  async function checkIn(rawValue: string) {
    setBusy(true);
    setError(null);
    try {
      const token = tokenForMeeting(rawValue, meetingId);
      await liveMeetingRpc("self_check_in", {
        p_meeting_id: meetingId,
        p_token: token,
        p_device_label: "live-member-room",
      });
      setTokenInput("");
      setScannerOpen(false);
      await onCompleted("أُرسل طلب حضورك للتحقق من رئيس المجلس أو المقرر.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "تعذر تسجيل حضورك.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    await checkIn(tokenInput);
  }

  if (verified) return <section className={`overflow-hidden rounded-[1.6rem] border border-emerald-200 bg-emerald-50 ${compact ? "p-4" : "p-6"}`}><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-900/10"><CheckCircle2 size={24} /></span><div><p className="text-[10px] font-black text-emerald-700">حضورك معتمد</p><h2 className="mt-1 text-sm font-black text-[#0a2630]">تم التحقق من وجودك في الجلسة</h2><p className="mt-1 text-[10px] text-emerald-800">يُحتسب حضورك الآن ضمن النصاب.</p></div></div></section>;
  if (submitted) return <section className={`rounded-[1.6rem] border border-blue-200 bg-blue-50 ${compact ? "p-4" : "p-6"}`}><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0877d6] text-white"><LoaderCircle className="animate-spin" size={23} /></span><div><p className="text-[10px] font-black text-blue-700">تم استلام طلب حضورك</p><h2 className="mt-1 text-sm font-black text-[#0b2945]">بانتظار تحقق الطرف المخوّل</h2><p className="mt-1 text-[10px] text-[#50708e]">لا يمكنك اعتماد حضورك بنفسك، وستتحدث الحالة تلقائياً.</p></div></div></section>;

  return <>
    <section className="overflow-hidden rounded-[1.6rem] border border-[#dbe6f1] bg-white shadow-sm">
      <div className={`bg-gradient-to-l from-[#eef7ff] to-white ${compact ? "p-4" : "p-6"}`}><div className="flex items-center gap-4"><span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0877d6] text-white"><ScanLine size={24} /></span><div><p className="text-[10px] font-black text-[#0877d6]">إثبات حضورك الشخصي</p><h2 className="mt-1 text-sm font-black text-[#0a1b35]">امسح الرمز المعروض في القاعة</h2><p className="mt-1 text-[10px] leading-5 text-[#6b7f95]">ينطبق ذلك على العضو ورئيس المجلس والمقرر دون احتساب تلقائي.</p></div></div></div>
      <form onSubmit={submit} className={compact ? "p-4" : "p-6"}>
        <button type="button" onClick={() => { setError(null); setScannerOpen(true); }} disabled={!canCheckIn || busy} className="mb-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-l from-[#087ee5] to-[#0767b9] text-xs font-black text-white shadow-lg shadow-blue-900/10 disabled:cursor-not-allowed disabled:bg-none disabled:bg-[#aab9c8]"><Camera size={18} />فتح الكاميرا ومسح رمز الحضور</button>
        <div className="flex gap-2"><div className="relative flex-1"><KeyRound className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8aa0b7]" size={17} /><input dir="ltr" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} disabled={!canCheckIn || busy} placeholder="أو الصق رابط QR أو الرمز" className="h-12 w-full rounded-xl border border-[#cfdce9] pr-10 pl-3 font-mono text-xs outline-none focus:border-[#0877d6]" /></div><button disabled={!canCheckIn || busy || tokenInput.trim().length < 20} className="flex h-12 items-center gap-2 rounded-xl border border-[#b9d8f4] bg-[#eef7ff] px-4 text-xs font-black text-[#0870ca] disabled:cursor-not-allowed disabled:opacity-45"><Fingerprint size={17} />تأكيد</button></div>
        {error && <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] font-bold leading-5 text-red-800"><AlertCircle className="mt-0.5 shrink-0" size={15} />{error}</div>}
        {!canCheckIn && <p className="mt-3 text-[10px] font-bold text-amber-700">تسجيل الحضور مغلق حالياً، أو ثُبّت سجل الاجتماع.</p>}
      </form>
    </section>
    {scannerOpen && <QrCheckInScanner onClose={() => setScannerOpen(false)} onDetected={(value) => void checkIn(value)} />}
  </>;
}
