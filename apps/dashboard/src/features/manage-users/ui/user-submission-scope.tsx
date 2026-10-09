"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Building2, Check, Search, ShieldCheck } from "lucide-react";
import { previewSubmissionScope, type SubmissionScope, type ScopeRule } from "../model/submission-scope";
import styles from "./user-submission-scope.module.css";
function readableFailure(reason: unknown, fallback: string) {
  return reason instanceof Error && /[\u0600-\u06ff]/u.test(reason.message) ? reason.message : fallback;
}
export function UserSubmissionScope({ userId, onSaved }: { userId: string; onSaved?: () => void }) {
  const [data, setData] = useState<SubmissionScope | null>(null); const [home, setHome] = useState("");
  const [rules, setRules] = useState<ScopeRule[]>([]); const [kind, setKind] = useState<ScopeRule["kind"]>("council");
  const [query, setQuery] = useState(""); const [loading, setLoading] = useState(true); const [pending, setPending] = useState(false);
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const busy = useRef(false); const receipt = useRef<{ input: string; id: string } | null>(null);
  const roleReceipt = useRef<{ input: string; id: string } | null>(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [confirmReload, setConfirmReload] = useState(false);
  function reload() { setConfirmReload(false); setLoading(true); setError(""); setAttempt(value => value + 1); }
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users/${userId}/submission-scope`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "تعذر تحميل النطاق.");
      if (controller.signal.aborted) return;
      if (!Array.isArray(payload.rules) || !Array.isArray(payload.councils) || !Array.isArray(payload.units) || !Array.isArray(payload.classes)) throw new Error("تعذر التحقق من خيارات النطاق.");
      setData(payload); setHome(payload.home_unit_id ?? ""); setRules(payload.rules); setNeedsReload(false);
    }).catch(reason => { if (!controller.signal.aborted) setError(readableFailure(reason, "تعذر تحميل النطاق؛ تحقق من الاتصال وأعد المحاولة.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, attempt]);
  function update(next: ScopeRule[]) { setRules(next); setError(""); setMessage(""); }
  async function save() {
    if (!data || busy.current || needsReload) return;
    busy.current = true; setPending(true); setError(""); setMessage("");
    const input = JSON.stringify({ revision: data.revision, homeUnitId: home || null, rules });
    if (receipt.current?.input !== input) receipt.current = { input, id: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/admin/users/${userId}/submission-scope`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(input), requestId: receipt.current.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(`${payload.message ?? "تعذر حفظ النطاق."}${payload.traceId ? ` رقم التتبع: ${payload.traceId}` : ""}`);
      if (payload.saved !== true || !Number.isInteger(payload.revision)) throw new Error("تعذر تأكيد الحفظ؛ أعد تحميل النطاق للتحقق.");
      setData({ ...data, revision: payload.revision, home_unit_id: home || null, rules, submission_enabled: data.revision === 0 ? true : data.submission_enabled }); receipt.current = null; setMessage("حُفظت جهة العمل ونطاق التقديم بنجاح.");
      onSaved?.();
    } catch (reason) { setError(readableFailure(reason, "تعذر حفظ النطاق؛ اختياراتك محفوظة هنا، أعد المحاولة.")); }
    finally { busy.current = false; setPending(false); }
  }
  const enabled = data?.submission_enabled ?? (!!data && data.revision > 0);
  const dirty = !!data && (home !== (data.home_unit_id ?? "") || JSON.stringify(rules) !== JSON.stringify(data.rules));
  async function changeRole() {
    if (!data || busy.current || dirty || needsReload) return;
    busy.current = true; setPending(true); setError(""); setMessage("");
    const input = JSON.stringify({ revision: data.revision, enabled: !enabled });
    if (roleReceipt.current?.input !== input) roleReceipt.current = { input, id: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/admin/users/${userId}/submission-scope`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(input), requestId: roleReceipt.current.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`${result.message ?? "تعذر تغيير دور المقدم."}${result.traceId ? ` رقم التتبع: ${result.traceId}` : ""}`);
      if (result.saved !== true || !Number.isInteger(result.revision) || typeof result.submission_enabled !== "boolean") throw new Error("تعذر تأكيد حالة الدور؛ أعد تحميل النطاق للتحقق.");
      setData({ ...data, revision: result.revision, submission_enabled: result.submission_enabled });
      roleReceipt.current = null; setMessage(result.submission_enabled ? "فُعّل دور المقدم ضمن نطاقه المحفوظ." : "عُطّل دور المقدم مع حفظ اختيارات نطاقه.");
    } catch (reason) {
      setNeedsReload(true); setError(readableFailure(reason, "تعذر تأكيد تغيير الدور؛ أعد تحميل النطاق قبل المتابعة."));
    } finally { busy.current = false; setPending(false); }
  }
  const preview = data ? previewSubmissionScope(rules, data.councils, data.units) : [];
  const choices = (kind === "council" ? data?.councils.filter(choice => choice.status !== "archived") : data?.classes)?.filter(choice => choice.name_ar.includes(query.trim())) ?? [];
  return <main className={styles.page}>
    <header className={styles.header}><div><p>إدارة المستخدمين{data?.user_name_ar ? ` / ${data.user_name_ar}` : ""}</p><h1>جهة العمل ونطاق التقديم</h1><span>حدّد أين يستطيع المستخدم تقديم موضوع، دون منحه عضوية أو تصويتًا.</span></div><Link href="/admin/users"><ArrowRight size={16}/>المستخدمون</Link></header>
    {loading ? <p role="status">جارٍ تحميل جهة العمل والمجالس…</p> : !data ? <section className={styles.panel}><p role="alert">{error}</p><button type="button" onClick={() => { setError(""); setLoading(true); setAttempt(value => value+1); }}>إعادة المحاولة</button></section> : <div className={styles.layout}>
      <div><section className={styles.panel}><h2><Building2 size={20}/>جهة العمل</h2><p>الجهة التي يتبعها الموظف؛ لا تمنح صلاحيات بمجرد اختيارها.</p><label>الوحدة أو الإدارة<select aria-label="الوحدة أو الإدارة" value={home} disabled={pending} onChange={event => { setHome(event.target.value); setMessage(""); }}><option value="">لم تُحدد</option>{data.units.map(unit => <option key={unit.id} value={unit.id} disabled={unit.status !== "active"}>{unit.name_ar}{unit.status !== "active" ? " — غير متاحة للاختيار الجديد" : ""}</option>)}</select></label></section>
      <section className={styles.panel}><h2><ShieldCheck size={20}/>نطاق تقديم الموضوعات</h2><p>اجمع مجالس محددة ومستويات مجالس. فعّل التفرعات لكل اختيار عند الحاجة.</p>
        <section aria-label="دور مقدم الموضوع"><h3>مقدم موضوع / معاملة</h3>
          <p>{data.revision === 0 ? "احفظ نطاق التقديم لتعيين دور المقدم." : enabled ? "الدور مفعّل ضمن النطاق المحفوظ." : "الدور معطّل؛ اختيارات النطاق محفوظة ولا تمنح تقديمًا من هذا الدور."}</p>
          <button type="button" disabled={pending || needsReload || dirty || data.revision === 0 || (!enabled && !data.rules.length)} onClick={() => void changeRole()}>{pending ? "جارٍ الحفظ…" : enabled ? "تعطيل دور المقدم" : "تفعيل دور المقدم"}</button>
          {dirty && <p>احفظ تعديلات النطاق أو أعد تحميله قبل تغيير حالة الدور.</p>}
          {data.revision > 0 && !enabled && !data.rules.length && <p>حدّد نطاقًا محفوظًا قبل تفعيل دور المقدم.</p>}
        </section>
        <div className={styles.tabs}><button type="button" aria-pressed={kind === "council"} onClick={() => { setKind("council"); setQuery(""); }}>مجالس محددة</button><button type="button" aria-pressed={kind === "class"} onClick={() => { setKind("class"); setQuery(""); }}>مستويات المجالس</button></div>
        <label className={styles.search}><Search size={17}/><input aria-label="بحث في خيارات النطاق" placeholder="ابحث بالاسم…" value={query} onChange={event => setQuery(event.target.value)}/></label>
        <div className={styles.choices}>{choices.map(choice => {
          const selected = rules.find(rule => rule.kind === kind && rule.target_id === choice.id);
          return <div key={choice.id} className={selected ? styles.selected : ""}><label><input type="checkbox" disabled={pending} checked={!!selected} onChange={event => update(event.target.checked ? [...rules, { kind, target_id: choice.id, include_descendants: false }] : rules.filter(rule => !(rule.kind === kind && rule.target_id === choice.id)))}/><strong>{choice.name_ar}</strong></label>
            {selected && <label className={styles.children}><input type="checkbox" disabled={pending} checked={selected.include_descendants} onChange={event => update(rules.map(rule => rule === selected ? { ...rule, include_descendants: event.target.checked } : rule))}/>شمول المجالس التابعة عبر الهيكل التنظيمي</label>}
            {selected && kind === "council" && !data.councils.find(council => council.id === choice.id)?.scope_unit_id && <small>هذا المجلس غير مرتبط بوحدة تنظيمية؛ لا توجد تفرعات مشتقة له.</small>}
          </div>;
        })}{!choices.length && <p>لا توجد خيارات مطابقة.</p>}</div>
        <p className={styles.note}>هذه المنح إضافية. إزالة اختيار لا تسحب صلاحية سبق منحها من دور أو عضوية.</p>
        {error && <p role="alert" className={styles.error}>{error}<button type="button" disabled={pending} onClick={() => dirty ? setConfirmReload(true) : reload()}>إعادة تحميل النطاق</button></p>}
        {confirmReload && <div role="group" aria-label="تأكيد إعادة تحميل النطاق"><p>إعادة التحميل تستبدل اختياراتك غير المحفوظة.</p><button type="button" disabled={pending} onClick={reload}>استبدال الاختيارات وإعادة التحميل</button><button type="button" onClick={() => setConfirmReload(false)}>إبقاء الاختيارات</button></div>}
        {message && <p role="status" className={styles.success}><Check size={17}/>{message}</p>}
        <footer><span>{rules.length} اختيارات</span><button className={styles.primary} type="button" disabled={pending || needsReload || rules.length > 100 || rules.some(rule => rule.kind === "council" && data.councils.find(c => c.id === rule.target_id)?.status === "archived") || (!!home && data.units.find(unit => unit.id === home)?.status !== "active")} onClick={() => void save()}>{pending ? "جارٍ الحفظ…" : "حفظ جهة العمل والنطاق"}</button></footer>
        {rules.length > 100 && <p className={styles.error}>الحد الأقصى 100 اختيار؛ أزل الاختيارات الزائدة قبل الحفظ.</p>}
        {rules.filter(rule => rule.kind === "council" && data.councils.find(c => c.id === rule.target_id)?.status === "archived").map(rule => <p key={rule.target_id} className={styles.error}>المجلس «{data.councils.find(c => c.id === rule.target_id)?.name_ar}» مؤرشف؛ <button type="button" disabled={pending} onClick={() => update(rules.filter(r => r !== rule))}>إزالة اختياره قبل الحفظ</button></p>)}
        {!!home && data.units.find(unit => unit.id === home)?.status !== "active" && <p className={styles.error}>جهة العمل السابقة غير نشطة؛ اختر جهة نشطة أو أزل الربط قبل الحفظ.</p>}
      </section></div>
      <aside aria-label="معاينة نطاق التقديم" className={styles.panel}><h2>معاينة النطاق</h2><p>المجالس المطابقة لاختياراتك. التصنيف وجاهزية المسار يحددان إمكانية التقديم الفعلية.</p><strong className={styles.count}>{preview.length}<small>مجلس مطابق</small></strong>
        <ul>{rules.map(rule => <li key={`${rule.kind}:${rule.target_id}`}><strong>{(rule.kind === "council" ? data.councils : data.classes).find(choice => choice.id === rule.target_id)?.name_ar ?? "اختيار سابق غير متاح"}</strong><small>{rule.include_descendants ? "مع التفرعات" : "دون التفرعات"}</small></li>)}</ul>
        <details open><summary>المجالس المشمولة</summary><ul>{preview.map(council => <li key={council.id}>{council.name_ar}<small>{council.status === "active" ? "نشط" : "غير نشط؛ لا يُتاح التقديم إليه الآن"}</small></li>)}</ul>{!preview.length && <p>اختر مجلسًا أو مستوى لمعاينة النطاق.</p>}</details>
      </aside>
    </div>}
  </main>;
}
