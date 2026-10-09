import { CalendarClock, Paperclip } from "lucide-react";
import type { ScheduledAgendaSuggestion } from "../model/meeting";

export function ScheduledAgendaSuggestions({ items }: { items: ScheduledAgendaSuggestion[] }) {
  if (!items.length) return null;
  return <section aria-labelledby="scheduled-agenda-suggestions-title" className="space-y-3 p-5">
    <div className="flex items-center gap-2 text-[#0066cc]"><CalendarClock size={18}/><h3 id="scheduled-agenda-suggestions-title" className="text-sm font-bold">مقترحات مجدولة لهذا الاجتماع</h3><span className="rounded-full bg-[#f2f6fa] px-2 py-1 text-xs">{items.length}</span></div>
    <p className="text-xs leading-6 text-[#52647a]">مطابقة لمجلس الاجتماع وتاريخه. هذه مقترحات تحضير، وليست بنودًا معتمدة في جدول الأعمال.</p>
    <div className="space-y-2">{items.map(item => <article key={`${item.topic_type_version_id}:${item.available_from}`} className="rounded-xl border border-[#d8e5ef] bg-[#f2f6fa] p-4">
      <h4 className="text-sm font-bold text-[#0a1330]">{item.title_ar}</h4>
      <p className="mt-2 text-xs text-[#52647a]">فترة المناقشة: <time dateTime={item.available_from}>{item.available_from}</time>{item.due_on !== item.available_from && <> — <time dateTime={item.due_on}>{item.due_on}</time></>}</p>
      {item.required_attachment_count > 0 && <p className="mt-2 flex items-center gap-1.5 text-xs text-[#0066cc]"><Paperclip size={14}/>المرفقات المطلوبة قبل الإدراج: {item.required_attachment_count} على الأقل</p>}
    </article>)}</div>
  </section>;
}
