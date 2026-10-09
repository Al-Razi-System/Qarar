"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock, FileText, GitBranch, Paperclip, RotateCw, Search, Tags } from "lucide-react";
import styles from "./topic-types-list.module.css";
import type { Requirements } from "../model/topic-type-requirements";
import type { TopicStagePolicy } from "./topic-stage-policy-editor";
import { TopicTypeActions, type TypeActions } from "./topic-type-actions";
import { TopicInstructions } from "./topic-instructions";

type Row = { bundle_id: string; name_ar: string; classification_name: string; status: string; reference_number: string; can_edit?: boolean; is_enabled?: boolean; has_effective?: boolean; submitted_topic_count?: number };
export type TopicTypeDetail = {
  route_summary?: { name_ar: string; steps: { name_ar: string; sequence_no: number; work: string }[] };
  scope_summary?: { id: string; name_ar: string }[];
  submitted_topic_count?: number;
  management?: { actions: TypeActions; reasons: string[]; is_enabled: boolean; has_effective: boolean };
  bundle: { id: string; lock_version: number; status?: string };
  classification: { code: string; name_ar: string };
  version: { acceptance_finality: "advance" | "complete" | "return_previous"; rejection_finality: "complete" | "return_previous" | "refer_lower" };
  workflow_binding: { source_layout_version_id?: string; workflow_template_version_id: string; stage_policies?: TopicStagePolicy[] };
  topic_type: { name_ar: string };
  authorities: { authority_text: string; source_document_name?: string }[];
  authoring?: { scope_kind?: Requirements["scopeKind"]; scope_ids?: string[]; source_items?: { id: string }[]; required_attachment_count?: number; submission_mode?: string; submission_instructions?: string; discussion_instructions?: string };
  schedule?: { rule_type: Requirements["scheduleKind"]; rule_config?: Record<string, string | number | null> };
};
const statuses: Record<string, string> = { draft: "مسودة", under_review: "قيد المراجعة", changes_requested: "تحتاج تعديلًا", approved: "معتمد", effective: "منشور", retired: "سابق" };
function rowStatus(row: Row) { return row.has_effective && row.is_enabled === false ? "معطّل" : statuses[row.status] ?? "غير متاح"; }
const schedules: Record<string, string> = { none: "غير مجدول", fixed_date: "تاريخ محدد", monthly_week: "أسبوع شهري", seasonal: "موعد سنوي" };
async function read(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload?.error?.message || "تعذر تحميل البيانات.");
  return payload.data;
}
export function TopicTypesList({ onEdit, initialBundleId }: { onEdit?: (detail: TopicTypeDetail) => void; initialBundleId?: string | null }) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState<{ items: Row[]; total: number } | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [detail, setDetail] = useState<TopicTypeDetail | null>(null);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailAttempt, setDetailAttempt] = useState(0);
  const [operationNotice, setOperationNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    read(`/api/admin/governance-model?${new URLSearchParams({ view: "types", search: query, status, page: String(page) })}`, controller.signal)
      .then(data => { if (!controller.signal.aborted) { setList({ items: Array.isArray(data?.items) ? data.items : [], total: Number(data?.total) || 0 }); setError(""); if (initialBundleId) setSelected(current => current ?? data?.items?.find((row: Row) => row.bundle_id === initialBundleId) ?? null); } })
      .catch(() => { if (!controller.signal.aborted) setError("تعذر تحميل التصنيفات. أعد المحاولة."); });
    return () => controller.abort();
  }, [query, status, page, attempt, initialBundleId]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    read(`/api/admin/governance-model?bundleId=${encodeURIComponent(selected.bundle_id)}`, controller.signal)
      .then(data => { if (!controller.signal.aborted) setDetail(data); })
      .catch(() => { if (!controller.signal.aborted) setDetailError("تعذر تحميل تفاصيل التصنيف."); });
    return () => controller.abort();
  }, [selected, detailAttempt]);
  function reload() { setList(null); setError(""); setAttempt(value => value + 1); }
  async function afterAction(result: { bundle_id: string }) {
    if (!selected) return;
    if (result.bundle_id !== selected.bundle_id && onEdit) {
      const controller = new AbortController();
      const fresh = await read(`/api/admin/governance-model?bundleId=${encodeURIComponent(result.bundle_id)}`, controller.signal);
      onEdit(fresh); return;
    }
    setOperationNotice("تم تحديث التصنيف بنجاح.");
    reload(); setDetail(null); setDetailError(""); setDetailAttempt(value => value + 1);
  }
  function selectRow(row: Row) {
    if (selected?.bundle_id === row.bundle_id) return;
    setDetail(null); setDetailError(""); setOperationNotice(""); setSelected(row);
  }
  return <div className={styles.workspace}>
    <form className={styles.toolbar} onSubmit={event => { event.preventDefault(); setList(null); setPage(1); setQuery(search); setAttempt(value => value + 1); }}>
      <label className={styles.search}><Search size={18}/><input aria-label="البحث عن تصنيف" placeholder="ابحث باسم التصنيف…" value={search} maxLength={300} onChange={event => setSearch(event.target.value)}/></label>
      <select aria-label="حالة التصنيف" value={status} onChange={event => { setList(null); setStatus(event.target.value); setPage(1); }}><option value="">كل الحالات</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      <button type="submit">بحث</button><button type="button" aria-label="تحديث التصنيفات" onClick={reload}><RotateCw size={18}/></button>
    </form>
    <div className={styles.columns}>
      <section className={styles.list} aria-label="التصنيفات المحفوظة">
        <header><h2>التصنيفات</h2>{list && <span>{list.total}</span>}</header>
        {error ? <div role="alert" className={styles.message}>{error}<button type="button" onClick={reload}>إعادة المحاولة</button></div> : !list ? <p role="status" className={styles.message}>جارٍ تحميل التصنيفات…</p> : !list.items.length ? <div className={styles.message}><Tags size={30}/><h3>{query || status ? "لا توجد نتائج مطابقة" : "ابدأ بأول تصنيف"}</h3><p>{query || status ? "غيّر البحث أو الحالة لعرض نتائج أخرى." : "أنشئ تصنيفًا لتحديد مساره ومتطلباته."}</p></div> : <>
          <div className={styles.rows}>{list.items.map(row => <button key={row.bundle_id} type="button" aria-label={`عرض ${row.name_ar}`} aria-pressed={selected?.bundle_id === row.bundle_id} onClick={() => selectRow(row)}><span className={styles.rowIcon}><FileText size={19}/></span><span><strong>{row.name_ar}</strong><small>{row.classification_name}{row.submitted_topic_count !== undefined ? ` · ${row.submitted_topic_count} موضوع` : ""}</small></span><em>{rowStatus(row)}</em><ArrowLeft size={16}/></button>)}</div>
          <footer><button type="button" disabled={page <= 1} onClick={() => { setList(null); setPage(value => value - 1); }}><ArrowRight size={16}/>السابق</button><span>صفحة {page}</span><button type="button" disabled={page * 20 >= list.total} onClick={() => { setList(null); setPage(value => value + 1); }}>التالي<ArrowLeft size={16}/></button></footer>
        </>}
      </section>
      <section className={styles.detail} aria-label="تفاصيل التصنيف">
        {!selected ? <div className={styles.message}><FileText size={34}/><h2>كل إعدادات التصنيف في مكان واحد</h2><p>اختر تصنيفًا لعرض نطاقه وأسانيده ومتطلبات تقديمه.</p></div> : <>
          <header><div className={styles.detailIdentity}><span className={styles.detailIcon}><Tags size={23}/></span><div><span>{detail?.classification?.name_ar ?? selected.classification_name}</span><h2>{detail?.topic_type?.name_ar ?? selected.name_ar}</h2></div></div><span className={styles.statusBadge}>{detail?.management?.has_effective && !detail.management.is_enabled ? "معطّل للتقديم الجديد" : detail?.bundle?.status ? statuses[detail.bundle.status] ?? "غير متاح" : rowStatus(selected)}</span></header>
          {detailError ? <div role="alert" className={styles.message}>{detailError}<button type="button" onClick={() => { setDetailError(""); setDetailAttempt(value => value + 1); }}>إعادة المحاولة</button></div> : !detail ? <p role="status" className={styles.message}>جارٍ تحميل التفاصيل…</p> : <>
            {operationNotice && <p role="status" className={styles.operationNotice}>{operationNotice}</p>}
            <div className={styles.detailControls}>
              {selected.can_edit && (!detail.bundle?.status || ["draft", "changes_requested"].includes(detail.bundle.status)) && onEdit && <button type="button" className={styles.edit} onClick={() => onEdit(detail)}>تعديل التصنيف</button>}
              {detail.management && <TopicTypeActions key={`${detail.bundle.id}:${detail.bundle.lock_version}`} bundleId={detail.bundle.id} lockVersion={detail.bundle.lock_version} actions={detail.management.actions} reasons={detail.management.reasons} onChanged={afterAction}/>}
            </div>
            <dl className={styles.facts}><div><dt>نطاق الإتاحة</dt><dd>{detail.authoring?.scope_kind === "councils" ? "مجالس محددة" : detail.authoring?.scope_kind === "classes" ? "مستويات مجالس محددة" : "حسب بداية المسار"}</dd></div><div><dt>المرفقات المطلوبة</dt><dd>{detail.authoring?.required_attachment_count ? `${detail.authoring.required_attachment_count} على الأقل` : "غير مطلوبة"}</dd></div><div><dt>الدورية</dt><dd>{schedules[detail.schedule?.rule_type ?? "none"] ?? "غير متاح"}</dd></div><div><dt>التقديم</dt><dd>{detail.authoring?.submission_mode === "automatic_agenda" ? "مقترح مجدول لجدول الأعمال" : "طلب من مقدم الموضوع"}</dd></div><div><dt>الموضوعات المقدمة</dt><dd>{detail.submitted_topic_count ?? "تعذر قراءة العدد"}</dd></div></dl>
            {Boolean(detail.scope_summary?.length) && <section className={styles.scopes}><h3>متاح لدى</h3><div>{detail.scope_summary!.map(scope => <span key={scope.id}>{scope.name_ar}</span>)}</div></section>}
            {detail.route_summary && <section className={styles.route}><h3><GitBranch size={18}/>رحلة الموضوع</h3><ol>{detail.route_summary.steps.map(node => <li key={node.sequence_no}><b>{node.sequence_no}</b><span>{node.name_ar}</span></li>)}</ol></section>}
            {detail.schedule && detail.schedule.rule_type !== "none" && <section className={styles.schedule}><h3><CalendarClock size={18}/>موعد المناقشة</h3><p>{detail.schedule.rule_type === "monthly_week" ? `كل شهر في الأسبوع ${["الأول", "الثاني", "الثالث", "الرابع"][Number(detail.schedule.rule_config?.week ?? 1) - 1]}` : detail.schedule.rule_type === "fixed_date" ? String(detail.schedule.rule_config?.date ?? "") : `سنويًا يوم ${detail.schedule.rule_config?.day}/${detail.schedule.rule_config?.month}`}</p>{detail.schedule.rule_config?.starts_on && <small>من {String(detail.schedule.rule_config.starts_on)}{detail.schedule.rule_config.ends_on ? ` إلى ${detail.schedule.rule_config.ends_on}` : " دون نهاية محددة"}</small>}</section>}
            <TopicInstructions title="تعليمات التقديم" text={detail.authoring?.submission_instructions}/>
            <TopicInstructions title="تعليمات المناقشة" text={detail.authoring?.discussion_instructions}/>
            <div className={styles.requirementHint}><Paperclip size={17}/><p>{detail.authoring?.required_attachment_count ? "تُرفع المرفقات من تفاصيل الموضوع لاستكمال متطلبات مناقشته." : "يمكن تقديم الموضوع دون مرفقات إلزامية."}</p></div>
            <section className={styles.sources}><h3>الأسانيد المرتبطة</h3>{detail.authorities?.length ? detail.authorities.map((source, index) => <article key={index}>{source.source_document_name && <strong>{source.source_document_name}</strong>}<p>{source.authority_text}</p></article>) : <p>لا توجد أسانيد مرتبطة.</p>}</section>
            {detail.management?.has_effective && detail.management.is_enabled && <div className={styles.sources}><Link className={styles.edit} href="/admin/topics/new">تقديم موضوع من تصنيف</Link></div>}
          </>}
        </>}
      </section>
    </div>
  </div>;
}
