"use client";

import { useEffect, useId, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { LibraryError } from "../api/regulation-library-client";
import type { Policy, PolicyItem } from "../model/types";
import styles from "./regulation-library.module.css";

export type LibraryDialog =
  | { kind: "create" }
  | { kind: "identity"; policy: Policy }
  | { kind: "item"; item?: PolicyItem; items: PolicyItem[] }
  | { kind: "confirm"; title: string; description: string; submitLabel: string; reason?: boolean; destructive?: boolean };

export function RegulationLibraryDialog({ dialog, onClose, onSave, onReload }: {
  dialog: LibraryDialog; onClose: () => void; onSave: (payload: Record<string, unknown>) => Promise<void>; onReload: () => Promise<void>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<LibraryError | null>(null);
  const source = dialog.kind === "item" ? dialog.item : undefined;
  const [title, setTitle] = useState(source?.title_ar ?? (dialog.kind === "identity" ? dialog.policy.name_ar : ""));
  const [text, setText] = useState(source?.official_text ?? source?.body_text ?? "");
  const [type, setType] = useState(source?.item_type ?? "article");
  const [parent, setParent] = useState(source?.parent_item_id ?? "");
  useEffect(() => {
    const element = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    if (element?.showModal) element.showModal(); else element?.setAttribute("open", "");
    element?.querySelector<HTMLElement>("input, textarea, button")?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = oldOverflow; previous?.focus(); };
  }, []);
  const titleLabel = dialog.kind === "create" ? "إضافة لائحة" : dialog.kind === "identity" ? "بيانات اللائحة" : dialog.kind === "item" ? source ? "تعديل النص النظامي" : "إضافة مادة أو بند" : dialog.title;
  const submitLabel = dialog.kind === "item" ? "حفظ البند" : dialog.kind === "confirm" ? dialog.submitLabel : "حفظ اللائحة";
  const blocked = new Set<string>(source ? [source.id] : []);
  if (dialog.kind === "item") {
    // Exclude the item and its descendants; the database independently checks cycles.
    for (let changed = true; changed;) {
      changed = false;
      for (const item of dialog.items) if (item.parent_item_id && blocked.has(item.parent_item_id) && !blocked.has(item.id)) { blocked.add(item.id); changed = true; }
    }
  }
  async function submit(form: HTMLFormElement) {
    if (lock.current) return;
    const values = new FormData(form);
    let payload: Record<string, unknown>;
    if (dialog.kind === "item") {
      const from = values.get("source_page_from") ? Number(values.get("source_page_from")) : null;
      const to = values.get("source_page_to") ? Number(values.get("source_page_to")) : null;
      if (to !== null && (from === null || to < from)) { setFailure(new LibraryError("حدد صفحة البداية، واجعل صفحة النهاية بعدها أو مساوية لها.")); return; }
      payload = { item_id: source?.id ?? null, title_ar: title.trim(), body_text: text, item_type: type, parent_item_id: parent || null, interpretation_text: values.get("interpretation_text") || null, source_locator: values.get("source_locator") || null, source_page_from: from, source_page_to: to };
    } else if (dialog.kind === "confirm") payload = dialog.reason ? { reason: values.get("reason") } : {};
    else payload = { name_ar: title.trim(), description: values.get("description") || null };
    lock.current = true; setBusy(true); setFailure(null);
    try { await onSave(payload); onClose(); }
    catch (error) { setFailure(error instanceof LibraryError ? error : new LibraryError("تعذر حفظ التعديل. لم يغلق النموذج؛ أعد المحاولة.")); }
    finally { lock.current = false; setBusy(false); }
  }
  return <dialog ref={ref} className={styles.dialog} aria-labelledby={titleId} dir="rtl" onCancel={(event) => { event.preventDefault(); if (!lock.current) onClose(); }} onKeyDown={(event) => {
    if (event.key === "Tab") {
      const focusable = [...(ref.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),summary") ?? [])].filter((node) => !node.closest("details:not([open])") || node.tagName === "SUMMARY");
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <form onSubmit={(event) => { event.preventDefault(); void submit(event.currentTarget); }}>
      <header className={styles.dialogHeader}><div><small>مكتبة اللوائح</small><h2 id={titleId}>{titleLabel}</h2></div><button type="button" aria-label="إغلاق" disabled={busy} onClick={onClose}><X size={22} /></button></header>
      <fieldset disabled={busy} className={styles.dialogBody}>
        {dialog.kind === "create" && <p className={styles.hint}>ابدأ بالاسم. ينشئ النظام المرجع ومسودة العمل تلقائيًا، ثم أضف المواد والبنود.</p>}
        {(dialog.kind === "create" || dialog.kind === "identity") && <>
          <label>اسم اللائحة<input required minLength={3} maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثل: لائحة الشؤون الأكاديمية" /></label>
          <details className={styles.advanced}><summary>وصف مختصر · اختياري</summary><div className={styles.field}><label htmlFor={`${titleId}-description`}>الوصف</label><textarea id={`${titleId}-description`} name="description" rows={3} defaultValue={dialog.kind === "identity" ? dialog.policy.description ?? "" : ""} maxLength={4000} /></div></details>
        </>}
        {dialog.kind === "item" && <>
          <div className={styles.typeSwitch} aria-label="نوع النص"><button type="button" aria-pressed={type === "article"} onClick={() => setType("article")}>مادة</button><button type="button" aria-pressed={type === "clause"} onClick={() => setType("clause")}>بند</button></div>
          <label>عنوان البند<input required minLength={2} maxLength={500} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="مثل: تشكيل مجلس القسم" /></label>
          <div className={styles.field}><label htmlFor={`${titleId}-text`}>النص النظامي</label><textarea id={`${titleId}-text`} required={!["chapter", "section"].includes(type)} value={text} onChange={(event) => setText(event.target.value)} rows={7} maxLength={60000} placeholder="أدخل النص الأصلي كما ورد في اللائحة…" /></div>
          <details className={styles.advanced}><summary>تنظيم النص وبيانات المصدر · اختياري</summary>
            <label>نوع النص<select value={type} onChange={(event) => setType(event.target.value)}><option value="article">مادة</option><option value="clause">بند</option><option value="chapter">باب تجميعي</option><option value="section">فصل تجميعي</option><option value="procedure">إجراء وارد في اللائحة</option></select></label>
            <label>يندرج تحت<select value={parent} onChange={(event) => setParent(event.target.value)}><option value="">مباشرة تحت اللائحة</option>{dialog.items.filter((item) => !blocked.has(item.id)).map((item) => <option key={item.id} value={item.id}>{item.title_ar}</option>)}</select></label>
            <label>موضع النص في المصدر<input name="source_locator" defaultValue={source?.source_locator ?? ""} maxLength={1000} placeholder="مثل: المادة الخامسة" /></label>
            <div className={styles.fieldRow}><label>صفحة البداية<input name="source_page_from" type="number" min={1} max={100000} defaultValue={source?.source_page_from ?? ""} /></label><label>صفحة النهاية<input name="source_page_to" type="number" min={1} max={100000} defaultValue={source?.source_page_to ?? ""} /></label></div>
            <div className={styles.field}><label htmlFor={`${titleId}-interpretation`}>تفسير النص</label><textarea id={`${titleId}-interpretation`} name="interpretation_text" defaultValue={source?.interpretation_text ?? ""} rows={3} maxLength={6000} /></div>
            <p className={styles.hint}>هذا تفسير للسند نفسه. إجراءات الموضوع ومتطلبات مرفقاته تُعدّ في فئة الموضوع، وليست هنا.</p>
          </details>
        </>}
        {dialog.kind === "confirm" && <><p className={styles.hint}>{dialog.description}</p>{dialog.reason && <div className={styles.field}><label htmlFor={`${titleId}-reason`}>سبب الإعادة</label><textarea id={`${titleId}-reason`} name="reason" required maxLength={4000} rows={3} /></div>}</>}
      </fieldset>
      {failure && <div role="alert" className={styles.error}>{failure.message}{failure.requestId && <small>مرجع المتابعة: <bdi>{failure.requestId}</bdi></small>}{["40001", "PT409"].includes(failure.code ?? "") && <button type="button" disabled={busy} onClick={async () => {
        if (lock.current) return;
        lock.current = true; setBusy(true);
        try { await onReload(); setFailure(new LibraryError("تم تحميل التعديل الأحدث. نصك ما زال هنا؛ راجعه قبل إعادة الحفظ.")); }
        catch { setFailure(new LibraryError("تعذر تحميل التعديل الأحدث. لم تتغير مدخلاتك؛ أعد المحاولة.", "40001")); }
        finally { lock.current = false; setBusy(false); }
      }}>تحميل التعديل الأحدث مع الاحتفاظ بمدخلاتي</button>}</div>}
      <footer className={styles.dialogFooter}><button type="submit" className={dialog.kind === "confirm" && dialog.destructive ? styles.danger : styles.primary} disabled={busy}>{busy ? <><LoaderCircle size={18} className={styles.spinner} />جارٍ الحفظ…</> : submitLabel}</button><button type="button" className={styles.secondary} disabled={busy} onClick={onClose}>إلغاء</button></footer>
    </form>
  </dialog>;
}
