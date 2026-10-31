"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, CheckCircle2, Clock3, FileCheck2, FileText, GitBranch,
  Landmark, LoaderCircle, Paperclip, RotateCcw, Route, UserRound, Vote,
} from "lucide-react";
import { topicsRpc } from "@/features/topics/api/topics-client";
import { meetingRpc } from "../api/meetings-client";
import { InstructionContent } from "@/shared/content/instruction-content";
import { AdministrativeTextArea } from "@/shared/ui/administrative-field";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Card } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { TopicPdfDownloadButton } from "@/features/topics/ui/topic-pdf-download-button";
import { MeetingMinutesDownloadButton } from "./meeting-minutes-download-button";
import type { AgendaCandidate } from "../model/meeting";

type TopicDetail = {
  id: string;
  topic_no?: string;
  title_ar: string;
  description?: string | null;
  status?: string;
  priority?: string;
  created_at?: string;
  submitted_at?: string;
  category?: { name_ar?: string } | null;
  governance_unit?: { name_ar?: string } | null;
  submitted_by?: { full_name_ar?: string } | null;
  typed_creation_request?: {
    snapshot?: {
      topic_type_name_ar?: string;
      classification_name_ar?: string;
      authoring?: {
        discussion_instructions?: string;
        required_attachment_count?: number;
        source_items?: Array<{ text?: string; source_document_name?: string; reference_number?: string }>;
      };
      authorities?: Array<{ source_document_name?: string; article_number?: string; authority_text?: string }>;
    };
  } | null;
};

type Workflow = { status?: string; steps?: WorkflowStep[] };
type WorkflowStep = { id: string; sequence_no?: number; status?: string; outcome_code?: string | null; opened_at?: string | null; acted_at?: string | null; snapshot?: { name_ar?: string } };
type TopicAttachment = { id: string; file_name: string; file_url: string; mime_type?: string; file_size_bytes?: number; description?: string | null };
type Referral = { id: string; from_unit_name_ar?: string; to_unit_name_ar?: string; status?: string; referral_reason?: string; referred_at?: string };
type MeetingHistory = {
  agenda_item_id: string;
  agenda_status?: string;
  discussion_notes?: string | null;
  meeting: { id: string; meeting_no?: string; title: string; status: string; scheduled_date?: string; unit_name?: string };
  minutes?: { id: string; status: string; content?: string | null; approved_at?: string | null; updated_at?: string | null } | null;
  voting_rounds: Array<{ id: string; round_number: number; status: string; result?: string | null; approve_count?: number; reject_count?: number; abstain_count?: number }>;
  decisions: Array<{ id: string; decision_no: string; decision_text: string; decision_status: string; issued_at?: string | null }>;
};
type ReturnOption = { available: boolean; reason_unavailable?: string | null; expected_version?: number; previous_unit_name_ar?: string | null };

type Tab = "summary" | "attachments" | "route" | "history";

const tabs = [
  { value: "summary", label: "الملخص" },
  { value: "attachments", label: "المرفقات" },
  { value: "route", label: "المسار" },
  { value: "history", label: "السجل السابق" },
] as const;

const priorityLabels: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };
const workflowStatusLabels: Record<string, string> = { completed: "مكتملة", active: "المرحلة الحالية", pending: "قادمة", rejected: "مرفوضة" };
const outcomeLabels: Record<string, string> = { approved: "موافقة", rejected: "رفض", completed: "مكتملة", tied: "تعادل" };

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeZone: "Asia/Riyadh" }).format(date);
}

function fileSizeLabel(value?: number) {
  if (!value) return "حجم غير متاح";
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} ك.ب`;
  return `${(value / (1024 * 1024)).toFixed(1)} م.ب`;
}

function Fact({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: string }) {
  return <div className="flex min-h-20 items-start gap-3 rounded-q-card bg-q-surface-2 p-4">
    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-q-control bg-q-surface text-q-link"><Icon size={20} /></span>
    <div className="min-w-0"><p className="text-q-caption text-q-text-3">{label}</p><p className="mt-1 break-words text-q-ui font-bold text-q-text">{value}</p></div>
  </div>;
}

function EmptySection({ icon: Icon, title, description }: { icon: typeof Paperclip; title: string; description: string }) {
  return <div className="grid min-h-48 place-items-center rounded-q-card border border-dashed border-q-border p-6 text-center">
    <div><Icon className="mx-auto text-q-text-3" size={28} /><h3 className="mt-3 text-q-h3 font-bold">{title}</h3><p className="mx-auto mt-2 max-w-xl text-q-ui text-q-text-2">{description}</p></div>
  </div>;
}

export function AgendaCandidateDetailsDialog({ candidate, meetingId, busy, onClose, onReview, onReturned, actionLabel = "مراجعة التعليمات والإدراج" }: {
  candidate: AgendaCandidate;
  meetingId?: string;
  busy: boolean;
  onClose: () => void;
  onReview: (candidate: AgendaCandidate) => void;
  onReturned?: () => void;
  actionLabel?: string;
}) {
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [attachments, setAttachments] = useState<TopicAttachment[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [history, setHistory] = useState<MeetingHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [sectionErrors, setSectionErrors] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("summary");
  const [returnOption, setReturnOption] = useState<ReturnOption | null>(null);
  const [returnMode, setReturnMode] = useState(false);
  const [returnReason, setReturnReason] = useState("");
  const [returnPending, setReturnPending] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true); setFatalError(null); setSectionErrors([]); setTopic(null); setWorkflow(null); setAttachments([]); setReferrals([]); setHistory([]); setReturnOption(null);
      try {
        const detail = await topicsRpc<TopicDetail>("get_topic_detail", { p_topic_id: candidate.id });
        if (!alive) return;
        setTopic(detail);
        const sections = await Promise.allSettled([
          topicsRpc<Workflow>("get_topic_workflow", { p_topic_id: candidate.id }),
          topicsRpc<TopicAttachment[]>("list_topic_attachments", { p_topic_id: candidate.id }),
          topicsRpc<Referral[]>("get_topic_route_history", { p_topic_id: candidate.id }),
          topicsRpc<MeetingHistory[]>("get_topic_meeting_history", { p_topic_id: candidate.id }),
          meetingId ? meetingRpc<ReturnOption>("get_topic_return_option", { p_topic_id: candidate.id, p_meeting_id: meetingId }) : Promise.resolve(null),
        ]);
        if (!alive) return;
        const labels = ["المسار", "المرفقات", "الإحالات", "الاجتماعات والقرارات السابقة"];
        sections.forEach((result, index) => {
          if (result.status === "rejected" && labels[index]) setSectionErrors((current) => [...current, `تعذر تحميل قسم ${labels[index]}. يمكنك إعادة المحاولة دون فقد بقية التفاصيل.`]);
        });
        if (sections[0].status === "fulfilled") setWorkflow(sections[0].value as Workflow);
        if (sections[1].status === "fulfilled") setAttachments((sections[1].value as TopicAttachment[]) ?? []);
        if (sections[2].status === "fulfilled") setReferrals((sections[2].value as Referral[]) ?? []);
        if (sections[3].status === "fulfilled") setHistory((sections[3].value as MeetingHistory[]) ?? []);
        if (sections[4].status === "fulfilled") setReturnOption(sections[4].value as ReturnOption | null);
      } catch (error) {
        if (alive) setFatalError(error instanceof Error ? error.message : "تعذر تحميل ملف الموضوع.");
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [candidate.id, meetingId, attempt]);

  async function submitReturn() {
    if (!returnOption?.available || returnOption.expected_version === undefined || returnReason.trim().length < 10) return;
    setReturnPending(true); setReturnError(null);
    try {
      await meetingRpc("return_topic_to_previous_council", {
        p_topic_id: candidate.id,
        p_reason: returnReason.trim(),
        p_idempotency_key: crypto.randomUUID(),
        p_expected_version: returnOption.expected_version,
      });
      onReturned?.();
    } catch (error) {
      setReturnError(error instanceof Error ? error.message : "تعذر إرجاع الموضوع. حدّث البيانات ثم أعد المحاولة.");
    } finally { setReturnPending(false); }
  }

  const sourceDecision = useMemo(() => history.flatMap((item) => item.decisions).at(0), [history]);
  const sourceMeeting = history.at(0)?.meeting;
  const snapshot = topic?.typed_creation_request?.snapshot;
  const topicType = snapshot?.topic_type_name_ar ?? topic?.category?.name_ar ?? "موضوع عام";
  const classification = snapshot?.classification_name_ar
    ?? (topic?.category?.name_ar && topic.category.name_ar !== topicType ? topic.category.name_ar : "غير محدد");

  return <Dialog
    title="تفاصيل الموضوع"
    description={`${candidate.topic_no ?? "موضوع مسجل"} · راجع المعلومات قبل الانتقال إلى تعليمات المناقشة`}
    size="xl"
    scrollContent
    onClose={onClose}
    closeDisabled={busy}
    footer={<div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-q-caption text-q-text-2">الإدراج يضيف الموضوع إلى هذا الاجتماع ولا يعني اعتماده.</p>
      <div className="flex flex-wrap items-start gap-3">
        <TopicPdfDownloadButton topicId={candidate.id} meetingId={meetingId} />
        {returnOption?.available && (
          <Button
            variant="danger"
            disabled={busy || loading}
            aria-label={`إرجاع إلى ${returnOption.previous_unit_name_ar ?? "المجلس السابق"}`}
            onClick={() => { setReturnMode(true); setReturnError(null); }}
          >
            إرجاع للمجلس السابق
            <RotateCcw size={18} />
          </Button>
        )}
        <Button variant="secondary" disabled={busy || returnPending} onClick={onClose}>إغلاق</Button>
        <Button pending={busy} disabled={loading || Boolean(fatalError) || returnPending} onClick={() => onReview(candidate)}>
          {actionLabel}
          <ArrowLeft size={18} />
        </Button>
      </div>
    </div>}
  >
    <div className="flex w-full flex-col gap-5">
      {returnMode && returnOption?.available && (
        <Card className="space-y-4 border-q-danger bg-q-danger-soft">
          <div>
            <h3 className="text-q-h3 font-bold text-q-danger">
              إرجاع الموضوع إلى {returnOption.previous_unit_name_ar ?? "المجلس السابق"}
            </h3>
            <p className="mt-2 text-q-ui text-q-text-2">
              سيخرج الموضوع من مقترحات هذا المجلس وتبدأ دورة مراجعة جديدة لدى المجلس السابق، مع بقاء قرارات الدورات السابقة محفوظة.
            </p>
          </div>
          <AdministrativeTextArea
            label="سبب الإرجاع"
            hint="سيظهر السبب في مسار الموضوع وسجل التدقيق. اكتب عشرة أحرف على الأقل."
            minLength={10}
            required
            value={returnReason}
            onChange={(event) => setReturnReason(event.target.value)}
            disabled={returnPending}
          />
          {returnError && <InlineMessage tone="error">{returnError}</InlineMessage>}
          <div className="flex flex-wrap gap-3">
            <Button
              variant="danger"
              pending={returnPending}
              pendingLabel="جارٍ إرجاع الموضوع…"
              disabled={returnReason.trim().length < 10}
              onClick={() => void submitReturn()}
            >
              تأكيد الإرجاع
            </Button>
            <Button
              variant="secondary"
              disabled={returnPending}
              onClick={() => { setReturnMode(false); setReturnReason(""); setReturnError(null); }}
            >
              إلغاء
            </Button>
          </div>
        </Card>
      )}
      <Card className="overflow-hidden p-0">
        <div className="border-t-4 border-q-primary p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-3xl"><div className="mb-3 flex flex-wrap gap-2"><Badge tone="info">{candidate.topic_no ?? "موضوع مسجل"}</Badge>{candidate.current_step && <Badge tone="warning">{candidate.current_step}</Badge>}{(topic?.priority || candidate.priority) && <Badge tone="neutral">أولوية {priorityLabels[topic?.priority ?? candidate.priority ?? ""] ?? topic?.priority ?? candidate.priority}</Badge>}</div><h2 className="text-q-h2 font-bold text-q-text">{candidate.title_ar}</h2><p className="mt-3 text-q-ui text-q-text-2">ملف موحد يوضح أصل الموضوع ومرفقاته ومساره وما سبق اتخاذه بشأنه.</p></div>
            <div className="min-w-64 rounded-q-card bg-q-surface-2 p-4"><p className="text-q-caption text-q-text-3">الجهة الحالية</p><p className="mt-1 text-q-ui font-bold text-q-text">{topic?.governance_unit?.name_ar ?? candidate.current_step ?? "المجلس الحالي"}</p></div>
          </div>
        </div>
        {(candidate.source_unit_name_ar || candidate.source_decision_no || sourceMeeting || sourceDecision) && <div className="grid gap-3 border-t border-q-border bg-q-surface-2 p-4 sm:grid-cols-3">
          <Fact icon={Landmark} label="وصل من" value={candidate.source_unit_name_ar ?? sourceMeeting?.unit_name ?? "جهة سابقة في المسار"} />
          <Fact icon={FileCheck2} label="اجتماع المصدر" value={candidate.source_meeting_title_ar ?? sourceMeeting?.title ?? candidate.source_meeting_no ?? "غير متاح"} />
          <Fact icon={CheckCircle2} label="القرار السابق" value={candidate.source_decision_no ?? sourceDecision?.decision_no ?? "لم يصدر قرار سابق"} />
        </div>}
      </Card>

      <SegmentedControl label="أقسام ملف الموضوع" options={tabs} value={tab} onChange={setTab} className="overflow-x-auto" />
      {loading && <Card className="grid min-h-48 place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-q-link" size={28} /><p className="mt-3 text-q-ui font-bold">جاري جمع ملف الموضوع…</p><p className="mt-1 text-q-caption text-q-text-2">الوصف والمرفقات والمسار والاجتماعات السابقة</p></div></Card>}
      {fatalError && <Card className="space-y-4"><InlineMessage tone="error">{fatalError}</InlineMessage><Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>إعادة تحميل ملف الموضوع</Button></Card>}
      {!loading && !fatalError && <>
        {sectionErrors.length > 0 && <Card className="space-y-3">{sectionErrors.map((error) => <InlineMessage key={error} tone="error">{error}</InlineMessage>)}<Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>إعادة تحميل الأقسام المتعثرة</Button></Card>}

        {tab === "summary" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)]">
          <Card><div className="mb-4 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-q-control bg-q-surface-2 text-q-link"><FileText size={20} /></span><div><h3 className="text-q-h3 font-bold">وصف الموضوع</h3><p className="text-q-caption text-q-text-2">النص الذي قدمه صاحب الموضوع</p></div></div><p className="whitespace-pre-wrap text-q-body leading-8 text-q-text">{topic?.description?.trim() || "لم يكتب مقدم الموضوع وصفًا إضافيًا."}</p></Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <Fact icon={UserRound} label="مقدم الموضوع" value={topic?.submitted_by?.full_name_ar ?? "غير متاح"} />
            <Fact icon={FileText} label="نوع الطلب" value={topicType} />
            <Fact icon={GitBranch} label="تصنيف الموضوع" value={classification} />
            <Fact icon={Clock3} label="تاريخ التقديم" value={dateLabel(topic?.submitted_at ?? topic?.created_at)} />
          </div>
          {(candidate.source_decision_text || sourceDecision?.decision_text) && <Card className="lg:col-span-2"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-q-caption text-q-text-2">نص القرار السابق</p><h3 className="mt-1 text-q-h3 font-bold">{candidate.source_decision_no ?? sourceDecision?.decision_no}</h3></div><Badge tone="success">موافقة سابقة موثقة</Badge></div><p className="mt-4 whitespace-pre-wrap border-r-4 border-q-success pr-4 text-q-body leading-8">{candidate.source_decision_text ?? sourceDecision?.decision_text}</p></Card>}
          {snapshot?.authoring?.discussion_instructions?.trim() && <Card className="lg:col-span-2"><div className="mb-4"><p className="text-q-caption text-q-text-2">قادمة من تصنيف الموضوع ويمكن تخصيصها لهذا الاجتماع في الخطوة التالية</p><h3 className="mt-1 text-q-h3 font-bold">تعليمات المناقشة الموروثة</h3></div><InstructionContent value={snapshot.authoring.discussion_instructions} /></Card>}
          {(snapshot?.authoring?.source_items?.length ?? 0) > 0 && <Card className="lg:col-span-2"><h3 className="text-q-h3 font-bold">المرجع النظامي للتصنيف</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{snapshot?.authoring?.source_items?.map((item, index) => <div key={`${item.reference_number}-${index}`} className="rounded-q-card bg-q-surface-2 p-4"><p className="text-q-caption text-q-text-2">{item.source_document_name ?? "مرجع تنظيمي"} · {item.reference_number ?? ""}</p><p className="mt-2 text-q-ui font-bold">{item.text}</p></div>)}</div></Card>}
          {(snapshot?.authorities?.length ?? 0) > 0 && <Card className="lg:col-span-2"><h3 className="text-q-h3 font-bold">السند والاختصاص</h3><div className="mt-4 grid gap-3 sm:grid-cols-2">{snapshot?.authorities?.map((authority, index) => <div key={`${authority.article_number}-${index}`} className="rounded-q-card border border-q-border p-4"><p className="text-q-caption text-q-text-2">{authority.source_document_name ?? "سند تنظيمي"}{authority.article_number ? ` · المادة ${authority.article_number}` : ""}</p><p className="mt-2 text-q-ui leading-7">{authority.authority_text ?? "لم يضف نص السند."}</p></div>)}</div></Card>}
        </div>}

        {tab === "attachments" && (attachments.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{attachments.map((attachment) => <Card key={attachment.id} className="flex flex-col gap-4"><div className="flex items-start gap-3"><span className="grid h-12 w-12 shrink-0 place-items-center rounded-q-control bg-q-surface-2 text-q-link"><Paperclip size={21} /></span><div className="min-w-0"><h3 className="break-words text-q-ui font-bold">{attachment.file_name}</h3><p className="mt-1 text-q-caption text-q-text-2">{attachment.mime_type ?? "ملف"} · {fileSizeLabel(attachment.file_size_bytes)}</p></div></div>{attachment.description && <p className="text-q-ui text-q-text-2">{attachment.description}</p>}<a href={attachment.file_url} target="_blank" rel="noopener noreferrer" className="mt-auto inline-flex min-h-11 items-center justify-center rounded-q-control border border-q-primary px-4 text-q-ui font-bold text-q-link">عرض المرفق</a></Card>)}</div> : <EmptySection icon={Paperclip} title="لا توجد مرفقات" description={`لا توجد ملفات مرتبطة بهذا الموضوع. يتطلب التصنيف ${snapshot?.authoring?.required_attachment_count ?? 0} مرفقًا على الأقل.`} />)}

        {tab === "route" && <div className="grid gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(18rem,1fr)]"><Card><div className="flex items-center gap-3"><Route className="text-q-link" size={22} /><div><h3 className="text-q-h3 font-bold">مسار الاعتماد</h3><p className="text-q-caption text-q-text-2">موقع الموضوع الآن وما سبقه وما ينتظره</p></div></div>{workflow?.steps?.length ? <ol className="mt-5 space-y-3">{[...workflow.steps].sort((a, b) => (a.sequence_no ?? 0) - (b.sequence_no ?? 0)).map((step) => <li key={step.id} className="flex gap-4 rounded-q-card border border-q-border p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-full font-bold ${step.status === "active" ? "bg-q-primary text-q-on-primary" : step.status === "completed" ? "bg-q-success-soft text-q-success" : "bg-q-neutral-soft text-q-text-2"}`}>{step.sequence_no ?? "•"}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-q-ui font-bold">{step.snapshot?.name_ar ?? "مرحلة في المسار"}</h4><Badge tone={step.status === "completed" ? "success" : step.status === "active" ? "info" : "neutral"}>{workflowStatusLabels[step.status ?? ""] ?? "بانتظار دورها"}</Badge></div>{step.outcome_code && <p className="mt-2 text-q-caption text-q-text-2">النتيجة: {outcomeLabels[step.outcome_code] ?? step.outcome_code}</p>}</div></li>)}</ol> : <EmptySection icon={Route} title="تعذر عرض خطوات المسار" description="أعد تحميل الأقسام للتحقق من مسار الموضوع." />}</Card><Card><h3 className="text-q-h3 font-bold">الإحالات</h3>{referrals.length ? <div className="mt-4 space-y-3">{referrals.map((referral) => <div key={referral.id} className="rounded-q-card bg-q-surface-2 p-4"><p className="text-q-ui font-bold">{referral.from_unit_name_ar ?? "جهة سابقة"} ← {referral.to_unit_name_ar ?? "جهة محال إليها"}</p><p className="mt-2 text-q-caption text-q-text-2">{referral.referral_reason ?? "دون ملاحظة إحالة"}</p></div>)}</div> : <p className="mt-3 text-q-ui text-q-text-2">لا توجد إحالات جانبية؛ الموضوع يتحرك في مساره الأصلي.</p>}</Card></div>}

        {tab === "history" && (history.length ? <div className="space-y-5">{history.map((entry) => <Card key={entry.agenda_item_id}><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-q-caption text-q-text-2">{entry.meeting.unit_name ?? "مجلس سابق"} · {entry.meeting.meeting_no ?? ""}</p><h3 className="mt-1 text-q-h3 font-bold">{entry.meeting.title}</h3><p className="mt-1 text-q-caption text-q-text-2">{dateLabel(entry.meeting.scheduled_date)}</p></div><Badge tone="success">نوقش سابقًا</Badge></div>{entry.discussion_notes && <div className="mt-4 rounded-q-card bg-q-surface-2 p-4"><p className="text-q-caption text-q-text-2">خلاصة المناقشة</p><p className="mt-2 whitespace-pre-wrap text-q-ui leading-7">{entry.discussion_notes}</p></div>}<div className="mt-4 grid gap-4 lg:grid-cols-2">{entry.voting_rounds.map((round) => <div key={round.id} className="rounded-q-card border border-q-border p-4"><div className="flex items-center gap-2"><Vote className="text-q-link" size={19} /><h4 className="text-q-ui font-bold">نتيجة التصويت</h4></div><div className="mt-3 flex flex-wrap gap-2"><Badge tone="success">{round.approve_count ?? 0} موافق</Badge><Badge tone="danger">{round.reject_count ?? 0} غير موافق</Badge><Badge tone="neutral">{round.abstain_count ?? 0} ممتنع</Badge></div></div>)}{entry.decisions.map((decision) => <div key={decision.id} className="rounded-q-card border border-q-border p-4"><div className="flex items-center justify-between gap-2"><h4 className="text-q-ui font-bold">{decision.decision_no}</h4><Badge tone="success">قرار صادر</Badge></div><p className="mt-3 whitespace-pre-wrap text-q-ui leading-7">{decision.decision_text}</p></div>)}</div>{entry.minutes && <div className="mt-4 rounded-q-card border border-q-border bg-q-surface-2 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-q-caption text-q-text-2">محضر المجلس السابق</p><h4 className="mt-1 text-q-ui font-bold">{entry.minutes.status === "approved" ? "محضر معتمد" : "المحضر قيد الاعتماد"}</h4></div>{entry.minutes.status === "approved" && <MeetingMinutesDownloadButton meetingId={entry.meeting.id} meetingTitle={entry.meeting.title} />}</div>{entry.minutes.content ? <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-q-ui leading-7 text-q-text-2">{entry.minutes.content}</p> : <InlineMessage className="mt-3" tone="warning">يظهر نص المحضر وتنزيله بعد اكتمال المصادقة واعتماده.</InlineMessage>}</div>}</Card>)}</div> : <EmptySection icon={Vote} title="لم يناقش الموضوع في اجتماع سابق" description="هذا أول مجلس يناقش الموضوع، لذلك لا توجد نتائج تصويت أو قرارات سابقة." />)}
      </>}
    </div>
  </Dialog>;
}
