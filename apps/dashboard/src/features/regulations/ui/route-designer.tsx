"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { GovernancePageHeader } from "@/shared/ui/governance-page-header";
import { ArrowDown, ArrowLeft, ArrowUp, Check, GitBranch, Plus, RotateCcw, Save, Search, ShieldCheck, Trash2, Waypoints } from "lucide-react";
import { libraryRpc, LibraryError } from "../api/regulation-library-client";
import { blankRoute, removeRouteStage, routeErrors, suggestRouteName, verifyRouteInventory, type RouteInventory, type RouteRecord, type RouteSpec, type RouteStage } from "../model/route-designer";
import styles from "./route-designer.module.css";
const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function RouteDesigner({ initialData }: { initialData: RouteInventory }) {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const [data, setData] = useState(initialData);
  const [selected, setSelected] = useState<RouteRecord | null>(null);
  const [spec, setSpec] = useState<RouteSpec | null>(null);
  const [automaticName, setAutomaticName] = useState(true);
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failure, setFailure] = useState(false);
  const [conflict, setConflict] = useState(false);
  const lock = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const legacy = Boolean(selected && !selected.payload);
  const errors = spec ? routeErrors(spec, data) : [];
  const activationReason = !selected ? "احفظ المسودة أولًا." : dirty ? "احفظ تعديلاتك قبل التنشيط." : selected.version_status !== "draft" ? "المسار الحالي متاح بالفعل." : selected.validation_errors.length ? "أكمل ملاحظات التحقق الموضحة أدناه." : "";

  function choose(record: RouteRecord | null) {
    if (busy || (dirty && !window.confirm("لديك تعديلات غير محفوظة. هل تريد تركها؟"))) return;
    setSelected(record);
    setSpec(record?.payload ? structuredClone(record.payload) : record ? null : blankRoute());
    setAutomaticName(!record);
    setDirty(false); setMessage(""); setFailure(false); setConflict(false); retry.current = null;
  }
  function edit(next: RouteSpec, auto = automaticName) {
    setSpec(auto ? { ...next, name_ar: suggestRouteName(next.steps, data) } : next);
    setDirty(true); setMessage(""); setConflict(false);
  }
  function updateStage(key: string, change: Partial<RouteStage>) {
    if (spec) edit({ ...spec, steps: spec.steps.map(node => node.key === key ? { ...node, ...change } : node) });
  }
  function label(node: RouteStage) {
    return (node.target_kind === "council" ? data.councils : data.classes).find(target => target.id === node.target_id)?.name_ar ?? "اختر جهة المرحلة";
  }
  function addStage() {
    if (!spec) return;
    const key = `s${Math.max(0, ...spec.steps.map(node => Number(node.key.slice(1)))) + 1}`;
    edit({ ...spec, steps: [...spec.steps, { key, target_kind: "class", target_id: "" }] });
  }
  function move(index: number, delta: number) {
    if (!spec) return;
    const steps = [...spec.steps]; [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]];
    edit({ ...spec, steps });
  }
  async function command(action: "save" | "activate") {
    if (lock.current || !spec) return;
    if (errors.length) { setMessage(errors.join(" ")); setFailure(true); return; }
    lock.current = true; setBusy(true); setMessage(""); setConflict(false);
    const params = { p_template_id: selected?.id ?? null, p_action: action, p_payload: action === "save" ? spec : {}, p_expected_revision: selected?.revision ?? null };
    const fingerprint = JSON.stringify(params);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = verifyRouteInventory(await libraryRpc<RouteInventory>("admin_save_route_layout_v2", { ...params, p_client_request_id: retry.current.key }));
      const record = result.items.find(item => item.id === result.saved_id);
      if (!record?.payload) throw new Error("تعذر التحقق من المسار المحفوظ. أعد تحميل القائمة قبل إعادة الحفظ.");
      setData(result); setSelected(record); setSpec(structuredClone(record.payload)); setDirty(false);
      setFailure(false); setMessage(action === "save" ? "تم حفظ المسودة. لم تتغير المسارات المستخدمة في الموضوعات الحالية." : "تم تنشيط المسار؛ أصبح متاحًا لربطه بتصنيفات الموضوعات.");
      retry.current = null;
    } catch (error) {
      setFailure(true); setConflict(error instanceof LibraryError && ["PT409", "40001"].includes(error.code ?? ""));
      setMessage(error instanceof Error ? error.message : "تعذر حفظ المسار. احتفظ ببياناتك وأعد المحاولة.");
    } finally { lock.current = false; setBusy(false); }
  }
  async function reload() {
    if (lock.current || (dirty && !window.confirm("ستُستبدل تعديلاتك بآخر نسخة محفوظة. هل تريد المتابعة؟"))) return;
    lock.current = true; setBusy(true);
    try {
      const result = verifyRouteInventory(await libraryRpc<RouteInventory>("admin_get_route_layouts_v2", {}));
      setData(result);
      if (selected) {
        const record = result.items.find(item => item.id === selected.id) ?? null;
        setSelected(record); setSpec(record?.payload ? structuredClone(record.payload) : null);
        setAutomaticName(false);
      }
      setDirty(false); setMessage("تم تحديث البيانات."); setFailure(false); setConflict(false); retry.current = null;
    } catch (error) { setFailure(true); setMessage(error instanceof Error ? error.message : "تعذر تحديث القائمة."); }
    finally { lock.current = false; setBusy(false); }
  }

  return <main className={styles.workspace} dir="rtl">
    <GovernancePageHeader current="routes" title="مسارات الموضوعات" description="حدّد المجالس وترتيبها مرة واحدة، ثم استخدم المسار في أكثر من تصنيف للموضوعات."
      actions={<button type="button" disabled={busy || !ready} onClick={() => choose(null)}><Plus size={18} />إنشاء مسار</button>} />
    <div className={styles.layout}>
      <aside className={styles.navigator} aria-label="قائمة المسارات">
        <div className={styles.navHeading}><h2>المسارات</h2><span>{data.items.length}</span><button type="button" disabled={busy || !ready} onClick={() => void reload()} aria-label="تحديث المسارات"><RotateCcw size={16} /></button></div>
        <label className={styles.search}><Search size={17} /><input aria-label="البحث في المسارات" placeholder="ابحث عن مسار…" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <div className={styles.routeList}>{data.items.filter(item => item.name_ar.includes(query)).map(item => <button type="button" key={item.id} disabled={busy || !ready} className={`${styles.routeLink} ${selected?.id === item.id ? styles.selected : ""}`} onClick={() => choose(item)}>
          <span className={styles.routeSymbol}><Waypoints size={19} /></span><span><strong>{item.name_ar}</strong><small>{item.payload?.steps.length ?? item.versions?.[0]?.steps.length ?? 0} مراحل · {item.version_status === "active" ? "نشط" : "مسودة"}</small></span><ArrowLeft size={15} />
        </button>)}{data.items.length === 0 && <p className={styles.hint}>لا توجد مسارات بعد. ابدأ بإنشاء أول مسار.</p>}</div>
        <div className={styles.navNote}><ShieldCheck size={19} /><p>المسار يخص الموضوع.<br />البنود أسانيد نظامية قابلة لإعادة الاستخدام.</p></div>
        <Link href="/admin/governance-model" className={styles.textLink}>تصنيفات الموضوعات <ArrowLeft size={16} /></Link>
      </aside>
      <section className={styles.editor} aria-label="محرر المسار">
        {!spec && !legacy && <div className={styles.empty}><div className={styles.emptyArt}><span>١</span><i /><span>٢</span><i /><Check size={22} /></div><h2>كل موضوع له رحلة واضحة</h2><p>اختر مسارًا لتعديله، أو أنشئ مسارًا وحدّد المجالس التي يمر بها الموضوع. لا تحتاج إلى إدخال رموز أو إعداد إصدارات.</p><button type="button" className={styles.primary} disabled={busy || !ready} onClick={() => choose(null)}><Plus size={17} />ابدأ مسارًا جديدًا</button></div>}
        {legacy && <div className={styles.legacy}><GitBranch size={26} /><h2>{selected?.name_ar}</h2><p>هذا مسار سابق قد يحتوي شروطًا متقدمة. نعرضه دون تغيير بياناته؛ أنشئ مسارًا جديدًا إذا أردت استخدام المحرر المبسّط.</p><ol>{selected?.versions?.[0]?.steps.map(node => <li key={node.id}>{node.name_ar}</li>)}</ol></div>}
        {spec && <>
          <div className={styles.editorHeader}><div><span className={styles.eyebrow}>{selected?.reference_number ?? "مسار جديد · مرجع تلقائي عند الحفظ"}</span><h2>{selected ? selected.name_ar : "صمّم مسار الموضوع"}</h2></div><span className={styles.status}>{dirty ? "تعديلات غير محفوظة" : selected?.version_status === "active" ? "نشط" : "مسودة"}</span></div>
          <fieldset disabled={busy} className={styles.form}>
            <label className={styles.nameLabel}>اسم المسار<input aria-describedby="route-name-hint" maxLength={300} placeholder="مثل: مسار مجلس القسم ← مجلس الكلية ← مجلس الجامعة" value={spec.name_ar} onChange={event => { setAutomaticName(false); edit({ ...spec, name_ar: event.target.value }, false); }} /></label>
            <div className={styles.nameHelp}><p id="route-name-hint">{automaticName ? "يُقترح الاسم من المجالس بالترتيب ويتحدّث معها. يمكنك الكتابة لتخصيصه." : "اسم مخصص؛ لن نغيّره عند تعديل المراحل."}</p>{!automaticName && <button type="button" onClick={() => { setAutomaticName(true); edit(spec, true); }}><RotateCcw size={14} />استخدام الاسم التلقائي</button>}</div>
            <details className={styles.description}><summary>وصف المسار <span>اختياري</span></summary><textarea aria-label="وصف المسار" maxLength={3000} placeholder="متى يُستخدم هذا المسار؟" value={spec.description} onChange={event => edit({ ...spec, description: event.target.value })} /></details>
            <div className={styles.sectionHeading}><div><h3>مراحل المسار</h3><p>الترتيب من أول مجلس يستقبل الموضوع إلى جهة القرار النهائي.</p></div><span>{spec.steps.length} مراحل</span></div>
            <ol className={styles.stages}>
              {spec.steps.map((node, index) => <li className={styles.stage} key={node.key}>
                <div className={styles.stageMarker}>{index + 1}</div>
                <article className={styles.stageCard}>
                  <header className={styles.stageHeader}><strong>{label(node)}</strong><div className={styles.stageActions}><button type="button" aria-label={`رفع المرحلة ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp size={16} /></button><button type="button" aria-label={`خفض المرحلة ${index + 1}`} disabled={index === spec.steps.length - 1} onClick={() => move(index, 1)}><ArrowDown size={16} /></button><button type="button" aria-label={`حذف المرحلة ${index + 1}`} disabled={spec.steps.length === 1} onClick={() => edit(removeRouteStage(spec, node.key))}><Trash2 size={16} /></button></div></header>
                  <div className={styles.targetRow}><label>تحديد الجهة<select aria-label={`تحديد الجهة للمرحلة ${index + 1}`} value={node.target_kind} onChange={event => updateStage(node.key, { target_kind: event.target.value as RouteStage["target_kind"], target_id: "" })}><option value="class">حسب نوع المجلس</option><option value="council">مجلس محدد</option></select></label><label>الجهة<select aria-label={`جهة المرحلة ${index + 1}`} value={node.target_id} onChange={event => updateStage(node.key, { target_id: event.target.value })}><option value="">اختر الجهة</option>{(node.target_kind === "council" ? data.councils : data.classes).map(target => <option key={target.id} value={target.id}>{target.name_ar}{target.status && target.status !== "active" ? " — غير نشط" : ""}</option>)}</select></label></div>
                  <p className={styles.hint}>{node.target_kind === "class" ? "يُحدد المجلس الفعلي وفق الوحدة التنظيمية للموضوع؛ مثل مجلس كلية مقدم الموضوع." : "يمر الموضوع بهذا المجلس بعينه، مثل مجلس الجامعة أو مجلس الأمناء."}</p>
                </article>
              </li>)}
            </ol>
            <button type="button" className={styles.addStage} disabled={spec.steps.length >= 30} onClick={addStage}><Plus size={18} />إضافة مرحلة</button>
          </fieldset>
          {selected && !dirty && selected.validation_errors.length > 0 && <div className={styles.warning}><strong>المسودة محفوظة، وتحتاج إلى استكمال:</strong><ul>{selected.validation_errors.map((error, i) => <li key={i}>{error}</li>)}</ul></div>}
          <footer className={styles.footer}>
            <div className={styles.footerActions}><button type="button" className={styles.primary} disabled={busy || conflict} onClick={() => void command("save")}><Save size={17} />{busy ? "جارٍ تنفيذ العملية…" : "حفظ المسودة"}</button><button type="button" className={styles.secondary} disabled={busy || Boolean(activationReason) || Boolean(errors.length) || conflict} onClick={() => void command("activate")}><Check size={17} />تنشيط المسار</button></div>
            {activationReason && <p className={styles.hint}>{activationReason}</p>}
            <p className={styles.hint}>هذا ترتيب مشترك للمجالس، وليس سياسة قرار. حدّد نتائج القبول والرفض في تصنيف الموضوع. الإحالة إجراء مستقل داخل الاجتماع.</p>
          </footer>
        </>}
        {message && <div role={failure ? "alert" : "status"} className={failure ? styles.error : styles.success}>{message}{conflict && <button type="button" disabled={busy} onClick={() => void reload()}>تحميل النسخة الأحدث</button>}</div>}
      </section>
    </div>
  </main>;
}
