"use client";

import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
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
  const locked = session.meeting.attendance_locked;

  return (
    <div className="flex flex-col gap-4 font-sans text-q-text">
      <dl className="m-0 grid gap-3 sm:grid-cols-3">
        <Metric label="حاضر معتمد" value={session.quorum?.present_members ?? 0} />
        <Metric label="بانتظار التحقق" value={pendingClaims.length} />
        <Metric label="إجمالي المدعوين" value={session.quorum?.eligible_members ?? session.attendance.length} />
      </dl>
      <Card className="flex flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="m-0 text-q-h3 font-bold">بوابة الحضور المباشر</h2>
              {session.checkin_session?.status === "active" && <Badge tone="success">مفتوحة</Badge>}
              {locked && <Badge tone="neutral">السجل مثبّت</Badge>}
            </div>
            <p className="m-0 mt-1 text-q-caption text-q-text-2">اعرض رمز الحضور، ثم راجع طلبات الأعضاء قبل {canLock ? "تثبيت السجل" : "رفع السجل للرئيس لاعتماده"}.</p>
          </div>
          <div className="flex flex-col items-start gap-1">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={onRefreshQuorum} disabled={busy}>تحديث النصاب</Button>
              <Button onClick={onOpenQr} disabled={busy || locked}>عرض رمز QR</Button>
            </div>
            {locked && <span className="text-q-caption text-q-text-2">ثُبّت سجل الحضور، فلا يُصدر رمز جديد.</span>}
          </div>
        </header>

        {pendingClaims.length > 0 && (
          <section aria-label="طلبات تحقق جديدة" className="flex flex-col gap-3 rounded-q-card bg-q-surface-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="m-0 text-q-ui font-bold">طلبات تحقق جديدة</h3>
                <p className="m-0 text-q-caption text-q-text-2">هؤلاء الأعضاء مسحوا الرمز وينتظرون اعتماد وجودهم.</p>
              </div>
              <Badge tone="info">{pendingClaims.length}</Badge>
            </div>
            <div className="grid gap-2 lg:grid-cols-2">{pendingClaims.map((record) => <AttendanceVerificationRow key={record.id} record={record} busy={busy} isSelf={record.user_id === session.viewer.user_id} onVerify={onVerify} highlighted />)}</div>
          </section>
        )}

        <section aria-label="سجل أعضاء الاجتماع" className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="m-0 text-q-ui font-bold">سجل أعضاء الاجتماع</h3>
              <p className="m-0 text-q-caption text-q-text-2">يمكن التصحيح اليدوي قبل تثبيت الحضور فقط، ولا يجوز للمستخدم اعتماد حضوره بنفسه.</p>
            </div>
            <span className="text-q-caption font-bold text-q-text-2">{resolved.length} محسوم · {unresolved} غير محسوم</span>
          </div>
          <div className="grid gap-2 lg:grid-cols-2">{session.attendance.filter((record) => record.verification_status !== "pending_verification").map((record) => <AttendanceVerificationRow key={record.id} record={record} busy={busy} isSelf={record.user_id === session.viewer.user_id} onVerify={onVerify} />)}</div>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-q-border pt-4">
          <p className="m-0 max-w-2xl text-q-caption text-q-text-2">{canLock ? "تثبيت الحضور يغلق رمز الحضور ويمنع أي تعديل لاحق ويعتمد النصاب الذي ستُبنى عليه جولات التصويت." : "بصفتك مقرر المجلس يمكنك تشغيل الحضور والتحقق منه، بينما يعتمد رئيس المجلس السجل والنصاب نهائياً."}</p>
          {canLock ? (
            <div className="flex flex-col items-start gap-1">
              <Button onClick={onLock} disabled={busy || locked || unresolved > 0}>{locked ? "تم تثبيت الحضور" : `تثبيت الحضور${unresolved ? ` (${unresolved} متبقٍ)` : ""}`}</Button>
              {!locked && unresolved > 0 && <span className="text-q-caption text-q-text-2">احسم جميع سجلات الحضور أولاً.</span>}
            </div>
          ) : (
            <Badge tone={unresolved ? "warning" : "success"}>{unresolved ? `متبقٍ ${unresolved} سجلات قبل الاعتماد` : "السجل جاهز لاعتماد الرئيس"}</Badge>
          )}
        </footer>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-q-card border border-q-border bg-q-surface p-4">
      <dd className="m-0 text-q-h2 font-bold tabular-nums">{value}</dd>
      <dt className="text-q-caption font-bold text-q-text-2">{label}</dt>
    </div>
  );
}
