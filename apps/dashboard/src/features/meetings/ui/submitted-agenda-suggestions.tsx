import { ArrowLeft, FileCheck2, GitBranch, Landmark } from "lucide-react";
import {Card} from "@/shared/ui/card";
import {Button} from "@/shared/ui/button";
import {Badge} from "@/shared/ui/badge";
import {InlineMessage} from "@/shared/ui/inline-message";
import type {AgendaCandidate} from "../model/meeting";

export function AgendaCandidateCard({item,busy,onAdd,onReview}:{item:AgendaCandidate;busy:boolean;onAdd?:(id:string)=>void;onReview?:(item:AgendaCandidate)=>void}){
 return <article className="rounded-q-card border border-q-border bg-q-surface p-4 transition-colors hover:border-q-border-strong">
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div className="min-w-0 flex-1">
     <div className="mb-2 flex flex-wrap gap-2">{item.topic_no&&<Badge tone="info">{item.topic_no}</Badge>}{item.current_step&&<Badge tone="warning"><GitBranch size={14}/>{item.current_step}</Badge>}{item.source_decision_no&&<Badge tone="success">قرار سابق · {item.source_decision_no}</Badge>}</div>
     <h4 className="text-q-h3 font-bold leading-8 text-q-text">{item.title_ar}</h4>
     {item.source_unit_name_ar&&<p className="mt-2 flex items-center gap-2 text-q-caption text-q-text-2"><Landmark className="shrink-0 text-q-link" size={17}/>من {item.source_unit_name_ar}{item.source_meeting_no?` · ${item.source_meeting_no}`:""}</p>}
    </div>
    {onReview?<Button variant="secondary" pending={busy} onClick={()=>onReview(item)}>التفاصيل<ArrowLeft size={18}/></Button>:<Button pending={busy} onClick={()=>onAdd?.(item.id)}>إدراج في هذا الاجتماع</Button>}
   </div>
 </article>;
}

export function SubmittedAgendaSuggestions({items,total,busy,onAdd,onMore,onReview,notice}:{items:AgendaCandidate[];total:number;busy:boolean;onAdd:(id:string)=>void;onMore:()=>void;onReview?:(item:AgendaCandidate)=>void;notice?:{kind:"error"|"success";text:string}|null}){
 return <Card className="m-4 space-y-4" aria-labelledby="submitted-agenda-suggestions-title">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="submitted-agenda-suggestions-title" className="text-q-h3 font-bold">الموضوعات المقدمة لمقترحات جدول الأعمال</h3><Badge tone="info">{total} موضوع</Badge></div>
  <p className="text-q-ui text-q-text-2">تظهر تلقائيًا بحسب المجلس الحالي في المسار واكتمال المتطلبات. اختر ما سيُناقش في هذا الاجتماع؛ الإدراج ليس قبولًا للموضوع.</p>
  {notice&&<InlineMessage tone={notice.kind}>{notice.text}</InlineMessage>}
  {!items.length?<div className="rounded-q-card border border-dashed border-q-border p-6 text-center"><FileCheck2 className="mx-auto text-q-text-3" size={28}/><p className="mt-3 text-q-ui font-bold">لا توجد موضوعات مكتملة تنتظر الإدراج</p><p className="mt-1 text-q-caption text-q-text-2">ستظهر هنا تلقائيًا عندما تصل خطوة مسار إلى هذا المجلس.</p></div>:<ul className="grid gap-4">{items.map(item=><li key={item.id}><AgendaCandidateCard item={item} busy={busy} onAdd={onAdd} onReview={onReview}/></li>)}</ul>}
  {total>items.length&&<Button variant="secondary" onClick={onMore} disabled={busy}>عرض جميع المقترحات</Button>}
 </Card>;
}
