"use client";
import { Dialog } from "@/shared/ui/dialog";
import { Card } from "@/shared/ui/card";

import { Button } from "@/shared/ui/button";

import { useEffect, useMemo, useState } from "react";
import { Check, Clock3, Copy, RefreshCw } from "lucide-react";
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

  return <Dialog title="بوابة الحضور الآمن" description="اعرض الرمز على شاشة القاعة ليؤكد الأعضاء حضورهم من هواتفهم." size="xl" scrollContent onClose={onClose}>

      <div className="grid gap-6 p-6 sm:p-8 lg:grid-cols-[1fr_0.8fr]">
        <div className="grid place-items-center rounded-q-card border border-q-border bg-q-surface-2 p-6">
          <Card className="rounded-q-card border-[10px] border-q-border bg-q-surface p-3 ">
            <QRCodeSVG value={checkInUrl} size={280} level="H" marginSize={1} bgColor="var(--q-surface)" fgColor="var(--q-text)" />
          </Card>
          <p className="mt-5 text-center text-q-caption font-bold text-q-text-2">وجّه كاميرا الهاتف إلى الرمز، ثم افتح الرابط وسجّل الدخول بحساب العضو.</p>
        </div>
        <div className="flex flex-col justify-center">
          <span className={`mb-4 inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-q-caption font-bold ${seconds ? "bg-q-success-soft text-q-success" : "bg-q-danger-soft text-q-danger"}`}><span className="h-2 w-2 rounded-full bg-current" />{seconds ? "جلسة الحضور مفتوحة" : "انتهت صلاحية الرمز"}</span>
          <h3 className="text-q-h2 font-bold leading-9 text-q-text">مسح واحد، حضور موثّق، ومراجعة فورية.</h3>
          <Card className="mt-6 rounded-q-card border border-q-border bg-q-bg p-5"><p className="text-q-caption font-bold text-q-text-2">الوقت المتبقي</p><p dir="ltr" className="mt-1 font-mono text-q-h1 font-bold tracking-wider text-q-text-2">{minutesLabel}</p><p className="mt-2 flex items-center gap-1.5 text-q-caption text-q-text-3"><Clock3 size={13} />يتوقف قبول الطلبات تلقائياً عند انتهاء المدة.</p></Card>
          <div className="mt-5 grid gap-2"><Button variant="primary" type="submit" onClick={() => void copyLink()} className="flex items-center justify-center gap-2 rounded-q-control px-4 py-3 font-bold ">{copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "تم نسخ الرابط" : "نسخ رابط الحضور"}</Button><Button variant="secondary" type="submit" onClick={onRenew} className="flex items-center justify-center gap-2 rounded-q-control border px-4 py-3 font-bold "><RefreshCw size={15} />إنشاء رمز جديد لمدة 15 دقيقة</Button></div>
          <p className="mt-4 rounded-q-control bg-q-warning-soft px-4 py-3 text-q-caption leading-5 text-q-warning">كل رمز جديد يلغي الرمز السابق فوراً. لا تُرسل الرمز خارج قاعة الاجتماع.</p>
        </div>
      </div>
      <section className="border-t border-q-border bg-q-surface-2 p-6 sm:p-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><div className="flex items-center gap-2"><h3 className="text-q-body font-bold text-q-text">طلبات التحقق المباشرة</h3><span className="grid h-6 min-w-6 place-items-center rounded-full bg-q-primary px-1.5 text-q-caption font-bold text-q-on-primary">{pendingClaims.length}</span></div><p className="mt-1 text-q-caption text-q-text-2">تظهر الطلبات الجديدة هنا تلقائياً دون إغلاق نافذة الرمز.</p></div>
          <span className="inline-flex items-center gap-2 rounded-full bg-q-surface px-3 py-2 text-q-caption font-bold text-q-link "><span className="h-2 w-2 animate-pulse rounded-full bg-q-success-soft" />تحديث حي كل 3 ثوانٍ</span>
        </div>
        {pendingClaims.length ? <div className="grid max-h-72 gap-2 overflow-y-auto pl-1 lg:grid-cols-2">{pendingClaims.map((record) => <AttendanceVerificationRow key={record.id} record={record} busy={busy} isSelf={record.user_id === viewerUserId} highlighted onVerify={onVerify} />)}</div> : <Card className="rounded-q-card border border-dashed border-q-primary bg-q-surface/70 px-5 py-8 text-center"><p className="text-q-caption font-bold text-q-text-2">لا توجد طلبات بانتظار التحقق</p><p className="mt-1 text-q-caption text-q-text-2">ستظهر هنا فور مسح أحد المدعوين للرمز وإرسال طلب الحضور.</p></Card>}
      </section>
  </Dialog>;
}
