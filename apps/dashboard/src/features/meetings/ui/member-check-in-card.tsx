"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { cn } from "@/shared/lib/utils";
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
      const message = caught instanceof Error ? caught.message : "تعذر تسجيل حضورك.";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await checkIn(tokenInput);
    } catch {
      // The manual form renders the failure next to the submitted action.
    }
  }

  const padding = compact ? "p-4" : "p-5";

  if (verified) return (
    <Card role="status" className={cn("border-q-success bg-q-success-soft font-sans", padding)}>
      <p className="m-0 text-q-caption font-bold text-q-success">حضورك معتمد</p>
      <h2 className="m-0 mt-1 text-q-h3 font-bold">تم التحقق من وجودك في الجلسة</h2>
      <p className="m-0 mt-1 text-q-ui text-q-text-2">يُحتسب حضورك الآن ضمن النصاب.</p>
    </Card>
  );
  if (submitted) return (
    <Card role="status" className={cn("bg-q-surface-2 font-sans", padding)}>
      <p className="m-0 text-q-caption font-bold text-q-link">تم استلام طلب حضورك</p>
      <h2 className="m-0 mt-1 text-q-h3 font-bold">بانتظار تحقق الطرف المخوّل</h2>
      <p className="m-0 mt-1 text-q-ui text-q-text-2">لا يمكنك اعتماد حضورك بنفسك، وستتحدث الحالة تلقائياً.</p>
    </Card>
  );

  return <>
    <Card className={cn("flex flex-col gap-4 font-sans", padding)}>
      <div>
        <p className="m-0 text-q-caption font-bold text-q-link">إثبات حضورك الشخصي</p>
        <h2 className="m-0 mt-1 text-q-h3 font-bold">امسح الرمز المعروض في القاعة</h2>
        <p className="m-0 mt-1 text-q-caption text-q-text-2">ينطبق ذلك على العضو ورئيس المجلس والمقرر دون احتساب تلقائي.</p>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Button size="lg" block onClick={() => { setError(null); setScannerOpen(true); }} disabled={!canCheckIn || busy}>فتح الكاميرا ومسح رمز الحضور</Button>
        <div className="flex flex-wrap gap-2">
          <input dir="ltr" aria-label="رابط رمز الحضور أو الرمز" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} disabled={!canCheckIn || busy} placeholder="أو الصق رابط QR أو الرمز" className="min-h-11 min-w-0 flex-1 rounded-q-control border border-q-border-strong bg-q-surface px-3 font-mono text-q-ui text-q-text outline-none placeholder:font-sans placeholder:text-q-text-3 focus:border-q-primary focus:ring-2 focus:ring-q-focus disabled:cursor-not-allowed disabled:bg-q-neutral-soft" />
          <Button type="submit" variant="secondary" disabled={!canCheckIn || tokenInput.trim().length < 20} pending={busy} pendingLabel="جارٍ التسجيل…">تأكيد</Button>
        </div>
        {error && <InlineMessage tone="error">{error}</InlineMessage>}
        {!canCheckIn && <InlineMessage tone="info">تسجيل الحضور مغلق حالياً، أو ثُبّت سجل الاجتماع.</InlineMessage>}
      </form>
    </Card>
    {scannerOpen && <QrCheckInScanner onClose={() => setScannerOpen(false)} onDetected={checkIn} />}
  </>;
}
