"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";

type DocumentOption = { key: string; target_type: "topic" | "decision" | "minutes"; target_id: string; field_name: string; label: string; original_value: string | null };
type CorrectionIndex = { active_correction_id: string | null; can_open: boolean; expected_version: number | null; items: Array<{ id: string; correction_no: string; status: string; opening_reason: string; revision: number; opened_at: string; location_count: number; version_count: number }> };
type CorrectionLocation = { id: string; target_type: string; field_name: string; original_value: string | null; corrected_value: string; reason: string };
type CorrectionVersion = { id: string; document_type: string; version_no: number; correction_log: unknown[]; signature_count: number; can_sign: boolean; signatures: Array<{ signer_role: string; signed_at: string }> };
type CorrectionDetail = { id: string; correction_no: string; status: string; opening_reason: string; revision: number; current_station_id: string | null; locations: CorrectionLocation[]; stations: Array<{ id: string; sequence_no: number; station_kind: "council" | "submitter"; unit_name_ar?: string | null; status: string; decision_reason?: string | null }>; versions: CorrectionVersion[]; viewer: { can_decide: boolean; can_withdraw: boolean; can_revise: boolean } };
type MeetingRecord = { meeting: { title: string; unit_name?: string }; minutes?: { id: string; status: string; content?: string | null } | null; decisions: Array<{ id: string; decision_no: string; decision_text: string }> };
type DraftLocation = { targetKey: string; correctedValue: string; reason: string };

async function correctionRpc<T>(contract: string, params: Record<string, unknown>) {
  const response = await fetch("/api/admin/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contract, params }) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ إجراء التصحيح.");
  return payload.data as T;
}

const statusLabel: Record<string, string> = { traversing: "يمر بالمجالس", returned_to_opener: "معاد إلى فاتح الطلب", completed: "مكتمل", withdrawn: "مسحوب", active: "المحطة الحالية", pending: "بانتظار دوره", approved: "وافق", rejected: "رفض" };

export function TopicCorrectionsPanel({ topicId, title, description, meetings }: { topicId: string; title: string; description?: string | null; meetings: MeetingRecord[] }) {
  const [index, setIndex] = useState<CorrectionIndex | null>(null);
  const [detail, setDetail] = useState<CorrectionDetail | null>(null);
  const [open, setOpen] = useState(false);
  const [openingReason, setOpeningReason] = useState("");
  const [locations, setLocations] = useState<DraftLocation[]>([{ targetKey: "topic:title_ar", correctedValue: "", reason: "" }]);
  const [decisionReason, setDecisionReason] = useState("");
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionReason, setRevisionReason] = useState("");
  const [revisionLocations, setRevisionLocations] = useState<CorrectionLocation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo<DocumentOption[]>(() => {
    const result: DocumentOption[] = [
      { key: "topic:title_ar", target_type: "topic", target_id: topicId, field_name: "title_ar", label: "عنوان الموضوع", original_value: title },
      { key: "topic:description", target_type: "topic", target_id: topicId, field_name: "description", label: "وصف الموضوع", original_value: description ?? null },
    ];
    for (const record of meetings) {
      for (const decision of record.decisions) result.push({ key: `decision:${decision.id}`, target_type: "decision", target_id: decision.id, field_name: "decision_text", label: `القرار ${decision.decision_no} · ${record.meeting.unit_name ?? record.meeting.title}`, original_value: decision.decision_text });
      if (record.minutes?.status === "approved") result.push({ key: `minutes:${record.minutes.id}`, target_type: "minutes", target_id: record.minutes.id, field_name: "content_final", label: `محضر ${record.meeting.unit_name ?? record.meeting.title}`, original_value: record.minutes.content ?? null });
    }
    return result;
  }, [description, meetings, title, topicId]);

  const load = useCallback(async () => {
    const next = await correctionRpc<CorrectionIndex>("list_topic_corrections_v2", { p_topic_id: topicId });
    setIndex(next);
    if (next.active_correction_id) setDetail(await correctionRpc<CorrectionDetail>("get_topic_correction_v2", { p_correction_id: next.active_correction_id }));
    else setDetail(null);
  }, [topicId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر تحميل التصحيحات.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function perform(action: () => Promise<unknown>) {
    setBusy(true); setError(null);
    try { await action(); await load(); return true; }
    catch (cause) { setError(cause instanceof Error ? cause.message : "تعذر تنفيذ إجراء التصحيح."); return false; }
    finally { setBusy(false); }
  }

  async function submit() {
    if (index?.expected_version == null) return;
    const payload = locations.map((row) => {
      const option = options.find((item) => item.key === row.targetKey)!;
      return { target_type: option.target_type, target_id: option.target_id, field_name: option.field_name, original_value: option.original_value, corrected_value: row.correctedValue, reason: row.reason };
    });
    const saved = await perform(() => correctionRpc("open_topic_correction_v2", { p_topic_id: topicId, p_reason: openingReason, p_locations: payload, p_client_request_id: crypto.randomUUID(), p_expected_version: index.expected_version }));
    if (saved) { setOpen(false); setOpeningReason(""); setLocations([{ targetKey: "topic:title_ar", correctedValue: "", reason: "" }]); }
  }

  const invalidOpen = openingReason.trim().length < 10 || locations.some((row) => row.correctedValue.trim().length === 0 || row.reason.trim().length < 10);
  const invalidRevision = revisionReason.trim().length < 10 || revisionLocations.some((row) => row.corrected_value.trim().length === 0 || row.reason.trim().length < 10);
  return <section className="flex flex-col gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-q-card border border-q-border bg-q-surface p-5">
      <div><h2 className="m-0 text-q-h3 font-bold text-q-text">التصحيحات الرسمية</h2><p className="m-0 mt-1 text-q-caption text-q-text-2">تصحيح شكلي مضبوط يحفظ الأصل ويمر على المجالس السابقة بالترتيب، دون تغيير الأصوات أو نتائجها.</p></div>
      {index?.can_open && <Button onClick={() => setOpen(true)}>فتح طلب تصحيح</Button>}
    </div>
    {error && <InlineMessage tone="error">{error}</InlineMessage>}
    {!index ? <p role="status" className="text-q-ui text-q-text-2">جارٍ تحميل سجل التصحيحات…</p> : index.items.length === 0 ? <InlineMessage tone="info">لا توجد طلبات تصحيح لهذا الموضوع.</InlineMessage> : <div className="grid gap-3 lg:grid-cols-2">
      {index.items.map((item) => <button type="button" key={item.id} onClick={() => void correctionRpc<CorrectionDetail>("get_topic_correction_v2", { p_correction_id: item.id }).then(setDetail).catch((cause) => setError(cause instanceof Error ? cause.message : "تعذر فتح الطلب."))} className="flex flex-col gap-2 rounded-q-card border border-q-border bg-q-surface p-4 text-start hover:bg-q-surface-2">
        <div className="flex items-center justify-between gap-2"><strong dir="ltr" className="text-q-ui text-q-text">{item.correction_no}</strong><Badge tone={item.status === "completed" ? "success" : item.status === "returned_to_opener" ? "warning" : "neutral"}>{statusLabel[item.status] ?? item.status}</Badge></div>
        <span className="text-q-ui text-q-text">{item.opening_reason}</span><span className="text-q-caption text-q-text-2">{item.location_count} موضع · {item.version_count} نسخة مصححة</span>
      </button>)}
    </div>}
    {detail && <div className="flex flex-col gap-4 rounded-q-card border border-q-border bg-q-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><div><strong dir="ltr" className="text-q-h3 text-q-text">{detail.correction_no}</strong><p className="m-0 mt-1 text-q-caption text-q-text-2">{detail.opening_reason}</p></div><Badge tone={detail.status === "completed" ? "success" : "warning"}>{statusLabel[detail.status] ?? detail.status}</Badge></div>
      <ol className="m-0 grid list-none gap-2 p-0 md:grid-cols-2 xl:grid-cols-3">{detail.stations.map((station) => <li key={station.id} className="rounded-q-control border border-q-border bg-q-surface-2 p-3"><span className="text-q-caption text-q-text-2">المحطة {station.sequence_no}</span><p className="m-0 mt-1 text-q-ui font-bold text-q-text">{station.station_kind === "submitter" ? "مقدم الموضوع" : station.unit_name_ar}</p><Badge tone={station.status === "approved" ? "success" : station.status === "active" ? "warning" : "neutral"}>{statusLabel[station.status] ?? station.status}</Badge>{station.decision_reason && <p className="mb-0 text-q-caption text-q-text-2">{station.decision_reason}</p>}</li>)}</ol>
      <div className="flex flex-col gap-2">{detail.locations.map((location) => <div key={location.id} className="rounded-q-control border border-q-border p-3"><strong className="text-q-ui text-q-text">{location.field_name}</strong><div className="mt-2 grid gap-2 md:grid-cols-2"><p className="m-0 rounded-q-control bg-q-danger-soft p-2 text-q-caption text-q-text"><span className="font-bold">قبل:</span> {location.original_value ?? "فارغ"}</p><p className="m-0 rounded-q-control bg-q-success-soft p-2 text-q-caption text-q-text"><span className="font-bold">بعد:</span> {location.corrected_value}</p></div><p className="mb-0 text-q-caption text-q-text-2">{location.reason}</p></div>)}</div>
      {detail.versions.some((version) => version.document_type === "minutes") && <section className="rounded-q-control border border-q-border bg-q-surface-2 p-4">
        <h3 className="m-0 text-q-ui font-bold text-q-text">توقيع المحاضر المصححة</h3>
        <p className="m-0 mt-1 text-q-caption text-q-text-2">تصبح نسخة المحضر المصححة مكتملة التوقيع بعد توقيع رئيس المجلس ومقرره، وتبقى تواقيع الحاضرين على الأصل.</p>
        <div className="mt-3 grid gap-2">{detail.versions.filter((version) => version.document_type === "minutes").map((version) => <div key={version.id} className="flex flex-wrap items-center justify-between gap-3 rounded-q-control border border-q-border bg-q-surface p-3">
          <div><strong className="text-q-ui text-q-text">نسخة محضر مصححة رقم {version.version_no}</strong><p className="m-0 mt-1 text-q-caption text-q-text-2">{version.signature_count} من 2 توقيع · {version.signature_count === 2 ? "مكتملة التوقيع" : "بانتظار استكمال التوقيع"}</p></div>
          {version.can_sign && <Button disabled={busy} pending={busy} onClick={() => void perform(() => correctionRpc("sign_corrected_minutes_v2", { p_version_id: version.id, p_signature_strokes: null, p_expected_signature_count: version.signature_count }))}>توقيع النسخة المصححة</Button>}
        </div>)}</div>
      </section>}
      {detail.viewer.can_decide && <div className="flex flex-col gap-2 border-t border-q-border pt-4"><label className="text-q-caption font-bold text-q-text">سبب الرفض أو ملاحظة الموافقة<input value={decisionReason} onChange={(event) => setDecisionReason(event.target.value)} disabled={busy} className="mt-1 h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui font-normal" /></label><div className="flex gap-2"><Button disabled={busy} pending={busy} onClick={() => void perform(() => correctionRpc("decide_topic_correction_station_v2", { p_correction_id: detail.id, p_decision: "approve", p_reason: decisionReason || null, p_expected_revision: detail.revision, p_client_request_id: crypto.randomUUID() }))}>الموافقة وتمرير الطلب</Button><Button variant="danger" disabled={busy || decisionReason.trim().length < 10} onClick={() => void perform(() => correctionRpc("decide_topic_correction_station_v2", { p_correction_id: detail.id, p_decision: "reject", p_reason: decisionReason, p_expected_revision: detail.revision, p_client_request_id: crypto.randomUUID() }))}>رفض وإعادة الطلب</Button></div></div>}
      {detail.viewer.can_withdraw && <Button variant="secondary" disabled={busy} onClick={() => void perform(() => correctionRpc("withdraw_topic_correction_v2", { p_correction_id: detail.id, p_expected_revision: detail.revision, p_client_request_id: crypto.randomUUID() }))}>سحب طلب التصحيح</Button>}
      {detail.viewer.can_revise && <Button disabled={busy} onClick={() => { setRevisionReason(detail.opening_reason); setRevisionLocations(detail.locations.map((location) => ({ ...location }))); setRevisionOpen(true); }}>تعديل الطلب وإعادة إرساله</Button>}
    </div>}
    {open && <Dialog title="فتح طلب تصحيح رسمي" description="لأخطاء الكتابة والأسماء والمراجع والتواريخ فقط. تغيير المضمون مكانه إعادة الموضوع أو إنشاء موضوع جديد." size="lg" scrollContent closeDisabled={busy} onClose={() => setOpen(false)}>
      <div className="flex flex-col gap-4"><label className="text-q-caption font-bold text-q-text">سبب فتح الطلب<textarea value={openingReason} onChange={(event) => setOpeningReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-q-control border border-q-border p-3 text-q-ui font-normal" /></label>
        {locations.map((row, position) => <div key={position} className="grid gap-3 rounded-q-control border border-q-border bg-q-surface-2 p-3"><label className="text-q-caption font-bold text-q-text">موضع الخطأ<select value={row.targetKey} onChange={(event) => setLocations((current) => current.map((item, index) => index === position ? { ...item, targetKey: event.target.value, correctedValue: "" } : item))} className="mt-1 h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal">{options.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label><p className="m-0 text-q-caption text-q-text-2">القيمة الحالية: {options.find((item) => item.key === row.targetKey)?.original_value ?? "فارغ"}</p><label className="text-q-caption font-bold text-q-text">القيمة الصحيحة<textarea value={row.correctedValue} onChange={(event) => setLocations((current) => current.map((item, index) => index === position ? { ...item, correctedValue: event.target.value } : item))} className="mt-1 min-h-20 w-full rounded-q-control border border-q-border bg-q-surface p-3 text-q-ui font-normal" /></label><label className="text-q-caption font-bold text-q-text">سبب هذا التصحيح<input value={row.reason} onChange={(event) => setLocations((current) => current.map((item, index) => index === position ? { ...item, reason: event.target.value } : item))} className="mt-1 h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal" /></label>{locations.length > 1 && <Button variant="ghost" onClick={() => setLocations((current) => current.filter((_, index) => index !== position))}>إزالة الموضع</Button>}</div>)}
        <Button variant="secondary" disabled={locations.length >= 50} onClick={() => setLocations((current) => [...current, { targetKey: options[0]?.key ?? "topic:title_ar", correctedValue: "", reason: "" }])}>إضافة موضع آخر</Button><div className="flex items-center gap-2"><Button disabled={invalidOpen || busy} pending={busy} onClick={() => void submit()}>فتح الطلب وإرساله للمجلس السابق</Button>{invalidOpen && <span className="text-q-caption text-q-text-2">اكتب السبب والقيمة الصحيحة، وسبب كل موضع بعشرة أحرف على الأقل.</span>}</div>
      </div>
    </Dialog>}
    {revisionOpen && detail && <Dialog title="تعديل طلب التصحيح المعاد" description="عالج سبب الرفض ثم أعد الطلب إلى أول محطة بالترتيب، مع بقاء السجل السابق محفوظاً." size="lg" scrollContent closeDisabled={busy} onClose={() => setRevisionOpen(false)}>
      <div className="flex flex-col gap-4">
        <label className="text-q-caption font-bold text-q-text">سبب الطلب<textarea value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} className="mt-1 min-h-24 w-full rounded-q-control border border-q-border p-3 text-q-ui font-normal" /></label>
        {revisionLocations.map((location, position) => <div key={location.id} className="grid gap-3 rounded-q-control border border-q-border bg-q-surface-2 p-3">
          <p className="m-0 text-q-caption text-q-text-2">القيمة الأصلية: {location.original_value ?? "فارغ"}</p>
          <label className="text-q-caption font-bold text-q-text">القيمة الصحيحة<textarea value={location.corrected_value} onChange={(event) => setRevisionLocations((current) => current.map((item, index) => index === position ? { ...item, corrected_value: event.target.value } : item))} className="mt-1 min-h-20 w-full rounded-q-control border border-q-border bg-q-surface p-3 text-q-ui font-normal" /></label>
          <label className="text-q-caption font-bold text-q-text">سبب التصحيح<input value={location.reason} onChange={(event) => setRevisionLocations((current) => current.map((item, index) => index === position ? { ...item, reason: event.target.value } : item))} className="mt-1 h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal" /></label>
        </div>)}
        <div className="flex items-center gap-2"><Button disabled={invalidRevision || busy} pending={busy} onClick={() => void (async () => { const saved = await perform(() => correctionRpc("revise_topic_correction_v2", { p_correction_id: detail.id, p_opening_reason: revisionReason, p_locations: revisionLocations.map(({ id, corrected_value, reason }) => ({ id, corrected_value, reason })), p_expected_revision: detail.revision, p_client_request_id: crypto.randomUUID() })); if (saved) setRevisionOpen(false); })()}>حفظ وإعادة الإرسال</Button>{invalidRevision && <span className="text-q-caption text-q-text-2">أكمل السبب والقيم المصححة قبل الإرسال.</span>}</div>
      </div>
    </Dialog>}
  </section>;
}
