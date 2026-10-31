"use client";
import {useRef,useState} from "react";
import Link from "next/link";
import {Button} from "@/shared/ui/button";
import {InlineMessage} from "@/shared/ui/inline-message";

export function TopicSubmissionAttachments({topicId,required}:{topicId:string;required:number}){
  const [file,setFile]=useState<File|null>(null);
  const [count,setCount]=useState(0);
  const [pending,setPending]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [feedback,setFeedback]=useState<{error:boolean;text:string}|null>(null);
  const busy=useRef(false);
  async function upload(){
    if(busy.current||uncertain||!file)return;
    if(file.size===0||file.size>25*1024*1024){setFeedback({error:true,text:"اختر ملفًا غير فارغ لا يتجاوز 25 ميجابايت."});return;}
    busy.current=true;setPending(true);setFeedback(null);
    const body=new FormData();body.set("topicId",topicId);body.set("file",file);
    try{
      const response=await fetch("/api/admin/topics/upload",{method:"POST",body});
      const result=await response.json().catch(()=>null);
      if(response.status>=500||!result||(response.ok&&!result.data?.attachment))setUncertain(true);
      if(!response.ok||!result?.data?.attachment)throw Error(result?.error?.message??"تعذر تأكيد رفع الملف. افتح التفاصيل للتحقق قبل إعادة الرفع.");
      setCount(value=>value+1);setFile(null);setFeedback({error:false,text:"تم رفع المرفق وحفظه للموضوع."});
    }catch(error){if(error instanceof TypeError)setUncertain(true);setFeedback({error:true,text:error instanceof Error&&!(error instanceof TypeError)?error.message:"انقطع الاتصال. تحقق من المرفقات في التفاصيل قبل إعادة الرفع."});}
    finally{busy.current=false;setPending(false);}
  }
  return <section className="mt-6 border-t border-q-border pt-6" aria-label="مرفقات الموضوع">
    <h3 className="text-q-h3 font-bold">استكمال المرفقات</h3>
    <p className="mt-2 text-q-ui text-q-text-2">{required>0?`تم رفع ${count} من ${required} مرفقات مطلوبة في هذه الجلسة. المراجعة لا تبدأ قبل اكتمال المتطلبات.`:"المرفقات اختيارية لهذا التصنيف."}</p>
    <label className="mt-4 block text-q-ui font-bold">اختيار مرفق<input key={count} type="file" accept=".pdf,.png,.jpg,.jpeg,.docx" disabled={pending||uncertain} onChange={event=>{setFile(event.target.files?.[0]??null);setFeedback(null);}} className="mt-2 block min-h-11 w-full rounded-q-control border border-q-border bg-q-surface p-3 text-q-ui"/></label>
    <p className="mt-2 text-q-caption text-q-text-2">PDF أو PNG أو JPEG أو DOCX، حتى 25 ميجابايت لكل ملف.</p>
    <Button className="mt-4" variant="secondary" disabled={!file||uncertain} pending={pending} pendingLabel="جارٍ رفع المرفق…" onClick={()=>void upload()}>رفع المرفق</Button>
    {!file&&!uncertain&&<p className="mt-2 text-q-caption text-q-text-3">اختر ملفًا لتفعيل الرفع.</p>}
    {feedback&&<InlineMessage className="mt-4" tone={feedback.error?"error":"success"}>{feedback.text}</InlineMessage>}
    {uncertain&&<Link href={`/admin/topics/${topicId}`} className="mt-3 inline-flex min-h-11 items-center text-q-ui font-bold text-q-link">فتح التفاصيل للتحقق من المرفقات</Link>}
  </section>;
}
