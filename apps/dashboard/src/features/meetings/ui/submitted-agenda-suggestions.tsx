import Link from "next/link";
import {Card} from "@/shared/ui/card";
import {Button} from "@/shared/ui/button";
import {Badge} from "@/shared/ui/badge";
import {InlineMessage} from "@/shared/ui/inline-message";
import type {AgendaCandidate} from "../model/meeting";

export function SubmittedAgendaSuggestions({items,total,busy,onAdd,onMore,onReview,notice}:{items:AgendaCandidate[];total:number;busy:boolean;onAdd:(id:string)=>void;onMore:()=>void;onReview?:(item:AgendaCandidate)=>void;notice?:{kind:"error"|"success";text:string}|null}){
 return <Card className="m-4 space-y-4" aria-labelledby="submitted-agenda-suggestions-title">
  <div className="flex flex-wrap items-center justify-between gap-3"><h3 id="submitted-agenda-suggestions-title" className="text-q-h3 font-bold">الموضوعات المقدمة لمقترحات جدول الأعمال</h3><Badge tone="info">{total} موضوع</Badge></div>
  <p className="text-q-ui text-q-text-2">تظهر تلقائيًا بحسب المجلس الحالي في المسار واكتمال المتطلبات. اختر ما سيُناقش في هذا الاجتماع؛ الإدراج ليس قبولًا للموضوع.</p>
  {notice&&<InlineMessage tone={notice.kind}>{notice.text}</InlineMessage>}
  {!items.length?<p className="text-q-ui text-q-text-2">لا توجد موضوعات مكتملة تنتظر الإدراج لدى هذا المجلس.</p>:<ul className="space-y-3">{items.map(item=><li key={item.id} className="flex flex-wrap items-center gap-4 rounded-q-card border border-q-border p-4"><div className="min-w-0 flex-1 space-y-2"><Link className="inline-flex min-h-11 break-words items-center text-q-ui font-bold text-q-link" href={`/admin/topics/${item.id}`}>{item.title_ar}</Link><p className="text-q-caption text-q-text-2">{item.topic_no}{item.current_step?` · ${item.current_step}`:""}</p></div>{onReview?<Button variant="secondary" pending={busy} onClick={()=>onReview(item)}>مراجعة التعليمات والإدراج</Button>:<Button variant="secondary" pending={busy} onClick={()=>onAdd(item.id)}>إدراج في هذا الاجتماع</Button>}</li>)}</ul>}
  {total>items.length&&<Button variant="secondary" onClick={onMore} disabled={busy}>عرض جميع المقترحات</Button>}
 </Card>;
}
