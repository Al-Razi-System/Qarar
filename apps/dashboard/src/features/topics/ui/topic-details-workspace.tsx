"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, CheckCircle2, CircleAlert, ClipboardCheck, FileText,
  FolderOpen, Gavel, GitPullRequestArrow, Landmark, LoaderCircle, Paperclip,
  Route, ShieldCheck, Vote,
} from "lucide-react";
import { readUploadResponse } from "@/shared/api/upload-response";

type TopicDetail = {
  id: string;
  topic_no?: string;
  title_ar: string;
  description?: string | null;
  status: string;
  priority: string;
  source_type?: string;
  created_at?: string;
  category_id?: string;
  current_unit_id?: string;
  policy_id?: string | null;
  policy_version_id?: string | null;
  policy_item_id?: string | null;
  policy_scope_assignment_id?: string | null;
  routing_status?: string | null;
  governance_source?: string | null;
  category?: { name_ar?: string };
  governance_unit?: { name_ar?: string };
  history?: ActivityItem[];
};

type ActivityItem = {
  id: string;
  from_status?: string | null;
  to_status: string;
  change_reason?: string | null;
  changed_at?: string;
  changed_by_name_ar?: string | null;
};

type RegulationPreview = {
  article?: { title?: string; official_text?: string; interpretation?: string | null };
  rule_summary?: Array<{ name?: string; description?: string }>;
  scope?: { target_name?: string; description?: string };
  workflow?: { name?: string; description?: string };
  requirements?: Array<{ name?: string; type?: string; mandatory?: boolean; timing?: string | null }>;
  attachments?: Array<{ name?: string; description?: string | null }>;
  approval_effect?: string;
  voting_effect?: string;
};

type Workflow = {
  status?: string;
  steps?: Array<{
    id: string;
    sequence_no?: number;
    status?: string;
    opened_at?: string | null;
    acted_at?: string | null;
    outcome_code?: string | null;
    comment?: string | null;
    required_permission_code?: string | null;
    action_version?: number | null;
    snapshot?: { name_ar?: string; allowed_outcomes?: string[] };
  }>;
};

type WorkflowOutcome = "approved" | "rejected" | "completed";

type Referral = {
  id: string;
  from_unit_name_ar?: string;
  to_unit_name_ar?: string;
  status?: string;
  referral_reason?: string;
  referred_at?: string;
  responded_at?: string | null;
};
type TopicAttachment = { id: string; file_name: string; file_url: string; description?: string | null; file_size_bytes?: number; created_at?: string };
type RequirementStatus = { code: string; name: string; type: string; mandatory: boolean; timing: string; status: "pending" | "fulfilled" | "waived"; note?: string | null; attachment_id?: string | null };
type RequirementsStatus = { items: RequirementStatus[]; missing_mandatory: number; ready_for_review: boolean };
type RegulationReference = { id: string; label: string; reference_type: string; is_primary: boolean; policy_name?: string; version_no?: number; item_code?: string | null; item_title?: string | null };
type TopicMeetingHistory = { agenda_item_id: string; agenda_status: string; discussion_notes?: string | null; meeting: { id: string; meeting_no?: string; title: string; status: string; scheduled_date?: string; unit_name?: string }; voting_rounds: Array<{ id: string; round_number: number; status: string; result?: string | null; eligible_voter_count?: number; approve_count?: number; reject_count?: number; abstain_count?: number; opened_at?: string; closed_at?: string | null }>; decisions: Array<{ id: string; decision_no: string; decision_text: string; decision_status: string; requires_approval: boolean; issued_at?: string | null }> };
type PriorRouteAttachment = { id: string; file_name: string; file_url: string; mime_type: string; file_size_bytes?: number };
type PriorRouteStep = { id: string; sequence_no: number; step_title: string; responsible_unit_name_ar?: string | null; meeting_date: string; meeting_reference?: string | null; decision_type: string; decision_text: string; bypass_reason: string; attachments: PriorRouteAttachment[] };
type PriorRouteRequest = { id: string; topic_id: string; status: string; is_requester: boolean; submitted_at?: string | null; reviewed_at?: string | null; review_comment?: string | null; steps: PriorRouteStep[] };
type PriorRouteCouncil = PriorRouteStep & { evidence_ids: string[]; covered_step_titles: string[]; all_steps_have_evidence: boolean };

type TabId = "summary" | "regulation" | "requirements" | "workflow" | "referrals" | "decisions" | "activity";
type Notice = { kind: "error"; text: string } | null;

const tabs: Array<{ id: TabId; label: string; icon: typeof FileText }> = [
  { id: "summary", label: "الملخص", icon: FileText },
  { id: "regulation", label: "اللائحة والمادة", icon: Landmark },
  { id: "requirements", label: "المتطلبات والمرفقات", icon: Paperclip },
  { id: "workflow", label: "مسار الاعتماد", icon: Route },
  { id: "referrals", label: "الإحالات", icon: GitPullRequestArrow },
  { id: "decisions", label: "القرارات والتصويت", icon: Vote },
  { id: "activity", label: "سجل النشاط والتدقيق", icon: Activity },
];

const statusLabels: Record<string, string> = {
  draft: "مسودة", new: "بانتظار المراجعة", pending_review: "بانتظار المراجعة", under_review: "قيد المراجعة",
  returned: "مطلوب استكمال", approved: "معتمد للمسار", rejected: "مرفوض", needs_info: "مطلوب استكمال", referred: "محال",
  active: "نشط", pending: "بانتظار المرحلة السابقة", blocked: "المسار متوقف مؤقتاً", completed: "مكتمل", not_started: "لم يبدأ", routing_pending: "المسار قيد الاستكمال", routing_blocked: "المسار متوقف", routing_exception_pending: "بانتظار اعتماد الاستثناء",
  routing_ready: "المسار جاهز", deferred: "مؤجل", listed: "مدرج في اجتماع", in_process: "قيد المعالجة",
  postponed: "مؤجل للاجتماع", closed: "مغلق",
};

const priorityLabels: Record<string, string> = { low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة" };
const decisionTypeLabels: Record<string, string> = { approved: "موافقة", recommended: "توصية بالموافقة", rejected: "رفض", deferred: "تأجيل", returned: "إعادة للاستكمال" };
const activityReasonLabels: Record<string, string> = { "topic created": "تم إنشاء الموضوع" };

function topicDisplayStatus(topicStatus: string, priorRouteRequest: PriorRouteRequest | null) {
  if (priorRouteRequest?.status === "draft") {
    const missingEvidence = priorRouteRequest.steps.some((step) => step.attachments.length === 0);
    return missingEvidence ? "مطلوب استكمال أدلة المجالس السابقة" : "جاهز لإرسال الأدلة";
  }
  if (priorRouteRequest?.status === "submitted") return "بانتظار مراجعة أدلة المسار السابق";
  if (priorRouteRequest?.status === "rejected") return "أدلة المسار بحاجة لتصحيح";
  return statusLabels[topicStatus] ?? "حالة موضوع غير معرّفة";
}

function workflowDisplayStatus(workflowStatus: string | undefined, priorRouteRequest: PriorRouteRequest | null) {
  if (priorRouteRequest?.status === "draft") return "بانتظار استكمال أدلة المجالس السابقة";
  if (priorRouteRequest?.status === "submitted") return "بانتظار مراجعة أدلة المسار السابق";
  if (priorRouteRequest?.status === "rejected") return "أدلة المسار بحاجة لتصحيح";
  if (priorRouteRequest?.status === "approved") return "المراحل السابقة معتمدة والمسار نشط";
  return workflowStatus ? statusLabels[workflowStatus] ?? "حالة المسار غير معرّفة" : "بانتظار بدء المسار";
}

async function rpc<T>(contract: string, params: Record<string, unknown>) {
  const response = await fetch("/api/admin/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تحميل تفاصيل الموضوع.");
  return payload.data as T;
}

function dateLabel(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-YE", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function groupPriorRouteCouncils(steps: PriorRouteStep[]): PriorRouteCouncil[] {
  const groups: PriorRouteCouncil[] = [];
  for (const step of [...steps].sort((left, right) => left.sequence_no - right.sequence_no)) {
    const previous = groups.at(-1);
    const sameMeeting = previous
      && previous.responsible_unit_name_ar === step.responsible_unit_name_ar
      && previous.meeting_date === step.meeting_date
      && previous.meeting_reference === step.meeting_reference
      && previous.decision_type === step.decision_type
      && previous.decision_text === step.decision_text
      && previous.bypass_reason === step.bypass_reason;
    if (!sameMeeting) {
      groups.push({ ...step, evidence_ids: [step.id], covered_step_titles: [step.step_title], all_steps_have_evidence: step.attachments.length > 0 });
      continue;
    }
    previous.evidence_ids.push(step.id);
    previous.all_steps_have_evidence = previous.all_steps_have_evidence && step.attachments.length > 0;
    if (!previous.covered_step_titles.includes(step.step_title)) previous.covered_step_titles.push(step.step_title);
    const attachmentIds = new Set(previous.attachments.map((attachment) => attachment.id));
    previous.attachments.push(...step.attachments.filter((attachment) => !attachmentIds.has(attachment.id)));
  }
  return groups;
}

function EmptyState({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) {
  return <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-[#caddec] bg-[#fbfdff] p-8 text-center">
    <div><Icon className="mx-auto text-[#82a3c3]" size={32} /><h3 className="mt-3 text-sm font-black text-[#193451]">{title}</h3><p className="mt-2 max-w-lg text-xs leading-6 text-[#72839a]">{description}</p></div>
  </div>;
}

export function TopicDetailsWorkspace({ topicId }: { topicId: string }) {
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [preview, setPreview] = useState<RegulationPreview | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [attachments, setAttachments] = useState<TopicAttachment[]>([]);
  const [requirementsStatus, setRequirementsStatus] = useState<RequirementsStatus | null>(null);
  const [regulationReferences, setRegulationReferences] = useState<RegulationReference[]>([]);
  const [meetingHistory, setMeetingHistory] = useState<TopicMeetingHistory[]>([]);
  const [priorRouteRequest, setPriorRouteRequest] = useState<PriorRouteRequest | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [workflowBusy, setWorkflowBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true); setNotice(null);
      try {
        const detail = await rpc<TopicDetail>("get_topic_detail", { p_topic_id: topicId });
        if (!alive) return;
        setTopic(detail);
        const background: Promise<void>[] = [
          rpc<Workflow>("get_topic_workflow", { p_topic_id: topicId }).then((data) => { if (alive) setWorkflow(data); }).catch(() => undefined),
          rpc<Referral[]>("get_topic_route_history", { p_topic_id: topicId }).then((data) => { if (alive) setReferrals(data ?? []); }).catch(() => undefined),
          rpc<TopicAttachment[]>("list_topic_attachments", { p_topic_id: topicId }).then((data) => { if (alive) setAttachments(data ?? []); }).catch(() => undefined),
          rpc<RequirementsStatus>("get_topic_requirements_status", { p_topic_id: topicId }).then((data) => { if (alive) setRequirementsStatus(data); }).catch(() => undefined),
          rpc<RegulationReference[]>("list_topic_regulation_references", { p_topic_id: topicId }).then((data) => { if (alive) setRegulationReferences(data ?? []); }).catch(() => undefined),
          rpc<TopicMeetingHistory[]>("get_topic_meeting_history", { p_topic_id: topicId }).then((data) => { if (alive) setMeetingHistory(data ?? []); }).catch(() => undefined),
          rpc<PriorRouteRequest | null>("get_topic_prior_route_request", { p_topic_id: topicId }).then((data) => { if (alive) setPriorRouteRequest(data); }).catch(() => undefined),
        ];
        if (detail.policy_id && detail.policy_version_id && detail.policy_item_id && detail.policy_scope_assignment_id && detail.current_unit_id && detail.category_id) {
          background.push(rpc<RegulationPreview>("get_topic_regulation_preview", {
            p_governance_unit_id: detail.current_unit_id,
            p_topic_category_id: detail.category_id,
            p_priority: detail.priority,
            p_source_type: detail.source_type ?? "new",
            p_effective_on: (detail.created_at ?? new Date().toISOString()).slice(0, 10),
            p_policy_id: detail.policy_id,
            p_policy_version_id: detail.policy_version_id,
            p_policy_item_id: detail.policy_item_id,
            p_scope_assignment_id: detail.policy_scope_assignment_id,
          }).then((data) => { if (alive) setPreview(data); }).catch(() => undefined));
        }
        await Promise.all(background);
      } catch (error) {
        if (alive) setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل تفاصيل الموضوع." });
      } finally {
        if (alive) setLoading(false);
      }
    }
    void load();
    return () => { alive = false; };
  }, [topicId]);

  const currentStep = useMemo(() => workflow?.steps?.find((step) => step.status === "active"), [workflow]);

  async function actOnWorkflow(outcome: WorkflowOutcome) {
    if (!currentStep) return;
    const comment = window.prompt(outcome === "rejected" ? "سبب الرفض:" : "ملاحظة الإجراء (اختيارية):", "");
    if (outcome === "rejected" && !comment?.trim()) return;
    setWorkflowBusy(true); setNotice(null);
    try {
      await rpc("act_topic_workflow_step", { p_topic_id: topicId, p_outcome_code: outcome, p_comment: comment?.trim() || null, p_idempotency_key: crypto.randomUUID(), p_expected_version: currentStep.action_version ?? null });
      setWorkflow(await rpc<Workflow>("get_topic_workflow", { p_topic_id: topicId }));
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تنفيذ إجراء المسار." }); }
    finally { setWorkflowBusy(false); }
  }

  async function uploadAttachment(file: File, requirementCode?: string) {
    setAttachmentBusy(true); setNotice(null);
    try {
      const form = new FormData(); form.set("file", file); form.set("topicId", topicId); if (requirementCode) form.set("requirementCode", requirementCode);
      const response = await fetch("/api/admin/topics/upload", { method: "POST", body: form });
      await readUploadResponse(response);
      setAttachments(await rpc<TopicAttachment[]>("list_topic_attachments", { p_topic_id: topicId }));
      setRequirementsStatus(await rpc<RequirementsStatus>("get_topic_requirements_status", { p_topic_id: topicId }));
    } catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر رفع الملف." }); }
    finally { setAttachmentBusy(false); }
  }

  async function refreshPriorRouteRequest() {
    setPriorRouteRequest(await rpc<PriorRouteRequest | null>("get_topic_prior_route_request", { p_topic_id: topicId }));
  }

  async function uploadPriorRouteEvidence(council: PriorRouteCouncil, file: File) {
    setAttachmentBusy(true); setNotice(null);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("topicId", topicId);
      form.set("description", `محضر مجلس سابق: ${council.responsible_unit_name_ar || council.step_title}`);
      const response = await fetch("/api/admin/topics/upload", { method: "POST", body: form });
      const payload = await readUploadResponse<{ attachment?: { id?: string } }>(response);
      const attachmentId = String(payload.attachment?.id ?? "");
      if (!attachmentId) throw new Error("رُفع الملف دون معرف صالح للمرفق.");
      for (const evidenceId of council.evidence_ids) {
        await rpc("add_prior_route_evidence_attachment", { p_step_evidence_id: evidenceId, p_topic_attachment_id: attachmentId });
      }
      await refreshPriorRouteRequest();
      setAttachments(await rpc<TopicAttachment[]>("list_topic_attachments", { p_topic_id: topicId }));
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر رفع محضر المجلس السابق." });
    } finally { setAttachmentBusy(false); }
  }

  async function submitPriorRouteRequest() {
    if (!priorRouteRequest) return;
    setAttachmentBusy(true); setNotice(null);
    try {
      await rpc("submit_topic_prior_route_request", { p_request_id: priorRouteRequest.id });
      await refreshPriorRouteRequest();
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إرسال إثباتات المجالس السابقة." });
    } finally { setAttachmentBusy(false); }
  }

  async function removeAttachment(attachmentId: string) {
    if (!window.confirm("هل تريد حذف هذا المرفق؟")) return;
    setAttachmentBusy(true); setNotice(null);
    try {
      await rpc("remove_topic_attachment", { p_attachment_id: attachmentId });
      setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
      setRequirementsStatus(await rpc<RequirementsStatus>("get_topic_requirements_status", { p_topic_id: topicId }));
    }
    catch (error) { setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر حذف المرفق." }); }
    finally { setAttachmentBusy(false); }
  }

  async function fulfillRequirement(requirementCode: string) {
    setAttachmentBusy(true); setNotice(null);
    try {
      await rpc("fulfill_topic_requirement", {
        p_topic_id: topicId,
        p_requirement_code: requirementCode,
        p_evidence: { source: "topic_details", confirmed_at: new Date().toISOString() },
      });
      setRequirementsStatus(await rpc<RequirementsStatus>("get_topic_requirements_status", { p_topic_id: topicId }));
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تأكيد استيفاء المتطلب." });
    } finally { setAttachmentBusy(false); }
  }
  const headerPath = [
    topic?.title_ar || "الموضوع",
    topic?.policy_id ? "اللائحة الحاكمة" : "بانتظار تحديد اللائحة",
    topic?.policy_version_id ? "الإصدار النافذ" : null,
    preview?.article?.title || (topic?.policy_item_id ? "المادة الحاكمة" : null),
    currentStep ? `الخطوة ${currentStep.sequence_no ?? "الحالية"}` : workflowDisplayStatus(workflow?.status, priorRouteRequest),
  ].filter(Boolean);

  if (loading) return <div className="grid min-h-[520px] place-items-center rounded-3xl border border-[#dce7f1] bg-white"><LoaderCircle className="animate-spin text-[#0066cc]" size={30} /></div>;
  if (!topic) return <div className="space-y-4"><Link href="/admin/topics" className="inline-flex items-center gap-2 text-xs font-bold text-[#0066cc]"><ArrowRight size={15} /> العودة إلى الموضوعات</Link><EmptyState icon={CircleAlert} title="تعذر العثور على الموضوع" description={notice?.text ?? "قد لا تملك صلاحية عرض هذا الموضوع أو لم يعد موجودًا."} /></div>;

  return <div className="space-y-5">
    <Link href="/admin/topics" className="inline-flex items-center gap-2 text-xs font-bold text-[#0066cc] transition hover:text-[#004f9f]"><ArrowRight size={15} /> العودة إلى الموضوعات</Link>
    {notice && <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-800"><CircleAlert size={16} />{notice.text}</div>}

    <header className="overflow-hidden rounded-3xl border border-[#dce7f1] bg-white shadow-[0_10px_28px_rgba(24,48,80,.06)]">
      <div className="border-b border-[#e8eef5] bg-[linear-gradient(120deg,#0a1330_0%,#0066cc_68%,#1e88e5_100%)] px-5 py-5 text-white sm:px-7">
        <p className="text-[10px] font-black text-[#ffbb78]">تفاصيل الموضوع</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-xl font-black sm:text-2xl">{topic.title_ar}</h1><p className="mt-1 text-[11px] text-white/75">{topic.topic_no ?? "موضوع مسجل"} · أنشئ في {dateLabel(topic.created_at)}</p></div><span className="rounded-full bg-white/15 px-3 py-1.5 text-[10px] font-black text-white">{topicDisplayStatus(topic.status, priorRouteRequest)}</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-4 text-[11px] font-bold text-[#526f8c] sm:px-7" aria-label="سلسلة حوكمة الموضوع">
        {headerPath.map((item, index) => <span key={`${item}-${index}`} className="flex items-center gap-2"><span className={index === 0 ? "text-[#0a1330]" : ""}>{item}</span>{index < headerPath.length - 1 && <span className="text-[#9aabc0]">←</span>}</span>)}
      </div>
    </header>

    <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[#e0e9f2] bg-white p-1.5 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setActiveTab(id)} className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 text-[11px] font-black transition ${activeTab === id ? "bg-[#0066cc] text-white shadow-[0_5px_14px_rgba(0,102,204,.22)]" : "text-[#5d7188] hover:bg-[#f4f8fc]"}`}><Icon size={14} />{label}</button>)}
    </div>

    <section className="rounded-3xl border border-[#dce7f1] bg-white p-5 shadow-[0_10px_28px_rgba(24,48,80,.045)] sm:p-7">
      {activeTab === "summary" && <Summary topic={topic} workflow={workflow} preview={preview} priorRouteRequest={priorRouteRequest} />}
      {activeTab === "regulation" && <Regulation topic={topic} preview={preview} references={regulationReferences} />}
      {activeTab === "requirements" && <Requirements preview={preview} requirementsStatus={requirementsStatus} attachments={attachments} priorRouteRequest={priorRouteRequest} busy={attachmentBusy} onUpload={uploadAttachment} onUploadPriorEvidence={uploadPriorRouteEvidence} onSubmitPriorRoute={submitPriorRouteRequest} onRemove={removeAttachment} onFulfill={fulfillRequirement} />}
      {activeTab === "workflow" && <Workflow workflow={workflow} priorRouteRequest={priorRouteRequest} busy={workflowBusy} onAction={actOnWorkflow} />}
      {activeTab === "referrals" && <Referrals referrals={referrals} />}
      {activeTab === "decisions" && <Decisions preview={preview} meetings={meetingHistory} priorRouteRequest={priorRouteRequest} />}
      {activeTab === "activity" && <ActivityLog items={topic.history ?? []} priorRouteRequest={priorRouteRequest} topicCreatedAt={topic.created_at} />}
    </section>
  </div>;
}

function Summary({ topic, workflow, preview, priorRouteRequest }: { topic: TopicDetail; workflow: Workflow | null; preview: RegulationPreview | null; priorRouteRequest: PriorRouteRequest | null }) {
  const latestReturn = [...(topic.history ?? [])].reverse().find((item) => item.to_status === "returned");
  return <div className="space-y-6">
    <SectionTitle icon={ClipboardCheck} title="ملخص الموضوع" description="نظرة سريعة على بيانات الموضوع وحالته الحاكمة الحالية." />
    {topic.status === "returned" && <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <p className="text-[10px] font-black text-amber-700">إجراء مطلوب من مقدم الموضوع</p>
      <h3 className="mt-1 text-sm font-black">استكمال البيانات وإعادة الإرسال</h3>
      <p className="mt-2 text-xs leading-7">{latestReturn?.change_reason || "أُعيد الموضوع لاستكمال بيانات أو مرفقات ناقصة. راجع الجهة المراجعة قبل إعادة الإرسال."}</p>
      {latestReturn?.changed_by_name_ar && <p className="mt-2 text-[10px] text-amber-800">طلب الاستكمال: {latestReturn.changed_by_name_ar} · {dateLabel(latestReturn.changed_at)}</p>}
    </div>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Info label="الجهة" value={topic.governance_unit?.name_ar ?? "غير محددة"} /><Info label="الفئة" value={topic.category?.name_ar ?? "غير محددة"} /><Info label="الأولوية" value={priorityLabels[topic.priority] ?? "غير محددة"} /><Info label="حالة المسار" value={workflowDisplayStatus(workflow?.status ?? topic.routing_status ?? undefined, priorRouteRequest)} /></div>
    <div className="rounded-2xl border border-[#e4edf5] bg-[#fbfdff] p-4"><h3 className="text-xs font-black text-[#0a1330]">الوصف</h3><p className="mt-2 whitespace-pre-wrap text-xs leading-7 text-[#52647a]">{topic.description || "لم يُسجل وصف للموضوع."}</p></div>
    {preview?.workflow?.description && <div className="rounded-2xl border border-blue-100 bg-[#f2f8ff] p-4 text-xs leading-6 text-[#31516f]"><strong className="text-[#0066cc]">أثر اللائحة على الموضوع: </strong>{preview.workflow.description}</div>}
  </div>;
}

function Regulation({ topic, preview, references }: { topic: TopicDetail; preview: RegulationPreview | null; references: RegulationReference[] }) {
  if (!topic.policy_id) return <EmptyState icon={Landmark} title="لا توجد لائحة حاكمة بعد" description="لن يبدأ مسار الموضوع قبل اختيار لائحة ومادة منطبقة، أو اعتماد مسار استثنائي." />;
  return <div className="space-y-6"><SectionTitle icon={Landmark} title="اللائحة والمادة الحاكمة" description="المرجع النظامي الذي يحدد نطاق الموضوع ومساره." /><div className="grid gap-3 md:grid-cols-3"><Info label="اللائحة" value="لائحة مرتبطة بالموضوع" /><Info label="الإصدار" value={topic.policy_version_id ? "الإصدار النافذ المختار" : "—"} /><Info label="المادة" value={preview?.article?.title ?? "مادة مرتبطة بالموضوع"} /></div><ReferenceList references={references} />{preview ? <div className="grid gap-4 lg:grid-cols-[1.5fr_.8fr]"><div className="rounded-2xl border border-[#e2ebf3] p-5"><h3 className="text-sm font-black text-[#0a1330]">{preview.article?.title}</h3><p className="mt-3 whitespace-pre-wrap text-xs leading-7 text-[#43566d]">{preview.article?.official_text}</p>{preview.article?.interpretation && <p className="mt-4 rounded-xl bg-[#f7fafc] p-3 text-[11px] leading-6 text-[#617287]"><strong>التفسير التنفيذي: </strong>{preview.article.interpretation}</p>}</div><div className="rounded-2xl border border-[#dce9f5] bg-[#f8fbff] p-5"><p className="text-[10px] font-black text-[#0066cc]">نطاق التطبيق</p><h3 className="mt-2 text-sm font-black text-[#0a1330]">{preview.scope?.target_name}</h3><p className="mt-2 text-[11px] leading-6 text-[#63758b]">{preview.scope?.description}</p></div></div> : <EmptyState icon={ShieldCheck} title="المرجع مرتبط ومحمي" description="تعذر تحميل النص التفصيلي لهذه اللائحة بحسابك الحالي، بينما يبقى ربط الموضوع باللائحة والمادة محفوظًا." />}</div>;
}

function Requirements({ preview, requirementsStatus, attachments, priorRouteRequest, busy, onUpload, onUploadPriorEvidence, onSubmitPriorRoute, onRemove, onFulfill }: { preview: RegulationPreview | null; requirementsStatus: RequirementsStatus | null; attachments: TopicAttachment[]; priorRouteRequest: PriorRouteRequest | null; busy: boolean; onUpload: (file: File, requirementCode?: string) => void; onUploadPriorEvidence: (council: PriorRouteCouncil, file: File) => void; onSubmitPriorRoute: () => void; onRemove: (id: string) => void; onFulfill: (code: string) => void }) {
  const priorCouncils = groupPriorRouteCouncils(priorRouteRequest?.steps ?? []);
  const priorRouteReady = priorCouncils.length > 0 && priorCouncils.every((council) => council.all_steps_have_evidence);
  return <div className="space-y-6">
    <SectionTitle icon={Paperclip} title="المتطلبات والمرفقات" description="استكمل المستندات المطلوبة قبل الإحالة أو العرض على الجهة المختصة." />
    {priorRouteRequest && <div className="overflow-hidden rounded-2xl border border-[#b9d8f2] bg-[#f8fbff]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#dceaf6] bg-[#edf7ff] p-4"><div><p className="text-[10px] font-black text-[#0877df]">استكمال مسار سابق</p><h3 className="mt-1 text-sm font-black text-[#173654]">محاضر وقرارات المجالس السابقة</h3><p className="mt-1 text-[10px] leading-5 text-[#61778e]">البيانات محفوظة. أكمل المرفقات الناقصة ثم أرسلها للمراجعة المستقلة.</p></div><span className={`rounded-full px-3 py-1.5 text-[10px] font-black ${priorRouteRequest.status === "draft" ? "bg-amber-100 text-amber-800" : priorRouteRequest.status === "submitted" ? "bg-blue-100 text-blue-700" : priorRouteRequest.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"}`}>{priorRouteRequest.status === "draft" ? "مسودة تحتاج استكمال" : priorRouteRequest.status === "submitted" ? "بانتظار المراجعة" : priorRouteRequest.status === "approved" ? "تم اعتماد الأدلة" : priorRouteRequest.status === "rejected" ? "أعيدت الأدلة للتصحيح" : "حالة الطلب غير معرّفة"}</span></div>
      <div className="space-y-3 p-4">{priorCouncils.map((council, index) => <article key={council.id} className="rounded-xl border border-[#dbe7f2] bg-white p-4"><div className="flex flex-wrap items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#0066cc] text-xs font-black text-white">{index + 1}</span><div className="min-w-0 flex-1"><h4 className="text-xs font-black text-[#193651]">{council.responsible_unit_name_ar || council.step_title}</h4><p className="mt-1 text-[10px] text-[#71849a]">{dateLabel(council.meeting_date)}{council.meeting_reference ? ` · ${council.meeting_reference}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${council.all_steps_have_evidence ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{council.all_steps_have_evidence ? "المحضر مرفوع" : "المحضر مطلوب"}</span></div><div className="mt-3 grid gap-2 rounded-lg bg-[#f8fbfd] p-3 text-[10px] leading-5 text-[#52677d] md:grid-cols-2"><p><b className="text-[#183650]">القرار: </b>{council.decision_text}</p><p><b className="text-[#183650]">سبب التجاوز: </b>{council.bypass_reason}</p></div><div className="mt-3 flex flex-wrap items-center gap-2">{council.attachments.map((attachment) => <a key={attachment.id} href={attachment.file_url} target="_blank" rel="noreferrer" className="rounded-lg border border-[#b9d8f2] bg-[#eef7ff] px-2.5 py-1.5 text-[9px] font-black text-[#0877df]">عرض {attachment.file_name}</a>)}{priorRouteRequest.status === "draft" && priorRouteRequest.is_requester && <label className={`cursor-pointer rounded-lg bg-[#0066cc] px-3 py-2 text-[9px] font-black text-white ${busy ? "pointer-events-none opacity-50" : ""}`}>{council.all_steps_have_evidence ? "إضافة محضر آخر" : "رفع محضر المجلس"}<input className="hidden" type="file" accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onUploadPriorEvidence(council, file); event.currentTarget.value = ""; }} /></label>}</div></article>)}</div>
      {priorRouteRequest.status === "draft" && priorRouteRequest.is_requester && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#dceaf6] bg-white p-4"><p className="text-[10px] text-[#667b91]">لن تتغير بداية المسار إلا بعد إرسال الأدلة واعتمادها من مراجع مستقل.</p><button disabled={!priorRouteReady || busy} onClick={onSubmitPriorRoute} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black text-white disabled:cursor-not-allowed disabled:bg-[#aebdca]">{busy ? "جارٍ الحفظ…" : "إرسال الأدلة للمراجعة"}</button></div>}
    </div>}
    <RequirementsChecklist status={requirementsStatus} busy={busy} onUpload={onUpload} onFulfill={onFulfill} />
    {preview ? <div className="overflow-hidden rounded-2xl border border-[#e3ebf3]">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 bg-[#f8fafc] px-4 py-3 text-[10px] font-black text-[#617287]"><span>المتطلب</span><span>موعده</span><span>الحالة</span></div>
      {preview.requirements?.length ? preview.requirements.map((requirement, index) => <div key={`${requirement.name}-${index}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t border-[#edf2f6] px-4 py-3 text-xs"><span className="font-bold text-[#203750]">{requirement.name}</span><span className="text-[#6f8297]">{requirement.timing || "عند الإرسال"}</span><span className={`rounded-full px-2 py-1 text-[10px] font-black ${requirement.mandatory ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{requirement.mandatory ? "مطلوب" : "اختياري"}</span></div>) : <div className="p-5 text-center text-xs text-[#718196]">لا توجد متطلبات إضافية لهذه المادة.</div>}
    </div> : <div className="rounded-2xl border border-dashed border-[#caddec] bg-[#fbfdff] p-4 text-xs leading-6 text-[#718196]">لم تُحمّل المتطلبات النظامية بعد. يمكنك مع ذلك رفع المرفقات الداعمة للموضوع.</div>}
    <div className="rounded-2xl border border-[#e3ebf3] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm font-black text-[#0a1330]">مرفقات الموضوع</h3><p className="mt-1 text-[11px] text-[#718196]">يدعم PDF وPNG وJPEG وDOCX حتى 25 ميجابايت للملف الواحد.</p></div><label className={`cursor-pointer rounded-xl bg-[#0066cc] px-3 py-2 text-[11px] font-bold text-white ${busy ? "pointer-events-none opacity-50" : ""}`}>{busy ? "جارٍ الرفع…" : "إرفاق ملف"}<input className="hidden" type="file" accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /></label></div><div className="mt-4 space-y-2">{attachments.length ? attachments.map((attachment) => <div key={attachment.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-[#fbfdff] p-3"><FolderOpen className="text-[#0066cc]" size={17}/><a href={attachment.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-xs font-bold text-[#183b62] hover:underline">{attachment.file_name}</a><span className="text-[10px] text-[#72839a]">{attachment.file_size_bytes ? `${Math.ceil(attachment.file_size_bytes / 1024)} KB` : ""}</span><button disabled={busy} onClick={() => onRemove(attachment.id)} className="text-[10px] font-bold text-red-600 disabled:opacity-50">حذف</button></div>) : <p className="rounded-xl bg-[#fbfdff] p-4 text-center text-xs text-[#718196]">لا توجد مرفقات لهذا الموضوع.</p>}</div></div>
  </div>;
}

function ReferenceList({ references }: { references: RegulationReference[] }) {
  if (!references.length) return null;
  return <div className="rounded-2xl border border-[#dfeaf4] bg-[#f9fcff] p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="text-xs font-black text-[#18324e]">المراجع التشريعية المرتبطة</h3><span className="rounded-full bg-[#eaf5ff] px-2 py-1 text-[10px] font-black text-[#0066cc]">{references.length} مرجع</span></div>
    <div className="mt-3 grid gap-2 md:grid-cols-2">{references.map((reference) => <div key={reference.id} className={`rounded-xl border p-3 ${reference.is_primary ? "border-[#82bfff] bg-white" : "border-[#e4ebf2] bg-[#fbfdff]"}`}>
      <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-[9px] font-black ${reference.is_primary ? "bg-[#0066cc] text-white" : "bg-[#eef3f7] text-[#536a82]"}`}>{reference.is_primary ? "المرجع الحاكم" : "مرجع مساند"}</span><span className="text-[10px] text-[#6c7e92]">{reference.reference_type}</span></div>
      <p className="mt-2 text-xs font-black text-[#18324e]">{reference.label || reference.item_title || reference.policy_name || "مرجع تشريعي"}</p>
      <p className="mt-1 text-[10px] text-[#73869b]">{[reference.policy_name, reference.version_no ? `الإصدار ${reference.version_no}` : null, reference.item_code].filter(Boolean).join(" · ")}</p>
    </div>)}</div>
  </div>;
}

function RequirementsChecklist({ status, busy, onUpload, onFulfill }: { status: RequirementsStatus | null; busy: boolean; onUpload: (file: File, requirementCode?: string) => void; onFulfill: (code: string) => void }) {
  if (!status) return null;
  return <div className="overflow-hidden rounded-2xl border border-[#dfe9f2]">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-[#f7fafc] px-4 py-3"><div><h3 className="text-xs font-black text-[#18324e]">قائمة الاستيفاء الفعلية</h3><p className="mt-1 text-[10px] text-[#718196]">تُحدّث آليًا من القواعد التنفيذية والمرفقات المرتبطة.</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-black ${status.ready_for_review ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{status.ready_for_review ? "جاهز للمراجعة" : `${status.missing_mandatory} متطلب إلزامي ناقص`}</span></div>
    {status.items.length ? <div className="divide-y divide-[#e9eff5]">{status.items.map((item) => {
      const complete = item.status === "fulfilled" || item.status === "waived";
      const isDocument = ["document", "attachment", "evidence"].includes(item.type);
      return <div key={item.code} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
        <div><p className="text-xs font-black text-[#203850]">{item.name}</p><p className="mt-1 text-[10px] text-[#74869a]">{item.mandatory ? "إلزامي" : "اختياري"} · {item.timing || "قبل المراجعة"}{item.note ? ` · ${item.note}` : ""}</p></div>
        <span className={`w-fit rounded-full px-2 py-1 text-[10px] font-black ${complete ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{complete ? "مكتمل" : "ناقص"}</span>
        {!complete && isDocument ? <label className={`w-fit cursor-pointer rounded-lg bg-[#0066cc] px-3 py-2 text-[10px] font-bold text-white ${busy ? "pointer-events-none opacity-50" : ""}`}>إرفاق المطلوب<input className="hidden" type="file" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onUpload(file, item.code); event.currentTarget.value = ""; }} /></label> : !complete ? <button disabled={busy} onClick={() => onFulfill(item.code)} className="w-fit rounded-lg border border-[#9bc9f1] px-3 py-2 text-[10px] font-bold text-[#0066cc] disabled:opacity-50">تأكيد الاستيفاء</button> : <span className="text-[10px] font-bold text-emerald-700">تم التحقق</span>}
      </div>;
    })}</div> : <p className="p-5 text-center text-xs text-[#718196]">لا توجد متطلبات تنفيذية إضافية.</p>}
  </div>;
}

function Workflow({ workflow, priorRouteRequest, busy, onAction }: { workflow: Workflow | null; priorRouteRequest: PriorRouteRequest | null; busy: boolean; onAction: (outcome: WorkflowOutcome) => void }) {
  if (!workflow?.steps?.length) return <EmptyState icon={Route} title="المسار لم يبدأ بعد" description="سيظهر تسلسل الاعتماد هنا فور إنشاء المسار أو اعتماد المسار الاستثنائي." />;
  return <div className="space-y-6">
    <SectionTitle icon={Route} title="مسار الاعتماد" description="تعرّف على الخطوة الحالية وما يلزم للانتقال إلى التالية." />
    <div className="space-y-3">
      {workflow.steps.map((step, index) => {
        const active = step.status === "active";
        const sequence = step.sequence_no ?? index + 1;
        const priorEvidence = priorRouteRequest?.steps.find((evidence) => evidence.sequence_no === sequence);
        const priorApproved = Boolean(priorEvidence && priorRouteRequest?.status === "approved");
        const done = step.status === "completed" || priorApproved;
        const allowedOutcomes = step.snapshot?.allowed_outcomes ?? [];
        const stepStatus = priorEvidence && !priorApproved
          ? priorRouteRequest?.status === "submitted" ? "موثقة سابقاً — بانتظار اعتماد الأدلة" : "موثقة كمسودة — تحتاج استكمال"
          : statusLabels[step.status ?? ""] ?? "حالة المرحلة غير معرّفة";

        return <div key={step.id} className={`relative rounded-2xl border p-4 ${active ? "border-[#8ac1f2] bg-[#f2f8ff]" : done ? "border-emerald-100 bg-emerald-50/40" : "border-[#e5edf4] bg-white"}`}>
          <div className="flex items-start gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black ${active ? "bg-[#0066cc] text-white" : done ? "bg-emerald-600 text-white" : "bg-[#eef3f7] text-[#62758c]"}`}>
              {done ? <CheckCircle2 size={16} /> : sequence}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-xs font-black text-[#18324e]">{step.snapshot?.name_ar ?? `الخطوة ${sequence}`}</h3>
                <span className={`text-[10px] font-bold ${priorEvidence && !priorApproved ? "text-amber-700" : "text-[#63768d]"}`}>{stepStatus}</span>
              </div>
              <p className="mt-1 text-[11px] text-[#6d7f94]">
                {priorEvidence && !priorApproved
                  ? `سُجل اجتماع ${priorEvidence.responsible_unit_name_ar || "المجلس"} بتاريخ ${dateLabel(priorEvidence.meeting_date)}، ولا تُعد المرحلة مكتملة نظامياً قبل اعتماد الأدلة.`
                  : active ? "هذه هي الخطوة الحالية. اختر الإجراء المناسب بعد مراجعة الموضوع والمستندات." : done ? `تمت في ${dateLabel(step.acted_at ?? priorRouteRequest?.reviewed_at)}` : "تُفتح بعد اكتمال الخطوة السابقة."}
              </p>
              {step.required_permission_code && <p className="mt-1 text-[10px] text-[#7b8ba0]">هذه الخطوة موجهة للدور المختص ضمن المسار.</p>}
              {step.comment && <p className="mt-2 rounded-lg bg-white/70 p-2 text-[11px] text-[#53677e]"><strong>ملاحظة الإجراء: </strong>{step.comment}</p>}
              {active && <div className="mt-3 flex flex-wrap gap-2">
                {allowedOutcomes.includes("approved") && <button disabled={busy} onClick={() => onAction("approved")} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">اعتماد وانتقال</button>}
                {allowedOutcomes.includes("completed") && <button disabled={busy} onClick={() => onAction("completed")} className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-bold text-white disabled:opacity-50">إتمام الخطوة</button>}
                {allowedOutcomes.includes("rejected") && <button disabled={busy} onClick={() => onAction("rejected")} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-[10px] font-bold text-red-700 disabled:opacity-50">رفض الموضوع</button>}
              </div>}
            </div>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function Referrals({ referrals }: { referrals: Referral[] }) { if (!referrals.length) return <EmptyState icon={GitPullRequestArrow} title="لا توجد إحالات" description="ستظهر الإحالات بين الجهات هنا فور تسجيلها على الموضوع." />; return <div className="space-y-6"><SectionTitle icon={GitPullRequestArrow} title="الإحالات" description="سجل انتقال الموضوع بين الجهات واختصاصاتها." />{referrals.map((referral) => <div key={referral.id} className="rounded-2xl border border-[#e4edf5] p-4"><div className="flex flex-wrap items-center gap-2 text-xs font-black text-[#18324e]"><span>{referral.from_unit_name_ar || "الجهة السابقة"}</span><ArrowRight className="text-[#7e9abb]" size={15}/><span>{referral.to_unit_name_ar || "الجهة المحال إليها"}</span><span className="mr-auto rounded-full bg-[#edf6ff] px-2 py-1 text-[10px] text-[#0066cc]">{statusLabels[referral.status ?? ""] ?? "قيد المعالجة"}</span></div><p className="mt-2 text-[11px] leading-6 text-[#60748a]">{referral.referral_reason || "لم يُسجل سبب الإحالة."}</p><p className="mt-2 text-[10px] text-[#8797a9]">أحيل في {dateLabel(referral.referred_at)}</p></div>)}</div>; }

function Decisions({ preview, meetings, priorRouteRequest }: { preview: RegulationPreview | null; meetings: TopicMeetingHistory[]; priorRouteRequest: PriorRouteRequest | null }) {
  const hasResults = meetings.some((meeting) => meeting.voting_rounds.length || meeting.decisions.length);
  const priorCouncils = groupPriorRouteCouncils(priorRouteRequest?.steps ?? []);
  return <div className="space-y-6"><SectionTitle icon={Gavel} title="القرارات والتصويت" description="سجل الاجتماعات وجولات التصويت والقرارات المرتبطة بهذا الموضوع." />
    {preview?.approval_effect && <div className="rounded-2xl border border-blue-100 bg-[#f3f8ff] p-4 text-xs leading-6 text-[#405f7e]"><strong className="text-[#0066cc]">أثر اللائحة على الاعتماد: </strong>{preview.approval_effect}<br/><strong className="text-[#0066cc]">أثرها على التصويت: </strong>{preview.voting_effect}</div>}
    {priorCouncils.length > 0 && <section className="overflow-hidden rounded-2xl border border-[#b9d8f2]">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[#edf7ff] px-4 py-3"><div><h3 className="text-xs font-black text-[#173654]">المجالس السابقة الموثقة</h3><p className="mt-1 text-[10px] text-[#61778e]">اجتماعات عُقدت قبل إدخال الموضوع إلى النظام، لذلك لا توجد لها جولة تصويت إلكترونية داخل قرار.</p></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${priorRouteRequest?.status === "approved" ? "bg-emerald-100 text-emerald-700" : priorRouteRequest?.status === "submitted" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-800"}`}>{priorRouteRequest?.status === "approved" ? "معتمدة ومكتملة" : priorRouteRequest?.status === "submitted" ? "بانتظار اعتماد الأدلة" : "مسودة تحتاج استكمال"}</span></header>
      <div className="grid gap-3 p-4 lg:grid-cols-2">{priorCouncils.map((council) => <article key={council.id} className="rounded-xl border border-[#dfe9f2] bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-xs font-black text-[#18324e]">{council.responsible_unit_name_ar || council.step_title}</h4><p className="mt-1 text-[10px] text-[#74869b]">{council.meeting_reference || "اجتماع سابق"} · {dateLabel(council.meeting_date)}</p></div><span className="rounded-full bg-[#eef4fa] px-2 py-1 text-[9px] font-black text-[#506980]">{decisionTypeLabels[council.decision_type] ?? "قرار موثق"}</span></div><div className="mt-3 rounded-lg bg-emerald-50/60 p-3"><p className="text-[9px] font-black text-emerald-700">القرار المسجل</p><p className="mt-1 text-[11px] leading-6 text-[#35546a]">{council.decision_text}</p></div><div className="mt-2 rounded-lg bg-[#f8fafc] p-3 text-[10px] leading-5 text-[#617287]"><strong>سبب تجاوز المرحلة: </strong>{council.bypass_reason}</div><p className="mt-2 text-[9px] text-[#7a8b9e]">التصويت الإلكتروني: غير متاح — الاجتماع تم خارج النظام.</p></article>)}</div>
    </section>}
    {meetings.length ? <div className="space-y-4">{meetings.map((entry) => <article key={entry.agenda_item_id} className="overflow-hidden rounded-2xl border border-[#dfe8f1]">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-[#f8fbfe] px-4 py-3"><div><h3 className="text-xs font-black text-[#18324e]">{entry.meeting.title}</h3><p className="mt-1 text-[10px] text-[#74869b]">{entry.meeting.meeting_no || "اجتماع"} · {dateLabel(entry.meeting.scheduled_date)} · {entry.meeting.unit_name || "الجهة المختصة"}</p></div><span className="rounded-full bg-[#edf4fa] px-2 py-1 text-[10px] font-black text-[#506980]">{statusLabels[entry.meeting.status] ?? "حالة الاجتماع غير معرّفة"}</span></header>
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <div><p className="text-[10px] font-black text-[#61758c]">جولات التصويت</p>{entry.voting_rounds.length ? <div className="mt-2 space-y-2">{entry.voting_rounds.map((round) => <div key={round.id} className="rounded-xl border border-[#e5edf4] p-3 text-[10px] text-[#536980]"><div className="flex justify-between gap-2"><strong>الجولة {round.round_number}</strong><span>{round.result ? decisionTypeLabels[round.result] ?? "نتيجة مسجلة" : statusLabels[round.status] ?? "حالة التصويت غير معرّفة"}</span></div><p className="mt-2">موافق: {round.approve_count ?? 0} · رافض: {round.reject_count ?? 0} · ممتنع: {round.abstain_count ?? 0} · المؤهلون: {round.eligible_voter_count ?? 0}</p></div>)}</div> : <p className="mt-2 rounded-xl bg-[#fafcfe] p-3 text-[10px] text-[#7a8b9e]">لم تُفتح جولة تصويت بعد.</p>}</div>
        <div><p className="text-[10px] font-black text-[#61758c]">القرارات الصادرة</p>{entry.decisions.length ? <div className="mt-2 space-y-2">{entry.decisions.map((decision) => <div key={decision.id} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3"><div className="flex justify-between gap-2 text-[10px] font-black text-emerald-800"><span>{decision.decision_no}</span><span>{statusLabels[decision.decision_status] ?? "حالة القرار غير معرّفة"}</span></div><p className="mt-2 text-[11px] leading-6 text-[#35546a]">{decision.decision_text}</p></div>)}</div> : <p className="mt-2 rounded-xl bg-[#fafcfe] p-3 text-[10px] text-[#7a8b9e]">لم يصدر قرار بعد.</p>}</div>
      </div>
    </article>)}</div> : priorCouncils.length === 0 ? <EmptyState icon={hasResults ? Vote : Gavel} title="لم يُدرج الموضوع في اجتماع بعد" description="بعد اعتماد الموضوع وإضافته إلى جدول أعمال اجتماع، ستظهر هنا الجلسة والتصويت والقرار الناتج." /> : null}
  </div>;
}

function ActivityLog({ items, priorRouteRequest, topicCreatedAt }: { items: ActivityItem[]; priorRouteRequest: PriorRouteRequest | null; topicCreatedAt?: string }) {
  const priorCouncils = groupPriorRouteCouncils(priorRouteRequest?.steps ?? []);
  if (!items.length && !priorRouteRequest) return <EmptyState icon={Activity} title="لا يوجد نشاط مسجل بعد" description="سيظهر هنا سجل إنشاء الموضوع وتغير حالته والإجراءات المصرح بها." />;
  return <div className="space-y-6"><SectionTitle icon={Activity} title="سجل النشاط والتدقيق" description="سجل زمني غير قابل للتعديل لتغيرات الموضوع وإجراءاته." /><div className="space-y-3">
    {priorRouteRequest && <div className="flex gap-3 rounded-2xl border border-[#cfe3f4] bg-[#f8fbff] p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0877df]"/><div><p className="text-xs font-black text-[#203952]">تسجيل مسار سابق لـ {priorCouncils.length} {priorCouncils.length === 1 ? "مجلس" : "مجالس"}</p><p className="mt-1 text-[11px] leading-6 text-[#62758c]">{priorCouncils.map((council) => council.responsible_unit_name_ar || council.step_title).join("، ")}</p><p className="mt-2 text-[10px] text-[#8797a9]">{dateLabel(topicCreatedAt)} · {priorRouteRequest.status === "approved" ? "اعتمدت الأدلة وأغلقت المراحل السابقة" : priorRouteRequest.status === "submitted" ? "أرسلت الأدلة للمراجعة المستقلة" : "حُفظت كمسودة تحتاج استكمال"}</p></div></div>}
    {priorRouteRequest?.submitted_at && <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50/40 p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-blue-600"/><div><p className="text-xs font-black text-[#203952]">إرسال أدلة المسار السابق للمراجعة</p><p className="mt-1 text-[11px] leading-6 text-[#62758c]">اكتملت مرفقات المجالس السابقة وأُحيلت إلى مراجع مستقل.</p><p className="mt-2 text-[10px] text-[#8797a9]">{dateLabel(priorRouteRequest.submitted_at)}</p></div></div>}
    {priorRouteRequest?.reviewed_at && <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-600"/><div><p className="text-xs font-black text-[#203952]">{priorRouteRequest.status === "approved" ? "اعتماد أدلة المجالس السابقة" : "إعادة أدلة المجالس السابقة للتصحيح"}</p>{priorRouteRequest.review_comment && <p className="mt-1 text-[11px] leading-6 text-[#62758c]">{priorRouteRequest.review_comment}</p>}<p className="mt-2 text-[10px] text-[#8797a9]">{dateLabel(priorRouteRequest.reviewed_at)}</p></div></div>}
    {items.map((item) => <div key={item.id} className="flex gap-3 rounded-2xl border border-[#e6edf4] p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-[#0066cc]"/><div><p className="text-xs font-black text-[#203952]">{item.from_status ? `${statusLabels[item.from_status] ?? "الحالة السابقة"} ← ` : ""}{statusLabels[item.to_status] ?? "تحديث حالة الموضوع"}</p>{item.change_reason && <p className="mt-1 text-[11px] leading-6 text-[#62758c]">{activityReasonLabels[item.change_reason] ?? item.change_reason}</p>}<p className="mt-2 text-[10px] text-[#8797a9]">{item.changed_by_name_ar || "النظام"} · {dateLabel(item.changed_at)}</p></div></div>)}
  </div></div>;
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) { return <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#edf6ff] text-[#0066cc]"><Icon size={19}/></span><div><h2 className="text-base font-black text-[#0a1330]">{title}</h2><p className="mt-1 text-[11px] leading-5 text-[#72839a]">{description}</p></div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-xl border border-[#e4edf5] bg-[#fbfdff] p-3"><p className="text-[10px] font-black text-[#718196]">{label}</p><p className="mt-1.5 text-xs font-black text-[#18324e]">{value}</p></div>; }
