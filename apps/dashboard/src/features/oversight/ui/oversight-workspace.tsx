"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Eye, Plus, Search } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { CollapsibleSection } from "@/shared/ui/collapsible-section";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { TextArea } from "@/shared/ui/text-area";
import { OversightRulesSection } from "./oversight-rules-section";
import {
  councilCount, definitionFrom, emptyDefinition, holderSentence, isPreviewable, scopeSentence, toContract, unitOptions,
  type HolderKind, type OversightAssignment, type OversightDefinition, type OversightPreview, type OversightWorkspaceData, type TargetMode,
} from "../model/oversight";

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/oversight", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

const fieldClass = "mt-1 min-h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text outline-none focus:border-q-focus";

/** A labelled control; the hint is described, not part of the accessible name. */
function Field({ label, children, hint }: { label: string; children: (describedBy?: string) => ReactNode; hint?: string }) {
  const hintId = useId();
  return (
    <div>
      <label className="block text-q-caption font-bold text-q-text-2">
        {label}
        {children(hint ? hintId : undefined)}
      </label>
      {hint && <p id={hintId} className="mt-1 text-q-caption text-q-text-3">{hint}</p>}
    </div>
  );
}

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("ar-SA-u-nu-latn", { dateStyle: "medium" });
}

function AssignmentCard({ assignment, onEdit, onEnd }: { assignment: OversightAssignment; onEdit: () => void; onEnd: () => void }) {
  const holder = holderSentence(assignment);
  const active = assignment.status === "active";
  const holders = assignment.coverage?.holders ?? [];
  const from = formatDate(assignment.starts_on);
  const to = formatDate(assignment.ends_on);
  return (
    <article aria-label={assignment.title_ar ?? holder} className="flex flex-col gap-3 rounded-q-card border border-q-border bg-q-surface p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
      <div className="min-w-0 space-y-1">
        {assignment.title_ar && <p className="text-q-caption font-bold text-q-text-3">{assignment.title_ar}</p>}
        <h3 className="text-q-ui font-black text-q-text">{holder}</h3>
        <p className="text-q-ui text-q-text-2">{scopeSentence(assignment)}</p>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Badge tone={active ? "info" : "neutral"}>{councilCount(assignment.coverage?.council_count ?? 0)}</Badge>
          {!active && <Badge tone="neutral">منتهية</Badge>}
          {active && assignment.holder_kind !== "user" && (
            <span className="text-q-caption text-q-text-3">
              {holders.length ? `يشغلها الآن: ${holders.slice(0, 4).join("، ")}${holders.length > 4 ? ` و${(holders.length - 4).toLocaleString("ar-SA-u-nu-latn")} آخرون` : ""}` : "لا أحد يشغل هذا المنصب الآن"}
            </span>
          )}
        </div>
        <p className="text-q-caption text-q-text-3">
          {active ? `سارية ${from ? `من ${from}` : ""}${to ? ` حتى ${to}` : " دون تاريخ نهاية"}` : `أُنهيت${assignment.end_reason ? `: ${assignment.end_reason}` : ""}`}
        </p>
      </div>
      {active && (
        <div className="flex shrink-0 gap-2">
          <Button variant="secondary" onClick={onEdit}>تعديل</Button>
          <Button variant="ghost" onClick={onEnd}>إنهاء</Button>
        </div>
      )}
    </article>
  );
}

function PreviewPanel({ preview, loading, error, ready }: { preview: OversightPreview | null; loading: boolean; error: string | null; ready: boolean }) {
  if (!ready) return <p className="text-q-caption text-q-text-3">اختر المتابِع والنطاق لترى المجالس التي سيشملها.</p>;
  if (error) return <InlineMessage tone="error">{error}</InlineMessage>;
  if (loading && !preview) return <p role="status" className="text-q-caption text-q-text-3">يجري حساب المجالس المشمولة…</p>;
  if (!preview) return null;
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-q-ui font-black text-q-text">سيتابع {councilCount(preview.council_count)}</p>
      {preview.council_count === 0 && <InlineMessage tone="warning">لا يشمل هذا النطاق أي مجلس مربوط بوحدة. راجع الوحدة أو أنواع المجالس.</InlineMessage>}
      {preview.councils.length > 0 && (
        <p className="text-q-caption text-q-text-2">
          {preview.councils.slice(0, 8).map((council) => council.name_ar).join("، ")}
          {preview.councils.length > 8 && ` و${(preview.councils.length - 8).toLocaleString("ar-SA-u-nu-latn")} أخرى`}
        </p>
      )}
      <p className="text-q-caption text-q-text-3">
        {preview.holders.length
          ? `يشغلها الآن: ${preview.holders.map((holder) => holder.name_ar ?? "مستخدم").join("، ")}`
          : "لا أحد يشغل هذا المنصب الآن؛ ستعمل المتابعة تلقائيًا فور تعيين من يشغله."}
      </p>
    </div>
  );
}

function AssignmentDialog({ data, editing, onClose, onSaved }: {
  data: OversightWorkspaceData; editing: OversightAssignment | null; onClose: () => void; onSaved: (assignment: OversightAssignment) => void;
}) {
  const [definition, setDefinition] = useState<OversightDefinition>(() => (editing ? definitionFrom(editing) : emptyDefinition()));
  const [requestId] = useState(() => crypto.randomUUID());
  const [preview, setPreview] = useState<OversightPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [councilFilter, setCouncilFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const units = useMemo(() => unitOptions(data.units), [data.units]);
  const ready = isPreviewable(definition);
  const contract = JSON.stringify(toContract(definition));

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setPreviewLoading(true);
      void rpc<OversightPreview>("admin_preview_oversight_v2", { p_definition: JSON.parse(contract) })
        .then((value) => { if (!cancelled) { setPreview(value); setPreviewError(null); } })
        .catch((error: unknown) => { if (!cancelled) setPreviewError(error instanceof Error ? error.message : "تعذر حساب المعاينة."); })
        .finally(() => { if (!cancelled) setPreviewLoading(false); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [contract, ready]);

  const update = (patch: Partial<OversightDefinition>) => { setSaveError(null); setDefinition((current) => ({ ...current, ...patch })); };
  const toggle = (key: "target_class_ids" | "council_ids", id: string) =>
    update({ [key]: definition[key].includes(id) ? definition[key].filter((value) => value !== id) : [...definition[key], id] });

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const saved = await rpc<OversightAssignment>("admin_save_oversight_assignment_v2", {
        p_assignment_id: editing?.id ?? null, p_definition: toContract(definition),
        p_expected_version: editing?.version ?? null, p_request_id: requestId,
      });
      onSaved(saved);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "تعذر حفظ التعيين.");
    } finally {
      setSaving(false);
    }
  }

  const visibleCouncils = data.councils.filter((council) => !councilFilter.trim() || council.name_ar.includes(councilFilter.trim()));
  const ruleScope = definition.holder_kind === "position_rule";

  return (
    <Dialog
      title={editing ? "تعديل تعيين متابعة" : "تعيين متابعة"}
      description="المتابعة اطلاع على الأداء والتجاوزات فقط، ولا تمنح أي صلاحية إدارة أو تصويت."
      onClose={onClose}
      closeDisabled={saving}
      size="lg"
      scrollContent
      footer={(
        <>
          {saveError && <InlineMessage tone="error">{saveError}</InlineMessage>}
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button onClick={() => void save()} pending={saving} pendingLabel="جارٍ الحفظ…">حفظ التعيين</Button>
        </>
      )}
    >
      <div className="space-y-5">
        <Field label="عنوان مختصر (اختياري)" hint="مثل: متابعة رئيس مجلس الأمناء. يظهر في القائمة وفي سجل التدقيق.">
{(describedBy) => (
          <input aria-describedby={describedBy} value={definition.title_ar} maxLength={200} onChange={(event) => update({ title_ar: event.target.value })} className={fieldClass} />)}
</Field>

        <fieldset className="space-y-3">
          <legend className="text-q-ui font-black text-q-text">من يتابع؟</legend>
          <SegmentedControl<HolderKind>
            label="نوع المتابِع"
            options={[
              { value: "council_position", label: "منصب في مجلس" },
              { value: "position_rule", label: "قاعدة لكل مجالس نوع" },
              { value: "user", label: "شخص محدد" },
            ]}
            value={definition.holder_kind}
            onChange={(value) => update({ holder_kind: value })}
            className="w-full overflow-x-auto"
          />
          <p className="text-q-caption text-q-text-3">
            {definition.holder_kind === "council_position" && "المتابعة لمن يشغل المنصب، وتنتقل تلقائيًا عند تغيّره. مثل: رئيس مجلس الأمناء."}
            {definition.holder_kind === "position_rule" && "قاعدة واحدة لكل المجالس من نوع واحد، ونطاق كلٍّ وحدة مجلسه. مثل: رئيس كل مجلس كلية يتابع أقسام كليته."}
            {definition.holder_kind === "user" && "لشخص بعينه لا يرتبط بمنصب، مثل نائب الرئيس أو وكيل الدراسات العليا."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {definition.holder_kind === "user" && (
              <Field label="الشخص">
{(describedBy) => (
                <select aria-describedby={describedBy} value={definition.holder_user_id} onChange={(event) => update({ holder_user_id: event.target.value })} className={fieldClass}>
                  <option value="">اختر شخصًا</option>
                  {data.users.map((user) => <option key={user.id} value={user.id}>{user.name_ar ?? user.email}</option>)}
                </select>)}
</Field>
            )}
            {definition.holder_kind !== "user" && (
              <Field label="المنصب">
{(describedBy) => (
                <select aria-describedby={describedBy} value={definition.holder_role_code} onChange={(event) => update({ holder_role_code: event.target.value })} className={fieldClass}>
                  <option value="">اختر المنصب</option>
                  {data.roles.map((role) => <option key={role.code} value={role.code}>{role.name_ar}</option>)}
                </select>)}
</Field>
            )}
            {definition.holder_kind === "council_position" && (
              <Field label="في المجلس">
{(describedBy) => (
                <select aria-describedby={describedBy} value={definition.holder_council_id} onChange={(event) => update({ holder_council_id: event.target.value })} className={fieldClass}>
                  <option value="">اختر المجلس</option>
                  {data.councils.map((council) => <option key={council.id} value={council.id}>{council.name_ar}</option>)}
                </select>)}
</Field>
            )}
            {definition.holder_kind === "position_rule" && (
              <Field label="في كل مجلس من نوع">
{(describedBy) => (
                <select aria-describedby={describedBy} value={definition.holder_class_id} onChange={(event) => update({ holder_class_id: event.target.value })} className={fieldClass}>
                  <option value="">اختر النوع</option>
                  {data.classes.map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}
                </select>)}
</Field>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-q-ui font-black text-q-text">ماذا يتابع؟</legend>
          <SegmentedControl<TargetMode>
            label="نطاق المتابعة"
            options={[{ value: "subtree", label: ruleScope ? "ما تحت وحدة مجلسه" : "ما تحت وحدة في الشجرة" }, { value: "selected", label: "مجالس محددة" }]}
            value={definition.target_mode}
            onChange={(value) => update({ target_mode: value })}
          />
          {definition.target_mode === "subtree" ? (
            <div className="space-y-3">
              {!ruleScope && (
                <Field label="يتابع ما تحت" hint="كل الوحدات التابعة لها مشمولة، مهما كان عمقها.">
{(describedBy) => (
                  <select aria-describedby={describedBy} value={definition.root_unit_id} onChange={(event) => update({ root_unit_id: event.target.value })} className={fieldClass}>
                    <option value="">اختر الوحدة</option>
                    {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.label}</option>)}
                  </select>)}
</Field>
              )}
              <div role="group" aria-label="أنواع المجالس المشمولة">
                <p className="text-q-caption font-bold text-q-text-2">أنواع المجالس المشمولة</p>
                <p className="text-q-caption text-q-text-3">بلا اختيار تُشمل كل الأنواع.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.classes.map((type) => (
                    <label key={type.id} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text has-[:checked]:border-q-primary has-[:checked]:bg-q-surface-2">
                      <input type="checkbox" checked={definition.target_class_ids.includes(type.id)} onChange={() => toggle("target_class_ids", type.id)} />
                      {type.name_ar}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="relative block">
                <span className="sr-only">ابحث عن مجلس</span>
                <Search size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-q-text-3" />
                <input value={councilFilter} onChange={(event) => setCouncilFilter(event.target.value)} placeholder="ابحث عن مجلس" className={`${fieldClass} mt-0 pr-9`} />
              </label>
              <div role="group" aria-label="المجالس المختارة" className="max-h-60 space-y-1 overflow-y-auto rounded-q-control border border-q-border p-2">
                {visibleCouncils.map((council) => (
                  <label key={council.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-q-control px-2 text-q-ui text-q-text hover:bg-q-surface-2">
                    <input type="checkbox" checked={definition.council_ids.includes(council.id)} onChange={() => toggle("council_ids", council.id)} />
                    <span className="min-w-0 flex-1">{council.name_ar}</span>
                    {council.class_name_ar && <span className="text-q-caption text-q-text-3">{council.class_name_ar}</span>}
                  </label>
                ))}
                {visibleCouncils.length === 0 && <p className="p-2 text-q-caption text-q-text-3">لا مجالس بهذا الاسم.</p>}
              </div>
              <p className="text-q-caption text-q-text-3">مختار: {councilCount(definition.council_ids.length)}</p>
            </div>
          )}
        </fieldset>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="تبدأ من" hint="فارغ: من اليوم.">
{(describedBy) => (
            <input aria-describedby={describedBy} type="date" value={definition.starts_on} max={definition.ends_on || undefined} onChange={(event) => update({ starts_on: event.target.value })} className={fieldClass} />)}
</Field>
          <Field label="تنتهي في" hint="فارغ: دون تاريخ نهاية.">
{(describedBy) => (
            <input aria-describedby={describedBy} type="date" value={definition.ends_on} min={definition.starts_on || undefined} onChange={(event) => update({ ends_on: event.target.value })} className={fieldClass} />)}
</Field>
        </div>

        <section aria-label="المعاينة" className="rounded-q-card border border-q-border bg-q-bg p-4">
          <h3 className="mb-2 flex items-center gap-2 text-q-caption font-bold text-q-text-2"><Eye size={16} aria-hidden="true" /> المعاينة</h3>
          <PreviewPanel preview={ready ? preview : null} loading={previewLoading} error={ready ? previewError : null} ready={ready} />
        </section>
      </div>
    </Dialog>
  );
}

function EndDialog({ assignment, onClose, onEnded }: { assignment: OversightAssignment; onClose: () => void; onEnded: (assignment: OversightAssignment) => void }) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function end() {
    if (pending || !reason.trim()) return;
    setPending(true);
    setError(null);
    try {
      onEnded(await rpc<OversightAssignment>("admin_end_oversight_assignment_v2", {
        p_assignment_id: assignment.id, p_reason: reason.trim(), p_expected_version: assignment.version,
      }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "تعذر إنهاء المتابعة.");
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog
      title="إنهاء المتابعة"
      description={`${holderSentence(assignment)} لن يرى مجالس هذا التعيين بعد الإنهاء. يبقى التعيين وسببه في السجل.`}
      onClose={onClose}
      closeDisabled={pending}
      footer={(
        <>
          {error && <InlineMessage tone="error">{error}</InlineMessage>}
          {!reason.trim() && <span className="text-q-caption text-q-text-3">اكتب السبب لتفعيل الإنهاء.</span>}
          <Button variant="ghost" onClick={onClose} disabled={pending}>تراجع</Button>
          <Button variant="danger" onClick={() => void end()} disabled={!reason.trim()} pending={pending} pendingLabel="جارٍ الإنهاء…">إنهاء المتابعة</Button>
        </>
      )}
    >
      <TextArea label="سبب الإنهاء" value={reason} maxLength={500} rows={3} onChange={(event) => setReason(event.target.value)} />
    </Dialog>
  );
}

export function OversightWorkspace() {
  const [data, setData] = useState<OversightWorkspaceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<OversightAssignment | "new" | null>(null);
  const [ending, setEnding] = useState<OversightAssignment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc<OversightWorkspaceData>("admin_get_oversight_workspace_v2")
      .then((value) => { if (!cancelled) { setData(value); setLoadError(null); } })
      .catch((error: unknown) => { if (!cancelled) setLoadError(error instanceof Error ? error.message : "تعذر تحميل صلاحيات المتابعة."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  function replace(assignment: OversightAssignment, message: string) {
    setData((current) => current && ({
      ...current,
      assignments: current.assignments.some((item) => item.id === assignment.id)
        ? current.assignments.map((item) => (item.id === assignment.id ? assignment : item))
        : [assignment, ...current.assignments],
    }));
    setNotice(message);
  }

  if (loading) return <p role="status" className="py-12 text-center text-q-ui text-q-text-3">يجري تحميل صلاحيات المتابعة…</p>;
  if (loadError || !data) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <InlineMessage tone="error">{loadError ?? "تعذر تحميل صلاحيات المتابعة."}</InlineMessage>
        <Button variant="ghost" onClick={() => { setLoading(true); setReloadKey((key) => key + 1); }}>إعادة المحاولة</Button>
      </div>
    );
  }

  const active = data.assignments.filter((assignment) => assignment.status === "active");
  const ended = data.assignments.filter((assignment) => assignment.status !== "active");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-q-ui text-q-text-2">{active.length ? `${active.length.toLocaleString("ar-SA-u-nu-latn")} تعيين ساري` : "لا توجد تعيينات متابعة بعد."}</p>
        <Button onClick={() => { setNotice(null); setEditing("new"); }}><Plus size={16} aria-hidden="true" /> تعيين متابعة</Button>
      </div>
      {notice && <InlineMessage tone="success">{notice}</InlineMessage>}
      {data.unlinked_councils.length > 0 && (
        <InlineMessage tone="warning">
          {`${councilCount(data.unlinked_councils.length)} غير مربوطة بوحدة في الشجرة، فلن يراها أي متابع بالنطاق الشجري: ${data.unlinked_councils.map((council) => council.name_ar).join("، ")}. اربطها بوحدتها من شاشة المجالس، أو أضفها بالاسم في «مجالس محددة».`}
        </InlineMessage>
      )}
      {active.length === 0 && (
        <div className="rounded-q-card border border-dashed border-q-border bg-q-surface p-6 text-center">
          <p className="text-q-ui font-bold text-q-text">ابدأ بتحديد من يتابع ماذا.</p>
          <p className="mt-1 text-q-caption text-q-text-3">مثلًا: رئيس مجلس الأمناء يتابع كل المجالس، ورئيس كل مجلس كلية يتابع أقسام كليته.</p>
        </div>
      )}
      <div className="space-y-3">
        {active.map((assignment) => (
          <AssignmentCard key={assignment.id} assignment={assignment} onEdit={() => { setNotice(null); setEditing(assignment); }} onEnd={() => { setNotice(null); setEnding(assignment); }} />
        ))}
      </div>
      <OversightRulesSection />
      {ended.length > 0 && (
        <CollapsibleSection title="التعيينات المنتهية" hint="محفوظة بأسبابها للمراجعة">
          <div className="space-y-3">
            {ended.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} onEdit={() => undefined} onEnd={() => undefined} />)}
          </div>
        </CollapsibleSection>
      )}
      {editing && (
        <AssignmentDialog
          data={data}
          editing={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(assignment) => { setEditing(null); replace(assignment, "حُفظ تعيين المتابعة."); }}
        />
      )}
      {ending && (
        <EndDialog
          assignment={ending}
          onClose={() => setEnding(null)}
          onEnded={(assignment) => { setEnding(null); replace(assignment, "أُنهيت المتابعة."); }}
        />
      )}
    </div>
  );
}
