"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SelfAvatar } from "@/shared/ui/self-avatar";

export function AvatarPanel({ name, initialRevision = 0, initialHasImage = false }: { name: string; initialRevision?: number; initialHasImage?: boolean }) {
  const router = useRouter(); const busy = useRef(false);
  const [revision, setRevision] = useState(initialRevision);
  const [hasImage, setHasImage] = useState(initialHasImage);
  const [file, setFile] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [feedback, setFeedback] = useState<{error:boolean;text:string}|null>(null);
  async function save(remove: boolean) {
    if (busy.current || uncertain) return;
    if (!remove && (!file || file.size>2*1024*1024 || !["image/png","image/jpeg"].includes(file.type))) { setFeedback({ error:true, text:"اختر صورة PNG أو JPEG لا تتجاوز 2 ميجابايت." }); return; }
    busy.current=true; setPending(true); setFeedback(null);
    const body = new FormData(); body.set("revision", String(revision)); body.set("request_id", crypto.randomUUID()); if(file&&!remove)body.set("file", file);
    try {
      const response = await fetch("/api/account/avatar", { method:remove?"DELETE":"POST", body });
      const result = await response.json().catch(() => null);
      if(response.status>=500 || response.status===409 || (response.ok && result?.saved!==true))setUncertain(true);
      if(!response.ok || result?.saved!==true || !Number.isInteger(result.revision)) throw new Error(result?.message??"تعذر تأكيد حفظ الصورة؛ أعد تحميلها قبل المحاولة.");
      setRevision(result.revision);setHasImage(result.has_image);setFile(null);setConfirmRemove(false);
      setFeedback({error:false,text:remove?"تمت إزالة الصورة الشخصية.":"تم حفظ الصورة الشخصية."});
      window.dispatchEvent(new Event("qarar:avatar-updated"));router.refresh();
    } catch(error) { if(error instanceof TypeError)setUncertain(true);setFeedback({error:true,text:error instanceof Error&&!(error instanceof TypeError)?error.message:"انقطع الاتصال. أعد تحميل الصورة للتحقق من النتيجة."}); }
    finally {busy.current=false;setPending(false);}
  }
  async function reload() {
    if(busy.current)return;busy.current=true;setPending(true);
    try {const response=await fetch("/api/account/avatar?metadata=1",{cache:"no-store"}); const result=await response.json();if(!response.ok||!Number.isInteger(result.revision))throw Error("تعذر تحميل الصورة. حاول مرة أخرى.");setRevision(result.revision);setHasImage(result.has_image);setFile(null);setConfirmRemove(false);setUncertain(false);setFeedback(null);window.dispatchEvent(new Event("qarar:avatar-updated"));}
    catch {setFeedback({error:true,text:"تعذر تحميل الصورة. حاول مرة أخرى."});}finally{busy.current=false;setPending(false);}
  }
  return <Card className="p-6 sm:p-8">
    <div className="flex flex-col gap-6 sm:flex-row sm:items-center"><SelfAvatar name={name} large />
      <div className="min-w-0 flex-1"><h2 className="text-q-h3 font-bold">الصورة الشخصية</h2><p className="mt-2 text-q-ui text-q-text-2">PNG أو JPEG، حتى 2 ميجابايت. تُحفظ نسخة مربعة مصغرة دون بيانات التصوير.</p>
        <label className="mt-4 block text-q-ui font-bold">اختيار الصورة<input key={revision} type="file" accept="image/png,image/jpeg" disabled={pending||uncertain} onChange={e=>{setFile(e.target.files?.[0]??null);setFeedback(null);}} className="mt-2 block min-h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 py-2 text-q-ui file:me-3 file:rounded-q-control file:border-0 file:bg-q-surface-2 file:p-2 file:text-q-link" /></label>
        <div className="mt-4 flex flex-wrap gap-3"><Button onClick={()=>void save(false)} disabled={!file||uncertain} pending={pending} pendingLabel="جارٍ الحفظ…">حفظ الصورة</Button>{hasImage&&<Button variant="ghost" disabled={pending||uncertain} onClick={()=>setConfirmRemove(true)}>إزالة الصورة</Button>}</div>
        {!file&&!uncertain&&<p className="mt-2 text-q-caption text-q-text-3">اختر صورة لتفعيل الحفظ.</p>}
      </div>
    </div>
    {confirmRemove&&<div className="mt-4 flex flex-wrap items-center gap-3 rounded-q-control border border-q-border p-4"><p className="text-q-ui">إزالة صورتك والعودة إلى الأحرف الأولى؟</p><Button variant="danger" pending={pending} disabled={uncertain} onClick={()=>void save(true)}>تأكيد الإزالة</Button><Button variant="ghost" disabled={pending} onClick={()=>setConfirmRemove(false)}>إلغاء</Button></div>}
    {feedback&&<InlineMessage tone={feedback.error?"error":"success"} className="mt-4">{feedback.text}</InlineMessage>}
    {uncertain&&<div className="mt-4"><p className="mb-3 text-q-caption text-q-text-2">التعديل متوقف حتى التحقق من الصورة المحفوظة.</p><Button variant="secondary" pending={pending} onClick={()=>void reload()}>إعادة تحميل الصورة</Button></div>}
  </Card>;
}
