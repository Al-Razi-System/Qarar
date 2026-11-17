"use client";

import { Card as QCard } from "@/shared/ui/card";
import { Badge as QBadge } from "@/shared/ui/badge";

import { Button as QButton } from "@/shared/ui/button";

import {
  useDeferredValue,
  useState,
  type ReactNode,
} from "react";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  FileText,
  Folder,
  FolderOpen,
  Gavel,
  Info,
  Layers3,
  Link2,
  ListTree,
  Pencil,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  buildPolicyContentTree,
  countPolicyContent,
  flattenPolicyContent,
  searchPolicyContent,
  type PolicyContentEntry,
  type PolicyContentNode,
} from "../model/policy-content";
import type { Policy } from "../model/types";
import { ActionTooltip } from "./action-tooltip";

const typeLabels: Record<string, string> = {
  chapter: "فصل",
  section: "قسم",
  article: "مادة",
  clause: "بند",
  procedure: "إجراء",
  definition: "تعريف",
};

const legalStatusLabels: Record<string, string> = {
  active: "نافذ",
  amended: "معدّل",
  repealed: "ملغى",
  suspended: "موقوف",
};

const versionStatusLabels: Record<string, string> = {
  draft: "مسودة",
  under_review: "قيد المراجعة",
  approved: "معتمد",
  effective: "نافذ",
  suspended: "معلق",
  expired: "منتهي",
};

function syncContentLocation(versionId: string, itemId?: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "content");
  url.searchParams.set("version", versionId);
  if (itemId) url.searchParams.set("item", itemId);
  else url.searchParams.delete("item");
  window.history.replaceState(window.history.state, "", url);
}

function ItemTypeIcon({ type, size = 15 }: { type: string; size?: number }) {
  if (type === "chapter" || type === "section") return <Folder size={size} />;
  if (type === "article") return <BookOpen size={size} />;
  return <FileText size={size} />;
}

function Metric({
  label,
  value,
  icon,
  tone = "blue",
}: {
  label: string;
  value: number;
  icon: ReactNode;
  tone?: "blue" | "orange" | "green";
}) {
  const toneClass = {
    blue: "bg-q-surface-2 text-q-primary",
    orange: "bg-q-surface-2 text-q-link",
    green: "bg-q-success-soft text-q-success",
  }[tone];
  return (
    <QCard className="p-0 flex min-w-28 items-center gap-2 rounded-q-control border border-q-surface/70 bg-q-surface/90 px-3 py-2 backdrop-blur">
      <span className={`grid h-8 w-8 place-items-center rounded-q-control ${toneClass}`}>
        {icon}
      </span>
      <span>
        <strong className="block text-q-ui font-bold text-q-text">{value}</strong>
        <span className="text-q-caption font-bold text-q-text-3">{label}</span>
      </span>
    </QCard>
  );
}

function TreeBranch({
  node,
  depth,
  collapsedIds,
  selectedItemId,
  onToggle,
  onSelect,
}: {
  node: PolicyContentNode;
  depth: number;
  collapsedIds: Set<string>;
  selectedItemId?: string;
  onToggle: (itemId: string) => void;
  onSelect: (itemId: string) => void;
}) {
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.item.id);
  const selected = selectedItemId === node.item.id;
  return (
    <li
      role="treeitem"
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-selected={selected}
    >
      <div
        className={`group flex items-center gap-1.5 rounded-q-control border px-2 py-1.5 transition ${
          selected
            ? "border-q-primary bg-q-surface-2 "
            : "border-transparent hover:border-q-border hover:bg-q-surface"
        }`}
        style={{ marginInlineStart: `${Math.min(depth, 6) * 12}px` }}
      >
        <ActionTooltip
          label={
            hasChildren
              ? collapsed
                ? "إظهار العناصر التابعة"
                : "إخفاء العناصر التابعة"
              : "لا توجد عناصر تابعة"
          }
        >
          <QButton variant="ghost"
            type="button"
            disabled={!hasChildren}
            onClick={() => onToggle(node.item.id)}
            aria-label={
              hasChildren
                ? collapsed
                  ? `توسيع ${node.item.title_ar}`
                  : `طي ${node.item.title_ar}`
                : `${node.item.title_ar} بلا عناصر تابعة`
            }
            className={`min-w-11 grid min-h-11 min-w-11 shrink-0 place-items-center rounded-q-control ${
              hasChildren
                ? "text-q-primary hover:bg-q-surface-2"
                : "text-q-text-3"
            }`}
          >
            {hasChildren ? (
              <ChevronDown
                size={14}
                className={`transition-transform ${collapsed ? "rotate-90" : ""}`}
              />
            ) : (
              <span className="h-1 w-1 rounded-full bg-current" />
            )}
          </QButton>
        </ActionTooltip>
        <QButton variant="ghost"
          type="button"
          title={`عرض ${typeLabels[node.item.item_type] ?? "العنصر"}`}
          onClick={() => onSelect(node.item.id)}
          className="min-w-11 flex min-w-0 flex-1 items-center gap-2 rounded-q-control py-1 text-right"
        >
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-q-control ${
              selected
                ? "bg-q-primary text-q-on-primary"
                : "bg-q-surface-2 text-q-text-3"
            }`}
          >
            <ItemTypeIcon type={node.item.item_type} size={13} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <strong className="truncate text-q-caption text-q-text">
                {node.item.title_ar}
              </strong>
              {hasChildren && (
                <QBadge className="shrink-0 rounded-full bg-q-surface px-1.5 py-0.5 text-q-caption font-bold text-q-text-3">
                  {node.children.length}
                </QBadge>
              )}
            </span>
            <span className="mt-0.5 block truncate text-q-caption text-q-text-3">
              {typeLabels[node.item.item_type] ?? node.item.item_type} · {node.item.item_code}
            </span>
          </span>
        </QButton>
      </div>
      {hasChildren && !collapsed && (
        <ul role="group" className="mt-1 space-y-1 border-r border-q-border pr-1">
          {node.children.map((child) => (
            <TreeBranch
              key={child.item.id}
              node={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              selectedItemId={selectedItemId}
              onToggle={onToggle}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SearchResult({
  entry,
  selected,
  onSelect,
}: {
  entry: PolicyContentEntry;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <QButton variant="ghost"
      type="button"
      title={`فتح ${entry.item.title_ar}`}
      onClick={onSelect}
      className={`min-w-11 w-full rounded-q-control border p-3 text-right transition ${
        selected
          ? "border-q-primary bg-q-surface-2"
          : "border-q-border bg-q-surface hover:border-q-primary"
      }`}
    >
      <span className="flex items-center gap-2">
        <QBadge className="rounded-full bg-q-surface-2 px-2 py-0.5 text-q-caption font-bold text-q-primary">
          {typeLabels[entry.item.item_type] ?? entry.item.item_type}
        </QBadge>
        <strong className="truncate text-q-caption text-q-text">
          {entry.item.title_ar}
        </strong>
      </span>
      <span className="mt-1.5 block truncate text-q-caption text-q-text-3">
        {[...entry.ancestors.map((item) => item.title_ar), entry.item.item_code].join(" / ")}
      </span>
    </QButton>
  );
}

export function PolicyContentExplorer({
  policy,
  initialVersionId,
  initialItemId,
  onEditContent,
  onManageRules,
}: {
  policy: Policy;
  initialVersionId?: string;
  initialItemId?: string;
  onEditContent: () => void;
  onManageRules: () => void;
}) {
  const versions = policy.versions ?? [];
  const [selectedVersionId, setSelectedVersionId] = useState(
    versions.some((version) => version.id === initialVersionId)
      ? initialVersionId!
      : (versions[0]?.id ?? ""),
  );
  const [selectedItemId, setSelectedItemId] = useState<string | undefined>(
    initialItemId,
  );
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => new Set());
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");

  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ?? versions[0];
  const tree = buildPolicyContentTree(selectedVersion?.items ?? []);
  const entries = flattenPolicyContent(tree);
  const results = searchPolicyContent(entries, deferredQuery);
  const selectedEntry =
    entries.find((entry) => entry.item.id === selectedItemId) ?? entries[0];
  const selectedItem = selectedEntry?.item;
  const selectedIndex = selectedItem
    ? entries.findIndex((entry) => entry.item.id === selectedItem.id)
    : -1;
  const counts = countPolicyContent(selectedVersion?.items ?? []);
  const childCount = selectedItem
    ? selectedVersion?.items.filter((item) => item.parent_item_id === selectedItem.id)
        .length ?? 0
    : 0;

  function selectVersion(versionId: string) {
    const version = versions.find((candidate) => candidate.id === versionId);
    if (!version) return;
    const firstItemId = buildPolicyContentTree(version.items)[0]?.item.id;
    setSelectedVersionId(versionId);
    setSelectedItemId(firstItemId);
    setCollapsedIds(new Set());
    setQuery("");
    syncContentLocation(versionId, firstItemId);
  }

  function selectItem(itemId: string) {
    setSelectedItemId(itemId);
    if (selectedVersion) syncContentLocation(selectedVersion.id, itemId);
  }

  function toggleItem(itemId: string) {
    setCollapsedIds((current) => {
      const next = new Set(current);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function toggleAll() {
    const parentIds = entries
      .filter(({ item }) =>
        selectedVersion?.items.some((candidate) => candidate.parent_item_id === item.id),
      )
      .map(({ item }) => item.id);
    setCollapsedIds((current) =>
      current.size >= parentIds.length ? new Set() : new Set(parentIds),
    );
  }

  async function copyDirectLink() {
    if (!selectedVersion || !selectedItem) return;
    syncContentLocation(selectedVersion.id, selectedItem.id);
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  }

  if (!selectedVersion) {
    return (
      <section className="grid min-h-[420px] place-items-center rounded-q-card border border-dashed border-q-border bg-q-bg p-8 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-q-card bg-q-surface-2 text-q-primary">
            <Layers3 size={25} />
          </span>
          <h2 className="mt-4 text-q-ui font-bold text-q-text">لا يوجد إصدار للعرض</h2>
          <p className="mt-2 text-q-caption leading-6 text-q-text-3">
            أنشئ إصدار عمل أولاً، ثم أضف الفصول والمواد والبنود داخله.
          </p>
          <QButton variant="ghost"
            type="button"
            title="الانتقال إلى أدوات إنشاء الإصدار"
            onClick={onEditContent}
            className="min-w-11 mt-5 rounded-q-control bg-q-primary px-5 py-2.5 text-q-ui font-bold text-q-on-primary  "
          >
            إنشاء إصدار العمل
          </QButton>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-q-card border border-q-border bg-q-surface ">
      <header className="relative overflow-hidden border-b border-q-border bg-q-surface-2 px-4 py-4 sm:px-6">
        <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full border-[34px] border-q-primary/5" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-q-caption font-bold text-q-link">
              <ListTree size={14} />
              مستكشف المحتوى النظامي
            </div>
            <h2 className="mt-1 text-q-ui font-bold text-q-text">
              اقرأ اللائحة كما بُنيت، من الفصل إلى البند
            </h2>
            <p className="mt-1 text-q-caption leading-5 text-q-text-2">
              اختر عنصراً من الشجرة لعرض نصه الرسمي ومصدره وقواعده دون الدخول في وضع التحرير.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Metric label="إجمالي العناصر" value={counts.total} icon={<ListTree size={15} />} />
            <Metric label="المواد" value={counts.articles} icon={<BookOpen size={15} />} tone="orange" />
            <Metric label="البنود" value={counts.clauses} icon={<FileText size={15} />} tone="green" />
          </div>
        </div>
      </header>

      <div className="grid min-h-[650px] xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-b border-q-border bg-q-surface xl:border-b-0 xl:border-l">
          <div className="sticky top-0 z-10 space-y-3 border-b border-q-border bg-q-surface/95 p-3 backdrop-blur">
            <label className="block">
              <span className="mb-1.5 block text-q-caption font-bold text-q-text-2">الإصدار المعروض</span>
              <select
                aria-label="اختيار إصدار اللائحة"
                title="اختر الإصدار الذي تريد قراءة محتواه"
                value={selectedVersion.id}
                onChange={(event) => selectVersion(event.target.value)}
                className="min-h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-caption font-bold text-q-text outline-none focus:border-q-primary"
              >
                {versions.map((version) => (
                  <option key={version.id} value={version.id}>
                    {version.version_label || `الإصدار ${version.version_no}`} · {versionStatusLabels[version.legal_status] ?? version.legal_status}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-q-text-3" />
                <input
                  aria-label="البحث في مواد وبنود اللائحة"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث بالرمز أو النص..."
                  className="min-h-11 w-full rounded-q-control border border-q-border bg-q-surface pr-9 pl-9 text-q-caption outline-none focus:border-q-primary"
                />
                {query && (
                  <QButton variant="ghost"
                    type="button"
                    title="مسح عبارة البحث"
                    aria-label="مسح البحث"
                    onClick={() => setQuery("")}
                    className="min-w-11 absolute left-2 top-1/2 grid min-h-11 min-w-11 -translate-y-1/2 place-items-center rounded-q-control text-q-text-3 hover:bg-q-surface-2"
                  >
                    <X size={13} />
                  </QButton>
                )}
              </label>
              <ActionTooltip label="طي الشجرة كاملة أو توسيعها">
                <QButton variant="ghost"
                  type="button"
                  aria-label="طي أو توسيع شجرة المحتوى"
                  onClick={toggleAll}
                  className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control border border-q-border bg-q-surface text-q-primary hover:bg-q-surface-2"
                >
                  {collapsedIds.size ? <FolderOpen size={16} /> : <Folder size={16} />}
                </QButton>
              </ActionTooltip>
            </div>
            {deferredQuery && (
              <p role="status" className="text-q-caption font-bold text-q-text-3">
                {results.length} نتيجة مطابقة من أصل {counts.total}
              </p>
            )}
          </div>
          <div className="thin-scrollbar max-h-[660px] overflow-y-auto p-3">
            {!entries.length ? (
              <QCard className="p-0 rounded-q-card border border-dashed border-q-border bg-q-surface p-6 text-center">
                <FileText className="mx-auto text-q-text-3" size={24} />
                <strong className="mt-3 block text-q-caption text-q-text">الإصدار بلا محتوى</strong>
                <p className="mt-1 text-q-caption leading-5 text-q-text-3">أضف فصلاً أو مادة لبدء بناء هيكل اللائحة.</p>
                <QButton variant="ghost" type="button" title="فتح محرر هيكل اللائحة" onClick={onEditContent} className="min-w-11 mt-3 rounded-q-control bg-q-primary px-3 py-2 text-q-ui font-bold text-q-on-primary">إضافة المحتوى</QButton>
              </QCard>
            ) : deferredQuery ? (
              <div className="space-y-2">
                {results.map((entry) => (
                  <SearchResult key={entry.item.id} entry={entry} selected={entry.item.id === selectedItem?.id} onSelect={() => selectItem(entry.item.id)} />
                ))}
                {!results.length && (
                  <div className="rounded-q-card bg-q-surface p-6 text-center text-q-caption text-q-text-3">لم نجد مادة أو بنداً مطابقاً. جرّب كلمة أقصر أو رمز المادة.</div>
                )}
              </div>
            ) : (
              <ul role="tree" aria-label="شجرة محتوى اللائحة" className="space-y-1">
                {tree.map((node) => (
                  <TreeBranch key={node.item.id} node={node} depth={0} collapsedIds={collapsedIds} selectedItemId={selectedItem?.id} onToggle={toggleItem} onSelect={selectItem} />
                ))}
              </ul>
            )}
          </div>
        </aside>

        <main className="min-w-0 bg-q-surface">
          {selectedItem ? (
            <article className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-q-border pb-4">
                <nav aria-label="مسار العنصر" className="flex min-w-0 flex-wrap items-center gap-1 text-q-caption text-q-text-3">
                  {selectedEntry.ancestors.map((ancestor) => (
                    <span key={ancestor.id} className="flex items-center gap-1">
                      <span className="max-w-40 truncate">{ancestor.title_ar}</span>
                      <ChevronLeft size={11} />
                    </span>
                  ))}
                  <strong className="max-w-52 truncate text-q-text-2">{selectedItem.title_ar}</strong>
                </nav>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ActionTooltip label={copyState === "copied" ? "تم نسخ الرابط" : copyState === "failed" ? "تعذر النسخ" : "نسخ رابط مباشر لهذا العنصر"}>
                    <QButton variant="ghost" type="button" aria-label="نسخ رابط مباشر للعنصر" onClick={() => void copyDirectLink()} className="min-w-11 grid min-h-11 min-w-11 place-items-center rounded-q-control border border-q-border text-q-text-2 hover:border-q-primary hover:bg-q-surface hover:text-q-primary">
                      {copyState === "copied" ? <Check size={15} /> : <Link2 size={15} />}
                    </QButton>
                  </ActionTooltip>
                  <QButton variant="ghost" type="button" title="فتح أدوات تحرير هيكل ومحتوى الإصدار" onClick={onEditContent} className="min-w-11 inline-flex min-h-11 items-center gap-1.5 rounded-q-control border border-q-primary bg-q-surface px-3 text-q-ui font-bold text-q-primary hover:bg-q-surface-2"><Pencil size={13} /> تحرير المحتوى</QButton>
                  <QButton variant="ghost" type="button" title="إدارة القواعد التنفيذية والمسارات المرتبطة" onClick={onManageRules} className="min-w-11 inline-flex min-h-11 items-center gap-1.5 rounded-q-control bg-q-primary px-3 text-q-ui font-bold text-q-on-primary   hover:bg-q-primary"><Gavel size={13} /> القواعد والمسارات</QButton>
                </div>
              </div>

              <header className="py-6">
                <div className="flex flex-wrap items-center gap-2">
                  <QBadge className="inline-flex items-center gap-1.5 rounded-full bg-q-surface-2 px-3 py-1 text-q-caption font-bold text-q-primary"><ItemTypeIcon type={selectedItem.item_type} size={12} />{typeLabels[selectedItem.item_type] ?? selectedItem.item_type}</QBadge>
                  <code dir="ltr" className="rounded-full bg-q-surface-2 px-3 py-1 text-q-caption font-bold text-q-text-2">{selectedItem.item_code}</code>
                  <span className={`rounded-full px-3 py-1 text-q-caption font-bold ${selectedItem.is_active ? "bg-q-success-soft text-q-success" : "bg-q-neutral-soft text-q-text-2"}`}>{selectedItem.is_active ? "فعال" : "غير فعال"}</span>
                  {selectedItem.legal_status && <QBadge className="rounded-full bg-q-surface-2 px-3 py-1 text-q-caption font-bold text-q-link">{legalStatusLabels[selectedItem.legal_status] ?? selectedItem.legal_status}</QBadge>}
                </div>
                <h2 className="mt-4 text-q-h2 font-bold leading-[1.65] text-q-text">{selectedItem.title_ar}</h2>
                {selectedItem.title_en && <p dir="ltr" className="mt-1 text-left text-q-caption text-q-text-3">{selectedItem.title_en}</p>}
              </header>

              <section aria-labelledby="official-text-title" className="relative overflow-hidden rounded-q-card border border-q-border bg-q-bg p-5 sm:p-7">
                <span className="absolute right-0 top-0 h-full w-1 bg-q-primary" />
                <div className="flex items-center gap-2">
                  <Clipboard size={15} className="text-q-primary" />
                  <h3 id="official-text-title" className="text-q-caption font-bold text-q-text">النص الرسمي</h3>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-q-body leading-9 text-q-text">{selectedItem.official_text || selectedItem.body_text || "لم يُسجل نص رسمي لهذا العنصر بعد."}</p>
              </section>

              {selectedItem.interpretation_text && (
                <section className="mt-4 rounded-q-card border border-q-border bg-q-surface-2 p-5">
                  <div className="flex items-center gap-2 text-q-link"><Info size={15} /><h3 className="text-q-caption font-bold">التفسير والإرشاد</h3></div>
                  <p className="mt-3 whitespace-pre-wrap text-q-caption leading-7 text-q-text-2">{selectedItem.interpretation_text}</p>
                </section>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailCard label="المصدر" value={selectedItem.source_locator || "غير محدد"} icon={<BookOpen size={14} />} />
                <DetailCard label="الصفحات" value={selectedItem.source_page_from ? `${selectedItem.source_page_from}${selectedItem.source_page_to && selectedItem.source_page_to !== selectedItem.source_page_from ? `–${selectedItem.source_page_to}` : ""}` : "غير محددة"} icon={<FileText size={14} />} />
                <DetailCard label="العناصر التابعة" value={String(childCount)} icon={<ListTree size={14} />} />
                <DetailCard label="القواعد والإحالات" value={`${selectedItem.rules?.length ?? 0} قاعدة · ${selectedItem.references?.length ?? 0} إحالة`} icon={<ShieldCheck size={14} />} />
              </div>

              {selectedItem.amendment_note && (
                <QCard className="p-0 mt-4 rounded-q-control border border-q-border bg-q-warning-soft p-4 text-q-caption leading-6 text-q-warning"><strong>ملاحظة التعديل:</strong> {selectedItem.amendment_note}</QCard>
              )}

              <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-q-border pt-4">
                <p className="text-q-caption text-q-text-3">العنصر {selectedIndex + 1} من {entries.length} حسب ترتيب الإصدار</p>
                <div className="flex gap-2">
                  <QButton variant="ghost" type="button" title="الانتقال إلى العنصر السابق في ترتيب اللائحة" disabled={selectedIndex <= 0} onClick={() => selectItem(entries[selectedIndex - 1].item.id)} className="min-w-11 inline-flex min-h-11 items-center gap-1.5 rounded-q-control border border-q-border px-3 text-q-ui font-bold text-q-text-2 hover:bg-q-surface disabled:opacity-35"><ChevronRight size={14} /> السابق</QButton>
                  <QButton variant="ghost" type="button" title="الانتقال إلى العنصر التالي في ترتيب اللائحة" disabled={selectedIndex < 0 || selectedIndex >= entries.length - 1} onClick={() => selectItem(entries[selectedIndex + 1].item.id)} className="min-w-11 inline-flex min-h-11 items-center gap-1.5 rounded-q-control border border-q-border px-3 text-q-ui font-bold text-q-text-2 hover:bg-q-surface disabled:opacity-35">التالي <ChevronLeft size={14} /></QButton>
                </div>
              </footer>
            </article>
          ) : (
            <div className="grid min-h-[620px] place-items-center p-8 text-center">
              <div><FileText className="mx-auto text-q-text-3" size={28} /><h3 className="mt-3 text-q-ui font-bold text-q-text">اختر عنصراً لقراءة محتواه</h3><p className="mt-1 text-q-caption text-q-text-3">استخدم الشجرة أو البحث للوصول إلى المادة أو البند المطلوب.</p></div>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function DetailCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <QCard className="p-0 rounded-q-control border border-q-border bg-q-surface p-3 ">
      <span className="flex items-center gap-1.5 text-q-caption font-bold text-q-text-3">{icon}{label}</span>
      <strong className="mt-2 block break-words text-q-caption leading-5 text-q-text">{value}</strong>
    </QCard>
  );
}
