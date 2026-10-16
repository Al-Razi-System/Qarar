"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import type { MeetingAssignment, MeetingAssignments, NewAssignment } from "../../model/live-meeting";

/** What is running now, so its button shows pending and the others wait. */
export type AssignmentActivity = { key: string | null; errorKey: string | null; error: string | null };
export const NEW_ASSIGNMENT_KEY = "new";

type Props = {
  assignments: MeetingAssignment[];
  viewer: MeetingAssignments["viewer"];
  options: MeetingAssignments["options"];
  activity: AssignmentActivity;
  /** Resolves true when the assignment was saved; the form then clears. */
  onCreate: (input: NewAssignment) => Promise<boolean>;
  onConfirm: (assignment: MeetingAssignment) => void;
  onWithdraw: (assignment: MeetingAssignment) => void;
};

const dateFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
const today = () => new Date().toLocaleDateString("en-CA");

function dueLabel(value: string | null) {
  if (!value) return "بلا موعد محدد";
  return `موعد الإنجاز ${dateFormat.format(new Date(`${value}T00:00:00`))}`;
}

function stateOf(assignment: MeetingAssignment): { label: string; tone: "warning" | "success" | "neutral" } {
  if (assignment.status === "proposed") return { label: "مقترح بانتظار اعتماد الرئيس", tone: "warning" };
  if (assignment.status === "withdrawn") return { label: "مسحوب", tone: "neutral" };
  if (assignment.action_status === "cancelled") return { label: "أُلغيت مهمته", tone: "neutral" };
  return { label: "نافذ", tone: "success" };
}

/**
 * The decision's assignments. The chair's become execution tasks at once;
 * the rapporteur's wait for the chair. Everyone in the room reads them.
 */
export function ItemAssignments({ assignments, viewer, options, activity, onCreate, onConfirm, onWithdraw }: Props) {
  const [title, setTitle] = useState("");
  const [assignee, setAssignee] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [requiresEvidence, setRequiresEvidence] = useState(false);
  // Withdrawing cancels a task, so it asks once more beside the button.
  const [confirmingWithdraw, setConfirmingWithdraw] = useState<string | null>(null);
  const busy = activity.key !== null;
  const canWrite = (viewer.can_issue || viewer.can_propose) && options !== null;
  const missing = title.trim().length < 5 ? "اكتب عنوان التكليف بخمسة أحرف على الأقل."
    : !assignee ? "اختر المكلَّف."
    : !followUp ? "اختر متابع التكليف؛ هو من يتحقق من إنجازه."
    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missing || busy) return;
    const [kind, id] = assignee.split(":");
    const saved = await onCreate({
      title: title.trim(), userId: kind === "user" ? id : null, unitId: kind === "unit" ? id : null,
      dueDate: dueDate || null, followUpId: followUp, requiresEvidence,
    });
    if (saved) { setTitle(""); setAssignee(""); setDueDate(""); setFollowUp(""); setRequiresEvidence(false); }
  }

  if (assignments.length === 0 && !canWrite) return null;
  return (
    <section aria-label="التكليفات" className="flex flex-col gap-3 border-t border-q-border pt-4">
      <h3 className="m-0 text-q-ui font-bold">التكليفات</h3>
      {assignments.length === 0 ? (
        <p className="m-0 text-q-ui text-q-text-2">لا تكليفات على هذا القرار بعد.</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {assignments.map((assignment) => {
            const state = stateOf(assignment);
            const confirmable = viewer.can_issue && assignment.status === "proposed";
            const withdrawable = assignment.status === "proposed"
              ? viewer.can_issue || (viewer.can_propose && assignment.proposed_by_me)
              : assignment.status === "active" && viewer.can_issue && assignment.action_status === "new";
            const pending = activity.key === assignment.id;
            return (
              <li key={assignment.id} className="flex flex-col gap-2 rounded-q-control border border-q-border bg-q-surface p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="m-0 text-q-ui font-bold">{assignment.title_ar}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={state.tone}>{state.label}</Badge>
                    {assignment.action_no && <span dir="ltr" className="text-q-caption text-q-text-2">{assignment.action_no}</span>}
                  </div>
                </div>
                <p className="m-0 text-q-caption text-q-text-2">
                  المكلَّف: {assignment.assigned_user_name_ar ?? assignment.assigned_unit_name_ar ?? "غير محدد"}
                  {" · "}المتابع: {assignment.follow_up_user_name_ar ?? "غير محدد"}
                  {" · "}{dueLabel(assignment.due_date)}
                  {assignment.requires_evidence && " · يتطلب أدلة إنجاز"}
                </p>
                {(confirmable || withdrawable) && (
                  <div className="flex flex-wrap items-center gap-2">
                    {confirmable && <Button disabled={busy} pending={pending} pendingLabel="جارٍ التنفيذ…" onClick={() => onConfirm(assignment)}>اعتماد التكليف</Button>}
                    {withdrawable && confirmingWithdraw !== assignment.id && <Button variant="secondary" disabled={busy} onClick={() => setConfirmingWithdraw(assignment.id)}>سحب التكليف</Button>}
                    {withdrawable && confirmingWithdraw === assignment.id && (
                      <>
                        <span className="text-q-caption font-bold text-q-warning">{assignment.status === "active" ? "تُلغى مهمة التنفيذ." : "يُحذف المقترح من القائمة النافذة."}</span>
                        <Button variant="secondary" disabled={busy} pending={pending} pendingLabel="جارٍ السحب…" onClick={() => { setConfirmingWithdraw(null); onWithdraw(assignment); }}>تأكيد السحب</Button>
                        <Button variant="ghost" disabled={busy} onClick={() => setConfirmingWithdraw(null)}>تراجع</Button>
                      </>
                    )}
                  </div>
                )}
                {activity.errorKey === assignment.id && activity.error && <p role="alert" className="m-0 text-q-caption font-bold text-q-danger">{activity.error}</p>}
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && options && (
        <form onSubmit={(event) => void submit(event)} aria-label="تكليف جديد" className="flex flex-col gap-3 rounded-q-control bg-q-surface-2 p-3">
          <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
            عنوان التكليف
            <input
              value={title}
              maxLength={300}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal text-q-text"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
              المكلَّف
              <select
                value={assignee}
                disabled={busy}
                onChange={(event) => setAssignee(event.target.value)}
                className="h-11 rounded-q-control border border-q-border bg-q-surface px-2 text-q-ui font-normal text-q-text"
              >
                <option value="">اختر عضواً أو جهة</option>
                {options.users.length > 0 && <optgroup label="أعضاء الاجتماع">{options.users.map((user) => <option key={user.id} value={`user:${user.id}`}>{user.name_ar}</option>)}</optgroup>}
                {options.units.length > 0 && <optgroup label="الجهات">{options.units.map((unit) => <option key={unit.id} value={`unit:${unit.id}`}>{unit.name_ar}</option>)}</optgroup>}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
              موعد الإنجاز (اختياري)
              <input
                type="date"
                value={dueDate}
                min={today()}
                disabled={busy}
                onChange={(event) => setDueDate(event.target.value)}
                className="h-11 rounded-q-control border border-q-border bg-q-surface px-2 text-q-ui font-normal text-q-text"
              />
            </label>
            <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
              المتابع
              <select
                value={followUp}
                disabled={busy}
                onChange={(event) => setFollowUp(event.target.value)}
                className="h-11 rounded-q-control border border-q-border bg-q-surface px-2 text-q-ui font-normal text-q-text"
              >
                <option value="">اختر من يتابع التنفيذ</option>
                {options.users.map((user) => <option key={user.id} value={user.id}>{user.name_ar}</option>)}
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 self-end text-q-ui text-q-text">
              <input type="checkbox" checked={requiresEvidence} disabled={busy} onChange={(event) => setRequiresEvidence(event.target.checked)} className="h-5 w-5 accent-q-primary" />
              يتطلب أدلة إنجاز
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={Boolean(missing)} pending={activity.key === NEW_ASSIGNMENT_KEY} pendingLabel="جارٍ الحفظ…">
              {viewer.can_issue ? "إصدار التكليف" : "اقتراح التكليف"}
            </Button>
            {activity.errorKey === NEW_ASSIGNMENT_KEY && activity.error
              ? <span role="alert" className="text-q-caption font-bold text-q-danger">{activity.error}</span>
              : <span className="text-q-caption text-q-text-2">{missing ?? (viewer.can_issue ? "يصبح التكليف مهمة تنفيذ فور إصداره، قبل اعتماد القرار." : "يظهر مقترحك لرئيس المجلس ليعتمده.")}</span>}
          </div>
        </form>
      )}
    </section>
  );
}
