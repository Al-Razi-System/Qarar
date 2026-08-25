"use client";

import { CheckCircle2, Clock, XCircle } from "lucide-react";
import type { Attendance } from "../model/live-meeting";

const labels: Record<string, string> = { present: "حاضر", absent: "غائب", excused: "معتذر", late: "متأخر", pending: "لم يسجّل" };
const tones: Record<string, string> = { present: "bg-emerald-50 text-emerald-700", absent: "bg-red-50 text-red-700", excused: "bg-amber-50 text-amber-700", late: "bg-orange-50 text-orange-700", pending: "bg-slate-100 text-slate-600" };

export function AttendanceVerificationRow({ record, busy, isSelf, highlighted = false, onVerify }: {
  record: Attendance;
  busy: boolean;
  isSelf: boolean;
  highlighted?: boolean;
  onVerify: (record: Attendance, status: "present" | "absent" | "excused") => void;
}) {
  const initials = record.full_name_ar.split(" ").slice(0, 2).map((part) => part[0]).join("");
  const actionDisabled = busy || isSelf;

  return <article className={`flex items-center gap-3 rounded-2xl border p-3.5 ${highlighted ? "border-blue-200 bg-white shadow-sm" : "border-[#e4ebf2] bg-white"}`}>
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#eaf4fd] text-[11px] font-black text-[#0877d6]">{initials}</span>
    <div className="min-w-0 flex-1">
      <h4 className="truncate text-xs font-black text-[#182b43]">{record.full_name_ar}</h4>
      <div className="mt-1 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${tones[record.status] ?? tones.pending}`}>{labels[record.status] ?? record.status}</span>
        {record.check_in_method === "self_qr" && <span className="text-[9px] font-bold text-[#0877d6]">عبر QR</span>}
        {isSelf && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-black text-blue-700">حسابك · يعتمده الطرف الآخر</span>}
      </div>
    </div>
    <div className="flex gap-1">
      <Action label={isSelf ? "لا يمكنك اعتماد حضورك بنفسك" : "اعتماد حاضر"} tone="emerald" onClick={() => onVerify(record, "present")} disabled={actionDisabled} icon={CheckCircle2} />
      <Action label={isSelf ? "لا يمكنك تعديل حضورك بنفسك" : "تسجيل معتذر"} tone="amber" onClick={() => onVerify(record, "excused")} disabled={actionDisabled} icon={Clock} />
      <Action label={isSelf ? "لا يمكنك تعديل حضورك بنفسك" : "تسجيل غائب"} tone="red" onClick={() => onVerify(record, "absent")} disabled={actionDisabled} icon={XCircle} />
    </div>
  </article>;
}

function Action({ label, tone, onClick, disabled, icon: Icon }: {
  label: string;
  tone: "emerald" | "amber" | "red";
  onClick: () => void;
  disabled: boolean;
  icon: typeof CheckCircle2;
}) {
  const style = { emerald: "bg-emerald-50 text-emerald-700 hover:bg-emerald-100", amber: "bg-amber-50 text-amber-700 hover:bg-amber-100", red: "bg-red-50 text-red-700 hover:bg-red-100" }[tone];
  return <button onClick={onClick} disabled={disabled} title={label} aria-label={label} className={`grid h-8 w-8 place-items-center rounded-lg transition disabled:cursor-not-allowed disabled:opacity-40 ${style}`}><Icon size={15} /></button>;
}
