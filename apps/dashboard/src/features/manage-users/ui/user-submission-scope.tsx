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
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/users/${userId}/submission-scope`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      const payload = await response.json(); if (!response.ok) throw new Error(payload.message ?? "تعذر تحميل النطاق.");
      if (controller.signal.aborted) return;
      if (!Array.isArray(payload.rules) || !Array.isArray(payload.councils) || !Array.isArray(payload.units) || !Array.isArray(payload.classes)) throw new Error("تعذر التحقق من خيارات النطاق.");
      setData(payload); setHome(payload.home_unit_id ?? ""); setRules(payload.rules);
    }).catch(reason => { if (!controller.signal.aborted) setError(readableFailure(reason, "تعذر تحميل النطاق؛ تحقق من الاتصال وأعد المحاولة.")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [userId, attempt]);
  function update(next: ScopeRule[]) { setRules(next); setError(""); setMessage(""); }
  async function save() {
    if (!data || busy.current) return;
    busy.current = true; setPending(true); setError(""); setMessage("");
    const input = JSON.stringify({ revision: data.revision, homeUnitId: home || null, rules });
    if (receipt.current?.input !== input) receipt.current = { input, id: crypto.randomUUID() };
    try {
      const response = await fetch(`/api/admin/users/${userId}/submission-scope`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(input), requestId: receipt.current.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(`${payload.message ?? "تعذر حفظ النطاق."}${payload.traceId ? ` رقم التتبع: ${payload.traceId}` : ""}`);
      if (payload.saved !== true || !Number.isInteger(payload.revision)) throw new Error("تعذر تأكيد الحفظ؛ أعد تحميل النطاق للتحقق.");
      setData({ ...data, revision: payload.revision }); receipt.current = null; setMessage("حُفظت جهة العمل ونطاق التقديم بنجاح.");
      onSaved?.();
    } catch (reason) { setError(readableFailure(reason, "تعذر حفظ النطاق؛ اختياراتك محفوظة هنا، أعد المحاولة.")); }
    finally { busy.current = false; setPending(false); }
  }
  const preview = data ? previewSubmissionScope(rules, data.councils, data.units) : [];
  const choices = (kind === "council" ? data?.councils.filter(choice => choice.status !== "archived") : data?.classes)?.filter(choice => choice.name_ar.includes(query.trim())) ?? [];
  return <main className={styles.page}>
    <header className={styles.header}><div><p>إدارة المستخدمين{data?.user_name_ar ? ` / ${data.user_name_ar}` : ""}</p><h1>جهة العمل ونطاق التقديم</h1><span>حدّد أين يستطيع المستخدم تقديم موضوع، دون منحه عضوية أو تصويتًا.</span></div><Link href="/admin/users"><ArrowRight size={16}/>المستخدمون</Link></header>
    {loading ? <p role="status">جارٍ تحميل جهة العمل والمجالس…</p> : !data ? <section className={styles.panel}><p role="alert">{error}</p><button type="button" onClick={() => { setError(""); setLoading(true); setAttempt(value => value+1); }}>إعادة المحاولة</button></section> : <div className={styles.layout}>
      <div><section className={styles.panel}><h2><Building2 size={20}/>جهة العمل</h2><p>الجهة التي يتبعها الموظف؛ لا تمنح صلاحيات بمجرد اختيارها.</p><label>الوحدة أو الإدارة<select aria-label="الوحدة أو الإدارة" value={home} disabled={pending} onChange={event => { setHome(event.target.value); setMessage(""); }}><option value="">لم تُحدد</option>{data.units.map(unit => <option key={unit.id} value={unit.id} disabled={unit.status !== "active"}>{unit.name_ar}{unit.status !== "active" ? " — غير متاحة للاختيار الجديد" : ""}</option>)}</select></label></section>
      <section className={styles.panel}><h2><ShieldCheck size={20}/>نطاق تقديم الموضوعات</h2><p>اجمع مجالس محددة ومستويات مجالس. فعّل التفرعات لكل اختيار عند الحاجة.</p>
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
        {error && <p role="alert" className={styles.error}>{error}<button type="button" disabled={pending} onClick={() => { if (window.confirm("إعادة التحميل تستبدل اختياراتك غير المحفوظة. هل تريد المتابعة؟")) { setLoading(true); setAttempt(value => value+1); setError(""); } }}>إعادة تحميل النطاق</button></p>}
        {message && <p role="status" className={styles.success}><Check size={17}/>{message}</p>}
        <footer><span>{rules.length} اختيارات</span><button className={styles.primary} type="button" disabled={pending || rules.length > 100 || rules.some(rule => rule.kind === "council" && data.councils.find(c => c.id === rule.target_id)?.status === "archived") || (!!home && data.units.find(unit => unit.id === home)?.status !== "active")} onClick={() => void save()}>{pending ? "جارٍ الحفظ…" : "حفظ جهة العمل والنطاق"}</button></footer>
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
