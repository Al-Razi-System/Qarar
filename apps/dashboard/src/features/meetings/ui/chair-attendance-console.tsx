"use client";

import { Clock, Fingerprint, Lock, RefreshCw, UserCheck, Users } from "lucide-react";
import type { Attendance, LiveMeetingSession } from "../model/live-meeting";
import { AttendanceVerificationRow } from "./attendance-verification-row";

export function ChairAttendanceConsole({ session, busy, canLock, onOpenQr, onRefreshQuorum, onVerify, onLock }: {
  session: LiveMeetingSession;
  busy: boolean;
  canLock: boolean;
  onOpenQr: () => void;
  onRefreshQuorum: () => void;
  onVerify: (record: Attendance, status: "present" | "absent" | "excused") => void;
  onLock: () => void;
}) {
  const pendingClaims = session.attendance.filter((record) => record.verification_status === "pending_verification");
  const resolved = session.attendance.filter((record) => record.verification_status === "verified" || record.verification_status === "rejected");
  const unresolved = session.attendance.length - resolved.length;

  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-3"><Metric icon={UserCheck} label="حاضر معتمد" value={session.quorum?.present_members ?? 0} tone="emerald" /><Metric icon={Clock} label="بانتظار التحقق" value={pendingClaims.length} tone="blue" /><Metric icon={Users} label="إجمالي المدعوين" value={session.quorum?.eligible_members ?? session.attendance.length} tone="navy" /></section>
    <section className="overflow-hidden rounded-[1.6rem] border border-[#dce6ef] bg-white shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#e8eef4] bg-[#fbfdff] px-5 py-4 sm:px-6"><div><div className="flex items-center gap-2"><h2 className="text-base font-black text-[#0a1b35]">بوابة الحضور المباشر</h2>{session.checkin_session?.status === "active" && <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />مفتوحة</span>}</div><p className="mt-1 text-[11px] text-[#708399]">اعرض رمز QR، ثم راجع طلبات الأعضاء قبل {canLock ? "تثبيت السجل" : "رفع السجل للرئيس لاعتماده"}.</p></div><div className="flex flex-wrap gap-2"><button onClick={onRefreshQuorum} disabled={busy} title="إعادة حساب النصاب من السجل الحالي" className="flex h-10 items-center gap-2 rounded-xl border border-[#d0dce8] px-3 text-[11px] font-bold text-[#466079]"><RefreshCw size={15} />تحديث النصاب</button><button onClick={onOpenQr} disabled={busy || session.meeting.attendance_locked} title="إنشاء رمز حضور جديد وعرضه على شاشة القاعة" className="flex h-10 items-center gap-2 rounded-xl bg-[#0877d6] px-4 text-[11px] font-black text-white shadow-lg shadow-blue-900/10 disabled:bg-[#aab9c8]"><Fingerprint size={16} />عرض رمز QR</button></div></header>
      {pendingClaims.length > 0 && <div className="border-b border-blue-100 bg-blue-50/60 p-5 sm:p-6"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-black text-[#0b3359]">طلبات تحقق جديدة</h3><p className="mt-1 text-[10px] text-[#587895]">هؤلاء الأعضاء مسحوا الرمز وينتظرون اعتماد وجودهم.</p></div><span className="rounded-full bg-[#0877d6] px-2.5 py-1 text-[10px] font-black text-white">{pendingClaims.length}</span></div><div className="grid gap-2 lg:grid-cols-2">{pendingClaims.map((record) => <AttendanceVerificationRow key={record.id} record={record} busy={busy} isSelf={record.user_id === session.viewer.user_id} onVerify={onVerify} highlighted />)}</div></div>}
      <div className="p-5 sm:p-6"><div className="mb-3 flex items-center justify-between"><div><h3 className="text-sm font-black text-[#172a42]">سجل أعضاء الاجتماع</h3><p className="mt-1 text-[10px] text-[#7b8da0]">يمكن التصحيح اليدوي قبل تثبيت الحضور فقط، ولا يجوز للمستخدم اعتماد حضوره بنفسه.</p></div><span className="text-[10px] font-bold text-[#708399]">{resolved.length} محسوم · {unresolved} غير محسوم</span></div><div className="grid gap-2 lg:grid-cols-2">{session.attendance.filter((record) => record.verification_status !== "pending_verification").map((record) => <AttendanceVerificationRow key={record.id} record={record} busy={busy} isSelf={record.user_id === session.viewer.user_id} onVerify={onVerify} />)}</div></div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eef4] bg-[#f8fbfe] px-5 py-4 sm:px-6"><p className="max-w-2xl text-[10px] leading-5 text-[#657b91]">{canLock ? "تثبيت الحضور يغلق رمز QR ويمنع أي تعديل لاحق ويعتمد النصاب الذي ستُبنى عليه جولات التصويت." : "بصفتك مقرر المجلس يمكنك تشغيل الحضور والتحقق منه، بينما يعتمد رئيس المجلس السجل والنصاب نهائياً."}</p>{canLock ? <button onClick={onLock} disabled={busy || session.meeting.attendance_locked || unresolved > 0} title={unresolved > 0 ? "احسم جميع سجلات الحضور أولاً" : "قفل السجل واعتماد النصاب"} className="flex h-11 items-center gap-2 rounded-xl bg-[#0a1b35] px-5 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-[#aab5c1]"><Lock size={16} />{session.meeting.attendance_locked ? "تم تثبيت الحضور" : `تثبيت الحضور${unresolved ? ` (${unresolved} متبقٍ)` : ""}`}</button> : <span className={`rounded-xl px-4 py-2.5 text-[11px] font-black ${unresolved ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-700"}`}>{unresolved ? `متبقٍ ${unresolved} سجلات قبل الاعتماد` : "السجل جاهز لاعتماد الرئيس"}</span>}</footer>
    </section>
  </div>;
}

function Metric({ icon: Icon, label, value, tone }: { icon: typeof Users; label: string; value: number; tone: "emerald" | "blue" | "navy" }) { const style = { emerald: "bg-emerald-50 text-emerald-700", blue: "bg-blue-50 text-blue-700", navy: "bg-[#edf2f8] text-[#173653]" }[tone]; return <article className="flex items-center gap-3 rounded-2xl border border-[#dde7f0] bg-white p-4"><span className={`grid h-11 w-11 place-items-center rounded-xl ${style}`}><Icon size={20} /></span><div><strong className="block text-xl font-black text-[#0a1b35]">{value}</strong><span className="text-[10px] font-bold text-[#71859a]">{label}</span></div></article>; }
