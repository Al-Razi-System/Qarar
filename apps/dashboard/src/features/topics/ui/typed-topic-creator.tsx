"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import styles from "@/features/governance-v2/ui/topic-types-list.module.css";
import { TopicInstructions } from "@/features/governance-v2/ui/topic-instructions";
type Choice = { topic_type_version_id: string; topic_type_name_ar: string };
type Preview = { steps: { name_ar: string }[]; authoring?: { required_attachment_count?: number; submission_instructions?: string } };
async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal }); const value = await response.json();
  if (!response.ok) throw new Error(value?.error?.message ?? "تعذر تحميل البيانات."); return value.data;
}
export function TypedTopicCreator() {
  const [units, setUnits] = useState<{ id: string; name_ar: string }[]>([]);
  const [unit, setUnit] = useState(""); const [types, setTypes] = useState<Choice[]>([]); const [version, setVersion] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null); const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const [created, setCreated] = useState<{ topic_id: string; topic_no: string } | null>(null);
  const busy = useRef(false); const receipt = useRef<{ input: string; id: string } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams(unit ? { unitId: unit, ...(version ? { versionId: version } : {}) } : {});
    read<Preview | Choice[] | { governance_units: { id: string; name_ar: string }[] }>(`/api/admin/typed-topics?${query}`, controller.signal)
      .then(value => { if (controller.signal.aborted) return; if (version) setPreview(value as Preview); else if (unit) setTypes(value as Choice[]); else setUnits((value as { governance_units: { id: string; name_ar: string }[] }).governance_units ?? []); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "تعذر تحميل الخيارات."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [unit, version, attempt]);
  async function submit() {
    if (busy.current || !preview || loading || title.trim().length < 5 || description.trim().length < 10) return;
    busy.current = true; setPending(true); setError("");
    const input = JSON.stringify({ title, description, unitId: unit, versionId: version });
    if (receipt.current?.input !== input) receipt.current = { input, id: crypto.randomUUID() };
    try {
      const response = await fetch("/api/admin/typed-topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...JSON.parse(input), requestId: receipt.current.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(`${payload?.error?.message ?? "تعذر تقديم الموضوع."}${payload?.error?.traceId ? ` رقم التتبع: ${payload.error.traceId}` : ""}`);
      if (!payload?.data?.topic_id) throw new Error("تعذر التحقق من نتيجة التقديم؛ راجع قائمة موضوعاتك."); setCreated(payload.data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "تعذر تقديم الموضوع."); }
    finally { busy.current = false; setPending(false); }
  }
  return <section className={styles.creator}>
    {created ? <div role="status"><h2>تم تقديم الموضوع</h2><p>{created.topic_no}</p><Link href={`/admin/topics/${created.topic_id}`}>عرض الموضوع ورفع المرفقات</Link></div> : <form onSubmit={event => { event.preventDefault(); void submit(); }}>
      <div className={styles.creatorGrid}>
        <label>المجلس<select aria-label="المجلس" value={unit} disabled={pending} onChange={event => { setLoading(true); setError(""); setUnit(event.target.value); setVersion(""); setTypes([]); setPreview(null); }}><option value="">اختر المجلس</option>{units.map(value => <option key={value.id} value={value.id}>{value.name_ar}</option>)}</select></label>
        <label>تصنيف الموضوع<select aria-label="تصنيف الموضوع" value={version} disabled={!unit || loading || pending} onChange={event => { setLoading(true); setError(""); setVersion(event.target.value); setPreview(null); setTitle(types.find(value => value.topic_type_version_id === event.target.value)?.topic_type_name_ar ?? ""); }}><option value="">اختر التصنيف</option>{types.map(value => <option key={value.topic_type_version_id} value={value.topic_type_version_id}>{value.topic_type_name_ar}</option>)}</select></label>
      </div>
      {loading && <p role="status">جارٍ التحقق من الخيارات والمسار…</p>}
      {unit && !version && !loading && !error && !types.length && <p>لا توجد تصنيفات منشورة ومتاحة لهذا المجلس.</p>}
      {preview && <aside><h3>مسار الموضوع</h3><ol>{preview.steps.map((step, index) => <li key={index}>{step.name_ar}</li>)}</ol><p>{preview.authoring?.required_attachment_count ? `المرفقات المطلوبة: ${preview.authoring.required_attachment_count} على الأقل، تُرفع من تفاصيل الموضوع قبل المراجعة.` : "لا يتطلب التصنيف مرفقات إلزامية."}</p></aside>}
      {preview && <TopicInstructions title="تعليمات التقديم" text={preview.authoring?.submission_instructions}/>}
      <label>عنوان الموضوع<input value={title} disabled={pending} minLength={5} maxLength={300} onChange={event => setTitle(event.target.value)} placeholder="اكتب عنوانًا واضحًا للموضوع"/></label>
      <label>تفاصيل الموضوع<textarea value={description} disabled={pending} minLength={10} maxLength={10000} rows={5} onChange={event => setDescription(event.target.value)} placeholder="وضّح الطلب والمعلومات التي يحتاجها المجلس"/></label>
      {error && <div role="alert">{error}<button type="button" disabled={pending} onClick={() => { setLoading(true); setError(""); setPreview(null); setAttempt(value => value + 1); }}>تحديث الخيارات</button></div>}
      <footer><button type="submit" disabled={pending || loading || !preview || title.trim().length < 5 || description.trim().length < 10}>{pending ? "جارٍ تقديم الموضوع…" : "تقديم الموضوع"}</button><Link href="/admin/topics">العودة للموضوعات</Link></footer>
      {!preview && !error && <p>اختر المجلس والتصنيف للتحقق من جاهزية المسار أولًا.</p>}
      {preview && (title.trim().length < 5 || description.trim().length < 10) && <p>للتقديم: أدخل عنوانًا من 5 أحرف على الأقل وتفاصيل من 10 أحرف على الأقل.</p>}
    </form>}
  </section>;
}
