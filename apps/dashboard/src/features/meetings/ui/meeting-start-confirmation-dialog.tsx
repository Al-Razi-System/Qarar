"use client";

import { AlertTriangle, CalendarClock } from "lucide-react";
import type { MeetingStartTiming } from "../model/meeting";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";

function durationLabel(totalMinutes: number) {
  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const hoursLabel = hours === 1 ? "ساعة" : hours === 2 ? "ساعتان" : `${hours} ساعات`;
  if (hours && remainder) return `${hoursLabel} و${remainder} دقيقة`;
  if (hours) return hours === 1 ? "ساعة واحدة" : hoursLabel;
  return `${minutes} دقيقة`;
}

function dateTimeLabel(value: string | null | undefined, timezone: string) {
  if (!value) return "غير محدد";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "غير محدد";
  return new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(date);
}

export function meetingStartWarning(timing: MeetingStartTiming) {
  const difference = durationLabel(timing.difference_minutes);
  return timing.timing_status === "early"
    ? `لم يحن الموعد بعد؛ بقي على بداية الاجتماع ${difference}.`
    : `انتهى الوقت المحدد للاجتماع منذ ${difference}.`;
}

type Props = {
  timing: MeetingStartTiming;
  pending: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function MeetingStartConfirmationDialog({ timing, pending, error, onClose, onConfirm }: Props) {
  const canConfirm = timing.can_confirm_off_schedule;
  return (
    <Dialog
      title="تأكيد فتح الجلسة خارج الموعد"
      description="يعتمد النظام وقت الخادم والمنطقة الزمنية للمؤسسة، وسيُحفظ هذا التجاوز في سجل الاجتماع ومحضره."
      onClose={onClose}
      closeDisabled={pending}
      footer={(
        <>
          {error && <InlineMessage tone="error" className="w-full">{error}</InlineMessage>}
          <Button variant="ghost" disabled={pending} onClick={onClose}>العودة دون فتح</Button>
          <Button
            variant="success"
            pending={pending}
            pendingLabel="جارٍ فتح الجلسة…"
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            تأكيد وفتح الجلسة الآن
          </Button>
        </>
      )}
    >
      <div className="flex items-start gap-3 rounded-q-control bg-q-warning-soft p-4 text-q-warning">
        <AlertTriangle className="mt-0.5 shrink-0" size={22} aria-hidden="true" />
        <div>
          <p className="m-0 text-q-body font-bold">{meetingStartWarning(timing)}</p>
          <p className="m-0 mt-1 text-q-caption">قرار المتابعة لا يغيّر الموعد الأصلي؛ بل يوثق وقت الفتح الفعلي ومن أكده.</p>
        </div>
      </div>

      <dl className="grid gap-3 rounded-q-card border border-q-border bg-q-surface-2 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-q-caption text-q-text-3">الاجتماع</dt>
          <dd className="m-0 mt-1 text-q-ui font-bold text-q-text">{timing.title_ar}</dd>
        </div>
        <div>
          <dt className="text-q-caption text-q-text-3">المرجع</dt>
          <dd className="m-0 mt-1 text-q-ui font-bold text-q-text">{timing.meeting_no ?? "—"}</dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="flex items-center gap-2 text-q-caption text-q-text-3"><CalendarClock size={16} aria-hidden="true" /> الموعد المحدد</dt>
          <dd className="m-0 mt-1 text-q-ui font-bold text-q-text">
            {dateTimeLabel(timing.scheduled_start_at, timing.timezone)} – {dateTimeLabel(timing.scheduled_end_at, timing.timezone)}
          </dd>
        </div>
      </dl>

      {!canConfirm && (
        <InlineMessage tone="warning">
          تأكيد البدء خارج الموعد متاح لرئيس هذا المجلس فقط. اطلب من الرئيس فتح الجلسة أو عد إلى الموعد المحدد.
        </InlineMessage>
      )}
    </Dialog>
  );
}
