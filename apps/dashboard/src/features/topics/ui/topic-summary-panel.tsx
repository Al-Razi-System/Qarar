import {
  ArrowLeft, Check, Clock, Eye, FileQuestion, Forward, LoaderCircle,
  ShieldCheck, UserRound, X,
} from "lucide-react";
import {
  routingStatusLabel,
  topicCategoryName,
  topicUnitName,
  type ReviewAction,
  type TopicDetail,
} from "../model/topic-view";
import { TopicPriorityBadge, TopicRoutingBadge, TopicStatusBadge } from "./topic-status-badge";

type Props = {
  topic: TopicDetail | null;
  loading: boolean;
  reviewMode: boolean;
  busy: boolean;
  onReview: (action: ReviewAction) => void;
  onRefer: () => void;
  onOpenDetails: () => void;
};

function Fact({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ShieldCheck }) {
  return <div className="rounded-2xl border border-[#e2ebf3] bg-[#fbfdff] p-4">
    <span className="flex items-center gap-2 text-[10px] font-black text-[#6d7f94]"><Icon size={13} className="text-[#1680e5]" /> {label}</span>
    <strong className="mt-2 block text-xs leading-6 text-[#10243d]">{value}</strong>
  </div>;
}

export function TopicSummaryPanel({ topic, loading, reviewMode, busy, onReview, onRefer, onOpenDetails }: Props) {
  if (loading) return <section className="grid min-h-[500px] place-items-center rounded-3xl border border-[#dce7f1] bg-white"><LoaderCircle className="animate-spin text-[#0877df]" size={30} /></section>;
  if (!topic) return <section className="grid min-h-[500px] place-items-center rounded-3xl border border-[#dce7f1] bg-[radial-gradient(circle_at_top,#f4f9ff,#fff_62%)] p-8 text-center shadow-[0_14px_40px_rgba(13,42,76,.05)]"><div>
    <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-white text-[#76a3cc] shadow-[0_10px_30px_rgba(21,70,112,.1)]"><Eye size={27} /></span>
    <h3 className="mt-5 text-base font-black text-[#172a43]">اختر موضوعاً لعرض ملفه</h3>
    <p className="mx-auto mt-2 max-w-xs text-[11px] leading-6 text-[#75869a]">ستظهر بياناته النظامية، الجهة المسؤولة، حالة المسار، والإجراءات المتاحة حسب صلاحيتك.</p>
  </div></section>;

  const actions = new Set(topic.allowed_review_actions ?? []);
  const canApprove = reviewMode && actions.has("approve");
  const canReject = reviewMode && actions.has("reject");
  const canReturn = reviewMode && actions.has("return");
  const hasReviewAction = canApprove || canReject || canReturn;

  return <section className="overflow-hidden rounded-3xl border border-[#d6e4f0] bg-white shadow-[0_18px_50px_rgba(13,42,76,.08)]">
    <header className="relative overflow-hidden bg-[linear-gradient(125deg,#082d59,#086fce_66%,#1593ef)] px-6 py-6 text-white">
      <div className="absolute -left-12 -top-20 h-44 w-44 rounded-full border border-white/10" />
      <div className="relative">
        <div className="flex flex-wrap items-center gap-2"><TopicStatusBadge topic={topic} /><TopicPriorityBadge topic={topic} /><TopicRoutingBadge topic={topic} /></div>
        <h2 className="mt-4 text-lg font-black leading-8">{topic.title_ar}</h2>
        <p className="mt-1 text-[10px] font-bold text-white/70">{topic.topic_no ?? topic.id}</p>
      </div>
    </header>

    <div className="space-y-5 p-5">
      {topic.description && <div className="rounded-2xl border border-[#e3ebf3] bg-[#f8fbfe] p-4"><p className="text-[10px] font-black text-[#6d7f94]">وصف الموضوع</p><p className="mt-2 whitespace-pre-wrap text-xs leading-7 text-[#354a63]">{topic.description}</p></div>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Fact label="فئة الموضوع" value={topicCategoryName(topic)} icon={FileQuestion} />
        <Fact label="الجهة المسؤولة" value={topicUnitName(topic)} icon={ShieldCheck} />
        <Fact label="مقدم الموضوع" value={topic.submitted_by?.full_name_ar || topic.submitted_by_name_ar || "غير محدد"} icon={UserRound} />
        <Fact label="حالة المسار" value={routingStatusLabel(topic.routing_status)} icon={Forward} />
      </div>

      {topic.status === "returned" && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[11px] leading-6 text-amber-900"><strong>مطلوب استكمال:</strong> راجع سبب الإعادة في صفحة التفاصيل وسجل الحالة، ثم استكمل البيانات المطلوبة قبل إعادة الإرسال.</div>}

      {reviewMode && !hasReviewAction && <div className="rounded-2xl border border-[#dce6ef] bg-[#f8fafc] p-4 text-[11px] leading-6 text-[#617287]">لا توجد إجراءات مراجعة متاحة لهذه الحالة. قد يكون الموضوع حُسم أو أُعيد إلى مقدمه أو نُقل إلى مرحلة أخرى.</div>}
    </div>

    {hasReviewAction && <footer className="border-t border-[#e7eef5] bg-[#fbfcfe] p-5">
      <p className="mb-3 text-[10px] font-black text-[#60738a]">إجراءات المراجعة المتاحة</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {canApprove && <button title="اعتماد الموضوع مباشرة ونقله للمرحلة التالية" onClick={() => onReview("approve")} disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-[0_8px_20px_rgba(5,150,105,.18)] hover:bg-emerald-700 disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={15} /> : <Check size={15} />} اعتماد مباشر</button>}
        {canReturn && <button title="إعادة الموضوع لمقدمه مع تحديد البيانات الناقصة" onClick={() => onReview("return")} disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 text-xs font-black text-amber-900 hover:bg-amber-100 disabled:opacity-50"><Clock size={15} /> طلب استكمال</button>}
        {canReject && <button title="رفض الموضوع نهائياً مع توثيق السبب" onClick={() => onReview("reject")} disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-xs font-black text-red-700 hover:bg-red-100 disabled:opacity-50"><X size={15} /> رفض الموضوع</button>}
        <button title="إحالة الموضوع إلى جهة أخرى مخولة" onClick={onRefer} disabled={busy} className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#cbd9e8] bg-white px-4 text-xs font-black text-[#31516f] hover:border-[#0877df] hover:text-[#0877df] disabled:opacity-50"><Forward size={15} /> إحالة</button>
      </div>
    </footer>}

    <div className="border-t border-[#e7eef5] p-5"><button onClick={onOpenDetails} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#edf6ff] text-xs font-black text-[#0877df] transition hover:bg-[#dceeff]"><Eye size={15} /> فتح الملف الكامل وسجل الحالة <ArrowLeft size={14} /></button></div>
  </section>;
}
