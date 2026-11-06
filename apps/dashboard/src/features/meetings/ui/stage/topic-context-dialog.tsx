"use client";
import { InstructionContent } from "@/shared/content/instruction-content";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import type { MeetingTopicContext } from "../../model/live-meeting";

const statusLabels: Record<string, string> = { pending: "لم تبدأ", active: "قيد المعالجة", completed: "مكتملة", returned: "أُعيدت للاستكمال", rejected: "مرفوضة", cancelled: "ملغاة", skipped: "محتسبة سابقًا" };
const date = (value: string) => new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00`));

export function TopicContextDialog({ title, context, onClose }: { title: string; context: MeetingTopicContext; onClose: () => void }) {
  return <Dialog size="full" title={`تفاصيل الموضوع ومساره — ${title}`} description="قراءة من سياق الموضوع المدرج في الاجتماع؛ لا تغيّر عرضه أو مرحلته عند بقية الأعضاء." onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>العودة إلى الاجتماع</Button>}>
    <div className="mx-auto grid w-full max-w-5xl gap-4 lg:grid-cols-2">
      <Card className="min-w-0"><h3 className="m-0 mb-3 text-q-h3 font-bold">تفاصيل الموضوع المقدمة</h3>{context.description ? <InstructionContent value={context.description} /> : <p className="m-0 text-q-ui text-q-text-2">لم يُسجَّل وصف لهذا الموضوع.</p>}</Card>
      <Card className="min-w-0"><h3 className="m-0 mb-3 text-q-h3 font-bold">مسار الموضوع بين المجالس</h3>
        {context.route.length === 0 ? <p className="m-0 text-q-ui text-q-text-2">لا توجد مراحل تنفيذ مسجلة لهذا الموضوع.</p> : <ol className="m-0 flex list-none flex-col gap-3 p-0">{context.route.map(step => <li key={step.id} className="rounded-q-control border border-q-border bg-q-surface-2 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="m-0 text-q-ui font-bold">{step.sequence_no}. {step.unit_name_ar ?? step.name_ar ?? "مرحلة المسار"}</h4><Badge tone={step.current ? "info" : step.status === "completed" || step.status === "skipped" ? "success" : "neutral"}>{step.current ? "المرحلة الحالية" : statusLabels[step.status] ?? "مرحلة مسجلة"}</Badge></div>
          {step.name_ar && <p className="m-0 mt-1 text-q-caption text-q-text-2">{step.name_ar}</p>}
        </li>)}</ol>}
      </Card>
      <Card className="min-w-0 lg:col-span-2"><h3 className="m-0 mb-3 text-q-h3 font-bold">قرارات المجالس السابقة</h3>
        {context.previous_decisions.length === 0 ? <p className="m-0 text-q-ui text-q-text-2">لا قرارات من اجتماعات مغلقة سابقة لهذا الموضوع.</p> : <div className="flex flex-col gap-3">{context.previous_decisions.map(decision => <article key={decision.id} className="rounded-q-control border border-q-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="m-0 text-q-ui font-bold">{decision.unit_name_ar ?? decision.meeting_title_ar}</h4><Badge tone="success">{decision.decision_no}</Badge></div>
          <p className="m-0 mt-1 flex flex-wrap items-center gap-2 text-q-caption text-q-text-2"><span dir="ltr">{decision.meeting_no}</span><span aria-hidden="true">·</span><time dateTime={decision.meeting_date}>{date(decision.meeting_date)}</time></p>
          <p className="m-0 mt-3 whitespace-pre-wrap text-q-body">{decision.decision_text}</p>
        </article>)}</div>}
      </Card>
    </div>
  </Dialog>;
}
