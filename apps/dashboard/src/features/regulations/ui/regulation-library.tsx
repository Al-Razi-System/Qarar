"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BookOpen, ChevronLeft, FileText, LoaderCircle, Search, Plus, Pencil, Check, Archive, Trash2, MoreHorizontal, Power, CircleCheck } from "lucide-react";
import { GovernancePageHeader } from "@/shared/ui/governance-page-header";
import { LibraryError, libraryRpc, verifyLibraryDetail } from "../api/regulation-library-client";
import type { LibraryAction, LibraryDetail, LibraryList } from "../model/regulation-library";
import { RegulationLibraryDialog, type LibraryDialog } from "./regulation-library-dialog";
import { RegulationSourceFiles } from "./regulation-source-files";
import { buildPolicyContentTree, flattenPolicyContent, searchPolicyContent } from "../model/policy-content";
import type { Policy, PolicyItem, PolicyVersion } from "../model/types";
import styles from "./regulation-library.module.css";

const PAGE_SIZE = 30;
const legalLabels: Record<string, string> = { draft: "مسودة", under_review: "قيد المراجعة", approved: "معتمد", effective: "نافذ", suspended: "معلق", expired: "منتهي", archived: "مؤرشف" };
const itemLabels: Record<string, string> = { chapter: "باب", section: "فصل", article: "مادة", clause: "بند", definition: "تعريف", procedure: "إجراء" };
const subscribeHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

// Never echo arbitrary runtime/SQL messages into the preview.
function readFailure() { return "تعذر تحميل البيانات. أعد المحاولة؛ لم تتغير أي بيانات."; }

function defaultReadingVersion(versions: PolicyVersion[]) {
  const ordered = [...versions].sort((a, b) => b.version_no - a.version_no);
  return ordered.find((entry) => entry.legal_status === "effective") ?? ordered[0];
}
function versionStatusLabel(version?: PolicyVersion) {
  if (version?.library_mode && ["under_review", "approved"].includes(version.legal_status)) return "غير منشور";
  return legalLabels[version?.legal_status ?? ""] ?? "لم يُضف النص بعد";
}
function readingVersion(detail?: LibraryDetail) {
  const versions = detail?.policy.versions ?? [];
  return (detail?.capabilities.can_manage && versions.find((entry) => entry.id === detail.working_version_id)) || defaultReadingVersion(versions);
}
function hasUnpublishedText(item: PolicyItem, published?: PolicyItem) {
  if (!published) return false;
  return (["title_ar", "item_type", "body_text", "official_text", "interpretation_text", "source_locator", "source_page_from", "source_page_to"] as const).some((key) => (item[key] ?? "") !== (published[key] ?? ""));
}

export function RegulationLibrary({ initialPolicies, initialTotal, initialCanManage = false, initialDetail }: { initialPolicies: Policy[]; initialTotal: number; initialCanManage?: boolean; initialDetail?: LibraryDetail }) {
  const hydrated = useSyncExternalStore(subscribeHydration, clientReady, serverReady);
  const [policies, setPolicies] = useState(initialPolicies);
  const [total, setTotal] = useState(initialTotal);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [offset, setOffset] = useState(0);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [selection, setSelection] = useState<Policy | null>(initialDetail?.policy ?? null);
  const [snapshot, setSnapshot] = useState<LibraryDetail | null>(initialDetail ?? null);
  const detail = snapshot?.policy ?? null;
  const [detailBusy, setDetailBusy] = useState(false);
  const [detailError, setDetailError] = useState("");
  const initialVersion = readingVersion(initialDetail);
  const [versionId, setVersionId] = useState(initialVersion?.id ?? "");
  const [itemId, setItemId] = useState(flattenPolicyContent(buildPolicyContentTree(initialVersion?.items ?? []))[0]?.item.id ?? "");
  const [contentQuery, setContentQuery] = useState("");
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const requestedList = useRef({ search: "", offset: 0 });
  const [dialog, setDialog] = useState<(LibraryDialog & { action?: LibraryAction; payload?: Record<string, unknown> }) | null>(null);
  const [saving, setMutationBusy] = useState(false);
  const mutationBusy = saving || !hydrated;
  const [mutationError, setMutationError] = useState<LibraryError | null>(null);
  const [notice, setNotice] = useState("");
  const mutationLock = useRef(false);
  const retry = useRef<{ fingerprint: string; requestId: string } | null>(null);
  useEffect(() => () => { listRequest.current += 1; detailRequest.current += 1; }, []);

  async function loadList(search: string, nextOffset: number) {
    const request = ++listRequest.current;
    requestedList.current = { search, offset: nextOffset };
    setListBusy(true); setListError("");
    try {
      const result = await libraryRpc<LibraryList>("admin_search_regulation_library_v2", { p_query: search.trim() || null, p_limit: PAGE_SIZE, p_offset: nextOffset });
      if (request !== listRequest.current) return;
      if (!Array.isArray(result?.items) || !Number.isFinite(result.total)) throw new Error("INVALID_READ_RESPONSE");
      setPolicies(result.items); setTotal(result.total); setOffset(nextOffset); setAppliedQuery(search);
    } catch { if (request === listRequest.current) setListError(readFailure()); }
    finally { if (request === listRequest.current) setListBusy(false); }
  }

  async function openPolicy(policy: Policy) {
    const request = ++detailRequest.current;
    setSelection(policy); setSnapshot(null); setDetailError(""); setDetailBusy(true); setContentQuery(""); setNotice(""); setMutationError(null);
    try {
      const response = verifyLibraryDetail(await libraryRpc<LibraryDetail>("admin_get_regulation_library_v2", { p_policy_id: policy.id }));
      if (request !== detailRequest.current) return;
      const result = response.policy;
      if (!result || result.id !== policy.id || !Array.isArray(result.versions)) throw new Error("INVALID_READ_RESPONSE");
      setSnapshot(response); setSelection(result);
      window.history.replaceState(null, "", `/admin/regulations/${result.id}`);
      const version = readingVersion(response);
      setVersionId(version?.id ?? "");
      setItemId(flattenPolicyContent(buildPolicyContentTree(version?.items ?? []))[0]?.item.id ?? "");
    } catch { if (request === detailRequest.current) setDetailError(readFailure()); }
    finally { if (request === detailRequest.current) setDetailBusy(false); }
  }

  const versions = useMemo(() => [...(detail?.versions ?? [])].sort((a, b) => b.version_no - a.version_no), [detail]);
  const version = versions.find((entry) => entry.id === versionId);
  const currentVersion = defaultReadingVersion(versions);
  const entries = useMemo(() => flattenPolicyContent(buildPolicyContentTree(version?.items ?? [])), [version]);
  const visibleEntries = searchPolicyContent(entries, contentQuery);
  const selected = entries.find((entry) => entry.item.id === itemId);
  const item = selected?.item;
  const editable = !!version && detail?.status === "active" && !!snapshot?.editable_version_ids.includes(version.id);
  const canManage = snapshot?.capabilities.can_manage ?? initialCanManage;
  const inReview = versions.some((entry) => entry.legal_status === "under_review" && !entry.library_mode);
  const queuedText = versions.find((entry) => entry.id === versions[0]?.id && entry.library_mode && ["under_review", "approved"].includes(entry.legal_status));
  const directAction = !!version?.library_mode && canManage && !!(snapshot?.item_action_version_ids ?? snapshot?.direct_activation_version_ids ?? snapshot?.editable_version_ids)?.includes(version.id);
  const publications = snapshot?.item_publications ?? Object.fromEntries((versions.find((entry) => entry.legal_status === "effective")?.items ?? []).map((entry) => [entry.item_code, entry]));
  const historical = !!version && ![snapshot?.working_version_id, snapshot?.published_version_id, currentVersion?.id].includes(version.id) && !snapshot?.editable_version_ids.includes(version.id) && !directAction;
  const publishedItem = item ? historical && version?.legal_status !== "draft" ? item : publications[item.item_code] : undefined;
  const pendingEdit = !!item && hasUnpublishedText(item, publishedItem);
  const itemState = publishedItem ? publishedItem.is_active ? "نشط" : "معطل" : "مسودة";
  const canRemoveItem = !!item && !publishedItem && !item.attachments?.length && !version?.items.some((entry) => entry.parent_item_id === item.id);
  const readOnlyReason = detail?.status !== "active" ? "اللائحة مؤرشفة أو معطلة؛ أعد تفعيلها قبل التعديل." : version?.library_mode && ["under_review", "approved"].includes(version.legal_status) ? "يمكنك تنشيط هذا النص مباشرة بنفسك؛ لا يلزم مراجع آخر." : version?.legal_status === "under_review" ? "هذه نسخة تشغيلية قديمة قيد المراجعة؛ تُحفظ إجراءاتها السابقة." : version?.legal_status === "draft" ? "هذه المسودة مرتبطة بعملية سابقة؛ تبقى محفوظة دون تعديل." : "النص المنشور محفوظ. ابدأ تعديلًا لتعمل على نسخة جديدة دون تغييره.";

  async function mutate(action: LibraryAction, payload: Record<string, unknown> = {}) {
    if (mutationLock.current) throw new LibraryError("هناك عملية جارٍ حفظها. انتظر اكتمالها.");
    const params = { p_policy_id: action === "create" ? null : snapshot?.policy.id, p_action: action, p_payload: payload, p_expected_revision: action === "create" ? null : snapshot?.revision };
    const fingerprint = JSON.stringify(params);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, requestId: crypto.randomUUID() };
    mutationLock.current = true; setMutationBusy(true); setMutationError(null); setNotice("");
    // Ignore obsolete reads/searches once a successful command replaces the snapshot.
    ++detailRequest.current; ++listRequest.current;
    try {
      const result = verifyLibraryDetail(await libraryRpc<LibraryDetail>("admin_save_regulation_library_v2", { ...params, p_client_request_id: retry.current.requestId }));
      setSnapshot(result); setSelection(result.policy);
      const nextVersion = result.policy.versions?.find((entry) => entry.id === result.selected_version_id) ?? result.policy.versions?.find((entry) => entry.id === versionId) ?? defaultReadingVersion(result.policy.versions ?? []);
      setVersionId(nextVersion?.id ?? "");
      const nextItems = flattenPolicyContent(buildPolicyContentTree(nextVersion?.items ?? []));
      setItemId(result.item_id && nextItems.some((entry) => entry.item.id === result.item_id) ? result.item_id : nextItems.find((entry) => entry.item.id === itemId)?.item.id ?? nextItems[0]?.item.id ?? "");
      setPolicies((previous) => previous.some((entry) => entry.id === result.policy.id) ? previous.map((entry) => entry.id === result.policy.id ? result.policy : entry) : [result.policy, ...previous].slice(0, PAGE_SIZE));
      if (action === "create") setTotal((count) => count + 1);
      window.history.replaceState(null, "", `/admin/regulations/${result.policy.id}`);
      setNotice(action === "create" || action === "save_identity" ? "تم حفظ اللائحة." : action === "save_item" ? "تم حفظ البند." : action === "remove_item" ? "تم حذف البند من المسودة." : action === "begin_edit" ? "مساحة التعديل جاهزة؛ النص السابق محفوظ." : action === "set_item_publication" ? payload.is_active ? "تم تنشيط هذا البند فقط." : "تم تعطيل البند؛ السجل السابق محفوظ." : "تم تحديث حالة اللائحة.");
      retry.current = null;
      return result;
    } finally { mutationLock.current = false; setMutationBusy(false); setListBusy(false); }
  }
  async function beginEditing() {
    try {
      const result = await mutate("begin_edit");
      const draft = result.policy.versions?.find((entry) => entry.id === result.selected_version_id);
      if (!draft?.items.length) setDialog({ kind: "item", items: draft?.items ?? [] });
    } catch (error) { setMutationError(error instanceof LibraryError ? error : new LibraryError("تعذر بدء التعديل. أعد المحاولة.")); }
  }
  const confirm = (action: LibraryAction, title: string, description: string, submitLabel: string, payload: Record<string, unknown>, destructive = false, reason = false) => setDialog({ kind: "confirm", action, title, description, submitLabel, payload, destructive, reason });
  function selectReadingVersion(id: string) {
    const next = versions.find((entry) => entry.id === id);
    if (!next) return;
    setVersionId(id); setContentQuery("");
    setItemId(flattenPolicyContent(buildPolicyContentTree(next.items))[0]?.item.id ?? "");
  }
  const readingLabel = version?.legal_status === "draft"
    ? currentVersion?.legal_status === "effective" ? "مسودة تعديل" : "مسودة اللائحة"
    : version?.library_mode && ["under_review", "approved"].includes(version.legal_status) ? "نص محفوظ بانتظار التنشيط"
    : version?.id === currentVersion?.id && version?.legal_status === "effective"
      ? "النص الحالي" : version?.id === currentVersion?.id && version?.legal_status === "under_review" ? "النص قيد المراجعة" : version?.id === currentVersion?.id && version?.legal_status === "approved" ? "نص معتمد بانتظار النفاذ" : `نسخة محفوظة · ${legalLabels[version?.legal_status ?? ""] ?? "حالة غير معروفة"}`;

  return <div className={styles.library} dir="rtl">
    <GovernancePageHeader current="regulations" title="اللوائح والبنود" description="مكتبة الأسانيد النظامية. أضف اللائحة ونظّم بنودها، ثم نشّط كل بند من موضعه."
      actions={initialCanManage && <button disabled={mutationBusy || detailBusy || listBusy} onClick={() => setDialog({ kind: "create" })}><Plus size={19} aria-hidden />إضافة لائحة</button>} />
    <div className={styles.workspace}>
      <aside className={styles.catalog} aria-label="قائمة اللوائح">
        <div className={styles.panelHeading}><h2>اللوائح</h2><span>{total}</span></div>
        <form className={styles.search} onSubmit={(event) => { event.preventDefault(); void loadList(query, 0); }}>
          <input aria-label="البحث في اللوائح" placeholder="اسم اللائحة أو مرجعها" value={query} onChange={(event) => setQuery(event.target.value)} />
          <button type="submit" aria-label="بحث" disabled={listBusy}><Search aria-hidden size={19} /></button>
        </form>
        {listError && <div className={styles.error} role="alert">{listError}<button onClick={() => void loadList(requestedList.current.search, requestedList.current.offset)}>إعادة تحميل القائمة</button></div>}
        {listBusy && <p className={styles.loading} role="status"><LoaderCircle className={styles.spinner} size={18} />جارٍ تحميل اللوائح…</p>}
        <div className={styles.policyList} aria-busy={listBusy}>
          {!policies.length && !listBusy && <p className={styles.empty}>لا توجد لوائح في هذه القائمة.</p>}
          {policies.map((policy) => <button key={policy.id} disabled={listBusy || mutationBusy} aria-pressed={selection?.id === policy.id} className={styles.policy} onClick={() => void openPolicy(policy)}>
            <FileText aria-hidden size={21} /><span><strong>{policy.name_ar}</strong><small><bdi>{policy.code}</bdi>{policy.status !== "active" && " · مؤرشفة أو معطلة"}</small></span><ChevronLeft aria-hidden size={16} />
          </button>)}
        </div>
        <nav className={styles.pagination} aria-label="صفحات اللوائح">
          <button disabled={listBusy || offset === 0} onClick={() => void loadList(appliedQuery, Math.max(0, offset - PAGE_SIZE))}>السابق</button>
          <span>صفحة {Math.floor(offset / PAGE_SIZE) + 1}</span>
          <button disabled={listBusy || offset + PAGE_SIZE >= total} onClick={() => void loadList(appliedQuery, offset + PAGE_SIZE)}>التالي</button>
        </nav>
        {version && <nav className={styles.outline} aria-label="فهرس المحتوى">
          <div className={styles.panelHeading}><h3>بنود اللائحة</h3><span>{entries.length}</span></div>
          <input className={styles.contentSearch} aria-label="البحث داخل اللائحة" placeholder="ابحث عن بند…" value={contentQuery} onChange={(event) => setContentQuery(event.target.value)} />
          {!visibleEntries.length && <p className={styles.empty}>{entries.length ? "لا توجد نتائج مطابقة." : "أضف أول بند للبدء."}</p>}
          {visibleEntries.map(({ item: entry, depth }) => <button key={entry.id} onClick={() => setItemId(entry.id)} aria-pressed={entry.id === itemId} className={styles.outlineItem} style={{ paddingInlineStart: `${14 + Math.min(depth, 5) * 12}px` }}>
            <small>{itemLabels[entry.item_type] ?? "نص نظامي"}</small><strong>{entry.title_ar}</strong>
          </button>)}
        </nav>}
      </aside>
      <section className={styles.document} aria-label="قارئ اللائحة" aria-busy={detailBusy}>
        {!selection && <div className={styles.welcome}><BookOpen aria-hidden size={46} /><h2>مرجعك في مساحة واضحة</h2><p>اختر لائحة من القائمة، ثم المادة أو البند الذي تريد قراءته.</p></div>}
        {selection && <>
          <header className={styles.documentHeader}><div><small>اللائحة</small><h2>{selection.name_ar}</h2><bdi>{selection.code}</bdi></div>
            {version && <div className={styles.readingState}><span>{readingLabel}</span>
              {version.id !== currentVersion?.id && currentVersion && <button onClick={() => selectReadingVersion(currentVersion.id)}>العودة للنص الحالي</button>}
            </div>}
          </header>
          {detailBusy && <p className={styles.loading} role="status"><LoaderCircle className={styles.spinner} size={20} />جارٍ تحميل نص اللائحة…</p>}
          {detailError && <div className={styles.error} role="alert">{detailError}<button onClick={() => void openPolicy(selection)}>إعادة تحميل اللائحة</button></div>}
          {detail && <>
            <div className={styles.actionBar} aria-label="إجراءات اللائحة">
              {canManage && <>
                <button className={styles.secondary} disabled={mutationBusy || detail.status !== "active"} onClick={() => setDialog({ kind: "identity", policy: detail })}><Pencil size={16} />بيانات اللائحة</button>
                {!editable && <button className={styles.primary} disabled={mutationBusy || inReview || detail.status !== "active"} onClick={() => queuedText ? selectReadingVersion(queuedText.id) : void beginEditing()}><Pencil size={16} />{queuedText ? "فتح التعديل المحفوظ" : versions.length ? "بدء تعديل" : "إضافة أول بند"}</button>}
                {editable && <button className={styles.primary} disabled={mutationBusy} onClick={() => setDialog({ kind: "item", items: version.items })}><Plus size={17} />إضافة بند</button>}
              </>}
              <span className={styles.state}>{versionStatusLabel(version)}</span>
              {canManage && <details className={styles.more}><summary>المزيد</summary>
                <button disabled={mutationBusy} onClick={(event) => { event.currentTarget.closest("details")?.removeAttribute("open"); confirm("set_status", detail.status === "active" ? "أرشفة اللائحة" : "إعادة تفعيل اللائحة", "يُحفظ النص والسجل التاريخي. الأرشفة تمنع التعديل ولا تمحو القرارات المرتبطة.", detail.status === "active" ? "تأكيد الأرشفة" : "إعادة التفعيل", { status: detail.status === "active" ? "archived" : "active" }, detail.status === "active"); }}><Archive size={16} />{detail.status === "active" ? "أرشفة اللائحة" : "إعادة التفعيل"}</button>
              </details>}
            </div>
            {saving && !item && <p className={styles.loading} role="status"><LoaderCircle className={styles.spinner} size={18} />جارٍ حفظ العملية…</p>}
            {notice && !item && <p className={styles.success} role="status"><Check size={18} />{notice}</p>}
            {mutationError && <div className={styles.error} role="alert">{mutationError.message}<button onClick={() => void openPolicy(detail)}>إعادة تحميل اللائحة</button></div>}
            {canManage && !editable && version && <p className={styles.hint}>{readOnlyReason}</p>}
          </>}
          {detail && !versions.length && <p className={styles.empty}>لم يُضف نص لهذه اللائحة بعد.</p>}
          {version && <div className={styles.content}>
            <article className={styles.reader}>
              {item ? <>
                <div className={styles.breadcrumb}>{selected?.ancestors.map((ancestor) => <span key={ancestor.id}>{ancestor.title_ar} / </span>)}{itemLabels[item.item_type] ?? "نص نظامي"}</div>
                <header className={styles.itemHero}>
                  <div className={styles.itemHeading}><h3>{item.title_ar}</h3><span className={`${styles.statusBadge} ${itemState === "نشط" ? styles.statusActive : itemState === "معطل" ? styles.statusInactive : styles.statusDraft}`}><CircleCheck size={16} />{itemState}</span></div>
                  <p className={styles.reference}><bdi>{item.item_code}</bdi>{pendingEdit && <span className={styles.pendingBadge}>تعديل غير منشور</span>}</p>
                  <div className={styles.itemToolbar} aria-label="إجراءات البند">
                    {editable && <button className={styles.secondary} disabled={mutationBusy} onClick={() => setDialog({ kind: "item", item, items: version.items })}><Pencil size={17} />تعديل البند</button>}
                    {directAction && !["chapter", "section"].includes(item.item_type) && <>
                      {(!publishedItem?.is_active || pendingEdit) && <button className={styles.primary} disabled={mutationBusy || !(item.official_text?.trim() || item.body_text?.trim())} onClick={() => confirm("set_item_publication", pendingEdit && publishedItem?.is_active ? "نشر تعديل البند" : "تنشيط البند", "سيُنشر نص هذا البند فقط؛ مسودات بقية البنود لن تتغير. يُحفظ السجل السابق تلقائيًا.", "تأكيد التنشيط", { version_id: version.id, item_id: item.id, is_active: true })}><Power size={17} />{pendingEdit && publishedItem?.is_active ? "نشر تعديل البند" : "تنشيط البند"}</button>}
                      {publishedItem?.is_active && <button className={styles.secondary} disabled={mutationBusy} onClick={() => confirm("set_item_publication", "تعطيل البند", "سيتوقف استخدام هذا البند مع حفظ تاريخه وارتباطاته. أي تعديل غير منشور يبقى في المسودة.", "تأكيد التعطيل", { version_id: version.id, item_id: item.id, is_active: false })}><Power size={17} />تعطيل البند</button>}
                    </>}
                    {editable && <details className={styles.itemMore}><summary aria-label="المزيد من إجراءات البند"><MoreHorizontal size={22} /></summary><div>
                      <button className={styles.danger} disabled={mutationBusy || !canRemoveItem} onClick={() => confirm("remove_item", "حذف البند من المسودة", "سيُحذف البند غير المنشور من مساحة العمل فقط.", "تأكيد حذف البند", { version_id: version.id, item_id: item.id }, true)}><Trash2 size={16} />حذف البند</button>
                      {!canRemoveItem && <small>{publishedItem ? "البند منشور؛ عطّله بدل حذف سجله." : "عالج البنود التابعة ومرفقات المصدر قبل الحذف."}</small>}
                    </div></details>}
                  </div>
                  {saving && <p className={styles.loading} role="status"><LoaderCircle className={styles.spinner} size={18} />جارٍ حفظ العملية…</p>}
                  {notice && <p className={styles.success} role="status"><Check size={18} />{notice}</p>}
                  {directAction && !["chapter", "section"].includes(item.item_type) && !(item.official_text?.trim() || item.body_text?.trim()) && <p className={styles.hint}>أضف نص البند قبل تنشيطه.</p>}
                </header>
                <div className={styles.legalText}>{item.official_text?.trim() || item.body_text?.trim() || "لم يُضف النص الرسمي لهذا البند بعد."}</div>
                {!!(item.interpretation_text || item.source_locator || item.source_page_from || item.attachments?.length) && <details className={styles.source} key={item.id}><summary>التفسير وبيانات المصدر</summary>
                  {item.interpretation_text && <section><h4>تفسير المصدر</h4><p>{item.interpretation_text}</p></section>}
                  {item.source_locator && <p>موضع النص: {item.source_locator}</p>}
                  {item.source_page_from != null && <p>الصفحة {item.source_page_from}{item.source_page_to != null && item.source_page_to !== item.source_page_from ? ` إلى ${item.source_page_to}` : ""}</p>}
                  {!!item.attachments?.length && <RegulationSourceFiles attachments={item.attachments} />}
                </details>}
              </> : <p className={styles.empty}>اختر نصًا من الفهرس لقراءته.</p>}
            </article>
          </div>}
          {version && versions.length > 1 && <details className={styles.history} key={detail?.id}>
            <summary>النسخ السابقة والتعديلات</summary>
            <p>للاطلاع عند الحاجة فقط؛ اختيار نسخة هنا لا يغيّر اللائحة أو اعتمادها.</p>
            <label className={styles.version}>النسخ المحفوظة<select value={versionId} onChange={(event) => selectReadingVersion(event.target.value)}>
              {versions.map((entry) => <option key={entry.id} value={entry.id}>نسخة {entry.version_no} · {versionStatusLabel(entry)}{entry.id === currentVersion?.id ? " · المعروضة افتراضيًا" : ""}</option>)}
            </select></label>
          </details>}
          {!!((detail?.attachments?.length ?? 0) + (version?.attachments?.length ?? 0)) && <details className={styles.history}><summary>وثائق مصدر اللائحة</summary><RegulationSourceFiles attachments={[...(detail?.attachments ?? []), ...(version?.attachments ?? [])]} /></details>}
        </>}
      </section>
    </div>
    {dialog && <RegulationLibraryDialog key={dialog.kind + (dialog.kind === "item" ? dialog.item?.id ?? "new" : "")} dialog={dialog} onClose={() => setDialog(null)} onReload={async () => {
      if (!detail) return;
      const result = verifyLibraryDetail(await libraryRpc<LibraryDetail>("admin_get_regulation_library_v2", { p_policy_id: detail.id }));
      setSnapshot(result); setSelection(result.policy);
    }} onSave={async (payload) => {
      const action = dialog.kind === "create" ? "create" : dialog.kind === "identity" ? "save_identity" : dialog.kind === "item" ? "save_item" : dialog.action!;
      await mutate(action, { ...(dialog.kind === "item" ? { version_id: versionId } : {}), ...dialog.payload, ...payload });
    }} />}
  </div>;
}
