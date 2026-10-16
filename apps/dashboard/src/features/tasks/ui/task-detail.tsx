"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { TextArea } from "@/shared/ui/text-area";
import { taskEvidenceUrl } from "../api/tasks-client";
import { assigneeName, TASK_EVENT_LABEL, taskStatusLabel, type TaskDetail } from "../model/tasks";

export type TaskAction =
  | { kind: "start" }
  | { kind: "progress"; percent: number; note: string }
  | { kind: "submit"; note: string }
  | { kind: "verify"; note: string }
  | { kind: "return"; reason: string }
  | { kind: "upload"; file: File; description: string }
  | { kind: "remove_evidence"; evidenceId: string };

type Props = {
  task: TaskDetail;
  /** The action running now; its button shows pending and the others wait. */
  pending: TaskAction["kind"] | null;
  error: string | null;
  /** Resolves true when the action succeeded; forms then clear. */
  onAction: (action: TaskAction) => Promise<boolean>;
};

const dateFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
const timeFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
const formatDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00`));

/**
 * One task: what the decision asks, who executes and who follows, the
 * progress, the evidence and every step taken. Each person sees the steps
 * they may take; a step the server would refuse is explained, not offered.
 */
export function TaskDetailPanel({ task, pending, error, onAction }: Props) {
  const [percent, setPercent] = useState(task.progress_percent >= 100 ? 99 : task.progress_percent);
  const [progressNote, setProgressNote] = useState("");
  const [submitNote, setSubmitNote] = useState("");
  const [verdict, setVerdict] = useState<"verify" | "return">("verify");
  const [verdictNote, setVerdictNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileDescription, setFileDescription] = useState("");
  const busy = pending !== null;
  const state = taskStatusLabel(task);
  const viewer = task.viewer;
  const open = task.status === "new" || task.status === "in_progress";
  const returnTooShort = verdict === "return" && verdictNote.trim().length < 5;

  async function run(action: TaskAction, clear?: () => void) {
    if (busy) return;
    if (await onAction(action)) clear?.();
  }

  function submitProgress(event: FormEvent) {
    event.preventDefault();
    void run({ kind: "progress", percent, note: progressNote }, () => setProgressNote(""));
  }

  function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    void run({ kind: "upload", file, description: fileDescription }, () => { setFile(null); setFileDescription(""); });
  }

  function submitVerdict(event: FormEvent) {
    event.preventDefault();
    if (returnTooShort) return;
    void run(verdict === "verify" ? { kind: "verify", note: verdictNote } : { kind: "return", reason: verdictNote }, () => setVerdictNote(""));
  }

  return (
    <Card role="region" aria-label="تفاصيل المهمة" className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-q-caption font-bold text-q-text-2">
          <span dir="ltr">{task.action_no}</span>
          {task.decision_no && <span>القرار <span dir="ltr">{task.decision_no}</span></span>}
          {task.meeting_title_ar && <span>{task.meeting_title_ar}</span>}
        </div>
        <h2 className="m-0 text-q-h3 font-bold">{task.title_ar}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={state.tone}>{state.label}</Badge>
          {task.requires_evidence && <Badge tone="neutral">يتطلب أدلة إنجاز</Badge>}
        </div>
      </header>

      <dl className="m-0 grid gap-x-6 gap-y-2 text-q-ui sm:grid-cols-2">
        <div><dt className="text-q-caption font-bold text-q-text-2">المكلَّف</dt><dd className="m-0">{assigneeName(task)}</dd></div>
        <div><dt className="text-q-caption font-bold text-q-text-2">المتابع</dt><dd className="m-0">{task.follow_up_user_name_ar ?? "غير محدد"}</dd></div>
        <div>
          <dt className="text-q-caption font-bold text-q-text-2">موعد الإنجاز</dt>
          <dd className={task.is_overdue ? "m-0 font-bold text-q-danger" : "m-0"}>{task.due_date ? formatDate(task.due_date) : "بلا موعد محدد"}{task.is_overdue && " · متأخرة"}</dd>
        </div>
        <div>
          <dt className="text-q-caption font-bold text-q-text-2">نسبة الإنجاز</dt>
          <dd className="m-0 flex items-center gap-2">
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-q-surface-2" aria-hidden="true">
              <span className="block h-full rounded-full bg-q-primary" style={{ width: `${task.progress_percent}%` }} />
            </span>
            <span dir="ltr" className="text-q-caption font-bold">{task.progress_percent}%</span>
          </dd>
        </div>
      </dl>

      {task.decision_text && (
        <section aria-label="نص القرار" className="rounded-q-control bg-q-surface-2 p-3">
          <h3 className="m-0 text-q-caption font-bold text-q-text-2">نص القرار</h3>
          <p className="m-0 mt-1 whitespace-pre-line text-q-ui">{task.decision_text}</p>
        </section>
      )}

      {error && <InlineMessage tone="error">{error}</InlineMessage>}

      {viewer.can_start && (
        <div className="flex flex-wrap items-center gap-2">
          <Button pending={pending === "start"} pendingLabel="جارٍ البدء…" disabled={busy} onClick={() => void run({ kind: "start" })}>بدء التنفيذ</Button>
          <span className="text-q-caption text-q-text-2">يرى المتابع أن التنفيذ بدأ.</span>
        </div>
      )}

      {viewer.can_update && (
        <form onSubmit={submitProgress} aria-label="تحديث الإنجاز" className="flex flex-col gap-3 rounded-q-control border border-q-border p-3">
          <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
            نسبة الإنجاز: <span dir="ltr">{percent}%</span>
            <input type="range" min={0} max={99} step={5} value={percent} disabled={busy} onChange={(event) => setPercent(Number(event.target.value))} className="h-11 accent-q-primary" />
          </label>
          <TextArea label="ملاحظة (اختيارية)" value={progressNote} maxLength={2000} disabled={busy} onChange={(event) => setProgressNote(event.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" variant="secondary" pending={pending === "progress"} pendingLabel="جارٍ الحفظ…" disabled={busy}>حفظ الإنجاز</Button>
            <span className="text-q-caption text-q-text-2">تكتمل المهمة بنسبة 100% عند التحقق من إنجازها.</span>
          </div>
        </form>
      )}

      <section aria-label="أدلة الإنجاز" className="flex flex-col gap-2">
        <h3 className="m-0 text-q-ui font-bold">أدلة الإنجاز</h3>
        {task.evidence.length === 0 ? (
          <p className="m-0 text-q-ui text-q-text-2">{task.requires_evidence ? "لم يُرفق دليل بعد، والمهمة تتطلبه قبل التسليم." : "لم يُرفق دليل."}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {task.evidence.map((evidence) => (
              <li key={evidence.id} className="flex flex-wrap items-center justify-between gap-2 rounded-q-control border border-q-border p-2">
                <div className="min-w-0">
                  <a href={taskEvidenceUrl(task.id, evidence.id)} className="block truncate text-q-ui font-bold text-q-link">{evidence.file_name}</a>
                  <p className="m-0 text-q-caption text-q-text-2">{[evidence.description, evidence.uploaded_by_name_ar].filter(Boolean).join(" · ")}</p>
                </div>
                {viewer.can_update && (
                  <Button variant="ghost" disabled={busy} pending={pending === "remove_evidence"} pendingLabel="جارٍ الحذف…" onClick={() => void run({ kind: "remove_evidence", evidenceId: evidence.id })}>حذف</Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {viewer.can_update && (
          <form onSubmit={submitUpload} aria-label="إرفاق دليل" className="flex flex-col gap-2 rounded-q-control bg-q-surface-2 p-3">
            <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
              الملف (PDF أو صورة أو DOCX، حتى 25 ميجابايت)
              <input type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="min-h-11 text-q-ui" />
            </label>
            <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
              وصف الدليل (اختياري)
              <input value={fileDescription} maxLength={500} disabled={busy} onChange={(event) => setFileDescription(event.target.value)} className="h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal text-q-text" />
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="submit" variant="secondary" disabled={!file || busy} pending={pending === "upload"} pendingLabel="جارٍ الرفع…">إرفاق الدليل</Button>
              {!file && <span className="text-q-caption text-q-text-2">اختر ملفاً أولاً.</span>}
            </div>
          </form>
        )}
      </section>

      {viewer.is_executor && open && (
        <section aria-label="تسليم الإنجاز" className="flex flex-col gap-2 border-t border-q-border pt-4">
          <TextArea label="ملاحظة التسليم (اختيارية)" value={submitNote} maxLength={2000} disabled={busy} onChange={(event) => setSubmitNote(event.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button disabled={busy || !viewer.can_submit} pending={pending === "submit"} pendingLabel="جارٍ التسليم…" onClick={() => void run({ kind: "submit", note: submitNote }, () => setSubmitNote(""))}>تسليم الإنجاز للتحقق</Button>
            {viewer.submit_blocked_reason && <span className="text-q-caption font-bold text-q-warning">{viewer.submit_blocked_reason}</span>}
          </div>
        </section>
      )}

      {task.status === "submitted" && viewer.is_executor && !viewer.can_verify && (
        <p className="m-0 rounded-q-control bg-q-surface-2 p-3 text-q-ui text-q-text-2">سُلّمت المهمة، وتنتظر تحقق المتابع أو رئيس المجلس أو مسؤول الحوكمة.</p>
      )}

      {viewer.can_verify && (
        <form onSubmit={submitVerdict} aria-label="التحقق من الإنجاز" className="flex flex-col gap-3 border-t border-q-border pt-4">
          <fieldset className="m-0 flex flex-wrap gap-4 border-0 p-0" disabled={busy}>
            <legend className="mb-1 text-q-ui font-bold">التحقق من الإنجاز</legend>
            <label className="flex min-h-11 items-center gap-2 text-q-ui"><input type="radio" name="verdict" checked={verdict === "verify"} onChange={() => setVerdict("verify")} className="h-5 w-5 accent-q-primary" />اعتماد الإنجاز</label>
            <label className="flex min-h-11 items-center gap-2 text-q-ui"><input type="radio" name="verdict" checked={verdict === "return"} onChange={() => setVerdict("return")} className="h-5 w-5 accent-q-primary" />إعادة للتنفيذ</label>
          </fieldset>
          <TextArea label={verdict === "return" ? "سبب الإعادة" : "ملاحظة (اختيارية)"} value={verdictNote} maxLength={2000} disabled={busy} onChange={(event) => setVerdictNote(event.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={busy || returnTooShort} pending={pending === "verify" || pending === "return"} pendingLabel="جارٍ الحفظ…">
              {verdict === "verify" ? "اعتماد الإنجاز" : "إعادة المهمة للتنفيذ"}
            </Button>
            {returnTooShort && <span className="text-q-caption text-q-text-2">اكتب سبب الإعادة بخمسة أحرف على الأقل.</span>}
          </div>
        </form>
      )}
      {viewer.verify_blocked_reason && <p className="m-0 text-q-caption font-bold text-q-warning">{viewer.verify_blocked_reason}</p>}

      <section aria-label="سجل المهمة" className="flex flex-col gap-2 border-t border-q-border pt-4">
        <h3 className="m-0 text-q-ui font-bold">سجل المهمة</h3>
        {task.events.length === 0 ? (
          <p className="m-0 text-q-ui text-q-text-2">لم يُتخذ إجراء بعد.</p>
        ) : (
          <ol className="m-0 flex list-none flex-col gap-2 p-0">
            {task.events.map((event) => (
              <li key={event.id} className="flex flex-col gap-0.5 border-s-2 border-q-border ps-3">
                <p className="m-0 text-q-ui font-bold">
                  {TASK_EVENT_LABEL[event.event_type]}
                  {event.event_type === "progress" && event.progress_percent !== null && <> · <span dir="ltr">{event.progress_percent}%</span></>}
                </p>
                <p className="m-0 text-q-caption text-q-text-2">{[event.actor_name_ar, timeFormat.format(new Date(event.created_at))].filter(Boolean).join(" · ")}</p>
                {event.note && <p className="m-0 whitespace-pre-line text-q-ui">{event.note}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </Card>
  );
}
