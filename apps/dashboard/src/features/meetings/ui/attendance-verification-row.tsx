"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import type { Attendance } from "../model/live-meeting";

const labels: Record<string, string> = { present: "حاضر", absent: "غائب", excused: "معتذر", late: "متأخر", pending: "لم يسجّل" };
const tones: Record<string, "success" | "danger" | "warning" | "neutral"> = { present: "success", absent: "danger", excused: "warning", late: "warning", pending: "neutral" };

export function AttendanceVerificationRow({ record, busy, isSelf, highlighted = false, onVerify }: {
  record: Attendance;
  busy: boolean;
  isSelf: boolean;
  highlighted?: boolean;
  onVerify: (record: Attendance, status: "present" | "absent" | "excused") => void;
}) {
  const initials = record.full_name_ar.split(" ").slice(0, 2).map((part) => part[0]).join("");
  const actionDisabled = busy || isSelf;

  return (
    <article className={cn("flex flex-wrap items-center gap-3 rounded-q-card border bg-q-surface p-3 font-sans text-q-text", highlighted ? "border-q-primary" : "border-q-border")}>
      <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-q-surface-2 text-q-caption font-bold text-q-link">{initials}</span>
      <div className="min-w-0 flex-1">
        <h4 className="m-0 truncate text-q-ui font-bold">{record.full_name_ar}</h4>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge tone={tones[record.status] ?? "neutral"}>{labels[record.status] ?? "غير محدد"}</Badge>
          {record.check_in_method === "self_qr" && <span className="text-q-caption font-bold text-q-link">عبر رمز الحضور</span>}
          {isSelf && <Badge tone="info">حسابك · يعتمده الطرف الآخر</Badge>}
        </div>
      </div>
      <div className="flex gap-1.5">
        <Action label={isSelf ? "لا يمكنك اعتماد حضورك بنفسك" : "اعتماد حاضر"} className="bg-q-success-soft text-q-success" onClick={() => onVerify(record, "present")} disabled={actionDisabled} icon={CheckCircle2} />
        <Action label={isSelf ? "لا يمكنك تعديل حضورك بنفسك" : "تسجيل معتذر"} className="bg-q-warning-soft text-q-warning" onClick={() => onVerify(record, "excused")} disabled={actionDisabled} icon={Clock} />
        <Action label={isSelf ? "لا يمكنك تعديل حضورك بنفسك" : "تسجيل غائب"} className="bg-q-danger-soft text-q-danger" onClick={() => onVerify(record, "absent")} disabled={actionDisabled} icon={XCircle} />
      </div>
    </article>
  );
}

function Action({ label, className, onClick, disabled, icon: Icon }: {
  label: string;
  className: string;
  onClick: () => void;
  disabled: boolean;
  icon: typeof CheckCircle2;
}) {
  return <button type="button" onClick={onClick} disabled={disabled} title={label} aria-label={label} className={cn("grid h-11 w-11 place-items-center rounded-q-control transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40", className)}><Icon size={18} aria-hidden="true" /></button>;
}
