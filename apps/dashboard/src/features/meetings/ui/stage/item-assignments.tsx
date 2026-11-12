"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import type { AssignmentPreview, AssignmentPreviewRow, AssignmentTargetSelection, AssignmentUserOption, MeetingAssignment, MeetingAssignments, NewAssignment } from "../../model/live-meeting";

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
  onSearchUsers?: (query: string) => Promise<AssignmentUserOption[]>;
  /** Who the chosen targets resolve to, so each person can be seen and removed before issuing. */
  onPreview?: (targets: AssignmentTargetSelection[]) => Promise<AssignmentPreview>;
  onConfirm: (assignment: MeetingAssignment) => void;
  onWithdraw: (assignment: MeetingAssignment) => void;
  editorOpen?: boolean;
  onEditorChange?: (open: boolean) => void;
  /** The chair adds assignments from the control dock; the list then shows no button of its own. */
  addFromDock?: boolean;
};

type PersonPickerProps = {
  label: string;
  value: string;
  initial: AssignmentUserOption[];
  disabled: boolean;
  onChange: (value: string, option?: AssignmentUserOption) => void;
  onSearch: (query: string) => Promise<AssignmentUserOption[]>;
  units?: Array<{ id: string; name_ar: string }>;
  onUnitChange?: (value: string) => void;
};

function AssignmentPersonPicker({ label, value, initial, disabled, onChange, onSearch, units = [], onUnitChange }: PersonPickerProps) {
  const selected = initial.find((user) => user.id === value);
  const [query, setQuery] = useState(selected?.name_ar ?? "");
  const [results, setResults] = useState<AssignmentUserOption[]>(initial);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const root = useRef<HTMLDivElement>(null);

  // A list left open would cover the fields below it; a press anywhere else closes it.
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const closeOnKey = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", closeOnKey);
    return () => { document.removeEventListener("pointerdown", close); document.removeEventListener("keydown", closeOnKey); };
  }, [open]);

  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    const current = ++request.current;
    const timer = window.setTimeout(() => {
      void onSearch(text).then((users) => {
        if (request.current !== current) return;
        setResults(Array.from(new Map([...initial.filter((user) => user.name_ar.includes(text) || user.email?.includes(text)), ...users].map((user) => [user.id, user])).values()));
        setError(null);
      }).catch(() => {
        if (request.current !== current) return;
        setResults([]);
        setError("تعذر البحث عن المستخدمين. أعد المحاولة.");
      }).finally(() => {
        if (request.current === current) setLoading(false);
      });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [initial, onSearch, query]);

  return (
    <div ref={root} className="relative flex flex-col gap-1 text-q-caption font-bold text-q-text">
      <label>
        {label}
        <input
          value={query}
          disabled={disabled}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-label={`البحث عن ${label}`}
          aria-expanded={open}
          aria-controls={`${label}-results`}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            const next = event.target.value;
            setQuery(next);
            onChange("");
            setOpen(true);
            setError(null);
            setResults(initial.filter((user) => !next.trim() || user.name_ar.includes(next.trim()) || user.email?.includes(next.trim())));
            setLoading(next.trim().length >= 2);
            if (next.trim().length < 2) request.current += 1;
          }}
          className="mt-1 h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal text-q-text"
          placeholder="اكتب حرفين من الاسم أو البريد…"
        />
      </label>
      {open && !disabled && (
        <div id={`${label}-results`} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-52 overflow-y-auto rounded-q-control border border-q-border bg-q-surface p-1 shadow-q-card">
          {units.filter((unit) => !query.trim() || unit.name_ar.includes(query.trim())).map((unit) => (
            <button type="button" role="option" aria-selected={false} aria-label={unit.name_ar} key={`unit-${unit.id}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onChange(""); onUnitChange?.(unit.id); setQuery(unit.name_ar); setOpen(false); }} className="flex w-full flex-col items-start rounded-q-control px-3 py-2 text-start text-q-ui font-bold text-q-text hover:bg-q-surface-2">
              <span>{unit.name_ar}</span><span className="text-q-caption font-normal text-q-text-2">جهة تنظيمية</span>
            </button>
          ))}
          {error ? <p role="alert" className="m-0 px-3 py-2 font-normal text-q-danger">{error}</p> : results.map((user) => (
            <button
              type="button"
              role="option"
              aria-selected={value === user.id}
              key={user.id}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => { onChange(user.id, user); setQuery(user.name_ar); setOpen(false); }}
              className="flex w-full flex-col items-start rounded-q-control px-3 py-2 text-start text-q-ui font-bold text-q-text hover:bg-q-surface-2"
            >
              <span>{user.name_ar}</span>
              {(user.job_title || user.email) && <span className="text-q-caption font-normal text-q-text-2">{user.job_title ?? user.email}</span>}
            </button>
          ))}
          {loading && <p role="status" className="m-0 px-3 py-2 font-normal text-q-text-2">جارٍ البحث في جميع مستخدمي الجامعة…</p>}
          {!loading && !error && results.length === 0 && units.filter((unit) => !query.trim() || unit.name_ar.includes(query.trim())).length === 0 && <p className="m-0 px-3 py-2 font-normal text-q-text-2">لا توجد نتائج مطابقة.</p>}
        </div>
      )}
    </div>
  );
}

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
  if (assignment.action_status === "completed") return { label: "منجز", tone: "success" };
  if (assignment.action_status === "submitted") return { label: "نافذ · بانتظار التحقق", tone: "success" };
  return { label: "نافذ", tone: "success" };
}

/**
 * The decision's assignments. The chair's become execution tasks at once;
 * the rapporteur's wait for the chair. Everyone in the room reads them.
 */
export function ItemAssignments({ assignments, viewer, options, activity, onCreate, onSearchUsers, onPreview, onConfirm, onWithdraw, editorOpen, onEditorChange, addFromDock = false }: Props) {
  const [localOpen, setLocalOpen] = useState(false);
  const open = editorOpen ?? localOpen;
  function changeOpen(next: boolean) { if (onEditorChange) onEditorChange(next); else setLocalOpen(next); }
  const [title, setTitle] = useState("");
  const [targets, setTargets] = useState<AssignmentTargetSelection[]>([]);
  const [targetType, setTargetType] = useState("");
  const [targetScope, setTargetScope] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [requiresEvidence, setRequiresEvidence] = useState(false);
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID());
  const [preview, setPreview] = useState<{ state: "idle" | "loading" | "error" | "ready"; data: AssignmentPreview | null; forTargets: AssignmentTargetSelection[] | null }>({ state: "idle", data: null, forTargets: null });
  // People taken out of the list before issuing, by who they are (a person or a unit's responsible).
  const [removed, setRemoved] = useState<string[]>([]);
  const rowKey = (row: AssignmentPreviewRow) => row.target_kind === "user" ? `u:${row.target_user_id}` : `g:${row.target_unit_id}`;
  useEffect(() => {
    if (!onPreview || targets.length === 0) return;
    let current = true;
    const timer = window.setTimeout(() => {
      setPreview((last) => ({ state: "loading", data: last.data, forTargets: null }));
      onPreview(targets).then((data) => { if (current) setPreview({ state: "ready", data, forTargets: targets }); })
        .catch(() => { if (current) setPreview({ state: "error", data: null, forTargets: null }); });
    }, 250);
    return () => { current = false; window.clearTimeout(timer); };
  }, [onPreview, targets]);
  const live = Boolean(onPreview) && targets.length > 0;
  const fresh = live && preview.state === "ready" && preview.forTargets === targets;
  const previewRows = fresh && preview.data ? preview.data.targets : [];
  const blockerOf = (row: AssignmentPreviewRow) => preview.data?.blockers.find((blocker) => row.target_kind === "unit" && blocker.target_unit_id === row.target_unit_id)?.reason ?? null;
  const keptRows = previewRows.filter((row) => !removed.includes(rowKey(row)));
  // Withdrawing cancels a task, so it asks once more beside the button.
  const [confirmingWithdraw, setConfirmingWithdraw] = useState<string | null>(null);
  const busy = activity.key !== null;
  const canWrite = (viewer.can_issue || viewer.can_propose) && options !== null;
  const searchUsers = onSearchUsers ?? (async () => options?.users ?? []);
  function addTarget(target: AssignmentTargetSelection) {
    const key = `${target.kind}:${target.id}:${target.scopeUnitId ?? ""}`;
    setTargets((current) => current.some((item) => `${item.kind}:${item.id}:${item.scopeUnitId ?? ""}` === key) ? current : [...current, target]);
  }
  const missing = title.trim().length < 5 ? "اكتب عنوان التكليف بخمسة أحرف على الأقل."
    : targets.length === 0 ? "اختر مكلَّفاً واحداً على الأقل."
    : live && (preview.state === "loading" || (preview.state === "ready" && !fresh)) ? "جارٍ تحديد المكلَّفين…"
    : live && preview.state === "error" ? "تعذرت معاينة المكلَّفين؛ عدّل الاختيار أو أعد المحاولة."
    : fresh && keptRows.length === 0 ? "أُزيل كل المكلَّفين؛ اختر مكلَّفاً واحداً على الأقل."
    : keptRows.some((row) => blockerOf(row)) ? "بعض الجهات بلا مسؤول محدد؛ أزلها من القائمة أو عيّن لها مسؤولاً."
    : null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (missing || busy) return;
    // What was shown and kept is exactly what is sent, one entry per person or unit.
    const finalTargets: AssignmentTargetSelection[] = fresh
      ? keptRows.map((row) => row.target_kind === "user"
        ? { kind: "user" as const, id: row.target_user_id as string, label: row.resolved_user_name_ar ?? "" }
        : { kind: "unit" as const, id: row.target_unit_id as string, label: row.resolved_unit_name_ar ?? "" })
      : targets;
    const saved = await onCreate({
      title: title.trim(), targets: finalTargets,
      dueDate: dueDate || null, followUpId: followUp || null, requiresEvidence, clientRequestId,
    });
    if (saved) { setRemoved([]); setTitle(""); setTargets([]); setTargetType(""); setTargetScope(""); setDueDate(""); setFollowUp(""); setRequiresEvidence(false); setClientRequestId(crypto.randomUUID()); }
  }

  if (assignments.length === 0 && !canWrite) return null;
  return (
    <section aria-label="التكليفات" className="flex flex-col gap-3 border-t border-q-border pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="m-0 text-q-ui font-bold">التكليفات والمهام</h3>
        {canWrite && !addFromDock && <Button variant="secondary" disabled={busy} onClick={() => changeOpen(true)}>{viewer.can_issue ? "إضافة تكليف" : "اقتراح تكليف"}</Button>}
      </div>
      {canWrite && <p className="m-0 text-q-caption text-q-text-2">يمكن إصدار المطلوب نفسه لعدة أشخاص أو جهات دفعة واحدة. تنشأ لكل مستهدف مهمة مستقلة، ولا يصدر أي جزء إذا تعذر تحديد مسؤول إحدى الجهات.</p>}
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

      {canWrite && options && open && <Dialog title={viewer.can_issue ? "إضافة تكليف" : "اقتراح تكليف"} description="يرتبط بالقرار الحالي؛ حدد المطلوب والمكلَّف ومن يتابع التنفيذ." size="lg" scrollContent closeDisabled={busy} onClose={() => changeOpen(false)}>
        <form onSubmit={(event) => void submit(event)} aria-label="تكليف جديد" className="flex flex-col gap-3 rounded-q-control bg-q-surface-2 p-3">
          <section className="flex flex-col gap-3 rounded-q-control border border-q-border bg-q-surface p-4">
            <header><h3 className="m-0 flex items-center gap-2 text-q-ui font-bold text-q-text"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-q-primary text-q-caption text-q-on-primary">1</span>ما المطلوب؟</h3><p className="m-0 mt-1 text-q-caption text-q-text-2">اكتب المطلوب عمله بجملة واضحة.</p></header>
          <label className="flex flex-col gap-1 text-q-ui font-bold text-q-text">
            عنوان التكليف
            <input
              value={title}
              maxLength={300}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal text-q-text"
            />
          </label>
          </section>
          <section className="flex flex-col gap-3 rounded-q-control border border-q-border bg-q-surface p-4">
            <header><h3 className="m-0 flex items-center gap-2 text-q-ui font-bold text-q-text"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-q-primary text-q-caption text-q-on-primary">2</span>من المكلَّف؟</h3><p className="m-0 mt-1 text-q-caption text-q-text-2">اختر شخصاً أو جهة، أو استهدف نوع جهة بالكامل. يمكن الجمع بين أكثر من مكلَّف.</p></header>
          <AssignmentPersonPicker
              key={`target-${targets.length}`}
              label="إضافة شخص أو جهة"
              value=""
              initial={options.users}
              disabled={busy}
              units={options.units}
              onUnitChange={(id) => {
                const unit = options.units.find((item) => item.id === id);
                if (unit) addTarget({ kind: "unit", id, label: unit.name_ar });
              }}
              onChange={(id, selectedUser) => {
                const user = selectedUser ?? options.users.find((item) => item.id === id);
                if (user) addTarget({ kind: "user", id, label: user.name_ar });
              }}
              onSearch={async (query) => {
                const users = await searchUsers(query);
                return users.map((user) => user);
              }}
            />
          {targets.length > 0 && <div aria-label="المستهدفون المختارون" className="flex flex-wrap gap-2">
            {targets.map((target) => {
              const key = `${target.kind}:${target.id}:${target.scopeUnitId ?? ""}`;
              return <button key={key} type="button" disabled={busy} onClick={() => setTargets((current) => current.filter((item) => `${item.kind}:${item.id}:${item.scopeUnitId ?? ""}` !== key))} className="rounded-q-pill border border-q-primary bg-q-primary-soft px-3 py-2 text-q-caption font-bold text-q-primary">{target.label} ×</button>;
            })}
          </div>}
          {live && (
            <div aria-label="المكلَّفون" className="flex flex-col gap-2 rounded-q-control border border-q-border bg-q-surface-2 p-3">
              <p className="m-0 text-q-caption font-bold text-q-text">
                {preview.state === "loading" ? "جارٍ تحديد المكلَّفين…" : preview.state === "error" ? "تعذرت معاينة المكلَّفين." : `سيُكلَّف ${keptRows.length} ${keptRows.length === 1 ? "شخص" : "أشخاص"} — أزل من لا تريده قبل الإصدار`}
              </p>
              {fresh && <ul className="m-0 flex max-h-56 list-none flex-col gap-1 overflow-y-auto p-0">
                {previewRows.map((row) => {
                  const key = rowKey(row);
                  const blocker = blockerOf(row);
                  const gone = removed.includes(key);
                  return <li key={key} className={`flex items-center justify-between gap-2 rounded-q-control border px-3 py-2 ${gone ? "border-q-border bg-q-surface text-q-text-3 line-through" : blocker ? "border-q-danger bg-q-danger-soft" : "border-q-border bg-q-surface"}`}>
                    <span className="min-w-0 text-q-ui text-q-text">
                      <strong>{row.resolved_user_name_ar ?? row.resolved_unit_name_ar ?? "غير محدد"}</strong>
                      {row.target_kind === "unit" && row.resolved_unit_name_ar && row.resolved_user_name_ar && <span className="text-q-caption text-q-text-2"> · {row.resolved_unit_name_ar}</span>}
                      {blocker && <span className="block text-q-caption font-bold text-q-danger">{blocker}</span>}
                    </span>
                    <Button type="button" variant="ghost" disabled={busy} aria-label={`${gone ? "إعادة" : "إزالة"} ${row.resolved_user_name_ar ?? row.resolved_unit_name_ar ?? ""}`} onClick={() => setRemoved((current) => gone ? current.filter((item) => item !== key) : [...current, key])}>{gone ? "إعادة" : "إزالة"}</Button>
                  </li>;
                })}
              </ul>}
            </div>
          )}
          <div className="grid gap-3 rounded-q-control bg-q-surface-2 p-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
              أو استهدف نوع جهة بالكامل
              <select value={targetType} disabled={busy} onChange={(event) => setTargetType(event.target.value)} className="h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal text-q-text">
                <option value="">اختر نوع الجهة</option>
                {(options.unit_types ?? []).map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-q-caption font-bold text-q-text">
              ضمن جهة رئيسية (اختياري)
              <select value={targetScope} disabled={busy || !targetType} onChange={(event) => setTargetScope(event.target.value)} className="h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal text-q-text">
                <option value="">كل الجامعة</option>
                {options.units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}
              </select>
            </label>
            <Button type="button" variant="secondary" disabled={busy || !targetType} onClick={() => {
              const type = (options.unit_types ?? []).find((item) => item.id === targetType);
              const scope = options.units.find((item) => item.id === targetScope);
              if (type) addTarget({ kind: "unit_type", id: type.id, scopeUnitId: targetScope || null, label: scope ? `${type.name_ar} ضمن ${scope.name_ar}` : `كل ${type.name_ar}` });
            }}>إضافة النوع</Button>
          </div>
          </section>
          <section className="flex flex-col gap-3 rounded-q-control border border-q-border bg-q-surface p-4">
            <header><h3 className="m-0 flex items-center gap-2 text-q-ui font-bold text-q-text"><span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-full bg-q-primary text-q-caption text-q-on-primary">3</span>من يتابع وبأي شروط؟</h3><p className="m-0 mt-1 text-q-caption text-q-text-2">المتابع هو من يتحقق من الإنجاز.</p></header>
          <div className="grid gap-3 sm:grid-cols-2">
            <AssignmentPersonPicker label="المتابع (اختياري)" value={followUp} initial={options.users} disabled={busy} onChange={setFollowUp} onSearch={searchUsers} />
            <label className="flex min-h-11 items-center gap-2 self-end text-q-ui text-q-text">
              <input type="checkbox" checked={requiresEvidence} disabled={busy} onChange={(event) => setRequiresEvidence(event.target.checked)} className="h-5 w-5 accent-q-primary" />
              يتطلب أدلة إنجاز
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
          </div>
          </section>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={Boolean(missing)} pending={activity.key === NEW_ASSIGNMENT_KEY} pendingLabel="جارٍ الحفظ…">
              {viewer.can_issue ? "إصدار التكليف" : "اقتراح التكليف"}
            </Button>
            {activity.errorKey === NEW_ASSIGNMENT_KEY && activity.error
              ? <span role="alert" className="text-q-caption font-bold text-q-danger">{activity.error}</span>
              : <span className="text-q-caption text-q-text-2">{missing ?? (viewer.can_issue ? "يصبح التكليف مهمة تنفيذ فور إصداره، قبل اعتماد القرار." : "يظهر مقترحك لرئيس المجلس ليعتمده.")}</span>}
          </div>
        </form>
      </Dialog>}
    </section>
  );
}
