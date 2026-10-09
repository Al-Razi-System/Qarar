"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, ShieldCheck, Pencil } from "lucide-react";
import styles from "./user-roles.module.css";
type Membership={id:string;role_id:string;role_name_ar:string;unit_id:string;unit_name_ar:string;title:string|null;status:"active"|"inactive"|"ended";start_date:string;end_date:string|null;updated_at:string};
type Data={user_name_ar:string;user_status:string;memberships:Membership[];roles:{id:string;name_ar:string;code:string;role_scope:string}[];units:{id:string;name_ar:string;is_council:boolean}[]};
type Draft={membership?:Membership;roleId:string;unitId:string;title:string;startDate:string;endDate:string};
const labels={active:"نشط",inactive:"معطل",ended:"منتهٍ"};
function enableBlock(m:Membership,data:Data){
 if(m.status!=="inactive")return "";
 if(!data.roles.some(r=>r.id===m.role_id)||!data.units.some(u=>u.id===m.unit_id))return "الدور أو الجهة غير متاحين؛ عدّل الربط قبل إعادة التفعيل.";
 if(m.end_date&&m.end_date<new Date().toISOString().slice(0,10))return "عدّل نهاية السريان قبل إعادة التفعيل.";
 return "";
}
async function json(url:string,init?:RequestInit){const response=await fetch(url,init);const payload=await response.json();if(!response.ok)throw new Error(`${payload.message??"تعذر تنفيذ العملية."}${payload.traceId?` رقم التتبع: ${payload.traceId}`:""}`);return payload;}
function readable(error:unknown){return error instanceof Error&&/[\u0600-\u06ff]/.test(error.message)?error.message:"تعذر الاتصال. اختياراتك محفوظة؛ أعد تحميل القائمة للتحقق قبل المتابعة.";}
export function UserRoles({userId,onContinue}:{userId:string;onContinue?:()=>void}){
 const [data,setData]=useState<Data|null>(null),[loading,setLoading]=useState(true),[pending,setPending]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState(""),[attempt,setAttempt]=useState(0),[draft,setDraft]=useState<Draft|null>(null);
 const busy=useRef(false),receipt=useRef<{input:string;id:string}|null>(null),[needsReload,setNeedsReload]=useState(false);
 const url=`/api/admin/users/${userId}/roles`;
 useEffect(()=>{const controller=new AbortController();json(url,{signal:controller.signal,cache:"no-store"}).then(payload=>{if(controller.signal.aborted)return;if(!Array.isArray(payload.memberships)||!Array.isArray(payload.roles)||!Array.isArray(payload.units))throw new Error("تعذر التحقق من قائمة الأدوار.");setData(payload);setNeedsReload(false);}).catch(reason=>{if(!controller.signal.aborted)setError(readable(reason));}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[url,attempt]);
 async function mutate(action:string,membership?:Membership){
  if(busy.current||needsReload)return;busy.current=true;setPending(true);setError("");setSuccess("");
  const body=action==="add"||action==="update"?{action,roleId:draft?.roleId,unitId:draft?.unitId,title:draft?.title||null,startDate:draft?.startDate||undefined,endDate:draft?.endDate||null,...(draft?.membership?{membershipId:draft.membership.id,expectedUpdatedAt:draft.membership.updated_at}:{})}:{action,membershipId:membership?.id,expectedUpdatedAt:membership?.updated_at};
  const input=JSON.stringify(body);if(action==="add"&&receipt.current?.input!==input)receipt.current={input,id:crypto.randomUUID()};
  try{const result=await json(url,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({...body,...(action==="add"?{requestId:receipt.current?.id}:{})})});if(result.saved!==true||typeof result.membership_id!=="string")throw new Error("تعذر تأكيد الحفظ؛ أعد تحميل الأدوار للتحقق.");setSuccess("حُفظ الدور بنجاح. حالة الحساب ونطاق التقديم لم يتغيرا.");setDraft(null);receipt.current=null;setNeedsReload(true);setAttempt(a=>a+1);
  }catch(reason){setError(readable(reason));setNeedsReload(true);}finally{busy.current=false;setPending(false);}
 }
 function reload(){setLoading(true);setError("");setAttempt(a=>a+1);}
 const role=data?.roles.find(r=>r.id===draft?.roleId),units=data?.units.filter(u=>!role?.code.startsWith("council_")||u.is_council)??[];
 return <section className={styles.panel} aria-label="أدوار المستخدم">
  <header><div><span><ShieldCheck size={19}/>الهوية والصلاحيات</span><h2>أدوار المستخدم{data?.user_name_ar?` / ${data.user_name_ar}`:""}</h2><p>يمكن إضافة أكثر من دور، لكل دور جهة وسريان مستقلان. حفظ الأدوار لا يفعّل الحساب ولا يوسّع نطاق تقديمه ضمنيًا.</p></div><button type="button" disabled={!data||pending||loading||needsReload} onClick={()=>{setDraft({roleId:"",unitId:"",title:"",startDate:"",endDate:""});setError("");setSuccess("");}}><Plus size={16}/>إضافة دور</button></header>
  {loading&&<p role="status">جارٍ تحميل الأدوار…</p>}
  {error&&<div role="alert" className={styles.error}>{error}<button type="button" disabled={pending} onClick={reload}>إعادة تحميل الأدوار</button></div>}
  {success&&<p role="status" className={styles.success}>{success}</p>}
  <p>دور «مقدم موضوع / معاملة» مستقل عن عضوية المجلس والتصويت. {onContinue ? "تعيينه ونطاقه في الخطوة التالية." : <Link href={`/admin/users/${userId}/submission-scope`}>إدارة دور المقدم ونطاقه</Link>}</p>
  {data&&!loading&&<><div className={styles.list}>{data.memberships.map(m=><article key={m.id}><div><h3>{m.role_name_ar}<small data-status={m.status}>{labels[m.status]}</small></h3><p>{m.unit_name_ar}</p><span>{m.start_date}{m.end_date?` — ${m.end_date}`:" — مستمر"}{m.title?` · ${m.title}`:""}</span></div>{m.status!=="ended"&&<div className={styles.actions}><button type="button" disabled={pending||needsReload} onClick={()=>{setDraft({membership:m,roleId:m.role_id,unitId:m.unit_id,title:m.title??"",startDate:m.start_date,endDate:m.end_date??""});setError("");}}><Pencil size={14}/>تعديل الدور</button><button type="button" disabled={pending||needsReload||!!enableBlock(m,data)} onClick={()=>void mutate(m.status==="active"?"disable":"enable",m)}>{m.status==="active"?"تعطيل الدور":"إعادة تفعيل الدور"}</button>{enableBlock(m,data)&&<small>{enableBlock(m,data)}</small>}</div>}</article>)}{!data.memberships.length&&<p className={styles.empty}>لا توجد أدوار مرتبطة. يمكن إضافة أدوار اختيارية أو متابعة إعداد نطاق التقديم.</p>}</div>
  {draft&&<form className={styles.form} onSubmit={event=>{event.preventDefault();void mutate(draft.membership?"update":"add");}}><h3>{draft.membership?"تعديل الدور والجهة":"دور إضافي"}</h3><div className={styles.fields}>
   <label>الدور<select required disabled={pending} value={draft.roleId} onChange={e=>setDraft({...draft,roleId:e.target.value,unitId:""})}><option value="">اختر الدور</option>{data.roles.map(r=><option value={r.id} key={r.id}>{r.name_ar}</option>)}{draft.roleId&&!data.roles.some(r=>r.id===draft.roleId)&&<option value={draft.roleId} disabled>الدور السابق غير متاح؛ اختر بديلًا</option>}</select></label>
   <label>المجلس أو جهة الدور<select required disabled={pending} value={draft.unitId} onChange={e=>setDraft({...draft,unitId:e.target.value})}><option value="">اختر الجهة</option>{units.map(u=><option value={u.id} key={u.id}>{u.name_ar}{u.is_council?" — مجلس":" — وحدة تنظيمية"}</option>)}{draft.unitId&&!units.some(u=>u.id===draft.unitId)&&<option value={draft.unitId} disabled>الجهة السابقة غير متاحة؛ اختر بديلًا</option>}</select></label>
  </div><details><summary>السريان وصفة الدور — اختيارية</summary><div className={styles.fields}><label>بداية السريان<input type="date" disabled={pending} value={draft.startDate} onChange={e=>setDraft({...draft,startDate:e.target.value})}/></label><label>نهاية السريان<input type="date" disabled={pending} min={draft.startDate} value={draft.endDate} onChange={e=>setDraft({...draft,endDate:e.target.value})}/></label><label>صفة الدور<input disabled={pending} maxLength={500} value={draft.title} onChange={e=>setDraft({...draft,title:e.target.value})}/></label></div></details>
  <footer><button type="button" disabled={pending} onClick={()=>setDraft(null)}>إلغاء</button><button className={styles.primary} disabled={pending||needsReload||!draft.roleId||!draft.unitId||!data.roles.some(r=>r.id===draft.roleId)||!units.some(u=>u.id===draft.unitId)}>{pending?"جارٍ الحفظ…":"حفظ الدور"}</button></footer></form>}
  {onContinue&&<footer><span>نطاق التقديم يُحدد في الخطوة التالية، وليس باختيار دور عضو مجلس.</span><button className={styles.primary} type="button" disabled={pending||!!draft||needsReload} onClick={onContinue}>متابعة إلى جهة العمل ونطاق التقديم</button></footer>}</>}
 </section>;
}
