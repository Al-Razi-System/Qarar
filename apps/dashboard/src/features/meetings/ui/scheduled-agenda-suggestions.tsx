import { CalendarClock, Paperclip } from "lucide-react";
import type { ScheduledAgendaSuggestion } from "../model/meeting";
import { Button } from "@/shared/ui/button";
import { dayLabel, windowRangeLabel } from "../model/meeting-schedule";

export function ScheduledAgendaSuggestions({ items, onPrepare }: { items: ScheduledAgendaSuggestion[]; onPrepare: (item: ScheduledAgendaSuggestion) => void }) {
  if (!items.length) return null;
  return <section aria-labelledby="scheduled-agenda-suggestions-title" className="space-y-3 rounded-q-card border border-q-border bg-q-surface p-5">
    <div className="flex flex-wrap items-center gap-2 text-q-link"><CalendarClock size={18}/><h3 id="scheduled-agenda-suggestions-title" className="text-q-h3 font-bold text-q-text">مقترحات دورية مستحقة لهذا الاجتماع</h3><span className="rounded-full bg-q-info-soft px-2 py-1 text-q-caption font-bold text-q-link">{items.length}</span></div>
    <p className="text-q-caption leading-6 text-q-text-2">مطابقة لمجلس الاجتماع ودورته. هذه مقترحات تحضير، وليست بنودًا معتمدة في جدول الأعمال.</p>
    <div className="grid gap-2 md:grid-cols-2">{items.map(item => <article key={item.occurrence_id ?? `${item.topic_type_version_id}:${item.available_from}`} className="rounded-q-control border border-q-border bg-q-surface-2 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-q-ui font-bold text-q-text">{item.title_ar}</h4>{item.timing_status === "overdue" && <span className="rounded-full bg-q-warning-soft px-2 py-1 text-q-caption font-bold text-q-warning">متأخر عن دورته</span>}</div>
      {item.reference_number && <p className="mt-1 text-q-caption text-q-text-2">مرجع الاستحقاق: <bdi>{item.reference_number}</bdi></p>}
      <p className="mt-2 text-q-caption text-q-text-2">فترة المناقشة: <time dateTime={item.available_from}>{item.due_on !== item.available_from ? windowRangeLabel(item.available_from, item.due_on) : dayLabel(item.available_from)}</time></p>
      {item.required_attachment_count > 0 && <p className="mt-2 flex items-center gap-1.5 text-q-caption font-bold text-q-link"><Paperclip size={14}/>المرفقات المطلوبة قبل الإدراج: {item.required_attachment_count} على الأقل</p>}
      <Button className="mt-4" variant="secondary" onClick={() => onPrepare(item)} aria-label={`استكمال وإدراج ${item.title_ar}`}>استكمال البيانات والمرفقات</Button>
    </article>)}</div>
  </section>;
}
