"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { InstructionContent } from "@/shared/content/instruction-content";
const field = "mt-2 min-h-12 w-full rounded-q-control border border-q-border bg-q-surface px-4 py-3 text-q-ui text-q-text outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary disabled:bg-q-surface-2";
type Choice = { topic_type_version_id: string; topic_type_name_ar: string };
type Preview = { steps: { name_ar: string }[]; can_resume?: boolean; prior_steps?: {template_step_id:string;name_ar:string}[]; authoring?: { required_attachment_count?: number; submission_instructions?: string } };
type PickedFile={id:string;file:File;evidenceIndex?:number};
type Evidence={template_step_id:string;meeting_date:string;meeting_reference:string;decision_type:string;decision_text:string;bypass_reason:string};
class SubmissionFailure extends Error { constructor(message:string,readonly confirmed:boolean){super(message);} }
async function read<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: "no-store", signal }); const value = await response.json();
  if (!response.ok || value?.data == null) throw new Error(value?.error?.message ?? "تعذر تحميل البيانات."); return value.data;
}
export function TypedTopicCreator() {
  const [units, setUnits] = useState<{ id: string; name_ar: string }[]>([]);
  const [unit, setUnit] = useState(""); const [types, setTypes] = useState<Choice[]>([]); const [version, setVersion] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null); const [title, setTitle] = useState(""); const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true); const [pending, setPending] = useState(false); const [error, setError] = useState(""); const [attempt, setAttempt] = useState(0);
  const [created, setCreated] = useState<{ topic_id: string; topic_no: string } | null>(null);
  const busy = useRef(false); const receipt = useRef<{ input: string; id: string } | null>(null);
  const [uncertain,setUncertain]=useState(false);
  const [files,setFiles]=useState<PickedFile[]>([]);const [resume,setResume]=useState(false);const [evidence,setEvidence]=useState<Evidence[]>([]);const [progress,setProgress]=useState("");
  const fileControls=useRef<Record<string,HTMLInputElement|null>>({});
  function pickFiles(list:FileList|null,index?:number){
    if(!list)return;const picked=Array.from(list);
    if(files.length+picked.length>30||picked.some(file=>file.size<1||file.size>25*1024*1024||!(/\.(pdf|png|jpe?g|docx)$/i.test(file.name)))){setError("اختر ملفات PDF أو PNG أو JPEG أو DOCX لا تتجاوز 25 ميجابايت؛ الحد الأقصى 30 ملفًا.");return;}
    setError("");setFiles(old=>[...old,...picked.map(file=>({file,id:crypto.randomUUID(),evidenceIndex:index}))]);
  }
  function resetPrepared(){setFiles([]);setResume(false);setEvidence([]);}
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
    if (busy.current || !preview || loading || title.trim().length < 5 || description.trim().length < 10 || !requirementsReady) return;
    busy.current = true; setPending(true); setError("");
    const input = JSON.stringify({ title:title.trim(), description:description.trim(), unitId: unit, versionId: version,evidence:resume?evidence:[] });
    if (receipt.current?.input !== input) receipt.current = { input, id: crypto.randomUUID() };
    try {
      const command=async(body:unknown)=>{const response=await fetch("/api/admin/typed-topics",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});const value=await response.json().catch(()=>null);if(!response.ok||!value?.data){throw new SubmissionFailure(`${value?.error?.message??"تعذر التحقق من تجهيز الطلب."}${value?.error?.traceId?` رقم التتبع: ${value.error.traceId}`:""}`,response.status>=400&&response.status<500&&Boolean(value?.error));}return value.data;};
      setProgress("جارٍ تجهيز الطلب دون تقديمه…");
      const prepared=await command({...JSON.parse(input),requestId:receipt.current.id,action:"prepare"});
      if(!prepared.request_id)throw new Error("تعذر التحقق من تجهيز الطلب؛ أعد التحقق قبل المحاولة بطلب آخر.");
      if(prepared.result?.topic_id&&prepared.result?.topic_no){setCreated(prepared.result);return;}
      for(const [index,picked] of files.entries()){
        if(prepared.files?.some((saved:{id:string})=>saved.id===picked.id))continue;
        setProgress(`جارٍ رفع المرفق ${index+1} من ${files.length}…`);const form=new FormData();form.set("file",picked.file);form.set("submissionId",receipt.current.id);form.set("fileId",picked.id);form.set("input",input);if(picked.evidenceIndex!==undefined)form.set("evidenceIndex",String(picked.evidenceIndex));
        const uploaded=await fetch("/api/admin/typed-topics/files",{method:"POST",body:form});const value=await uploaded.json().catch(()=>null);
        if(!uploaded.ok||value?.data?.id!==picked.id)throw new SubmissionFailure(`${value?.error?.message??"تعذر تأكيد رفع المرفق؛ لم يُقدم الموضوع."}${value?.error?.traceId?` رقم التتبع: ${value.error.traceId}`:""}`,uploaded.status>=400&&uploaded.status<500&&Boolean(value?.error));
      }
      setProgress("اكتملت المرفقات؛ جارٍ التحقق والتقديم…");
      const response = await fetch("/api/admin/typed-topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action:"submit",requestId: receipt.current.id }) });
      const payload = await response.json().catch(()=>null);
      if(response.status>=500 || !payload || (response.ok && (!payload.data?.topic_id || !payload.data?.topic_no)))setUncertain(true);
      if (!response.ok) throw new SubmissionFailure(`${payload?.error?.message ?? "تعذر تقديم الموضوع."}${payload?.error?.traceId ? ` رقم التتبع: ${payload.error.traceId}` : ""}`,response.status>=400&&response.status<500&&Boolean(payload?.error));
      if (!payload?.data?.topic_id || !payload.data.topic_no) throw new Error("تعذر التحقق من نتيجة التقديم؛ راجع قائمة موضوعاتك."); setCreated(payload.data);
    } catch (reason) { const confirmed=reason instanceof SubmissionFailure&&reason.confirmed;setUncertain(!confirmed);if(confirmed){receipt.current=null;setFiles(old=>old.map(f=>({...f,id:crypto.randomUUID()})));}setError(reason instanceof Error && !(reason instanceof TypeError) ? reason.message : "انقطع الاتصال. تحقق من التقديم قبل إنشاء طلب جديد."); }
    finally { busy.current = false; setPending(false);setProgress(""); }
  }
  const locked=pending||uncertain;
  const required=preview?.authoring?.required_attachment_count??0;
  const requirementsReady=files.length>=required&&(!resume||(evidence.length>0&&evidence.every((item,index)=>item.meeting_date&&item.decision_text.trim().length>=3&&item.bypass_reason.trim().length>=10&&files.some(f=>f.evidenceIndex===index))));
  function filePicker(index?:number){const key=index===undefined?"main":`proof-${index}`;return <div className="mt-4 space-y-3 rounded-q-control border border-q-border bg-q-surface-2 p-4"><label htmlFor={`files-${key}`} className="block text-q-ui font-bold">{index===undefined?"مرفقات الموضوع":"محضر أو دليل المرحلة"}</label><input id={`files-${key}`} ref={el=>{fileControls.current[key]=el;}} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.docx" disabled={locked} className="sr-only" onChange={event=>{pickFiles(event.target.files,index);event.target.value="";}}/><Button variant="secondary" disabled={locked} onClick={()=>fileControls.current[key]?.click()}>اختيار الملفات</Button><p className="text-q-caption text-q-text-2">PDF أو PNG أو JPEG أو DOCX؛ 25 ميجابايت لكل ملف.</p><ul className="space-y-2">{files.filter(f=>f.evidenceIndex===index).map(f=><li key={f.id} className="flex min-w-0 items-center justify-between gap-3 rounded-q-control border border-q-border p-3"><span className="min-w-0 break-all text-q-ui">{f.file.name}</span><Button variant="secondary" disabled={locked} onClick={()=>setFiles(old=>old.filter(item=>item.id!==f.id))} aria-label={`إزالة ${f.file.name}`}>إزالة</Button></li>)}</ul></div>;}
  return <section className="space-y-6 text-q-text" dir="rtl">
    {created ? <Card className="p-6 sm:p-8">
      <InlineMessage tone="success">تم تقديم الموضوع</InlineMessage>
      <h2 className="mt-6 text-q-h2 font-bold">تم تقديم الموضوع</h2><p className="mt-2 text-q-body font-bold">{title}</p><p className="mt-2 text-q-ui text-q-text-2">{created.topic_no}</p>
      <p className="mt-4 text-q-ui text-q-text-2">{resume?"أُرسلت محاضر المراحل السابقة للمراجعة المستقلة؛ لن يتجاوز المسار هذه المراحل قبل اعتماد الأدلة.":"رُبطت المرفقات بالموضوع وبدأ مساره من أول مرحلة."}</p>
      <Link className="mt-6 inline-flex min-h-11 items-center text-q-ui font-bold text-q-link" href={`/admin/topics/${created.topic_id}`}>عرض الموضوع ومرفقاته</Link>
    </Card> : <form onSubmit={event => { event.preventDefault(); void submit(); }} className="space-y-6">
      <Card className="p-6 sm:p-8">
        <h2 className="text-q-h3 font-bold">جهة التقديم</h2>
        <p className="mt-2 text-q-ui text-q-text-2">المجالس الظاهرة ضمن نطاق تقديمك. اختر المجلس لتظهر تصنيفاته المتاحة.</p>
        <fieldset disabled={locked} className="mt-6 grid min-w-0 gap-4 sm:grid-cols-2">
          <label className="text-q-ui font-bold">المجلس<select aria-label="المجلس" className={field} value={unit} disabled={locked||loading} onChange={event => { resetPrepared();setLoading(true);setError("");setUnit(event.target.value);setVersion("");setTypes([]);setPreview(null); }}><option value="">اختر المجلس</option>{units.map(value => <option key={value.id} value={value.id}>{value.name_ar}</option>)}</select></label>
          <label className="text-q-ui font-bold">تصنيف الموضوع<select aria-label="تصنيف الموضوع" className={field} value={version} disabled={!unit||loading||locked} onChange={event => { resetPrepared();setLoading(true);setError("");setVersion(event.target.value);setPreview(null);setTitle(types.find(value=>value.topic_type_version_id===event.target.value)?.topic_type_name_ar??""); }}><option value="">اختر التصنيف</option>{types.map(value=><option key={value.topic_type_version_id} value={value.topic_type_version_id}>{value.topic_type_name_ar}</option>)}</select></label>
        </fieldset>
        {loading&&<p className="mt-4 text-q-ui text-q-text-2" role="status">جارٍ التحقق من الخيارات والمسار…</p>}
        {!loading&&!unit&&!error&&!units.length&&<InlineMessage tone="info" className="mt-4">لا توجد مجالس نشطة متاحة للتقديم. تحقق من تفعيل المجلس واكتمال متطلباته، أو اطلب من مسؤول النظام مراجعة نطاق تقديمك.</InlineMessage>}
        {unit&&!version&&!loading&&!error&&!types.length&&<InlineMessage tone="info" className="mt-4">لا توجد تصنيفات منشورة ومتاحة لهذا المجلس.</InlineMessage>}
        {!unit&&!loading&&units.length>0&&<p className="mt-3 text-q-caption text-q-text-3">اختيار التصنيف يتاح بعد تحديد المجلس.</p>}
      </Card>
      {preview&&<Card className="p-6 sm:p-8">
        <h2 className="text-q-h3 font-bold">مسار الموضوع</h2>
        <ol className="mt-4 flex flex-wrap gap-3">{preview.steps.map((step,index)=><li key={index} className="flex items-center gap-3 rounded-q-control border border-q-border bg-q-surface-2 px-4 py-3 text-q-ui"><span className="font-bold text-q-primary">{index+1}</span>{step.name_ar}</li>)}</ol>
        <p className="mt-4 text-q-ui text-q-text-2">{required?`المرفقات المطلوبة: ${required} على الأقل، تُرفع قبل تقديم الموضوع.`:"لا يتطلب التصنيف مرفقات إلزامية."}</p>
        {preview.authoring?.submission_instructions?.trim()&&<section aria-label="تعليمات التقديم" className="mt-6 border-t border-q-border pt-6"><details open key={version}><summary className="min-h-11 cursor-pointer text-q-h3 font-bold">تعليمات التقديم</summary><div className="mt-4"><InstructionContent value={preview.authoring.submission_instructions}/></div></details></section>}
      </Card>}
      {preview&&<Card className="p-6 sm:p-8"><h2 className="text-q-h3 font-bold">نوع التقديم</h2><fieldset disabled={locked} className="mt-4 flex flex-wrap gap-4 text-q-ui"><label className="flex min-h-11 items-center gap-2"><input type="radio" name="submissionMode" checked={!resume} onChange={()=>{setResume(false);setEvidence([]);setFiles(old=>old.filter(f=>f.evidenceIndex===undefined));}}/>موضوع جديد</label><label className="flex min-h-11 items-center gap-2"><input type="radio" name="submissionMode" checked={resume} disabled={!preview.can_resume||(preview.prior_steps?.length??0)<2} onChange={()=>setResume(true)}/>استكمال مسار سابق</label></fieldset>{(!preview.can_resume||(preview.prior_steps?.length??0)<2)&&<p className="mt-2 text-q-caption text-q-text-2">{!preview.can_resume?"استكمال المسار يتطلب صلاحية توثيق المراحل السابقة.":"هذا المسار لا يحتوي على مراحل سابقة مع مرحلة متبقية."}</p>}{resume&&<div className="mt-4 space-y-4"><InlineMessage tone="info">أثبت المراحل المنفذة قبل دخول النظام بالترتيب. لا تُفعّل المرحلة التالية إلا بعد مراجعة مستقلة للمحاضر.</InlineMessage><label className="block text-q-ui font-bold">عدد المراحل المنفذة<select className={field} disabled={locked} value={evidence.length} onChange={event=>{const count=Number(event.target.value);setEvidence((preview.prior_steps??[]).slice(0,count).map((s,i)=>evidence[i]??{template_step_id:s.template_step_id,meeting_date:"",meeting_reference:"",decision_type:"approved",decision_text:"",bypass_reason:""}));setFiles(old=>old.filter(f=>f.evidenceIndex===undefined||f.evidenceIndex<count));}}><option value={0}>اختر المراحل السابقة</option>{preview.prior_steps?.slice(0,-1).map((s,i)=><option key={s.template_step_id} value={i+1}>{i+1} — حتى {s.name_ar}</option>)}</select></label>{evidence.map((item,index)=><fieldset disabled={locked} key={item.template_step_id} className="rounded-q-card border border-q-border p-4"><legend className="px-2 text-q-ui font-bold">{preview.prior_steps?.[index]?.name_ar}</legend><div className="grid gap-4 sm:grid-cols-2">{([{key:"meeting_date",label:"تاريخ الاجتماع",type:"date"},{key:"meeting_reference",label:"رقم المحضر (اختياري)",type:"text"},{key:"decision_text",label:"نص القرار",type:"text"},{key:"bypass_reason",label:"سبب استكمال المسار خارج النظام",type:"text"}] as const).map(f=><label key={f.key} className="text-q-ui font-bold">{f.label}<input type={f.type} maxLength={f.key==="meeting_reference"?200:f.key==="decision_text"?4000:f.key==="bypass_reason"?2000:undefined} max={f.type==="date"?new Date().toISOString().slice(0,10):undefined} className={field} value={item[f.key]} onChange={event=>setEvidence(old=>old.map((e,i)=>i===index?{...e,[f.key]:event.target.value}:e))}/></label>)}</div><label className="mt-4 block text-q-ui font-bold">نتيجة المرحلة السابقة<select className={field} value={item.decision_type} onChange={event=>setEvidence(old=>old.map((e,i)=>i===index?{...e,decision_type:event.target.value}:e))}><option value="approved">موافقة / اعتماد</option><option value="recommended">توصية</option><option value="referred">إحالة للمجلس التالي</option><option value="completed">إتمام المرحلة</option></select></label>{filePicker(index)}</fieldset>)}</div>}</Card>}
      <Card className="p-6 sm:p-8">
        <h2 className="text-q-h3 font-bold">بيانات الموضوع</h2>
        <fieldset disabled={locked} className="mt-6 min-w-0 space-y-4">
          <label className="block text-q-ui font-bold">عنوان الموضوع<input className={field} value={title} minLength={5} maxLength={300} onChange={event=>setTitle(event.target.value)} placeholder="اكتب عنوانًا واضحًا للموضوع"/></label>
          <label className="block text-q-ui font-bold">تفاصيل الموضوع<textarea className={field} value={description} minLength={10} maxLength={10000} rows={6} onChange={event=>setDescription(event.target.value)} placeholder="وضّح الطلب والمعلومات التي يحتاجها المجلس"/></label>
        </fieldset>
        {preview&&filePicker()}
        {preview&&!requirementsReady&&<InlineMessage tone="info" className="mt-4">أكمل المرفقات المطلوبة{resume?" وتاريخ وقرار وسبب ومحضر كل مرحلة سابقة":""} قبل التقديم. الملفات تُرفع وتُفحص قبل إرسال الطلب.</InlineMessage>}
        {progress&&<p role="status" className="mt-4 text-q-ui text-q-text-2">{progress}</p>}
        {error&&<div className="mt-4 space-y-3"><InlineMessage tone="error">{error}</InlineMessage>{!uncertain&&<Button variant="secondary" disabled={pending} onClick={()=>{setLoading(true);setError("");setPreview(null);setAttempt(value=>value+1);}}>تحديث الخيارات</Button>}</div>}
        {uncertain&&<div className="mt-4 space-y-3"><p className="text-q-ui text-q-text-2">المدخلات مقفلة لحماية الطلب من التكرار. التحقق يعيد الطلب نفسه بأمان.</p><Button variant="secondary" pending={pending} onClick={()=>void submit()}>التحقق من التقديم</Button><Link href="/admin/topics" className="ms-4 inline-flex min-h-11 items-center text-q-ui text-q-link">مراجعة قائمة الموضوعات</Link></div>}
        <footer className="mt-6 flex flex-wrap items-center gap-4 border-t border-q-border pt-6"><Button type="submit" pending={pending} pendingLabel="جارٍ تجهيز وتقديم الموضوع…" disabled={uncertain||loading||!preview||!requirementsReady||title.trim().length<5||description.trim().length<10}>تقديم الموضوع</Button><Link href="/admin/topics" className="inline-flex min-h-11 items-center text-q-ui text-q-link">العودة للموضوعات</Link></footer>
        {!preview&&!error&&<p className="mt-3 text-q-caption text-q-text-2">اختر المجلس والتصنيف للتحقق من جاهزية المسار أولًا.</p>}
        {preview&&(title.trim().length<5||description.trim().length<10)&&<p className="mt-3 text-q-caption text-q-text-2">للتقديم: أدخل عنوانًا من 5 أحرف على الأقل وتفاصيل من 10 أحرف على الأقل.</p>}
      </Card>
    </form>}
  </section>;
}
