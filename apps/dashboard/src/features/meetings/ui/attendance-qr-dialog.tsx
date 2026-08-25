"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Copy, QrCode, RefreshCw, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import type { Attendance } from "../model/live-meeting";
import { AttendanceVerificationRow } from "./attendance-verification-row";

export function AttendanceQrDialog({ meetingId, token, expiresAt, publicOrigin, attendance, viewerUserId, busy, onVerify, onClose, onRenew }: {
  meetingId: string;
  token: string;
  expiresAt: string;
  publicOrigin?: string;
  attendance: Attendance[];
  viewerUserId: string;
  busy: boolean;
  onVerify: (record: Attendance, status: "present" | "absent" | "excused") => void;
  onClose: () => void;
  onRenew: () => void;
}) {
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);
  const checkInUrl = useMemo(() => {
    const url = new URL("/meetings/check-in", publicOrigin || window.location.origin);
    url.searchParams.set("meeting", meetingId);
    url.searchParams.set("token", token);
    return url.toString();
  }, [meetingId, publicOrigin, token]);
  const seconds = Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000));
  const minutesLabel = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const pendingClaims = attendance.filter((record) => record.verification_status === "pending_verification");

  useEffect(() => {
    const initial = window.setTimeout(() => setNow(Date.now()), 0);
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearTimeout(initial); window.clearInterval(timer); };
  }, []);

  async function copyLink() {
    await navigator.clipboard.writeText(checkInUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#07162c]/75 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="رمز تسجيل الحضور">
    <section className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[2rem] border border-white/20 bg-white shadow-2xl">
      <header className="flex items-start justify-between bg-gradient-to-l from-[#087ee5] via-[#086bc6] to-[#0a3267] px-6 py-5 text-white sm:px-8">
        <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-white/15"><QrCode size={24} /></span><div><h2 className="text-lg font-black">بوابة الحضور الآمن</h2><p className="mt-1 text-xs text-blue-100">اعرض الرمز على شاشة القاعة ليؤكد الأعضاء حضورهم من هواتفهم.</p></div></div>
        <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 transition hover:bg-white/20" aria-label="إغلاق"><X size={20} /></button>
      </header>
      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_0.8fr]">
        <div className="grid place-items-center rounded-[1.75rem] border border-[#dce8f4] bg-[radial-gradient(circle_at_top,#f2f8ff,#ffffff_70%)] p-6">
          <div className="rounded-3xl border-[10px] border-white bg-white p-3 shadow-[0_20px_60px_rgba(4,70,130,.16)]">
            <QRCodeSVG value={checkInUrl} size={280} level="H" marginSize={1} bgColor="#ffffff" fgColor="#071a35" />
          </div>
          <p className="mt-5 text-center text-xs font-bold text-[#334b67]">وجّه كاميرا الهاتف إلى الرمز، ثم افتح الرابط وسجّل الدخول بحساب العضو.</p>
        </div>
        <div className="flex flex-col justify-center">
          <span className={`mb-4 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black ${seconds ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}><span className="h-2 w-2 rounded-full bg-current" />{seconds ? "جلسة الحضور مفتوحة" : "انتهت صلاحية الرمز"}</span>
          <h3 className="text-2xl font-black leading-9 text-[#0a1b35]">مسح واحد، حضور موثّق، ومراجعة فورية.</h3>
          <div className="mt-6 rounded-2xl border border-[#e1e9f2] bg-[#f8fbfe] p-5"><p className="text-[11px] font-bold text-[#7890a8]">الوقت المتبقي</p><p dir="ltr" className="mt-1 font-mono text-4xl font-black tracking-wider text-[#086bc6]">{minutesLabel}</p><p className="mt-2 flex items-center gap-1.5 text-[10px] text-[#718399]"><Clock3 size={13} />يتوقف قبول الطلبات تلقائياً عند انتهاء المدة.</p></div>
          <div className="mt-5 grid gap-2"><button onClick={() => void copyLink()} className="flex items-center justify-center gap-2 rounded-xl bg-[#086bc6] px-4 py-3 text-xs font-black text-white shadow-lg shadow-blue-900/10">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "تم نسخ الرابط" : "نسخ رابط الحضور"}</button><button onClick={onRenew} className="flex items-center justify-center gap-2 rounded-xl border border-[#cddbeb] px-4 py-3 text-xs font-bold text-[#37536f]"><RefreshCw size={15} />إنشاء رمز جديد لمدة 15 دقيقة</button></div>
          <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-[10px] leading-5 text-amber-800">كل رمز جديد يلغي الرمز السابق فوراً. لا تُرسل الرمز خارج قاعة الاجتماع.</p>
        </div>
      </div>
      <section className="border-t border-[#dfe8f1] bg-[#f5faff] p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><h3 className="text-base font-black text-[#0a2744]">طلبات التحقق المباشرة</h3><span className="grid h-6 min-w-6 place-items-center rounded-full bg-[#0877d6] px-1.5 text-[10px] font-black text-white">{pendingClaims.length}</span></div><p className="mt-1 text-[10px] text-[#64809b]">تظهر الطلبات الجديدة هنا تلقائياً دون إغلاق نافذة الرمز.</p></div>
          <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-[10px] font-bold text-[#55738f] shadow-sm"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />تحديث حي كل 3 ثوانٍ</span>
        </div>
        {pendingClaims.length ? <div className="grid max-h-72 gap-2 overflow-y-auto pl-1 lg:grid-cols-2">{pendingClaims.map((record) => <AttendanceVerificationRow key={record.id} record={record} busy={busy} isSelf={record.user_id === viewerUserId} highlighted onVerify={onVerify} />)}</div> : <div className="rounded-2xl border border-dashed border-[#bcd3e8] bg-white/70 px-5 py-8 text-center"><p className="text-xs font-black text-[#36536f]">لا توجد طلبات بانتظار التحقق</p><p className="mt-1 text-[10px] text-[#7890a8]">ستظهر هنا فور مسح أحد المدعوين للرمز وإرسال طلب الحضور.</p></div>}
      </section>
    </section>
  </div>;
}
