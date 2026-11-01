"use client";

import { useState } from "react";
import { ArrowDownToLine, ShieldX } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { cn } from "@/shared/lib/utils";

export type PendingRejectedVoteResolution = {
  voting_round_id: string;
  topic_title: string;
  destination_unit_name_ar: string;
  expected_version: number;
};

type Resolution = "final_reject" | "return_previous";

export function RejectedVoteResolutionDialog({
  item,
  pending,
  error,
  onSubmit,
}: {
  item: PendingRejectedVoteResolution;
  pending: boolean;
  error: string | null;
  onSubmit: (resolution: Resolution, reason: string) => void;
}) {
  const [resolution, setResolution] = useState<Resolution | null>(null);
  const [reason, setReason] = useState("");
  const valid = resolution === "final_reject" || (resolution === "return_previous" && reason.trim().length >= 10);

  return (
    <Dialog
      title="حسم نتيجة عدم الموافقة"
      description={`انتهى تصويت «${item.topic_title}» بعدم الموافقة. يحدد رئيس المجلس الآن الأثر الرسمي على المسار.`}
      onClose={() => undefined}
      closeDisabled
      footer={(
        <>
          {error && <InlineMessage tone="error" className="me-auto">{error}</InlineMessage>}
          <Button
            pending={pending}
            pendingLabel="جارٍ توثيق القرار…"
            disabled={!valid}
            onClick={() => resolution && onSubmit(resolution, reason.trim())}
          >
            تأكيد قرار الرئيس
          </Button>
        </>
      )}
    >
      <InlineMessage tone="warning">
        لن يُغلق البند أو الجلسة قبل اختيار أحد القرارين. سيظهر القرار في المحضر ورحلة الموضوع.
      </InlineMessage>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          aria-pressed={resolution === "final_reject"}
          onClick={() => setResolution("final_reject")}
          className={cn(
            "rounded-q-card border p-4 text-start transition",
            resolution === "final_reject"
              ? "border-q-danger bg-q-danger-soft"
              : "border-q-border bg-q-surface hover:bg-q-surface-2",
          )}
        >
          <ShieldX className="text-q-danger" />
          <strong className="mt-3 block text-q-body text-q-text">إنهاء المسار بالرفض</strong>
          <span className="mt-1 block text-q-caption leading-6 text-q-text-2">
            تثبيت عدم الموافقة كقرار نهائي لهذه الرحلة.
          </span>
        </button>
        <button
          type="button"
          aria-pressed={resolution === "return_previous"}
          onClick={() => setResolution("return_previous")}
          className={cn(
            "rounded-q-card border p-4 text-start transition",
            resolution === "return_previous"
              ? "border-q-warning bg-q-warning-soft"
              : "border-q-border bg-q-surface hover:bg-q-surface-2",
          )}
        >
          <ArrowDownToLine className="text-q-warning" />
          <strong className="mt-3 block text-q-body text-q-text">
            إعادة الموضوع إلى {item.destination_unit_name_ar}
          </strong>
          <span className="mt-1 block text-q-caption leading-6 text-q-text-2">
            فتح دورة جديدة لدى الجهة السابقة مع حفظ التصويت والسجل الحالي.
          </span>
        </button>
      </div>
      {resolution === "return_previous" && (
        <label className="grid gap-2 text-q-ui font-bold text-q-text">
          سبب إعادة الموضوع
          <textarea
            aria-label="سبب إعادة الموضوع"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={4}
            className="rounded-q-control border border-q-border bg-q-surface p-3 font-sans text-q-ui font-normal"
            placeholder="اكتب السبب الذي سيظهر في القرار والمحضر (10 أحرف على الأقل)"
          />
          <span className="text-q-caption font-normal text-q-text-3">
            {reason.trim().length}/10 أحرف على الأقل
          </span>
        </label>
      )}
    </Dialog>
  );
}
