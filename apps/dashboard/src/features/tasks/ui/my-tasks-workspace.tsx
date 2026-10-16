"use client";

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/shared/lib/utils";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { removeTaskEvidence, tasksRpc, uploadTaskEvidence } from "../api/tasks-client";
import { assigneeName, TASK_LISTS, taskStatusLabel, type MyTasks, type TaskDetail, type TaskList, type TaskSummary } from "../model/tasks";
import { TaskDetailPanel, type TaskAction } from "./task-detail";

const messageOf = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
const dateFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "short", year: "numeric" });

function TaskRow({ task, selected, onSelect }: { task: TaskSummary; selected: boolean; onSelect: () => void }) {
  const state = taskStatusLabel(task);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex w-full flex-col gap-1 rounded-q-control border p-3 text-start font-sans transition-colors",
          selected ? "border-q-primary bg-q-surface-2" : "border-q-border bg-q-surface hover:bg-q-surface-2",
        )}
      >
        <span className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-q-ui font-bold text-q-text">{task.title_ar}</span>
          <Badge tone={state.tone}>{state.label}</Badge>
        </span>
        <span className="text-q-caption text-q-text-2">
          <span dir="ltr">{task.action_no}</span>
          {" · "}{assigneeName(task)}
          {task.due_date && <>{" · "}<span className={task.is_overdue ? "font-bold text-q-danger" : undefined}>حتى {dateFormat.format(new Date(`${task.due_date}T00:00:00`))}</span></>}
          {" · "}<span dir="ltr">{task.progress_percent}%</span>
        </span>
      </button>
    </li>
  );
}

/**
 * Everything a person has to do with assignments: the tasks they execute,
 * the ones awaiting their verification, and the ones they follow.
 */
export function MyTasksWorkspace() {
  const [tasks, setTasks] = useState<MyTasks | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [list, setList] = useState<TaskList>("to_execute");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [pending, setPending] = useState<TaskAction["kind"] | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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
        // Open where the person has work: verification first, then execution.
        setList(data.to_verify.length ? "to_verify" : data.to_execute.length ? "to_execute" : data.following.length ? "following" : "to_execute");
      },
      (error) => { if (!cancelled) setLoadError(messageOf(error, "تعذر تحميل مهامك.")); },
    );
    return () => { cancelled = true; };
  }, []);

  function select(taskId: string) {
    setSelectedId(taskId);
    setActionError(null);
    setNotice(null);
    void loadDetail(taskId);
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
  return (
    <div className="grid items-start gap-4 font-sans text-q-text lg:grid-cols-[minmax(20rem,26rem)_minmax(0,1fr)]">
      <Card className="flex min-w-0 flex-col gap-3">
        <SegmentedControl
          label="قوائم المهام"
          options={TASK_LISTS.map((entry) => ({ value: entry.value, label: `${entry.label} (${tasks[entry.value].length})` }))}
          value={list}
          onChange={(value) => setList(value)}
        />
        {loadError && <InlineMessage tone="error">{loadError}</InlineMessage>}
        {rows.length === 0 ? (
          <p className="m-0 rounded-q-control bg-q-surface-2 p-4 text-center text-q-ui text-q-text-2">{current.empty}</p>
        ) : (
          <ul aria-label={`مهام ${current.label}`} className="m-0 flex list-none flex-col gap-2 p-0">
            {rows.map((task) => <TaskRow key={task.id} task={task} selected={task.id === selectedId} onSelect={() => select(task.id)} />)}
          </ul>
        )}
      </Card>
      <div className="flex min-w-0 flex-col gap-3">
        {notice && <InlineMessage tone="success">{notice}</InlineMessage>}
        {detailError && <InlineMessage tone="error">{detailError}</InlineMessage>}
        {detail ? (
          <TaskDetailPanel key={detail.id} task={detail} pending={pending} error={actionError} onAction={perform} />
        ) : !detailError && (
          <Card className="text-center"><p className="m-0 text-q-ui text-q-text-2">{selectedId ? "جارٍ تحميل المهمة…" : "اختر مهمة لعرض تفاصيلها وإجراءاتها."}</p></Card>
        )}
      </div>
    </div>
  );
}
