import { Eye, ArrowLeft } from "lucide-react";
import { Card } from "@/shared/ui/card";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";
import { routingStatusLabel, topicCategoryName, topicUnitName, type ReviewAction, type TopicDetail } from "../model/topic-view";
import { TopicPriorityBadge, TopicRoutingBadge, TopicStatusBadge } from "./topic-status-badge";
type Props={topic:TopicDetail|null;loading:boolean;reviewMode:boolean;busy:boolean;onReview:(action:ReviewAction)=>void;onRefer:()=>void;onOpenDetails:()=>void};
export function TopicSummaryPanel({topic,loading,reviewMode,busy,onReview,onOpenDetails}:Props){
 if(loading)return <Card className="p-8"><p role="status" className="text-q-ui text-q-text-2">جارٍ تحميل ملف الموضوع…</p></Card>;
 if(!topic)return <Card className="p-8 text-center"><Eye className="mx-auto text-q-primary"/><h3 className="mt-4 text-q-h3 font-bold">اختر موضوعًا لعرض ملفه</h3><p className="mt-3 text-q-ui text-q-text-2">ستظهر بيانات الطلب ومتطلباته وحالة معالجته.</p></Card>;
 const canReturn=reviewMode&&(topic.allowed_review_actions??[]).includes("return");
 const facts=[{label:"فئة الموضوع",value:topicCategoryName(topic)},{label:"المجلس المسؤول",value:topicUnitName(topic)},{label:"مقدم الموضوع",value:topic.submitted_by?.full_name_ar||topic.submitted_by_name_ar||"غير محدد"},{label:"حالة المسار",value:routingStatusLabel(topic.routing_status)}];
 return <Card className="overflow-hidden">
  <header className="border-b border-q-border p-6"><div className="flex flex-wrap gap-2"><TopicStatusBadge topic={topic}/><TopicPriorityBadge topic={topic}/><TopicRoutingBadge topic={topic}/></div><h2 className="mt-4 text-q-h2 font-bold">{topic.title_ar}</h2><p className="mt-2 text-q-caption text-q-text-2">{topic.topic_no??topic.id}</p></header>
  <div className="space-y-6 p-6">{topic.description&&<section><h3 className="text-q-ui font-bold">تفاصيل الطلب</h3><p className="mt-3 whitespace-pre-wrap text-q-body text-q-text-2">{topic.description}</p></section>}<dl className="grid gap-4 sm:grid-cols-2">{facts.map(f=><div key={f.label} className="rounded-q-control border border-q-border bg-q-surface-2 p-4"><dt className="text-q-caption text-q-text-2">{f.label}</dt><dd className="mt-2 text-q-ui font-bold">{f.value}</dd></div>)}</dl>
  {topic.status==="returned"&&<InlineMessage tone="info">مطلوب استكمال: راجع سبب الإعادة وأكمل البيانات المطلوبة قبل إعادة الإرسال.</InlineMessage>}
  {reviewMode&&<InlineMessage tone="info">القبول والرفض والإحالة قرارات تُسجل داخل الاجتماع عند مناقشة الموضوع. هذه الواجهة لمتابعة الطلب واستكمال بياناته.</InlineMessage>}
  {canReturn&&<Button variant="secondary" disabled={busy} onClick={()=>onReview("return")}>طلب استكمال</Button>}
  </div><footer className="border-t border-q-border p-6"><Button variant="secondary" onClick={onOpenDetails}><Eye size={18}/>فتح الملف الكامل وسجل الحالة<ArrowLeft size={18}/></Button></footer>
 </Card>;
}
