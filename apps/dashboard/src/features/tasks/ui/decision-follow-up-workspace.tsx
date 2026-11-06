"use client";

import { useCallback, useEffect, useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { TextArea } from "@/shared/ui/text-area";
import { tasksRpc } from "../api/tasks-client";
import { decisionStatusLabel, FOLLOW_UP_FILTERS, groupDecisionTasks, OUTCOME_KIND_LABEL, type DecisionTasks, type FollowedDecision, type FollowUpFilter } from "../model/follow-up";
import { cn } from "@/shared/lib/utils";
import { JourneyRail } from "@/shared/ui/journey-rail";
import { dueText, taskJourney } from "../model/journey";
import { assigneeName, taskStatusLabel, type TaskSummary } from "../model/tasks";

const messageOf = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const dateFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" });
const formatDate = (value: string) => dateFormat.format(new Date(`${value}T00:00:00`));
const today = () => new Date().toLocaleDateString("en-CA");

export type Manage =
  | { kind: "extend"; task: TaskSummary }
  | { kind: "reassign"; task: TaskSummary }
  | { kind: "cancel"; task: TaskSummary }
  | { kind: "close"; decision: FollowedDecision };

const MANAGE_TITLE: Record<Manage["kind"], string> = {
  extend: "تمديد موعد الإنجاز",
  reassign: "إعادة إسناد المهمة",
  cancel: "إلغاء المهمة",
  close: "إغلاق القرار",
};

export function ManageDialog({ manage, units, busy, error, onClose, onSubmit }: {
  manage: Manage;
  units: Array<{ id: string; name_ar: string }>;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (input: { reason: string; dueDate: string; unitId: string }) => void;
}) {
  const [reason, setReason] = useState("");
  const [dueDate, setDueDate] = useState(manage.kind === "extend" ? manage.task.due_date ?? "" : "");
  const [unitId, setUnitId] = useState("");
  const closing = manage.kind === "close";
  const missing = !closing && reason.trim().length < 5 ? "اكتب السبب بخمسة أحرف على الأقل."
    : manage.kind === "extend" && (!dueDate || dueDate < today()) ? "اختر موعداً لا يكون في الماضي."
    : manage.kind === "reassign" && !unitId ? "اختر الجهة المكلَّفة الجديدة."
    : null;
  const subject = closing ? `${manage.decision.decision_no}` : manage.task.title_ar;
  return (
    <Dialog
      title={MANAGE_TITLE[manage.kind]}
      description={closing
        ? `يُغلق القرار ${subject} بعد أن أُنجزت مهامه أو أُلغيت، ولا يقبل بعدها إجراءً على مهامه.`
        : `«${subject}». يُسجَّل السبب في سجل المهمة ويراه منفّذها ومتابعها.`}
      onClose={onClose}
      closeDisabled={busy}
      footer={<>
        {error && <InlineMessage tone="error" className="w-full">{error}</InlineMessage>}
        {!error && missing && <span className="me-auto text-q-caption font-bold text-q-text-2">{missing}</span>}
        <Button variant="ghost" onClick={onClose} disabled={busy}>تراجع</Button>
        <Button variant={manage.kind === "cancel" ? "danger" : "primary"} disabled={Boolean(missing)} pending={busy} pendingLabel="جارٍ الحفظ…" onClick={() => onSubmit({ reason, dueDate, unitId })}>
          {MANAGE_TITLE[manage.kind]}
        </Button>
      </>}
    >
      <div className="flex flex-col gap-3">
        {manage.kind === "extend" && (
          <label className="flex flex-col gap-1 text-q-ui font-bold text-q-text">
            موعد الإنجاز الجديد
            <input type="date" value={dueDate} min={today()} disabled={busy} onChange={(event) => setDueDate(event.target.value)} className="h-11 rounded-q-control border border-q-border bg-q-surface px-2 text-q-ui font-normal text-q-text" />
          </label>
        )}
        {manage.kind === "reassign" && (
          <label className="flex flex-col gap-1 text-q-ui font-bold text-q-text">
            الجهة المكلَّفة الجديدة
            <select value={unitId} disabled={busy} onChange={(event) => setUnitId(event.target.value)} className="h-11 rounded-q-control border border-q-border bg-q-surface px-2 text-q-ui font-normal text-q-text">
              <option value="">اختر الجهة</option>
              {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}
            </select>
          </label>
        )}
        <TextArea label={closing ? "ملاحظة الإغلاق (اختيارية)" : "السبب"} value={reason} maxLength={2000} disabled={busy} onChange={(event) => setReason(event.target.value)} />
      </div>
    </Dialog>
  );
}

/**
 * Where a decision's tasks stand, as one bar split by state: done, running,
 * late, cancelled. Each slice is also counted in words beneath it.
 */
function TaskMix({ decision }: { decision: FollowedDecision }) {
  const running = Math.max(0, decision.open_tasks - decision.overdue_tasks);
  const slices = [
    { key: "done", label: "منجزة", count: decision.completed_tasks, bar: "bg-q-success", dot: "bg-q-success" },
    { key: "running", label: "جارية", count: running, bar: "bg-q-primary", dot: "bg-q-primary" },
    { key: "late", label: "متأخرة", count: decision.overdue_tasks, bar: "bg-q-danger", dot: "bg-q-danger" },
    { key: "cancelled", label: "ملغاة", count: decision.cancelled_tasks, bar: "bg-q-border-strong", dot: "bg-q-border-strong" },
  ];
  if (decision.total_tasks === 0) {
    return <p className="m-0 text-q-caption text-q-text-2">لا تكليفات على هذا القرار.</p>;
  }
  return (
    <div className="flex items-center gap-4">
      <div className="flex shrink-0 flex-col items-center">
        <span dir="ltr" className="text-q-h2 font-bold leading-none text-q-text">{decision.progress_percent}%</span>
        <span className="text-q-caption text-q-text-2">إنجاز</span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-q-neutral-soft">
          {slices.filter((slice) => slice.count > 0).map((slice) => (
            <span key={slice.key} className={cn("h-full first:rounded-s-full last:rounded-e-full", slice.bar)} style={{ flexGrow: slice.count }} />
          ))}
        </div>
        <ul aria-label="حال المهام" className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-q-caption text-q-text-2">
          <li className="font-bold text-q-text">{decision.total_tasks === 1 ? "مهمة واحدة" : decision.total_tasks === 2 ? "مهمتان" : `${decision.total_tasks} مهام`}</li>
          {slices.filter((slice) => slice.count > 0).map((slice) => (
            <li key={slice.key} className={cn("flex items-center gap-1.5", slice.key === "late" && "font-bold text-q-danger")}>
              <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", slice.dot)} />
              {slice.label}: {slice.count}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function TaskRow({ task, onManage }: {
  task: DecisionTasks["tasks"][number];
  onManage: (manage: Manage) => void;
}) {
  const taskState = taskStatusLabel(task);
  const due = dueText(task);
  return (
    <li className="flex flex-col gap-2 rounded-q-control border border-q-border bg-q-surface p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-q-ui font-bold">{task.title_ar}</span>
        <Badge tone={taskState.tone}>{taskState.label}</Badge>
      </div>
      <JourneyRail compact label={`مسار المهمة: ${taskState.label}`} steps={taskJourney(task)} />
      <p className="m-0 flex flex-wrap gap-x-3 gap-y-1 text-q-caption text-q-text-2">
        <span dir="ltr">{task.action_no}</span>
        <span>المكلَّف: {assigneeName(task)}</span>
        <span>المتابع: {task.follow_up_user_name_ar ?? "غير محدد"}</span>
        <span className={due.tone === "danger" ? "font-bold text-q-danger" : undefined}>{due.text}{task.due_date && ` (${formatDate(task.due_date)})`}</span>
        <span dir="ltr" className="font-bold text-q-text">{task.progress_percent}%</span>
      </p>
      {task.can_manage && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => onManage({ kind: "extend", task })}>تمديد الموعد</Button>
          {task.status !== "submitted" && <Button variant="secondary" onClick={() => onManage({ kind: "reassign", task })}>إعادة إسناد</Button>}
          <Button variant="ghost" onClick={() => onManage({ kind: "cancel", task })}>إلغاء المهمة</Button>
        </div>
      )}
    </li>
  );
}

export function DecisionCard({ decision, open, onToggle, detail, detailError, onManage }: {
  decision: FollowedDecision;
  open: boolean;
  onToggle: () => void;
  detail: DecisionTasks | null;
  detailError: string | null;
  onManage: (manage: Manage) => void;
}) {
  const status = decisionStatusLabel(decision.decision_status);
  return (
    <li>
      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="m-0 text-q-caption font-bold text-q-text-2">
              <span dir="ltr">{decision.decision_no}</span>
              {decision.council_name_ar && <> · {decision.council_name_ar}</>}
              {decision.meeting_title_ar && <> · {decision.meeting_title_ar}</>}
            </p>
            <p className="m-0 mt-1 line-clamp-2 text-q-ui">{decision.decision_text}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={status.tone}>{status.label}</Badge>
            <Badge tone="neutral">{OUTCOME_KIND_LABEL[decision.outcome_kind] ?? "قرار"}</Badge>
          </div>
        </div>
        <TaskMix decision={decision} />
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" aria-expanded={open} onClick={onToggle}>{open ? "إخفاء المهام" : "عرض المهام"}</Button>
          {decision.decision_status !== "closed" && decision.can_manage && (
            <Button disabled={!decision.can_close} onClick={() => onManage({ kind: "close", decision })}>إغلاق القرار</Button>
          )}
          {decision.decision_status !== "closed" && decision.can_manage && decision.close_blocked_reason && (
            <span className="text-q-caption font-bold text-q-warning">{decision.close_blocked_reason}</span>
          )}
        </div>
        {open && (
          <section aria-label={`مهام القرار ${decision.decision_no}`} className="flex flex-col gap-2 border-t border-q-border pt-3">
            {detailError && <InlineMessage tone="error">{detailError}</InlineMessage>}
            {!detail && !detailError && <p role="status" className="m-0 text-q-ui text-q-text-2">جارٍ تحميل المهام…</p>}
            {detail && detail.tasks.length === 0 && <p className="m-0 text-q-ui text-q-text-2">لا تكليفات على هذا القرار.</p>}
            {detail && detail.tasks.length > 0 && (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {groupDecisionTasks(detail.tasks).map((group) => (
                  <li key={group.id}>
                    <details className="group rounded-q-control border border-q-border bg-q-surface-2 p-3">
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="m-0 text-q-ui font-bold text-q-text">{group.title_ar}</p>
                            <p className="m-0 mt-1 text-q-caption text-q-text-2">أُنجز {group.completed_count} من {group.target_count} · {group.tasks.length === 1 ? "مكلّف واحد" : `${group.tasks.length} مكلّفين`}</p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span dir="ltr" className="text-q-h3 font-bold text-q-text">{group.progress_percent}%</span>
                            <span className="text-q-caption font-bold text-q-link group-open:hidden">عرض مهام المكلّفين</span>
                            <span className="hidden text-q-caption font-bold text-q-link group-open:inline">إخفاء المهام</span>
                          </div>
                        </div>
                        <div aria-hidden="true" className="mt-3 h-2 overflow-hidden rounded-full bg-q-neutral-soft">
                          <span className="block h-full rounded-full bg-q-primary" style={{ width: `${group.progress_percent}%` }}/>
                        </div>
                      </summary>
                      <ul className="m-0 mt-3 flex list-none flex-col gap-2 border-t border-q-border pt-3 p-0">
                        {group.tasks.map((task) => <TaskRow key={task.id} task={task} onManage={onManage}/>) }
                      </ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </Card>
    </li>
  );
}

/**
 * The decisions a person follows, with their tasks. The council's chair, or a
 * holder of the management permission, extends, reassigns or cancels a task
 * with a written reason, and closes a decision once its tasks are finished.
 */
export function DecisionFollowUpWorkspace() {
  const [filter, setFilter] = useState<FollowUpFilter>("open");
  const [decisions, setDecisions] = useState<FollowedDecision[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DecisionTasks | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [manage, setManage] = useState<Manage | null>(null);
  const [busy, setBusy] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadList = useCallback(async (value: FollowUpFilter) => {
    try {
      setDecisions(await tasksRpc<FollowedDecision[]>("list_decision_follow_up_v2", { p_status: value }));
      setLoadError(null);
    } catch (error) {
      setLoadError(messageOf(error, "تعذر تحميل القرارات."));
    }
  }, []);

  const loadDetail = useCallback(async (decisionId: string) => {
    try {
      setDetail(await tasksRpc<DecisionTasks>("list_decision_tasks_v2", { p_decision_id: decisionId }));
      setDetailError(null);
    } catch (error) {
      setDetail(null);
      setDetailError(messageOf(error, "تعذر تحميل مهام القرار."));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void tasksRpc<FollowedDecision[]>("list_decision_follow_up_v2", { p_status: filter }).then(
      (data) => { if (!cancelled) { setDecisions(data); setLoadError(null); } },
      (error) => { if (!cancelled) setLoadError(messageOf(error, "تعذر تحميل القرارات.")); },
    );
    return () => { cancelled = true; };
  }, [filter]);

  function toggle(decisionId: string) {
    if (openId === decisionId) { setOpenId(null); return; }
    setOpenId(decisionId);
    setDetail(null);
    setDetailError(null);
    void loadDetail(decisionId);
  }

  async function submitManage(input: { reason: string; dueDate: string; unitId: string }) {
    if (!manage || busy) return;
    setBusy(true);
    setManageError(null);
    try {
      if (manage.kind === "close") {
        await tasksRpc("close_decision_v2", { p_decision_id: manage.decision.id, p_note: input.reason.trim() || null, p_expected_updated_at: manage.decision.updated_at });
      } else {
        const token = { p_task_id: manage.task.id, p_expected_updated_at: manage.task.updated_at };
        if (manage.kind === "extend") await tasksRpc("extend_task_due_date_v2", { ...token, p_due_date: input.dueDate, p_reason: input.reason.trim() });
        else if (manage.kind === "reassign") await tasksRpc("reassign_task_v2", { ...token, p_assigned_user_id: null, p_assigned_unit_id: input.unitId, p_reason: input.reason.trim() });
        else await tasksRpc("cancel_task_v2", { ...token, p_reason: input.reason.trim() });
      }
      setNotice({ extend: "مُدّد موعد المهمة.", reassign: "أُعيد إسناد المهمة.", cancel: "أُلغيت المهمة.", close: "أُغلق القرار." }[manage.kind]);
      setManage(null);
    } catch (error) {
      setManageError(messageOf(error, "تعذر تنفيذ الإجراء."));
    } finally {
      await loadList(filter);
      if (openId) await loadDetail(openId);
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 font-sans text-q-text">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl label="حالة القرارات" options={FOLLOW_UP_FILTERS} value={filter} onChange={(value) => { setFilter(value); setDecisions(null); setOpenId(null); }} />
        {notice && <InlineMessage tone="success">{notice}</InlineMessage>}
      </div>
      {loadError && (
        <div className="flex flex-wrap items-center gap-3">
          <InlineMessage tone="error">{loadError}</InlineMessage>
          <Button variant="secondary" onClick={() => void loadList(filter)}>إعادة المحاولة</Button>
        </div>
      )}
      {!decisions && !loadError && <p role="status" className="m-0 py-10 text-center text-q-ui font-bold text-q-text-2">جارٍ تحميل القرارات…</p>}
      {decisions && decisions.length === 0 && (
        <Card className="text-center"><p className="m-0 text-q-ui text-q-text-2">لا قرارات تتابعها في هذه القائمة.</p></Card>
      )}
      {decisions && decisions.length > 0 && (
        <ul aria-label="القرارات" className="m-0 flex list-none flex-col gap-3 p-0">
          {decisions.map((decision) => (
            <DecisionCard
              key={decision.id}
              decision={decision}
              open={openId === decision.id}
              onToggle={() => toggle(decision.id)}
              detail={openId === decision.id ? detail : null}
              detailError={openId === decision.id ? detailError : null}
              onManage={(next) => { setManageError(null); setNotice(null); setManage(next); }}
            />
          ))}
        </ul>
      )}
      {manage && (
        <ManageDialog
          key={manage.kind === "close" ? manage.decision.id : `${manage.kind}:${manage.task.id}`}
          manage={manage}
          units={detail?.units ?? []}
          busy={busy}
          error={manageError}
          onClose={() => setManage(null)}
          onSubmit={(input) => void submitManage(input)}
        />
      )}
    </div>
  );
}
