"use client";
import {useState} from "react";
import {Dialog} from "@/shared/ui/dialog";
import {Button} from "@/shared/ui/button";
import {InlineMessage} from "@/shared/ui/inline-message";
import {InstructionEditor} from "@/shared/ui/instruction-editor";

export function AgendaInstructionsDialog({title,initialValue,inserting,onClose,onSave}:{title:string;initialValue:string;inserting:boolean;onClose:()=>void;onSave:(text:string)=>Promise<void>}){
 const [text,setText]=useState(initialValue),[busy,setBusy]=useState(false),[error,setError]=useState("");
 async function save(){if(busy)return;setBusy(true);setError("");try{await onSave(text);onClose();}catch(reason){setError(reason instanceof Error?reason.message:"تعذر حفظ التعليمات. النص الذي كتبته محفوظ هنا؛ حدّث الاجتماع قبل المحاولة إذا تغيرت بياناته.");}finally{setBusy(false);}}
 return <Dialog title={inserting?"مراجعة التعليمات وإدراج الموضوع":"تعديل تعليمات المناقشة"} description={title} size="lg" scrollContent onClose={onClose} closeDisabled={busy} footer={<div className="w-full space-y-3">{error&&<InlineMessage tone="error">{error}</InlineMessage>}<div className="flex flex-wrap justify-end gap-3"><Button variant="secondary" disabled={busy} onClick={onClose}>إلغاء</Button><Button pending={busy} disabled={text.length>10000} onClick={()=>void save()}>{inserting?"حفظ وإدراج في الاجتماع":"حفظ تعليمات الموضوع"}</Button></div></div>}>
  <InlineMessage tone="info">هذا التعديل خاص بالموضوع في هذا الاجتماع فقط. لا يغيّر تصنيف الموضوع أو تعليمات الموضوعات الأخرى.</InlineMessage>
  <div className="mt-4"><InstructionEditor label="تعليمات المناقشة" value={text} onChange={setText} hint="راجع النص الموروث من التصنيف، ثم خصّصه لهذا الموضوع. يمكن استخدام المحرر أو Markdown ومعاينة العرض."/></div>
 </Dialog>;
}
