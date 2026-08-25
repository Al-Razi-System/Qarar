"use client";

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
    blue: "bg-[#eaf4ff] text-[#0872df]",
    orange: "bg-[#fff2e8] text-[#d96712]",
    green: "bg-emerald-50 text-emerald-700",
  }[tone];
  return (
    <div className="flex min-w-28 items-center gap-2 rounded-xl border border-white/70 bg-white/90 px-3 py-2 shadow-sm backdrop-blur">
      <span className={`grid h-8 w-8 place-items-center rounded-lg ${toneClass}`}>
        {icon}
      </span>
      <span>
        <strong className="block text-sm font-black text-[#10233d]">{value}</strong>
        <span className="text-[9px] font-bold text-[#76879a]">{label}</span>
      </span>
    </div>
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
        className={`group flex items-center gap-1.5 rounded-xl border px-2 py-1.5 transition ${
          selected
            ? "border-[#8dc4f5] bg-[#eaf4ff] shadow-sm"
            : "border-transparent hover:border-[#e0eaf3] hover:bg-white"
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
          <button
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
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
              hasChildren
                ? "text-[#0872df] hover:bg-[#dceeff]"
                : "text-[#b2bfcc]"
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
          </button>
        </ActionTooltip>
        <button
          type="button"
          title={`عرض ${typeLabels[node.item.item_type] ?? "العنصر"}`}
          onClick={() => onSelect(node.item.id)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1 text-right"
        >
          <span
            className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg ${
              selected
                ? "bg-[#0872df] text-white"
                : "bg-[#f0f5fa] text-[#65809d]"
            }`}
          >
            <ItemTypeIcon type={node.item.item_type} size={13} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <strong className="truncate text-[10px] text-[#1c3049]">
                {node.item.title_ar}
              </strong>
              {hasChildren && (
                <span className="shrink-0 rounded-full bg-white px-1.5 py-0.5 text-[8px] font-black text-[#66809b]">
                  {node.children.length}
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-[8px] text-[#8494a6]">
              {typeLabels[node.item.item_type] ?? node.item.item_type} · {node.item.item_code}
            </span>
          </span>
        </button>
      </div>
      {hasChildren && !collapsed && (
        <ul role="group" className="mt-1 space-y-1 border-r border-[#dde7f0] pr-1">
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
    <button
      type="button"
      title={`فتح ${entry.item.title_ar}`}
      onClick={onSelect}
      className={`w-full rounded-xl border p-3 text-right transition ${
        selected
          ? "border-[#8dc4f5] bg-[#eaf4ff]"
          : "border-[#e5edf4] bg-white hover:border-[#a9d1f4]"
      }`}
    >
      <span className="flex items-center gap-2">
        <span className="rounded-full bg-[#edf6ff] px-2 py-0.5 text-[8px] font-black text-[#0872df]">
          {typeLabels[entry.item.item_type] ?? entry.item.item_type}
        </span>
        <strong className="truncate text-[10px] text-[#1c3049]">
          {entry.item.title_ar}
        </strong>
      </span>
      <span className="mt-1.5 block truncate text-[8px] text-[#8797aa]">
        {[...entry.ancestors.map((item) => item.title_ar), entry.item.item_code].join(" / ")}
      </span>
    </button>
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
      <section className="grid min-h-[420px] place-items-center rounded-3xl border border-dashed border-[#cbdbea] bg-[#f8fbfe] p-8 text-center">
        <div className="max-w-md">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#eaf4ff] text-[#0872df]">
            <Layers3 size={25} />
          </span>
          <h2 className="mt-4 text-base font-black text-[#12263f]">لا يوجد إصدار للعرض</h2>
          <p className="mt-2 text-xs leading-6 text-[#6f8195]">
            أنشئ إصدار عمل أولاً، ثم أضف الفصول والمواد والبنود داخله.
          </p>
          <button
            type="button"
            title="الانتقال إلى أدوات إنشاء الإصدار"
            onClick={onEditContent}
            className="mt-5 rounded-xl bg-[#0872df] px-5 py-2.5 text-[11px] font-black text-white shadow-lg shadow-blue-200"
          >
            إنشاء إصدار العمل
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-3xl border border-[#d9e6f1] bg-white shadow-[0_16px_50px_rgba(20,54,92,.08)]">
      <header className="relative overflow-hidden border-b border-[#dbe8f3] bg-[linear-gradient(120deg,#f7fbff_0%,#eef7ff_55%,#fff7ef_100%)] px-4 py-4 sm:px-6">
        <div className="pointer-events-none absolute -left-16 -top-20 h-48 w-48 rounded-full border-[34px] border-[#0872df]/5" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[10px] font-black text-[#d96712]">
              <ListTree size={14} />
              مستكشف المحتوى النظامي
            </div>
            <h2 className="mt-1 text-base font-black text-[#10233d]">
              اقرأ اللائحة كما بُنيت، من الفصل إلى البند
            </h2>
            <p className="mt-1 text-[10px] leading-5 text-[#657a91]">
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
        <aside className="border-b border-[#e0e9f2] bg-[#f7fafd] xl:border-b-0 xl:border-l">
          <div className="sticky top-0 z-10 space-y-3 border-b border-[#e1eaf2] bg-[#f7fafd]/95 p-3 backdrop-blur">
            <label className="block">
              <span className="mb-1.5 block text-[9px] font-black text-[#536a83]">الإصدار المعروض</span>
              <select
                aria-label="اختيار إصدار اللائحة"
                title="اختر الإصدار الذي تريد قراءة محتواه"
                value={selectedVersion.id}
                onChange={(event) => selectVersion(event.target.value)}
                className="h-10 w-full rounded-xl border border-[#d7e4ef] bg-white px-3 text-[10px] font-bold text-[#20344d] outline-none focus:border-[#6fb2ed]"
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
                <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8496aa]" />
                <input
                  aria-label="البحث في مواد وبنود اللائحة"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث بالرمز أو النص..."
                  className="h-10 w-full rounded-xl border border-[#d7e4ef] bg-white pr-9 pl-9 text-[10px] outline-none focus:border-[#6fb2ed]"
                />
                {query && (
                  <button
                    type="button"
                    title="مسح عبارة البحث"
                    aria-label="مسح البحث"
                    onClick={() => setQuery("")}
                    className="absolute left-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[#7c8fa4] hover:bg-[#eef4f9]"
                  >
                    <X size={13} />
                  </button>
                )}
              </label>
              <ActionTooltip label="طي الشجرة كاملة أو توسيعها">
                <button
                  type="button"
                  aria-label="طي أو توسيع شجرة المحتوى"
                  onClick={toggleAll}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-[#d7e4ef] bg-white text-[#0872df] hover:bg-[#eaf4ff]"
                >
                  {collapsedIds.size ? <FolderOpen size={16} /> : <Folder size={16} />}
                </button>
              </ActionTooltip>
            </div>
            {deferredQuery && (
              <p role="status" className="text-[9px] font-bold text-[#6d8095]">
                {results.length} نتيجة مطابقة من أصل {counts.total}
              </p>
            )}
          </div>
          <div className="thin-scrollbar max-h-[660px] overflow-y-auto p-3">
            {!entries.length ? (
              <div className="rounded-2xl border border-dashed border-[#cad9e7] bg-white p-6 text-center">
                <FileText className="mx-auto text-[#98abc0]" size={24} />
                <strong className="mt-3 block text-xs text-[#263b54]">الإصدار بلا محتوى</strong>
                <p className="mt-1 text-[9px] leading-5 text-[#7b8da1]">أضف فصلاً أو مادة لبدء بناء هيكل اللائحة.</p>
                <button type="button" title="فتح محرر هيكل اللائحة" onClick={onEditContent} className="mt-3 rounded-lg bg-[#0872df] px-3 py-2 text-[9px] font-black text-white">إضافة المحتوى</button>
              </div>
            ) : deferredQuery ? (
              <div className="space-y-2">
                {results.map((entry) => (
                  <SearchResult key={entry.item.id} entry={entry} selected={entry.item.id === selectedItem?.id} onSelect={() => selectItem(entry.item.id)} />
                ))}
                {!results.length && (
                  <div className="rounded-2xl bg-white p-6 text-center text-[10px] text-[#75879b]">لم نجد مادة أو بنداً مطابقاً. جرّب كلمة أقصر أو رمز المادة.</div>
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

        <main className="min-w-0 bg-white">
          {selectedItem ? (
            <article className="mx-auto max-w-4xl px-4 py-5 sm:px-8 sm:py-7">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5edf4] pb-4">
                <nav aria-label="مسار العنصر" className="flex min-w-0 flex-wrap items-center gap-1 text-[9px] text-[#7b8da1]">
                  {selectedEntry.ancestors.map((ancestor) => (
                    <span key={ancestor.id} className="flex items-center gap-1">
                      <span className="max-w-40 truncate">{ancestor.title_ar}</span>
                      <ChevronLeft size={11} />
                    </span>
                  ))}
                  <strong className="max-w-52 truncate text-[#31516f]">{selectedItem.title_ar}</strong>
                </nav>
                <div className="flex items-center gap-1.5">
                  <ActionTooltip label={copyState === "copied" ? "تم نسخ الرابط" : copyState === "failed" ? "تعذر النسخ" : "نسخ رابط مباشر لهذا العنصر"}>
                    <button type="button" aria-label="نسخ رابط مباشر للعنصر" onClick={() => void copyDirectLink()} className="grid h-9 w-9 place-items-center rounded-xl border border-[#dce6ef] text-[#58718b] hover:border-[#9fc9ee] hover:bg-[#f2f8fd] hover:text-[#0872df]">
                      {copyState === "copied" ? <Check size={15} /> : <Link2 size={15} />}
                    </button>
                  </ActionTooltip>
                  <button type="button" title="فتح أدوات تحرير هيكل ومحتوى الإصدار" onClick={onEditContent} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#b9d8f3] bg-[#f3f9ff] px-3 text-[9px] font-black text-[#0872df] hover:bg-[#e7f3ff]"><Pencil size={13} /> تحرير المحتوى</button>
                  <button type="button" title="إدارة القواعد التنفيذية والمسارات المرتبطة" onClick={onManageRules} className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#0872df] px-3 text-[9px] font-black text-white shadow-md shadow-blue-100 hover:bg-[#0066cc]"><Gavel size={13} /> القواعد والمسارات</button>
                </div>
              </div>

              <header className="py-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#eaf4ff] px-3 py-1 text-[9px] font-black text-[#0872df]"><ItemTypeIcon type={selectedItem.item_type} size={12} />{typeLabels[selectedItem.item_type] ?? selectedItem.item_type}</span>
                  <code dir="ltr" className="rounded-full bg-[#f2f5f8] px-3 py-1 text-[9px] font-bold text-[#526b84]">{selectedItem.item_code}</code>
                  <span className={`rounded-full px-3 py-1 text-[9px] font-black ${selectedItem.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{selectedItem.is_active ? "فعال" : "غير فعال"}</span>
                  {selectedItem.legal_status && <span className="rounded-full bg-[#fff4e9] px-3 py-1 text-[9px] font-black text-[#c85f13]">{legalStatusLabels[selectedItem.legal_status] ?? selectedItem.legal_status}</span>}
                </div>
                <h2 className="mt-4 text-2xl font-black leading-[1.65] text-[#0b1f3a]">{selectedItem.title_ar}</h2>
                {selectedItem.title_en && <p dir="ltr" className="mt-1 text-left text-xs text-[#8594a5]">{selectedItem.title_en}</p>}
              </header>

              <section aria-labelledby="official-text-title" className="relative overflow-hidden rounded-2xl border border-[#dce8f2] bg-[#fbfdff] p-5 sm:p-7">
                <span className="absolute right-0 top-0 h-full w-1 bg-[linear-gradient(#0872df,#ff7a00)]" />
                <div className="flex items-center gap-2">
                  <Clipboard size={15} className="text-[#0872df]" />
                  <h3 id="official-text-title" className="text-xs font-black text-[#203650]">النص الرسمي</h3>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-[13px] leading-9 text-[#263c55]">{selectedItem.official_text || selectedItem.body_text || "لم يُسجل نص رسمي لهذا العنصر بعد."}</p>
              </section>

              {selectedItem.interpretation_text && (
                <section className="mt-4 rounded-2xl border border-[#f2dcc7] bg-[#fffaf5] p-5">
                  <div className="flex items-center gap-2 text-[#bd5b13]"><Info size={15} /><h3 className="text-xs font-black">التفسير والإرشاد</h3></div>
                  <p className="mt-3 whitespace-pre-wrap text-[11px] leading-7 text-[#634d3d]">{selectedItem.interpretation_text}</p>
                </section>
              )}

              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DetailCard label="المصدر" value={selectedItem.source_locator || "غير محدد"} icon={<BookOpen size={14} />} />
                <DetailCard label="الصفحات" value={selectedItem.source_page_from ? `${selectedItem.source_page_from}${selectedItem.source_page_to && selectedItem.source_page_to !== selectedItem.source_page_from ? `–${selectedItem.source_page_to}` : ""}` : "غير محددة"} icon={<FileText size={14} />} />
                <DetailCard label="العناصر التابعة" value={String(childCount)} icon={<ListTree size={14} />} />
                <DetailCard label="القواعد والإحالات" value={`${selectedItem.rules?.length ?? 0} قاعدة · ${selectedItem.references?.length ?? 0} إحالة`} icon={<ShieldCheck size={14} />} />
              </div>

              {selectedItem.amendment_note && (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[10px] leading-6 text-amber-900"><strong>ملاحظة التعديل:</strong> {selectedItem.amendment_note}</div>
              )}

              <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-[#e7edf3] pt-4">
                <p className="text-[9px] text-[#7e8fa2]">العنصر {selectedIndex + 1} من {entries.length} حسب ترتيب الإصدار</p>
                <div className="flex gap-2">
                  <button type="button" title="الانتقال إلى العنصر السابق في ترتيب اللائحة" disabled={selectedIndex <= 0} onClick={() => selectItem(entries[selectedIndex - 1].item.id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dce6ef] px-3 text-[9px] font-black text-[#536b84] hover:bg-[#f5f9fc] disabled:opacity-35"><ChevronRight size={14} /> السابق</button>
                  <button type="button" title="الانتقال إلى العنصر التالي في ترتيب اللائحة" disabled={selectedIndex < 0 || selectedIndex >= entries.length - 1} onClick={() => selectItem(entries[selectedIndex + 1].item.id)} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dce6ef] px-3 text-[9px] font-black text-[#536b84] hover:bg-[#f5f9fc] disabled:opacity-35">التالي <ChevronLeft size={14} /></button>
                </div>
              </footer>
            </article>
          ) : (
            <div className="grid min-h-[620px] place-items-center p-8 text-center">
              <div><FileText className="mx-auto text-[#9eb0c1]" size={28} /><h3 className="mt-3 text-sm font-black text-[#263b54]">اختر عنصراً لقراءة محتواه</h3><p className="mt-1 text-[10px] text-[#7b8da1]">استخدم الشجرة أو البحث للوصول إلى المادة أو البند المطلوب.</p></div>
            </div>
          )}
        </main>
      </div>
    </section>
  );
}

function DetailCard({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-xl border border-[#e2eaf2] bg-white p-3 shadow-sm">
      <span className="flex items-center gap-1.5 text-[8px] font-black text-[#71859b]">{icon}{label}</span>
      <strong className="mt-2 block break-words text-[10px] leading-5 text-[#253b54]">{value}</strong>
    </div>
  );
}
