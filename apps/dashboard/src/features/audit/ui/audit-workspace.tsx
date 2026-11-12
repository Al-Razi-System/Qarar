"use client";

import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { ChevronDown, Download, Search, ShieldAlert, ShieldCheck, TriangleAlert, X } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { CollapsibleSection } from "@/shared/ui/collapsible-section";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import {
  actorLabel, capacityLabel, changeRows, deviceLabel, displayValue, entityLabel, fieldLabel, formatTime, isMeaningfulField,
  resultLabels, verbLabel, type AuditEvent, type AuditResult,
} from "../model/audit-labels";

const PAGE_SIZE = 50;
const EXPORT_LIMIT = 10000;

type ResultFilter = "all" | AuditResult;
type Filters = { query: string; result: ResultFilter; entityType: string; actorId: string; from: string; to: string };
type Facets = {
  entity_types: Array<{ value: string; count: number }>;
  actors: Array<{ id: string; name_ar: string | null; count: number }>;
  results: Partial<Record<AuditResult, number>>;
};
type Page = { items: AuditEvent[]; total: number };
type Detail = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; event: AuditEvent };

const emptyFilters: Filters = { query: "", result: "all", entityType: "", actorId: "", from: "", to: "" };

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

/** Contract filters shared by search and export. Dates are whole local days; the end is exclusive. */
function contractFilters(filters: Filters) {
  const dayStart = (value: string, addDays = 0) => {
    if (!value) return null;
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + addDays);
    return date.toISOString();
  };
  return {
    p_action: null,
    p_entity_type: filters.entityType || null,
    p_actor_user_id: filters.actorId || null,
    p_result: filters.result === "all" ? null : filters.result,
    p_from: dayStart(filters.from),
    p_to: dayStart(filters.to, 1),
  };
}

function searchPage(filters: Filters, offset: number) {
  return rpc<Page>("admin_search_audit_logs", {
    p_query: filters.query.trim() || null,
    ...contractFilters(filters),
    p_limit: PAGE_SIZE,
    p_offset: offset,
  });
}

const resultIcon: Record<AuditResult, ReactNode> = {
  success: <ShieldCheck size={18} aria-hidden="true" className="text-q-success" />,
  denied: <ShieldAlert size={18} aria-hidden="true" className="text-q-danger" />,
  failure: <TriangleAlert size={18} aria-hidden="true" className="text-q-warning" />,
};

function RecordName({ event }: { event: AuditEvent }) {
  const label = event.entity_label;
  return (
    <>
      {entityLabel(event.entity_type)}
      {label?.reference && <> · <span dir="auto" className="font-bold text-q-text-2">{label.reference}</span></>}
      {label?.title && <> · <span dir="auto">{label.title}</span></>}
    </>
  );
}

function Fact({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="min-w-0 rounded-q-control border border-q-border bg-q-surface p-3">
      <dt className="text-q-caption text-q-text-3">{label}</dt>
      <dd className="mt-1 break-words text-q-ui font-bold text-q-text">{children}</dd>
      {hint && <dd className="mt-0.5 text-q-caption text-q-text-3">{hint}</dd>}
    </div>
  );
}

function Value({ value }: { value: unknown }) {
  const shown = displayValue(value);
  return shown.technical
    ? <span dir="ltr" className="inline-block rounded bg-q-surface-2 px-1.5 font-mono text-q-caption text-q-text-2">{shown.text}</span>
    : <span dir="auto">{shown.text}</span>;
}

function FieldName({ name }: { name: string }) {
  const label = fieldLabel(name);
  return label ? <>{label}</> : <span dir="ltr" className="font-mono text-q-caption text-q-text-2">{name}</span>;
}

function ChangesTable({ event }: { event: AuditEvent }) {
  const changes = changeRows(event);
  if (changes.kind === "none" || changes.rows.length === 0) {
    return <p className="text-q-caption text-q-text-3">لم يسجّل هذا الحدث بيانات قبل التغيير أو بعده.</p>;
  }
  const title = changes.kind === "update" ? "ما الذي تغيّر" : changes.kind === "insert" ? "القيم عند الإنشاء" : "القيم قبل الحذف";
  return (
    <div className="overflow-x-auto rounded-q-control border border-q-border bg-q-surface">
      <table aria-label="التغييرات" className="w-full min-w-[480px] border-collapse text-start text-q-ui">
        <caption className="border-b border-q-border px-3 py-2 text-start text-q-caption font-bold text-q-text-2">{title}</caption>
        <thead>
          <tr className="bg-q-surface-2 text-q-caption text-q-text-3">
            <th scope="col" className="w-1/4 px-3 py-2 text-start font-bold">الحقل</th>
            {changes.kind === "update" ? (
              <>
                <th scope="col" className="px-3 py-2 text-start font-bold">قبل</th>
                <th scope="col" className="px-3 py-2 text-start font-bold">بعد</th>
              </>
            ) : <th scope="col" className="px-3 py-2 text-start font-bold">القيمة</th>}
          </tr>
        </thead>
        <tbody>
          {changes.rows.map((row) => (
            <tr key={row.key} className="border-t border-q-border align-top">
              <th scope="row" className="px-3 py-2 text-start font-bold text-q-text-2"><FieldName name={row.key} /></th>
              {changes.kind === "update" ? (
                <>
                  <td className="px-3 py-2 text-q-text-3 line-through decoration-q-danger/50"><Value value={row.before} /></td>
                  <td className="px-3 py-2 text-q-text"><Value value={row.after} /></td>
                </>
              ) : <td className="px-3 py-2 text-q-text"><Value value={changes.kind === "insert" ? row.after : row.before} /></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutcomeExplanation({ event }: { event: AuditEvent }) {
  if (event.result === "success") return null;
  const actor = actorLabel(event);
  const code = typeof event.metadata?.error_code === "string" ? event.metadata.error_code : null;
  return event.result === "denied" ? (
    <InlineMessage tone="error">
      رُفضت محاولة «{actor}» تنفيذ عملية لا تملك صلاحيتها في هذا السياق، ولم يتغير أي سجل.
    </InlineMessage>
  ) : (
    <InlineMessage tone="warning">
      فشلت عملية بدأها «{actor}» بخطأ في الخادم{code ? ` (رمز ${code})` : ""}، ولم يُحفظ أي تغيير منها.
    </InlineMessage>
  );
}

function ExtraFacts({ metadata }: { metadata?: Record<string, unknown> | null }) {
  const entries = Object.entries(metadata ?? {}).filter(([key, value]) => isMeaningfulField(key) && value !== null && typeof value !== "object");
  if (entries.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-q-caption font-bold text-q-text-2">معلومات أخرى سجّلها الحدث</h4>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-q-control border border-q-border bg-q-surface px-3 py-2">
            <dt className="text-q-caption text-q-text-3"><FieldName name={key} /></dt>
            <dd className="mt-0.5 text-q-ui text-q-text"><Value value={value} /></dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EventDetails({ summary, detail, onRetry }: { summary: AuditEvent; detail: Detail | undefined; onRetry: () => void }) {
  if (!detail || detail.status === "loading") {
    return <p className="text-q-caption text-q-text-3" role="status">يجري تحميل تفاصيل الحدث…</p>;
  }
  if (detail.status === "error") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <InlineMessage tone="error">{detail.message}</InlineMessage>
        <Button variant="ghost" onClick={onRetry}>إعادة المحاولة</Button>
      </div>
    );
  }
  const event = { ...summary, ...detail.event };
  const result = resultLabels[event.result] ?? resultLabels.success;
  const device = deviceLabel(event.user_agent);
  return (
    <div className="space-y-4">
      <OutcomeExplanation event={event} />
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Fact label="المنفذ" hint={event.actor_email ?? undefined}>{actorLabel(event)}</Fact>
        <Fact label="الصفة" hint={capacityLabel(event.actor_capacity)?.hint ?? "لم تكن تُسجَّل قبل 12 نوفمبر 2026"}>
          {capacityLabel(event.actor_capacity)?.text ?? "غير مسجلة"}
        </Fact>
        <Fact label="السجل المتأثر"><RecordName event={event} /></Fact>
        <Fact label="العملية">{verbLabel(event.action)}</Fact>
        <Fact label="النتيجة"><Badge tone={result.tone}>{result.label}</Badge></Fact>
        <Fact label="الوقت الدقيق">{formatTime(event.occurred_at, true)}</Fact>
        <Fact label="عنوان IP" hint={event.client_ip ? "كما أبلغ به خادم اللوحة" : "لم يكن يُسجَّل قبل 12 نوفمبر 2026"}>
          {event.client_ip ? <span dir="ltr">{event.client_ip}</span> : "غير مسجل"}
        </Fact>
        <Fact label="الجهاز">{device ?? "غير مسجل"}</Fact>
        <Fact label="معرّف الطلب" hint="يربط الحدث بسجلات الخادم">
          {event.request_id ? <span dir="ltr" className="font-mono text-q-caption">{event.request_id}</span> : "غير مسجل"}
        </Fact>
      </dl>
      {event.entity_type !== "api_contract" && <ChangesTable event={event} />}
      <ExtraFacts metadata={event.metadata} />
      <CollapsibleSection title="تفاصيل تقنية" hint="البيانات كما سُجلت حرفيًا، للمراجعة الفنية">
        <pre dir="ltr" className="max-h-80 overflow-auto whitespace-pre-wrap break-all text-left font-mono text-q-caption text-q-text-2">
          {JSON.stringify({ id: event.id, action: event.action, entity_type: event.entity_type, entity_id: event.entity_id,
            previous_data: event.previous_data ?? null, new_data: event.new_data ?? null, metadata: event.metadata ?? null }, null, 2)}
        </pre>
      </CollapsibleSection>
    </div>
  );
}

function EventRow({ event, expanded, detail, onToggle, onRetry }: {
  event: AuditEvent; expanded: boolean; detail: Detail | undefined; onToggle: () => void; onRetry: () => void;
}) {
  const panelId = useId();
  const result = resultLabels[event.result] ?? resultLabels.success;
  return (
    <li className={expanded ? "bg-q-surface-2" : undefined}>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex min-h-16 w-full items-start gap-3 px-4 py-3 text-start transition-colors hover:bg-q-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-q-focus sm:px-5"
      >
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-q-control bg-q-surface">{resultIcon[event.result] ?? resultIcon.success}</span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-q-ui font-bold text-q-text">{actorLabel(event)}</span>
            {capacityLabel(event.actor_capacity) && (
              <span className="text-q-caption text-q-text-3">بصفته {capacityLabel(event.actor_capacity)!.text}</span>
            )}
            {event.result !== "success" && <Badge tone={result.tone}>{result.label}</Badge>}
          </span>
          <span className="mt-0.5 block text-q-caption text-q-text-2">
            <span className="font-bold">{verbLabel(event.action)}</span> · <RecordName event={event} />
          </span>
          {(event.changed_fields?.filter(isMeaningfulField).length ?? 0) > 0 && (
            <span className="mt-0.5 block truncate text-q-caption text-q-text-3">
              تغيّر: {event.changed_fields!.filter(isMeaningfulField).slice(0, 4).map((field) => fieldLabel(field) ?? "حقل تقني").join("، ")}
            </span>
          )}
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          <time dateTime={event.occurred_at} className="text-q-caption text-q-text-3">{formatTime(event.occurred_at)}</time>
          <ChevronDown size={18} aria-hidden="true" className={`text-q-text-3 transition-transform ${expanded ? "rotate-180" : ""}`} />
        </span>
      </button>
      {expanded && (
        <div id={panelId} role="region" aria-label="تفاصيل الحدث" className="border-t border-q-border px-4 py-4 sm:px-5 sm:ps-16">
          <EventDetails summary={event} detail={detail} onRetry={onRetry} />
        </div>
      )}
    </li>
  );
}

export function AuditWorkspace() {
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [queryDraft, setQueryDraft] = useState("");
  const [facets, setFacets] = useState<Facets | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, Detail>>({});
  const [exporting, setExporting] = useState(false);
  const [exportNotice, setExportNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void rpc<Facets>("admin_get_audit_facets_v2").then((value) => { if (!cancelled) setFacets(value); }).catch(() => {
      // Filters still work without counts; the list reports its own errors.
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void searchPage(filters, 0)
      .then((page) => {
        if (cancelled) return;
        setEvents(page.items ?? []);
        setTotal(page.total ?? 0);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "تعذر تحميل سجل التدقيق.");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [filters, reloadKey]);

  function applyFilters(next: Partial<Filters>) {
    setLoading(true);
    setLoadError(null);
    setMoreError(null);
    setExpandedId(null);
    setFilters((current) => ({ ...current, ...next }));
  }

  function submitSearch(event: FormEvent) {
    event.preventDefault();
    if (queryDraft.trim() !== filters.query) applyFilters({ query: queryDraft.trim() });
  }

  async function loadMore() {
    if (loadingMore) return;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await searchPage(filters, events.length);
      setEvents((current) => [...current, ...(page.items ?? [])]);
      setTotal(page.total ?? total);
    } catch (error) {
      setMoreError(error instanceof Error ? error.message : "تعذر تحميل المزيد.");
    } finally {
      setLoadingMore(false);
    }
  }

  async function loadDetail(id: string) {
    setDetails((current) => ({ ...current, [id]: { status: "loading" } }));
    try {
      const event = await rpc<AuditEvent>("admin_get_audit_log", { p_audit_log_id: id });
      setDetails((current) => ({ ...current, [id]: { status: "ready", event } }));
    } catch (error) {
      setDetails((current) => ({ ...current, [id]: { status: "error", message: error instanceof Error ? error.message : "تعذر تحميل تفاصيل الحدث." } }));
    }
  }

  function toggle(id: string) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!details[id] || details[id].status === "error") void loadDetail(id);
  }

  async function exportEvents() {
    if (exporting) return;
    setExporting(true);
    setExportNotice(null);
    try {
      const result = await rpc<{ items?: unknown[] }>("admin_export_audit_logs", {
        p_action: null, p_entity_type: filters.entityType || null, p_actor_user_id: filters.actorId || null,
        p_result: filters.result === "all" ? null : filters.result, ...(({ p_from, p_to }) => ({ p_from, p_to }))(contractFilters(filters)),
      });
      const count = result.items?.length ?? 0;
      const url = URL.createObjectURL(new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setExportNotice({ tone: "success", text: count >= EXPORT_LIMIT
        ? `صُدِّر أحدث ${EXPORT_LIMIT.toLocaleString("ar-SA-u-nu-latn")} حدث فقط؛ ضيّق الفترة لتصدير الباقي.`
        : `تم تصدير ${count} حدث بالفلاتر الحالية.` });
    } catch (error) {
      setExportNotice({ tone: "error", text: error instanceof Error ? error.message : "تعذر التصدير." });
    } finally {
      setExporting(false);
    }
  }

  const resultCount = (key: AuditResult) => facets?.results?.[key];
  const resultOptions = [
    { value: "all", label: "الكل" },
    { value: "success", label: `ناجحة${resultCount("success") !== undefined ? ` (${resultCount("success")!.toLocaleString("ar-SA-u-nu-latn")})` : ""}` },
    { value: "denied", label: `مرفوضة${resultCount("denied") !== undefined ? ` (${resultCount("denied")!.toLocaleString("ar-SA-u-nu-latn")})` : ""}` },
    { value: "failure", label: `فاشلة${resultCount("failure") !== undefined ? ` (${resultCount("failure")!.toLocaleString("ar-SA-u-nu-latn")})` : ""}` },
  ] as const;
  const hasFilters = JSON.stringify(filters) !== JSON.stringify(emptyFilters);
  const selectClass = "min-h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text outline-none focus:border-q-focus";

  return (
    <div className="space-y-4">
      <section aria-label="فلاتر السجل" className="space-y-4 rounded-q-card border border-q-border bg-q-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <form onSubmit={submitSearch} className="flex min-w-0 flex-1 basis-80 gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">ابحث في السجل</span>
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-q-text-3" />
              <input
                value={queryDraft}
                onChange={(event) => setQueryDraft(event.target.value)}
                placeholder="اسم المنفذ أو بريده، أو معرّف الطلب أو السجل"
                className="min-h-11 w-full rounded-q-control border border-q-border bg-q-surface pr-9 pl-3 text-q-ui text-q-text outline-none focus:border-q-focus"
              />
            </label>
            <Button type="submit" variant="secondary">بحث</Button>
          </form>
          <Button variant="secondary" onClick={() => void exportEvents()} pending={exporting} pendingLabel="جارٍ التصدير…">
            <Download size={16} aria-hidden="true" /> تصدير
          </Button>
        </div>
        <SegmentedControl<ResultFilter>
          label="نتيجة العملية"
          options={resultOptions}
          value={filters.result}
          onChange={(value) => applyFilters({ result: value })}
          className="w-full overflow-x-auto sm:w-fit"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-q-caption font-bold text-q-text-2">
            نوع السجل
            <select value={filters.entityType} onChange={(event) => applyFilters({ entityType: event.target.value })} className={`mt-1 ${selectClass}`}>
              <option value="">كل الأنواع</option>
              {(facets?.entity_types ?? []).map((type) => (
                <option key={type.value} value={type.value}>{entityLabel(type.value)} ({type.count.toLocaleString("ar-SA-u-nu-latn")})</option>
              ))}
            </select>
          </label>
          <label className="text-q-caption font-bold text-q-text-2">
            المنفذ
            <select value={filters.actorId} onChange={(event) => applyFilters({ actorId: event.target.value })} className={`mt-1 ${selectClass}`}>
              <option value="">كل المنفذين</option>
              {(facets?.actors ?? []).map((actor) => (
                <option key={actor.id} value={actor.id}>{actor.name_ar ?? "مستخدم بلا اسم"} ({actor.count.toLocaleString("ar-SA-u-nu-latn")})</option>
              ))}
            </select>
          </label>
          <label className="text-q-caption font-bold text-q-text-2">
            من تاريخ
            <input type="date" value={filters.from} max={filters.to || undefined} onChange={(event) => applyFilters({ from: event.target.value })} className={`mt-1 ${selectClass}`} />
          </label>
          <label className="text-q-caption font-bold text-q-text-2">
            إلى تاريخ
            <input type="date" value={filters.to} min={filters.from || undefined} onChange={(event) => applyFilters({ to: event.target.value })} className={`mt-1 ${selectClass}`} />
          </label>
        </div>
        {hasFilters && (
          <Button variant="ghost" onClick={() => { setQueryDraft(""); applyFilters(emptyFilters); }}>
            <X size={16} aria-hidden="true" /> مسح الفلاتر
          </Button>
        )}
        {exportNotice && <InlineMessage tone={exportNotice.tone}>{exportNotice.text}</InlineMessage>}
      </section>

      <section aria-label="الأحداث" className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-q-border px-4 py-3 sm:px-5">
          <h2 className="text-q-h3 font-black text-q-text">الأحداث</h2>
          {!loading && !loadError && (
            <span className="text-q-caption text-q-text-3">يعرض {events.length.toLocaleString("ar-SA-u-nu-latn")} من {total.toLocaleString("ar-SA-u-nu-latn")}</span>
          )}
        </header>
        {loading ? (
          <p role="status" className="px-5 py-12 text-center text-q-ui text-q-text-3">يجري تحميل السجل…</p>
        ) : loadError ? (
          <div className="flex flex-wrap items-center gap-3 p-5">
            <InlineMessage tone="error">{loadError}</InlineMessage>
            <Button variant="ghost" onClick={() => { setLoading(true); setLoadError(null); setReloadKey((key) => key + 1); }}>إعادة المحاولة</Button>
          </div>
        ) : events.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <ShieldCheck size={32} aria-hidden="true" className="mx-auto text-q-text-3" />
            <p className="mt-3 text-q-ui font-bold text-q-text">لا توجد أحداث تطابق هذه الفلاتر.</p>
            {hasFilters && <p className="mt-1 text-q-caption text-q-text-3">جرّب توسيع الفترة أو مسح الفلاتر.</p>}
          </div>
        ) : (
          <>
            <ul className="divide-y divide-q-border">
              {events.map((event, index) => (
                <EventRow
                  key={`${event.id}-${index}`}
                  event={event}
                  expanded={expandedId === event.id}
                  detail={details[event.id]}
                  onToggle={() => toggle(event.id)}
                  onRetry={() => void loadDetail(event.id)}
                />
              ))}
            </ul>
            {events.length < total && (
              <div className="flex flex-wrap items-center justify-center gap-3 border-t border-q-border p-4">
                <Button variant="secondary" onClick={() => void loadMore()} pending={loadingMore} pendingLabel="جارٍ التحميل…">عرض المزيد</Button>
                {moreError && <InlineMessage tone="error">{moreError}</InlineMessage>}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
