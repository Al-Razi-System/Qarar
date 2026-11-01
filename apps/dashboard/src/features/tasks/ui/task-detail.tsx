"use client";

import { useId, useState, type DragEvent, type FormEvent } from "react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { JourneyRail } from "@/shared/ui/journey-rail";
import { TextArea } from "@/shared/ui/text-area";
import { taskEvidenceUrl } from "../api/tasks-client";
import { dueText, taskJourney } from "../model/journey";
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
const PROGRESS_STEPS = [25, 50, 75, 90];
const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx";

function fileSize(bytes: number | null) {
  if (!bytes) return null;
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} ك.ب` : `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;
}

const extensionOf = (name: string) => name.split(".").pop()?.toUpperCase().slice(0, 4) ?? "ملف";

function Fact({ term, children, className }: { term: string; children: React.ReactNode; className?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-q-caption text-q-text-2">{term}</dt>
      <dd className={cn("m-0 truncate text-q-ui font-bold", className)}>{children}</dd>
    </div>
  );
}

/**
 * One task on its way from the decision to verified completion: the station
 * it is at, the one step the viewer should take next, the work and evidence,
 * and every step taken. A step the server would refuse is explained, not offered.
 */
export function TaskDetailPanel({ task, pending, error, onAction }: Props) {
  const [percent, setPercent] = useState(task.progress_percent >= 100 ? 90 : task.progress_percent);
  const [progressNote, setProgressNote] = useState("");
  const [submitNote, setSubmitNote] = useState("");
  const [verdict, setVerdict] = useState<"verify" | "return">("verify");
  const [verdictNote, setVerdictNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileDescription, setFileDescription] = useState("");
  const evidenceId = `evidence-${useId().replace(/:/g, "")}`;
  const busy = pending !== null;
  const state = taskStatusLabel(task);
  const due = dueText(task);
  const viewer = task.viewer;
  const open = task.status === "new" || task.status === "in_progress";
  const returnTooShort = verdict === "return" && verdictNote.trim().length < 5;
  const progressChoices = PROGRESS_STEPS.includes(task.progress_percent) || task.progress_percent === 0 || task.progress_percent >= 100
    ? PROGRESS_STEPS
    : [...PROGRESS_STEPS, task.progress_percent].sort((a, b) => a - b);

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

  function drop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setDragging(false);
    if (!busy && event.dataTransfer.files[0]) setFile(event.dataTransfer.files[0]);
  }

  const nextStep = (() => {
    if (task.status === "completed") return { title: "اكتملت المهمة", body: "اعتُمد إنجازها، ولا خطوات أخرى عليها." };
    if (task.status === "cancelled" || task.status === "closed") return { title: "أُلغيت المهمة", body: "لا خطوات عليها؛ يبقى سجلها للاطلاع." };
    if (viewer.can_verify) return { title: "راجع الإنجاز وقرّر", body: "اطّلع على الأدلة والسجل، ثم اعتمد الإنجاز أو أعد المهمة للمنفّذ بسبب واضح." };
    if (viewer.can_start) return { title: "ابدأ التنفيذ", body: "يرى المتابع أن التنفيذ بدأ، وتُفتح لك نسبة الإنجاز والأدلة." };
    if (viewer.is_executor && open) {
      return viewer.can_submit
        ? { title: "الإنجاز جاهز للتسليم", body: `يمكنك تسليم ما وصلت إليه الآن بنسبة ${task.progress_percent}%؛ يتحقق منه ${task.follow_up_user_name_ar ?? "المتابع"} أو رئيس المجلس أو مسؤول الحوكمة.` }
        : { title: "أكمل العمل ثم سلّمه", body: "لا يلزم رفع النسبة إلى 90%؛ أرفق الدليل المطلوب ثم سلّم ما أنجزته. تصل المهمة إلى 100% بعد اعتماد المتابع." };
    }
    if (task.status === "submitted" && viewer.is_executor) return { title: "بانتظار التحقق", body: "سُلّمت المهمة، وتنتظر تحقق المتابع أو رئيس المجلس أو مسؤول الحوكمة." };
    return { title: "للاطلاع", body: "تتابع هذه المهمة؛ يحدّث المنفّذ إنجازها ويتحقق منها المتابع." };
  })();

  return (
    <Card role="region" aria-label="تفاصيل المهمة" className="flex min-w-0 flex-col gap-5">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-q-caption text-q-text-2">
          <span dir="ltr" className="font-bold">{task.action_no}</span>
          {task.decision_no && <span>من القرار <span dir="ltr">{task.decision_no}</span></span>}
          {task.meeting_title_ar && <span>{task.meeting_title_ar}</span>}
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="m-0 min-w-0 flex-1 text-q-h3 font-bold leading-snug">{task.title_ar}</h2>
          <Badge tone={state.tone}>{state.label}</Badge>
        </div>
        <dl className="m-0 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Fact term="المكلَّف">{assigneeName(task)}</Fact>
          <Fact term="المتابع">{task.follow_up_user_name_ar ?? "غير محدد"}</Fact>
          <Fact term="الموعد" className={due.tone === "danger" ? "text-q-danger" : due.tone === "warning" ? "text-q-warning" : undefined}>
            {due.text}
            {task.due_date && <span className="block text-q-caption font-normal text-q-text-2">{formatDate(task.due_date)}</span>}
          </Fact>
          <Fact term="الإنجاز"><span dir="ltr">{task.progress_percent}%</span></Fact>
        </dl>
      </header>

      <div className="rounded-q-control border border-q-border px-2 py-4">
        <JourneyRail label="مسار المهمة" steps={taskJourney(task, task.events)} />
      </div>

      <section aria-label="خطوتك التالية" className="flex flex-col gap-3 rounded-q-control border-s-4 border-q-primary bg-q-surface-2 p-4">
        <div className="flex flex-col gap-0.5">
          <h3 className="m-0 text-q-caption font-bold text-q-text-2">خطوتك التالية</h3>
          <p className="m-0 text-q-h3 font-bold">{nextStep.title}</p>
          <p className="m-0 text-q-ui text-q-text-2">{nextStep.body}</p>
        </div>

        {viewer.is_executor && open && (
          <ol className="m-0 grid list-inside list-decimal gap-2 rounded-q-control bg-q-surface px-3 py-3 text-q-ui sm:grid-cols-3">
            <li>حدّث نسبة الإنجاز إن أردت توثيق تقدم جديد</li>
            <li>أرفق دليل الإنجاز {task.requires_evidence ? "المطلوب" : "إن وُجد"}</li>
            <li>سلّم ما أنجزته للتحقق بأي نسبة حالية</li>
          </ol>
        )}

        {error && <InlineMessage tone="error">{error}</InlineMessage>}

        {viewer.can_start && (
          <div><Button pending={pending === "start"} pendingLabel="جارٍ البدء…" disabled={busy} onClick={() => void run({ kind: "start" })}>بدء التنفيذ</Button></div>
        )}

        {viewer.can_verify && (
          <form onSubmit={submitVerdict} aria-label="التحقق من الإنجاز" className="flex flex-col gap-3">
            <fieldset className="m-0 grid gap-2 border-0 p-0 sm:grid-cols-2" disabled={busy}>
              <legend className="sr-only">التحقق من الإنجاز</legend>
              {([
                { value: "verify", label: "اعتماد الإنجاز", hint: "تكتمل المهمة بنسبة 100%." },
                { value: "return", label: "إعادة للتنفيذ", hint: "تعود للمنفّذ مع سببك." },
              ] as const).map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 rounded-q-control border-2 bg-q-surface p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-q-focus",
                    verdict === option.value ? (option.value === "verify" ? "border-q-success" : "border-q-danger") : "border-q-border",
                  )}
                >
                  <input type="radio" name="verdict" aria-label={option.label} checked={verdict === option.value} onChange={() => setVerdict(option.value)} className="mt-0.5 h-5 w-5 accent-q-primary" />
                  <span className="flex flex-col">
                    <span className="text-q-ui font-bold">{option.label}</span>
                    <span className="text-q-caption text-q-text-2">{option.hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <TextArea label={verdict === "return" ? "سبب الإعادة" : "ملاحظة (اختيارية)"} value={verdictNote} maxLength={2000} disabled={busy} onChange={(event) => setVerdictNote(event.target.value)} className="min-h-20" />
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" variant={verdict === "verify" ? "success" : "danger"} disabled={busy || returnTooShort} pending={pending === "verify" || pending === "return"} pendingLabel="جارٍ الحفظ…">
                {verdict === "verify" ? "اعتماد الإنجاز" : "إعادة المهمة للتنفيذ"}
              </Button>
              {returnTooShort && <span className="text-q-caption text-q-text-2">اكتب سبب الإعادة بخمسة أحرف على الأقل.</span>}
            </div>
          </form>
        )}
        {viewer.verify_blocked_reason && <p className="m-0 text-q-caption font-bold text-q-warning">{viewer.verify_blocked_reason}</p>}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
        <div className="flex min-w-0 flex-col gap-5">
          {viewer.can_update && (
            <form onSubmit={submitProgress} aria-label="تحديث الإنجاز" className="flex flex-col gap-3">
              <fieldset className="m-0 flex flex-col gap-2 border-0 p-0" disabled={busy}>
                <legend className="mb-2 text-q-ui font-bold">كم أنجزت؟</legend>
                <div className="flex flex-wrap gap-2">
                  {progressChoices.map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={percent === value}
                      onClick={() => setPercent(value)}
                      className={cn(
                        "min-h-11 min-w-16 rounded-q-control border-2 px-3 font-sans text-q-ui font-bold transition-colors disabled:cursor-not-allowed",
                        percent === value ? "border-q-primary bg-q-primary text-q-on-primary" : "border-q-border bg-q-surface text-q-text hover:border-q-border-strong",
                      )}
                    >
                      <span dir="ltr">{value}%</span>
                    </button>
                  ))}
                </div>
                <span className="h-2 overflow-hidden rounded-full bg-q-neutral-soft" aria-hidden="true">
                  <span className="block h-full rounded-full bg-q-primary transition-[width]" style={{ width: `${percent}%` }} />
                </span>
              </fieldset>
              <TextArea label="ملاحظة (اختيارية)" value={progressNote} maxLength={2000} disabled={busy} onChange={(event) => setProgressNote(event.target.value)} className="min-h-20" />
              <div className="flex flex-wrap items-center gap-3">
                <Button type="submit" variant="secondary" pending={pending === "progress"} pendingLabel="جارٍ الحفظ…" disabled={busy}>حفظ الإنجاز</Button>
                <span className="text-q-caption text-q-text-2">تبلغ المهمة 100% عند اعتماد إنجازها.</span>
              </div>
            </form>
          )}

          <section id={evidenceId} aria-label="أدلة الإنجاز" className="flex scroll-mt-4 flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-q-ui font-bold">أدلة الإنجاز</h3>
              {task.requires_evidence && (
                <span className={cn("text-q-caption font-bold", task.evidence.length ? "text-q-success" : "text-q-warning")}>
                  {task.evidence.length ? "✓ الدليل المطلوب مُرفق" : "دليل مطلوب قبل التسليم"}
                </span>
              )}
            </div>
            {task.evidence.length === 0 ? (
              !viewer.can_update && <p className="m-0 text-q-ui text-q-text-2">لم يُرفق دليل.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {task.evidence.map((evidence) => (
                  <li key={evidence.id} className="flex items-center gap-3 rounded-q-control border border-q-border p-2">
                    <span aria-hidden="true" className="grid h-10 w-10 shrink-0 place-items-center rounded-q-control bg-q-surface-2 text-q-caption font-bold text-q-link" dir="ltr">{extensionOf(evidence.file_name)}</span>
                    <div className="min-w-0 flex-1">
                      <a href={taskEvidenceUrl(task.id, evidence.id)} className="block truncate text-q-ui font-bold text-q-link">{evidence.file_name}</a>
                      <p className="m-0 truncate text-q-caption text-q-text-2">{[evidence.description, evidence.uploaded_by_name_ar, fileSize(evidence.file_size_bytes)].filter(Boolean).join("، ")}</p>
                    </div>
                    {viewer.can_update && (
                      <Button variant="ghost" disabled={busy} pending={pending === "remove_evidence"} pendingLabel="جارٍ الحذف…" onClick={() => void run({ kind: "remove_evidence", evidenceId: evidence.id })}>حذف</Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {viewer.can_update && (
              <form onSubmit={submitUpload} aria-label="إرفاق دليل" className="flex flex-col gap-3">
                <label
                  onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={drop}
                  className={cn(
                    "flex cursor-pointer flex-col items-center gap-1 rounded-q-control border-2 border-dashed p-5 text-center transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-q-focus",
                    dragging ? "border-q-primary bg-q-surface-2" : file ? "border-q-success bg-q-success-soft" : "border-q-border-strong bg-q-surface hover:bg-q-surface-2",
                    busy && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input type="file" accept={ACCEPT} disabled={busy} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="sr-only" />
                  <span className="text-q-ui font-bold">{file ? file.name : "اسحب الملف هنا أو اختره من جهازك"}</span>
                  <span className="text-q-caption text-q-text-2">{file ? "اضغط لاختيار ملف آخر" : "PDF أو صورة أو DOCX، حتى 25 ميجابايت"}</span>
                </label>
                {file && (
                  <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
                    وصف الدليل (اختياري)
                    <input value={fileDescription} maxLength={500} disabled={busy} onChange={(event) => setFileDescription(event.target.value)} className="h-11 rounded-q-control border border-q-border-strong bg-q-surface px-3 text-q-ui font-normal text-q-text" />
                  </label>
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button type="submit" variant="secondary" disabled={!file || busy} pending={pending === "upload"} pendingLabel="جارٍ الرفع…">إرفاق الدليل</Button>
                  {file && <Button variant="ghost" disabled={busy} onClick={() => { setFile(null); setFileDescription(""); }}>إلغاء الاختيار</Button>}
                  {!file && <span className="text-q-caption text-q-text-2">اختر ملفاً أولاً.</span>}
                </div>
              </form>
            )}
          </section>

          {viewer.is_executor && open && !viewer.can_start && (
            <section aria-label="إتمام المهمة" className="rounded-q-control border border-q-border bg-q-surface-2 p-4">
              <div aria-label="تسليم الإنجاز" role="group" className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <h3 className="m-0 text-q-h3 font-bold">تسليم الإنجاز</h3>
                  <p className="m-0 text-q-ui text-q-text-2">هذه هي الخطوة الأخيرة للمنفّذ. بعد التسليم تنتقل المهمة إلى المتابع للتحقق.</p>
                </div>
                {viewer.can_submit && <TextArea label="ملاحظة التسليم (اختيارية)" value={submitNote} maxLength={2000} disabled={busy} onChange={(event) => setSubmitNote(event.target.value)} className="min-h-20" />}
                <div className="flex flex-wrap items-center gap-3">
                  <Button disabled={busy || !viewer.can_submit} pending={pending === "submit"} pendingLabel="جارٍ التسليم…" onClick={() => void run({ kind: "submit", note: submitNote }, () => setSubmitNote(""))}>تسليم الإنجاز للتحقق</Button>
                  {viewer.submit_blocked_reason && <span className="text-q-caption font-bold text-q-warning">{viewer.submit_blocked_reason}</span>}
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-col gap-5">
          {task.decision_text && (
            <section aria-label="نص القرار" className="flex flex-col gap-1 rounded-q-control bg-q-surface-2 p-3">
              <h3 className="m-0 text-q-caption font-bold text-q-text-2">نص القرار <span dir="ltr">{task.decision_no}</span></h3>
              <p className="m-0 whitespace-pre-line text-q-ui leading-relaxed">{task.decision_text}</p>
            </section>
          )}

          <section aria-label="سجل المهمة" className="flex flex-col gap-2">
            <h3 className="m-0 text-q-ui font-bold">سجل المهمة</h3>
            {task.events.length === 0 ? (
              <p className="m-0 text-q-ui text-q-text-2">لم يُتخذ إجراء بعد.</p>
            ) : (
              <ol className="m-0 flex list-none flex-col p-0">
                {[...task.events].reverse().map((event) => (
                  <li key={event.id} className="relative flex flex-col gap-0.5 border-s-2 border-q-border pb-3 ps-4 last:pb-0">
                    <span aria-hidden="true" className={cn(
                      "absolute -start-[5px] top-1.5 h-2 w-2 rounded-full",
                      event.event_type === "verify" ? "bg-q-success" : event.event_type === "return" ? "bg-q-danger" : "bg-q-border-strong",
                    )} />
                    <p className="m-0 text-q-ui font-bold">
                      {TASK_EVENT_LABEL[event.event_type]}
                      {event.event_type === "progress" && event.progress_percent !== null && <> <span dir="ltr">{event.progress_percent}%</span></>}
                    </p>
                    <p className="m-0 text-q-caption text-q-text-2">{[event.actor_name_ar, timeFormat.format(new Date(event.created_at))].filter(Boolean).join("، ")}</p>
                    {event.note && <p className="m-0 whitespace-pre-line text-q-ui">{event.note}</p>}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>
      </div>
    </Card>
  );
}
