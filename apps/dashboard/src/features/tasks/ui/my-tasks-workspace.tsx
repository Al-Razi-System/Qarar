"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { removeTaskEvidence, tasksRpc, uploadTaskEvidence } from "../api/tasks-client";
import { JourneyRail } from "@/shared/ui/journey-rail";
import { dueText, taskJourney, URGENCY_GROUPS, urgencyOf, type DueTone, type Urgency } from "../model/journey";
import { assigneeName, TASK_LISTS, taskStatusLabel, type MyTasks, type TaskDetail, type TaskList, type TaskSummary } from "../model/tasks";
import { TaskDetailPanel, type TaskAction } from "./task-detail";

const messageOf = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

const dueClass: Record<DueTone, string> = {
  danger: "font-bold text-q-danger",
  warning: "font-bold text-q-warning",
  neutral: "text-q-text-2",
  success: "font-bold text-q-success",
};

function TaskRow({ task, selected, onSelect }: { task: TaskSummary; selected: boolean; onSelect: () => void }) {
  const state = taskStatusLabel(task);
  const due = dueText(task);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-2 rounded-q-control border p-3 text-start font-sans transition-colors",
          selected ? "border-q-primary bg-q-surface-2 ring-1 ring-q-primary" : "border-q-border bg-q-surface hover:border-q-border-strong",
        )}
      >
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0 text-q-ui font-bold leading-snug text-q-text">{task.title_ar}</span>
          <span className={cn("shrink-0 text-q-caption", dueClass[due.tone])}>{due.text}</span>
        </span>
        <JourneyRail compact label={`مسار المهمة: ${state.label}`} steps={taskJourney(task)} />
        <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-q-caption text-q-text-2">
          <span className="min-w-0 truncate">{assigneeName(task)}{task.meeting_title_ar && `، ${task.meeting_title_ar}`}</span>
          <span className="flex items-center gap-2">
            {task.requires_evidence && task.evidence_count === 0 && task.status !== "completed" && <span className="font-bold text-q-warning">ينقصها دليل</span>}
            <span dir="ltr" className="font-bold text-q-text">{task.progress_percent}%</span>
          </span>
        </span>
      </button>
    </li>
  );
}

const plural = (count: number, one: string, two: string, few: string) => count === 1 ? one : count === 2 ? two : `${count} ${few}`;

/** What is waiting on the person, as sentences that open the right list. */
function AttentionStrip({ tasks, active, onPick }: { tasks: MyTasks; active: string | null; onPick: (list: TaskList, focus: Urgency | null) => void }) {
  const toVerify = tasks.to_verify.length;
  const overdue = tasks.to_execute.filter((task) => urgencyOf(task) === "overdue").length;
  const soon = tasks.to_execute.filter((task) => urgencyOf(task) === "this_week").length;
  const items = [
    toVerify > 0 && { key: "verify", text: `${plural(toVerify, "مهمة", "مهمتان", "مهام")} بانتظار تحققك`, tone: "border-q-primary text-q-link", on: "bg-q-primary text-q-on-primary", pick: () => onPick("to_verify", null) },
    overdue > 0 && { key: "overdue", text: `${plural(overdue, "مهمة متأخرة", "مهمتان متأخرتان", "مهام متأخرة")}`, tone: "border-q-danger text-q-danger", on: "bg-q-danger text-q-on-danger", pick: () => onPick("to_execute", "overdue") },
    soon > 0 && { key: "soon", text: `${plural(soon, "مهمة", "مهمتان", "مهام")} موعدها خلال أسبوع`, tone: "border-q-warning text-q-warning", on: "bg-q-warning text-q-bg", pick: () => onPick("to_execute", "this_week") },
  ].filter(Boolean) as Array<{ key: string; text: string; tone: string; on: string; pick: () => void }>;
  const open = tasks.to_execute.length;
  return (
    <section aria-label="ما ينتظرك" className="flex flex-col gap-3 rounded-q-card border border-q-border bg-q-surface p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-0.5">
        <h2 className="m-0 text-q-h3 font-bold">{items.length === 0 ? "لا شيء عاجل ينتظرك" : "ما ينتظرك اليوم"}</h2>
        <p className="m-0 text-q-ui text-q-text-2">
          {open === 0 ? "لست مكلَّفاً بمهام مفتوحة." : `أنت مكلَّف بـ${plural(open, "مهمة واحدة", "مهمتين", "مهام")} مفتوحة${tasks.following.length ? `، وتتابع ${plural(tasks.following.length, "مهمة", "مهمتين", "مهام")}` : ""}.`}
        </p>
      </div>
      {items.length > 0 && (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
          {items.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                aria-pressed={active === item.key}
                onClick={item.pick}
                className={cn("min-h-11 rounded-full border-2 px-4 font-sans text-q-ui font-bold transition-colors", item.tone, active === item.key ? item.on : "bg-q-surface hover:bg-q-surface-2")}
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Everything a person has to do with assignments: the tasks they execute,
 * the ones awaiting their verification, and the ones they follow.
 */
export function MyTasksWorkspace({ initialTaskId = null }: { initialTaskId?: string | null }) {
  const [tasks, setTasks] = useState<MyTasks | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [list, setList] = useState<TaskList>("to_execute");
  const [focus, setFocus] = useState<Urgency | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pending, setPending] = useState<TaskAction["kind"] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const detailRef = useRef<HTMLDivElement>(null);

  const loadList = useCallback(async () => {
    try {
      const data = await tasksRpc<MyTasks>("list_my_tasks_v2");
      setTasks(data);
      setLoadError(null);
      return data;
    } catch (error) {
      setLoadError(messageOf(error, "تعذر تحميل مهامك."));
      return null;
    }
  }, []);

  const loadDetail = useCallback(async (taskId: string) => {
    try {
      setDetail(await tasksRpc<TaskDetail>("get_task_v2", { p_task_id: taskId }));
      setDetailError(null);
    } catch (error) {
      setDetail(null);
      setDetailError(messageOf(error, "تعذر تحميل المهمة."));
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void tasksRpc<MyTasks>("list_my_tasks_v2").then(
      (data) => {
        if (cancelled) return;
        setTasks(data);
        const linkedList = initialTaskId
          ? TASK_LISTS.find((entry) => data[entry.value].some((task) => task.id === initialTaskId))?.value
          : undefined;
        // A notification link opens its addressed task; otherwise open where the person has work.
        setList(linkedList ?? (data.to_verify.length ? "to_verify" : data.to_execute.length ? "to_execute" : data.following.length ? "following" : "to_execute"));
        if (initialTaskId) {
          setSelectedId(initialTaskId);
          void loadDetail(initialTaskId);
        }
      },
      (error) => { if (!cancelled) setLoadError(messageOf(error, "تعذر تحميل مهامك.")); },
    );
    return () => { cancelled = true; };
  }, [initialTaskId, loadDetail]);

  function select(taskId: string) {
    setSelectedId(taskId);
    setActionError(null);
    setNotice(null);
    // On a narrow screen the details sit under the list; bring them into view.
    void loadDetail(taskId).then(() => {
      if (window.matchMedia?.("(max-width: 1023px)").matches) detailRef.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    });
  }

  async function perform(action: TaskAction) {
    if (!detail || pending) return false;
    setPending(action.kind);
    setActionError(null);
    setNotice(null);
    const token = { p_task_id: detail.id, p_expected_updated_at: detail.updated_at };
    try {
      if (action.kind === "start") await tasksRpc("start_task_v2", token);
      else if (action.kind === "progress") await tasksRpc("update_task_progress_v2", { ...token, p_percent: action.percent, p_note: action.note.trim() || null });
      else if (action.kind === "submit") await tasksRpc("submit_task_completion_v2", { ...token, p_note: action.note.trim() || null });
      else if (action.kind === "verify") await tasksRpc("verify_task_completion_v2", { ...token, p_note: action.note.trim() || null });
      else if (action.kind === "return") await tasksRpc("return_task_v2", { ...token, p_reason: action.reason.trim() });
      else if (action.kind === "upload") await uploadTaskEvidence(detail.id, action.file, action.description);
      else await removeTaskEvidence(action.evidenceId);
      setNotice({
        start: "بدأ تنفيذ المهمة.", progress: "حُفظت نسبة الإنجاز.", submit: "سُلّمت المهمة للتحقق.",
        verify: "اعتُمد إنجاز المهمة.", return: "أُعيدت المهمة للتنفيذ.", upload: "أُرفق الدليل.", remove_evidence: "حُذف الدليل.",
      }[action.kind]);
      return true;
    } catch (error) {
      setActionError(messageOf(error, "تعذر تنفيذ الإجراء."));
      return false;
    } finally {
      // The server's state decides what is shown next, after success or failure.
      await Promise.all([loadDetail(detail.id), loadList()]);
      setPending(null);
    }
  }

  if (!tasks && !loadError) return <p role="status" className="m-0 py-10 text-center font-sans text-q-ui font-bold text-q-text-2">جارٍ تحميل مهامك…</p>;
  if (!tasks) {
    return (
      <div className="flex flex-col items-start gap-3 font-sans">
        <InlineMessage tone="error">{loadError}</InlineMessage>
        <Button variant="secondary" onClick={() => { setLoadError(null); void loadList(); }}>إعادة المحاولة</Button>
      </div>
    );
  }

  const current = TASK_LISTS.find((entry) => entry.value === list)!;
  const rows = tasks[list];
  const groups = URGENCY_GROUPS
    .filter((group) => !focus || group.value === focus)
    .map((group) => ({ ...group, rows: rows.filter((task) => urgencyOf(task) === group.value) }))
    .filter((group) => group.rows.length > 0);
  return (
    <div className="flex flex-col gap-4 font-sans text-q-text">
      <AttentionStrip tasks={tasks} active={list === "to_verify" ? "verify" : focus === "overdue" ? "overdue" : focus === "this_week" ? "soon" : null} onPick={(next, nextFocus) => { setList(next); setFocus(nextFocus); }} />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      <Card className="flex min-w-0 flex-col gap-3">
        <SegmentedControl
          label="قوائم المهام"
          options={TASK_LISTS.map((entry) => ({ value: entry.value, label: `${entry.label} (${tasks[entry.value].length})` }))}
          value={list}
          onChange={(value) => { setList(value); setFocus(null); }}
        />
        {loadError && <InlineMessage tone="error">{loadError}</InlineMessage>}
        {focus && (
          <div className="flex items-center justify-between gap-2 rounded-q-control bg-q-surface-2 px-3 py-1 text-q-caption">
            <span className="font-bold">تعرض: {URGENCY_GROUPS.find((group) => group.value === focus)?.label}</span>
            <Button variant="ghost" onClick={() => setFocus(null)}>عرض الكل</Button>
          </div>
        )}
        {groups.length === 0 ? (
          <p className="m-0 rounded-q-control bg-q-surface-2 p-4 text-center text-q-ui text-q-text-2">{current.empty}</p>
        ) : (
          <div aria-label={`مهام ${current.label}`} role="list" className="flex flex-col gap-4">
            {groups.map((group) => (
              <section key={group.value} role="listitem" aria-label={group.label} className="flex flex-col gap-2">
                <h3 className={cn("m-0 flex items-center gap-2 text-q-caption font-bold", group.value === "overdue" ? "text-q-danger" : "text-q-text-2")}>
                  {group.label}
                  <span className="rounded-full bg-q-neutral-soft px-2 text-q-text-2">{group.rows.length}</span>
                </h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {group.rows.map((task) => <TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={() => select(task.id)} />)}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Card>
      <div ref={detailRef} className="flex min-w-0 scroll-mt-4 flex-col gap-3">
        {notice && <InlineMessage tone="success">{notice}</InlineMessage>}
        {detailError && <InlineMessage tone="error">{detailError}</InlineMessage>}
        {detail ? (
          <TaskDetailPanel key={detail.id} task={detail} pending={pending} error={actionError} onAction={perform} />
        ) : !detailError && (
          selectedId ? (
            <Card className="text-center"><p role="status" className="m-0 text-q-ui text-q-text-2">جارٍ تحميل المهمة…</p></Card>
          ) : (
            <Card className="flex flex-col gap-5 py-8">
              <div className="flex flex-col gap-1 text-center">
                <p className="m-0 text-q-h3 font-bold">اختر مهمة من القائمة</p>
                <p className="m-0 text-q-ui text-q-text-2">تمر كل مهمة بأربع محطات، من قرار المجلس إلى اعتماد إنجازها.</p>
              </div>
              <JourneyRail
                label="محطات المهمة"
                className="mx-auto w-full max-w-xl"
                steps={[
                  { label: "تكليف", state: "done", detail: "يصدره رئيس المجلس" },
                  { label: "تنفيذ", state: "current", detail: "إنجاز وأدلة" },
                  { label: "تسليم", state: "upcoming", detail: "يرسله المكلَّف" },
                  { label: "تحقق", state: "upcoming", detail: "يعتمده المتابع" },
                ]}
              />
            </Card>
          )
        )}
      </div>
      </div>
    </div>
  );
}
