import { ArrowDown, ArrowUp, ClipboardList, Plus, Sparkles, Trash2 } from "lucide-react";
import type { AgendaItem } from "../model/meeting";

const priorityLabels: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };

export function MeetingAgendaPanel({ items, editable, busy, eligibleCount, onAdd, onMove, onRemove }: {
  items: AgendaItem[];
  editable: boolean;
  busy: boolean;
  eligibleCount: number | null;
  onAdd: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (id: string) => void;
}) {
  return <section className="p-5" aria-labelledby="meeting-agenda-title">
    <div className="mb-4 flex items-center justify-between gap-3">
      <div>
        <h3 id="meeting-agenda-title" className="flex items-center gap-2 text-sm font-black text-[#0a1330]"><ClipboardList size={17} className="text-[#0877d1]" /> جدول الأعمال</h3>
        <p className="mt-1 text-[10px] text-[#718196]">الموضوعات المرتبطة بهذا الاجتماع فعلياً وبترتيب مناقشتها.</p>
      </div>
      <span className="rounded-full bg-[#eaf4ff] px-3 py-1 text-[10px] font-black text-[#0877d1]">{items.length} بند</span>
    </div>
    {items.length === 0 ? <div className="rounded-2xl border border-dashed border-[#c8d9e8] bg-[#f8fbfe] px-5 py-8 text-center">
      <ClipboardList className="mx-auto text-[#8aa9c4]" size={28} />
      <h4 className="mt-3 text-sm font-black text-[#1c3552]">جدول الأعمال فارغ</h4>
      {editable && typeof eligibleCount === "number" && eligibleCount > 0 ? <div className="mx-auto mt-4 max-w-md rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-right">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-emerald-600 text-white"><Sparkles size={17} /></span>
          <div className="flex-1">
            <p className="text-xs font-black text-emerald-950">{eligibleCount === 1 ? "يوجد موضوع معتمد جاهز للإضافة" : `يوجد ${eligibleCount} موضوعات معتمدة جاهزة للإضافة`}</p>
            <p className="mt-1 text-[10px] leading-5 text-emerald-800">اختر الموضوعات التي ستدرج في هذا الاجتماع؛ الاعتماد لا يحدد الاجتماع تلقائياً.</p>
          </div>
        </div>
        <button type="button" onClick={onAdd} disabled={busy} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#0877d1] px-4 text-[11px] font-black text-white shadow-[0_8px_18px_rgba(8,119,209,.18)] disabled:opacity-50"><Plus size={15} /> عرض الموضوعات وإضافتها</button>
      </div> : <p className="mx-auto mt-1 max-w-sm text-[10px] leading-5 text-[#718196]">أضف موضوعاً مؤهلاً قبل تجهيز الدعوات وبدء الجلسة. الموضوع المرتجع أو المرفوض يُزال تلقائياً حفاظاً على سلامة الاجتماع.</p>}
    </div> : <div className="space-y-3">
      {items.map((item, index) => <article key={item.id} className="rounded-2xl border border-[#dfe9f2] bg-white p-4 shadow-[0_4px_16px_rgba(14,52,89,.04)]">
        <div className="flex items-start gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-[#e8f4ff] to-[#d9ecff] text-xs font-black text-[#0877d1]">{item.agenda_order}</span>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-black leading-6 text-[#0a1330]">{item.topic?.title_ar ?? "موضوع غير متاح"}</h4>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[9px] font-bold">
              {item.topic?.topic_no && <span className="rounded-full bg-slate-100 px-2 py-1 text-slate-600">{item.topic.topic_no}</span>}
              {item.topic?.category_name_ar && <span className="rounded-full bg-blue-50 px-2 py-1 text-blue-700">{item.topic.category_name_ar}</span>}
              {item.topic?.priority && <span className="rounded-full bg-orange-50 px-2 py-1 text-orange-700">{priorityLabels[item.topic.priority] ?? item.topic.priority}</span>}
              {item.is_exception && <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800">إدراج استثنائي</span>}
            </div>
            {item.topic?.submitted_by_name_ar && <p className="mt-2 text-[10px] text-[#718196]">مقدم الموضوع: <strong className="text-[#40566f]">{item.topic.submitted_by_name_ar}</strong></p>}
          </div>
          {editable && <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => onMove(index, -1)} disabled={busy || index === 0} title="نقل البند إلى أعلى" aria-label="نقل البند إلى أعلى" className="rounded-lg border border-[#dce8f2] p-2 text-[#0877d1] hover:bg-blue-50 disabled:opacity-30"><ArrowUp size={14} /></button>
            <button type="button" onClick={() => onMove(index, 1)} disabled={busy || index === items.length - 1} title="نقل البند إلى أسفل" aria-label="نقل البند إلى أسفل" className="rounded-lg border border-[#dce8f2] p-2 text-[#0877d1] hover:bg-blue-50 disabled:opacity-30"><ArrowDown size={14} /></button>
            <button type="button" onClick={() => onRemove(item.id)} disabled={busy} title="إزالة من جدول الأعمال" aria-label="إزالة من جدول الأعمال" className="rounded-lg border border-red-100 p-2 text-red-600 hover:bg-red-50 disabled:opacity-30"><Trash2 size={14} /></button>
          </div>}
        </div>
      </article>)}
    </div>}
  </section>;
}
