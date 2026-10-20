"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Clock3, MessageSquareText, RefreshCcw, Send, Settings2, type LucideIcon } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";

type Delivery = {
  id: string; recipient_name_ar: string; destination_masked: string | null;
  template_code: string; template_label: string; status_key: "accepted" | "queued" | "skipped" | "needs_review";
  status_label: string; error_message: string | null; created_at: string; accepted_at: string | null;
};

export type NotificationWorkspaceData = {
  channel: { code: string; label: string; connection_evidence: "messages_accepted" | "not_verified"; last_accepted_at: string | null };
  summary: { total: number; accepted: number; queued: number; needs_review: number; skipped: number };
  deliveries: Delivery[];
};

const templates = [
  ["دعوة اجتماع", "دعوة العضو مع رقم الاجتماع والمجلس والتاريخ والوقت والمكان."],
  ["تذكير باجتماع", "تذكير قبل الموعد مع تفاصيل الاجتماع المعتمدة."],
  ["قرب انتهاء دورة اجتماع", "تنبيه قيادة المجلس قبل انتهاء نافذة الدورة."],
  ["انتهاء دورة اجتماع", "تنبيه قيادة المجلس عند انتهاء النافذة دون تثبيت موعد."],
  ["تكليف جديد", "إشعار المكلّف برقم التكليف والقرار والموعد والملخص."],
  ["متابعة تكليف جديد", "إشعار المتابع بمسؤوليته عن متابعة التنفيذ."],
  ["قرب استحقاق تكليف", "تذكير المكلّف والمتابع قبل موعد الإنجاز."],
  ["تكليف متأخر", "تنبيه عند تجاوز موعد الإنجاز والتكليف ما زال مفتوحًا."],
  ["تكليف بانتظار التحقق", "إشعار المتابع بعد تسليم المكلّف للأدلة."],
  ["إعادة تكليف للاستكمال", "إشعار المكلّف بمراجعة الملاحظات واستكمال المطلوب."],
  ["اكتمال تكليف", "إشعار اعتماد الإنجاز للمكلّف والمتابع."],
] as const;

const tabs = [
  { value: "overview", label: "نظرة عامة" }, { value: "templates", label: "القوالب" },
  { value: "deliveries", label: "سجل الإرسال" }, { value: "settings", label: "الإعدادات" },
] as const;

function dateTime(value: string | null) {
  return value ? new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Riyadh" }).format(new Date(value)) : "لا يوجد";
}

function statusTone(status: Delivery["status_key"]): "success" | "warning" | "danger" | "neutral" {
  if (status === "accepted") return "success";
  if (status === "needs_review") return "danger";
  if (status === "queued") return "warning";
  return "neutral";
}

export function NotificationAdminWorkspace({ initialData, loadError = null }: { initialData: NotificationWorkspaceData | null; loadError?: string | null }) {
  const [tab, setTab] = useState<(typeof tabs)[number]["value"]>("overview");
  if (!initialData) return <Card><InlineMessage tone="error">{loadError ?? "تعذر تحميل إعدادات الإشعارات."}</InlineMessage><Button className="mt-4" variant="secondary" onClick={() => window.location.reload()}><RefreshCcw aria-hidden size={18} />إعادة المحاولة</Button></Card>;
  const { channel, summary, deliveries } = initialData;
  const stats: Array<[string, number, LucideIcon]> = [["إجمالي المحاولات",summary.total,Send],["تم الإرسال",summary.accepted,CheckCircle2],["في الانتظار",summary.queued,Clock3],["تحتاج مراجعة",summary.needs_review,AlertTriangle]];
  return <section className="space-y-5" aria-label="إدارة إشعارات واتساب">
    <SegmentedControl label="أقسام إدارة الإشعارات" options={tabs} value={tab} onChange={setTab} className="flex-wrap" />

    {tab === "overview" && <div className="space-y-5">
      <Card className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4"><span className="grid min-h-11 min-w-11 place-items-center rounded-q-control bg-q-success-soft text-q-success"><MessageSquareText aria-hidden /></span><div><h2 className="text-q-h3 font-bold">قناة واتساب</h2><p className="mt-1 text-q-ui text-q-text-2">{channel.connection_evidence === "messages_accepted" ? "توجد عمليات إرسال ناجحة" : "لم تُتحقق القناة بإرسال ناجح بعد"}</p><p className="mt-1 text-q-caption text-q-text-3">آخر قبول من الخدمة: {dateTime(channel.last_accepted_at)}</p></div></div>
        <Badge tone={channel.connection_evidence === "messages_accepted" ? "success" : "warning"}>{channel.connection_evidence === "messages_accepted" ? "تم التحقق بالإرسال" : "بانتظار التحقق"}</Badge>
      </Card>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map(([label,value,Icon])=><Card key={label}><div className="flex items-center justify-between"><div><p className="text-q-caption text-q-text-2">{label}</p><strong className="mt-2 block text-q-h2">{value}</strong></div><Icon aria-hidden className="text-q-link" /></div></Card>)}
      </div>
      {summary.needs_review > 0 && <InlineMessage tone="warning">توجد رسائل تحتاج مراجعة بشرية. لا تعِد إرسال الرسالة ذات النتيجة غير المؤكدة قبل التحقق من المستلم.</InlineMessage>}
    </div>}

    {tab === "templates" && <div className="grid gap-4 lg:grid-cols-2">
      {templates.map(([name,description])=><Card key={name}><div className="flex items-start justify-between gap-3"><div><h2 className="text-q-h3 font-bold">{name}</h2><p className="mt-2 text-q-ui text-q-text-2">{description}</p></div><Badge tone="success">معتمد</Badge></div><div className="mt-4 rounded-q-control bg-q-surface-2 p-4 text-q-ui"><strong>*قرار | {name}*</strong><p className="mt-2 text-q-text-2">تعرض الرسالة بياناتها الفعلية من نظام قرار.</p><p className="mt-3 text-q-caption italic text-q-text-3">نظام قرار - جامعة الرازي</p></div></Card>)}
    </div>}

    {tab === "deliveries" && <Card className="overflow-hidden p-0"><div className="border-b border-q-border p-5"><h2 className="text-q-h3 font-bold">آخر عمليات الإرسال</h2><p className="mt-1 text-q-ui text-q-text-2">الأرقام مقنّعة، ولا تظهر مفاتيح الخدمة أو معرفات المزود.</p></div>{deliveries.length===0?<p className="p-8 text-center text-q-ui text-q-text-2">لا توجد عمليات إرسال حتى الآن.</p>:<div className="divide-y divide-q-border">{deliveries.map(delivery=><article key={delivery.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-q-ui font-bold">{delivery.template_label}</h3><Badge tone={statusTone(delivery.status_key)}>{delivery.status_label}</Badge></div><p className="mt-2 text-q-ui text-q-text-2">{delivery.recipient_name_ar} · {delivery.destination_masked ?? "رقم غير متاح"}</p><p className="mt-1 text-q-caption text-q-text-3">أُنشئت في {dateTime(delivery.created_at)}</p>{delivery.error_message&&<InlineMessage tone="warning" className="mt-3">{delivery.error_message}</InlineMessage>}</div>{delivery.accepted_at&&<span className="text-q-caption text-q-success">قُبلت في {dateTime(delivery.accepted_at)}</span>}</article>)}</div>}</Card>}

    {tab === "settings" && <div className="grid gap-5 lg:grid-cols-2"><Card><div className="flex items-start gap-3"><Settings2 aria-hidden className="text-q-link"/><div><h2 className="text-q-h3 font-bold">رقم الإرسال والربط</h2><p className="mt-2 text-q-ui text-q-text-2">تغيير رقم الإرسال يتم بربط جلسة واتساب جديدة ومسح رمز QR، وليس بكتابة رقم يدوي يمكن انتحالُه.</p></div></div><InlineMessage className="mt-4">ستضاف عملية الربط والفصل في الدفعة التالية بعقد خادم مدقق. لا تُعرض أسرار OpenWA في المتصفح.</InlineMessage></Card><Card><h2 className="text-q-h3 font-bold">سياسة الإشعارات</h2><p className="mt-2 text-q-ui text-q-text-2">الأنواع الحالية: دعوات الاجتماعات، تذكيرات الدورات، ودورة التكليف من الإنشاء حتى اكتمال الإنجاز.</p><InlineMessage className="mt-4">تحرير مدد التذكير وتعطيل نوع محدد سيُفعّل بعد إضافة عقد حفظ ذري وسجل تدقيق.</InlineMessage></Card></div>}
  </section>;
}
