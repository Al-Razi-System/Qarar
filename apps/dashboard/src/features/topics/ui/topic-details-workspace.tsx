"use client";
import { Card } from "@/shared/ui/card";
import { Dialog } from "@/shared/ui/dialog";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity, ArrowRight, CheckCircle2, CircleAlert, ClipboardCheck, FileText,
  FolderOpen, Gavel, GitPullRequestArrow, Landmark, LoaderCircle, Paperclip,
  Route, ShieldCheck, Vote,
} from "lucide-react";
import { readUploadResponse } from "@/shared/api/upload-response";
import {TypedTopicAuthorities,type TypedTopicSnapshot} from "./typed-topic-details";
import {Button} from "@/shared/ui/button";
import {InlineMessage} from "@/shared/ui/inline-message";
import {TopicPdfDownloadButton} from "./topic-pdf-download-button";
import {MeetingMinutesDownloadButton} from "@/features/meetings/ui/meeting-minutes-download-button";
import { TopicCorrectionsPanel } from "./topic-corrections-panel";
import { TopicScheduleOccurrences } from "./topic-schedule-occurrences";

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
  topic_type_version_id?:string|null;
  typed_creation_request?:{snapshot?:TypedTopicSnapshot}|null;
  category?: { name_ar?: string };
  governance_unit?: { name_ar?: string };
  history?: ActivityItem[];
  is_corrected?: boolean;
  correction_no?: string | null;
  original_content?: { title_ar?: string | null; title_en?: string | null; description?: string | null } | null;
  active_correction_id?: string | null;
  active_correction_no?: string | null;
  correction_status?: "traversing" | "returned_to_opener" | null;
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
type TopicMinute = { id: string; status: string; content?: string | null; submitted_at?: string | null; approved_at?: string | null; updated_at?: string | null; is_corrected?: boolean; correction_no?: string; corrected_version_id?: string; original_content?: string | null; signature_count?: number };
type TopicDecision = { id: string; decision_no: string; decision_text: string; decision_status: string; requires_approval: boolean; issued_at?: string | null; is_corrected?: boolean; correction_no?: string; corrected_version_id?: string; original_decision_text?: string | null };
type TopicMeetingHistory = { agenda_item_id: string; agenda_status: string; discussion_notes?: string | null; meeting: { id: string; meeting_no?: string; title: string; status: string; scheduled_date?: string; unit_name?: string }; minutes?: TopicMinute | null; voting_rounds: Array<{ id: string; round_number: number; status: string; result?: string | null; eligible_voter_count?: number; approve_count?: number; reject_count?: number; abstain_count?: number; opened_at?: string; closed_at?: string | null }>; decisions: TopicDecision[] };
type TopicActivity = { id: string; source: "status_history" | "audit"; action: string; entity_type: string; entity_id?: string | null; occurred_at?: string; actor_name_ar?: string | null; from_status?: string | null; to_status?: string | null; summary?: string | null };
type PriorRouteAttachment = { id: string; file_name: string; file_url: string; mime_type: string; file_size_bytes?: number };
type PriorRouteStep = { id: string; sequence_no: number; step_title: string; responsible_unit_name_ar?: string | null; meeting_date: string; meeting_reference?: string | null; decision_type: string; decision_text: string; bypass_reason: string; attachments: PriorRouteAttachment[] };
type PriorRouteRequest = { id: string; topic_id: string; status: string; is_requester: boolean; submitted_at?: string | null; reviewed_at?: string | null; review_comment?: string | null; steps: PriorRouteStep[] };
type PriorRouteCouncil = PriorRouteStep & { evidence_ids: string[]; covered_step_titles: string[]; all_steps_have_evidence: boolean };
type ResubmissionOption = { available: boolean; reason_unavailable?: string | null; expected_version?: number | null; destination_unit_name_ar?: string | null };

type TabId = "summary" | "regulation" | "requirements" | "workflow" | "referrals" | "decisions" | "corrections" | "activity";
type Notice = { kind: "error" | "success"; text: string } | null;

const tabs: Array<{ id: TabId; label: string; icon: typeof FileText }> = [
  { id: "summary", label: "الملخص", icon: FileText },
  { id: "regulation", label: "اللائحة والمادة", icon: Landmark },
  { id: "requirements", label: "المتطلبات والمرفقات", icon: Paperclip },
  { id: "workflow", label: "مسار الاعتماد", icon: Route },
  { id: "referrals", label: "الإحالات", icon: GitPullRequestArrow },
  { id: "decisions", label: "القرارات والتصويت", icon: Vote },
  { id: "corrections", label: "التصحيحات", icon: ClipboardCheck },
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
const activityActionLabels: Record<string, string> = {
  "topics.create": "إنشاء الموضوع",
  "topics.prepare.submit": "استكمال بيانات التقديم",
  "agenda.item.add": "إدراج الموضوع في جدول الأعمال",
  "agenda.instructions.update": "تحديث تعليمات مناقشة البند",
  "meetings.agenda.discussion.complete": "اكتمال مناقشة البند",
  "agenda.discussion.update": "تحديث خلاصة المناقشة",
  "voting.open": "فتح التصويت",
  "voting.close": "إغلاق التصويت وتثبيت النتيجة",
  "decision.create_from_vote": "إنشاء قرار من نتيجة التصويت",
  "decisions.create_for_outcome": "صياغة قرار المجلس",
  "decisions.approve_with_minutes": "اعتماد القرار مع المحضر",
  "topics.referral.request": "إحالة الموضوع",
  "meetings.agenda.referred": "إحالة بند الاجتماع",
  "minutes.draft.save": "حفظ مسودة المحضر",
  "minutes.submit": "إرسال المحضر للمصادقة",
  "minutes.approval.respond": "تسجيل مصادقة على المحضر",
  "governance.topic.current_unit.repaired": "مواءمة المجلس الحالي مع مرحلة المسار",
  "meetings.agenda.downloads": "تحديث صلاحية تنزيل مرفقات البند",
  "meetings.agenda.planned_minutes": "تحديد المدة المقررة للبند",
  "topics.pdf.export": "تنزيل ملف الموضوع الرسمي",
  "topic.correction.open": "فتح طلب تصحيح رسمي",
  "topic.correction.station_decide": "قرار محطة التصحيح",
  "topic.correction.withdraw": "سحب طلب التصحيح",
  "topic.correction.minutes_sign": "توقيع المحضر المصحح",
};

function topicDisplayStatus(topicStatus: string, priorRouteRequest: PriorRouteRequest | null, typedReady = false) {
  if (priorRouteRequest?.status === "draft") {
    const missingEvidence = priorRouteRequest.steps.some((step) => step.attachments.length === 0);
    return missingEvidence ? "مطلوب استكمال أدلة المجالس السابقة" : "جاهز لإرسال الأدلة";
  }
  if (priorRouteRequest?.status === "submitted") return "بانتظار مراجعة أدلة المسار السابق";
  if (priorRouteRequest?.status === "rejected") return "أدلة المسار بحاجة لتصحيح";
  if (typedReady) return "مقدم لمقترحات المجلس";
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
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("ar-YE-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(date);
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
  return <Card className="grid min-h-56 place-items-center rounded-q-card border border-dashed border-q-border bg-q-bg p-8 text-center">
    <div><Icon className="mx-auto text-q-link" size={32} /><h3 className="mt-3 text-q-ui font-bold text-q-text">{title}</h3><p className="mt-2 max-w-lg text-q-caption leading-6 text-q-text-2">{description}</p></div>
  </Card>;
}

export function TopicDetailsWorkspace({ topicId }: { topicId: string }) {
  const [confirmation, setConfirmation] = useState<{ message: string; input: boolean } | null>(null);
  const [confirmationValue, setConfirmationValue] = useState("");
  const confirmationResolve = useRef<((value: string | null) => void) | null>(null);
  function requestConfirmation(message: string, input = false) {
    setConfirmationValue("");
    setConfirmation({ message, input });
    return new Promise<string | null>((resolve) => { confirmationResolve.current = resolve; });
  }
  function finishConfirmation(value: string | null) {
    const resolve = confirmationResolve.current;
    confirmationResolve.current = null;
    setConfirmation(null);
    resolve?.(value);
  }
  useEffect(() => () => { confirmationResolve.current?.(null); }, []);
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [preview, setPreview] = useState<RegulationPreview | null>(null);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [attachments, setAttachments] = useState<TopicAttachment[]>([]);
  const [requirementsStatus, setRequirementsStatus] = useState<RequirementsStatus | null>(null);
  const [regulationReferences, setRegulationReferences] = useState<RegulationReference[]>([]);
  const [meetingHistory, setMeetingHistory] = useState<TopicMeetingHistory[]>([]);
  const [activityTimeline, setActivityTimeline] = useState<TopicActivity[]>([]);
  const [priorRouteRequest, setPriorRouteRequest] = useState<PriorRouteRequest | null>(null);
  const [resubmissionOption, setResubmissionOption] = useState<ResubmissionOption | null>(null);
  const [resubmitting, setResubmitting] = useState(false);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("summary");
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice>(null);
  const [readErrors,setReadErrors]=useState<string[]>([]);
  const [readAttempt,setReadAttempt]=useState(0);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true); setNotice(null);setReadErrors([]);setPreview(null);setWorkflow(null);setReferrals([]);setAttachments([]);setRegulationReferences([]);setMeetingHistory([]);setActivityTimeline([]);setPriorRouteRequest(null);setResubmissionOption(null);
      try {
        const detail = await rpc<TopicDetail>("get_topic_detail", { p_topic_id: topicId });
        if (!alive) return;
        setTopic(detail);
        const failed=(section:string)=>()=>{if(alive)setReadErrors(errors=>[...errors,`تعذر تحميل ${section}. أعد تحميل التفاصيل للتحقق.`]);};
        const background: Promise<void>[] = [
          rpc<Workflow>("get_topic_workflow", { p_topic_id: topicId }).then((data) => { if (alive) setWorkflow(data); }).catch(failed("مسار الموضوع")),
          rpc<Referral[]>("get_topic_route_history", { p_topic_id: topicId }).then((data) => { if (alive) setReferrals(data ?? []); }).catch(failed("إحالات الموضوع")),
          rpc<TopicAttachment[]>("list_topic_attachments", { p_topic_id: topicId }).then((data) => { if (alive) setAttachments(data ?? []); }).catch(failed("مرفقات الموضوع")),
          rpc<RequirementsStatus>("get_topic_requirements_status", { p_topic_id: topicId }).then((data) => { if (alive) setRequirementsStatus(data); }).catch(() => undefined),
          rpc<RegulationReference[]>("list_topic_regulation_references", { p_topic_id: topicId }).then((data) => { if (alive) setRegulationReferences(data ?? []); }).catch(() => undefined),
          rpc<TopicMeetingHistory[]>("get_topic_meeting_history", { p_topic_id: topicId }).then((data) => { if (alive) setMeetingHistory(data ?? []); }).catch(failed("اجتماعات الموضوع")),
          rpc<TopicActivity[]>("get_topic_activity_timeline", { p_topic_id: topicId }).then((data) => { if (alive) setActivityTimeline(data ?? []); }).catch(failed("سجل النشاط والتدقيق")),
          rpc<PriorRouteRequest | null>("get_topic_prior_route_request", { p_topic_id: topicId }).then((data) => { if (alive) setPriorRouteRequest(data); }).catch(failed("أدلة المسار السابق")),
        ];
        if (detail.status === "returned") {
          background.push(
            rpc<ResubmissionOption>("get_topic_resubmission_option", { p_topic_id: topicId })
              .then((data) => { if (alive) setResubmissionOption(data); })
              .catch(failed("صلاحية إعادة إرسال الموضوع")),
          );
        }
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
  }, [topicId,readAttempt]);

  const currentStep = useMemo(() => workflow?.steps?.find((step) => step.status === "active"), [workflow]);

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
    if (!(await requestConfirmation("هل تريد حذف هذا المرفق؟"))) return;
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
  async function resubmitTopic() {
    if (!resubmissionOption?.available || resubmissionOption.expected_version == null) return;
    setResubmitting(true);
    setNotice(null);
    try {
      await rpc("resubmit_returned_topic", {
        p_topic_id: topicId,
        p_idempotency_key: crypto.randomUUID(),
        p_expected_version: resubmissionOption.expected_version,
      });
      const destination = resubmissionOption.destination_unit_name_ar || "المجلس المختص";
      setTopic((current) => current ? { ...current, status: "approved", routing_status: "routing_ready" } : current);
      setWorkflow((current) => current ? { ...current, status: "active" } : current);
      setResubmissionOption(null);
      setNotice({ kind: "success", text: `أُعيد إرسال الموضوع إلى ${destination} بنجاح.` });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إعادة إرسال الموضوع." });
    } finally {
      setResubmitting(false);
    }
  }
  const headerPath = [
    topic?.title_ar || "الموضوع",
    topic?.topic_type_version_id ? topic.typed_creation_request?.snapshot?.topic_type_name_ar : topic?.policy_id ? "اللائحة الحاكمة" : "بانتظار تحديد اللائحة",
    topic?.policy_version_id ? "الإصدار النافذ" : null,
    preview?.article?.title || (topic?.policy_item_id ? "المادة الحاكمة" : null),
    currentStep ? `الخطوة ${currentStep.sequence_no ?? "الحالية"}` : workflowDisplayStatus(workflow?.status, priorRouteRequest),
  ].filter(Boolean);

  if (loading) return <Card className="grid min-h-[520px] place-items-center rounded-q-card border border-q-border bg-q-surface"><LoaderCircle className="animate-spin text-q-primary" size={30} /></Card>;
  if (!topic) return <div className="space-y-4"><Link href="/admin/topics" className="inline-flex items-center gap-2 text-q-caption font-bold text-q-primary"><ArrowRight size={15} /> العودة إلى الموضوعات</Link><EmptyState icon={CircleAlert} title="تعذر العثور على الموضوع" description={notice?.text ?? "قد لا تملك صلاحية عرض هذا الموضوع أو لم يعد موجودًا."} /></div>;

  return <div className="space-y-5">
      {confirmation && <Dialog title={confirmation.message} onClose={() => finishConfirmation(null)} footer={<>
        <Button variant="secondary" onClick={() => finishConfirmation(null)}>إلغاء</Button>
        <Button onClick={() => finishConfirmation(confirmation.input ? confirmationValue : "confirmed")}>تأكيد</Button>
      </>}>
        {confirmation.input && <input autoFocus aria-label={confirmation.message} value={confirmationValue} onChange={(event) => setConfirmationValue(event.target.value)} className="min-h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui text-q-text" />}
      </Dialog>}

    <Link href="/admin/topics" className="inline-flex items-center gap-2 text-q-caption font-bold text-q-primary transition hover:text-q-link"><ArrowRight size={15} /> العودة إلى الموضوعات</Link>
    {notice && <InlineMessage tone={notice.kind}>{notice.text}</InlineMessage>}
    {readErrors.length > 0 && <div className="space-y-3">
      {readErrors.map(error => <InlineMessage key={error} tone="error">{error}</InlineMessage>)}
      <Button variant="secondary" onClick={() => setReadAttempt(value => value + 1)}>إعادة تحميل التفاصيل</Button>
    </div>}
    {topic.topic_type_version_id && topic.routing_status === "routing_ready" && ["new", "under_review"].includes(topic.status) && <InlineMessage tone="info">الموضوع المكتمل متاح مباشرة في مقترحات مجلسه الحالي حسب المسار. المتابعة والسجلات معروضة هنا؛ تُتخذ القرارات والإحالة داخل الاجتماع بعد المناقشة.</InlineMessage>}
    {topic.active_correction_id && <InlineMessage tone={topic.correction_status === "returned_to_opener" ? "warning" : "info"}>الموضوع قيد التصحيح الرسمي ({topic.active_correction_no}). أوقفت إجراءات المسار والإدراج والتصويت مؤقتاً حتى يكتمل الطلب أو يُسحب.</InlineMessage>}

    <header className="overflow-hidden rounded-q-control border border-q-border bg-q-surface ">
      <div className="border-b border-q-border bg-q-surface-2 px-5 py-5 text-q-text sm:px-7">
        <p className="text-q-caption font-bold text-q-warning">تفاصيل الموضوع</p>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><h1 className="text-q-h3 font-bold sm:text-q-h2">{topic.title_ar}</h1>{topic.is_corrected && <span className="rounded-q-pill bg-q-surface px-2.5 py-1 text-q-caption font-bold text-q-primary">مصحح · {topic.correction_no}</span>}</div><p className="mt-1 text-q-caption text-q-on-primary/75">{topic.topic_no ?? "موضوع مسجل"} · أنشئ في {dateLabel(topic.created_at)}</p></div><span className="rounded-full bg-q-surface/15 px-3 py-1.5 text-q-caption font-bold text-q-on-primary">{topicDisplayStatus(topic.status, priorRouteRequest, Boolean(topic.topic_type_version_id && topic.routing_status === "routing_ready" && ["new", "under_review"].includes(topic.status)))}</span></div>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 py-4 text-q-caption font-bold text-q-link sm:px-7" aria-label="سلسلة حوكمة الموضوع">
        {headerPath.map((item, index) => <span key={`${item}-${index}`} className="flex items-center gap-2"><span className={index === 0 ? "text-q-text" : ""}>{item}</span>{index < headerPath.length - 1 && <span className="text-q-text-2">←</span>}</span>)}
        <div className="ms-auto"><TopicPdfDownloadButton topicId={topicId} /></div>
      </div>
    </header>

    <Card className="flex gap-1 overflow-x-auto rounded-q-card border border-q-border bg-q-surface p-1.5 ">
      {tabs.map(({ id, label, icon: Icon }) => <Button key={id} variant={activeTab === id ? "primary" : "ghost"} aria-pressed={activeTab === id} onClick={() => setActiveTab(id)} className="shrink-0"><Icon size={16} />{topic.topic_type_version_id && id === "regulation" ? "اللائحة والبنود" : topic.topic_type_version_id && id === "workflow" ? "مسار الموضوع" : label}</Button>)}
    </Card>

    <section className="rounded-q-control border border-q-border bg-q-surface p-5  sm:p-7">
      {activeTab === "summary" && <div className="space-y-6"><Summary topic={topic} workflow={workflow} preview={preview} priorRouteRequest={priorRouteRequest} resubmissionOption={resubmissionOption} resubmitting={resubmitting} onResubmit={resubmitTopic} /><TopicScheduleOccurrences topicId={topic.id}/></div>}
      {activeTab === "regulation" && (topic.topic_type_version_id ? <TypedTopicAuthorities snapshot={topic.typed_creation_request?.snapshot} /> : <Regulation topic={topic} preview={preview} references={regulationReferences} />)}
      {activeTab === "requirements" && <Requirements preview={preview} requirementsStatus={requirementsStatus} attachments={attachments} priorRouteRequest={priorRouteRequest} busy={attachmentBusy} onUpload={uploadAttachment} onUploadPriorEvidence={uploadPriorRouteEvidence} onSubmitPriorRoute={submitPriorRouteRequest} onRemove={removeAttachment} onFulfill={fulfillRequirement} />}
      {activeTab === "workflow" && <Workflow workflow={workflow} priorRouteRequest={priorRouteRequest} />}
      {activeTab === "referrals" && <Referrals referrals={referrals} />}
      {activeTab === "decisions" && <Decisions preview={preview} meetings={meetingHistory} priorRouteRequest={priorRouteRequest} />}
      {activeTab === "corrections" && <TopicCorrectionsPanel topicId={topic.id} title={topic.title_ar} description={topic.description} meetings={meetingHistory} />}
      {activeTab === "activity" && <ActivityLog items={activityTimeline} priorRouteRequest={priorRouteRequest} topicCreatedAt={topic.created_at} typedTopic={Boolean(topic.topic_type_version_id)} />}
    </section>
  </div>;
}

function Summary({ topic, workflow, preview, priorRouteRequest, resubmissionOption, resubmitting, onResubmit }: { topic: TopicDetail; workflow: Workflow | null; preview: RegulationPreview | null; priorRouteRequest: PriorRouteRequest | null; resubmissionOption: ResubmissionOption | null; resubmitting: boolean; onResubmit: () => void }) {
  const latestReturn = [...(topic.history ?? [])].reverse().find((item) => item.to_status === "returned");
  return <div className="space-y-6">
    <SectionTitle icon={ClipboardCheck} title="ملخص الموضوع" description="نظرة سريعة على بيانات الموضوع وحالته الحاكمة الحالية." />
    {topic.status === "returned" && <Card className="rounded-q-card border border-q-warning bg-q-warning-soft p-5 text-q-warning">
      <h3 className="mt-1 text-q-ui font-bold">استكمال البيانات وإعادة الإرسال</h3>
<p className="text-q-caption font-bold text-q-text-2">إجراء مطلوب من مقدم الموضوع</p>
      <p className="mt-2 text-q-caption leading-7">{latestReturn?.change_reason || "أُعيد الموضوع لاستكمال بيانات أو مرفقات ناقصة. راجع الجهة المراجعة قبل إعادة الإرسال."}</p>
      {latestReturn?.changed_by_name_ar && <p className="mt-2 text-q-caption text-q-warning">طلب الاستكمال: {latestReturn.changed_by_name_ar} · {dateLabel(latestReturn.changed_at)}</p>}
      {resubmissionOption?.available ? <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" pending={resubmitting} pendingLabel="جارٍ إعادة الإرسال…" onClick={onResubmit}>إعادة إرسال الموضوع</Button>
        <p className="text-q-caption font-bold text-q-text-2">سيعود إلى {resubmissionOption.destination_unit_name_ar || "المجلس المختص"} بدورة مراجعة جديدة، مع حفظ السجل السابق.</p>
      </div> : resubmissionOption?.reason_unavailable ? <InlineMessage className="mt-4" tone="warning">{resubmissionOption.reason_unavailable}</InlineMessage> : null}
    </Card>}
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"><Info label="الجهة" value={topic.governance_unit?.name_ar ?? "غير محددة"} /><Info label="الفئة" value={topic.typed_creation_request?.snapshot?.classification_name_ar ?? topic.category?.name_ar ?? "غير محددة"} /><Info label="الأولوية" value={priorityLabels[topic.priority] ?? "غير محددة"} /><Info label="حالة المسار" value={workflowDisplayStatus(workflow?.status ?? topic.routing_status ?? undefined, priorRouteRequest)} /></div>
    <Card className="rounded-q-card border border-q-border bg-q-bg p-4"><h3 className="text-q-caption font-bold text-q-text">الوصف</h3><p className="mt-2 whitespace-pre-wrap text-q-caption leading-7 text-q-text-2">{topic.description || "لم يُسجل وصف للموضوع."}</p></Card>
    {preview?.workflow?.description && <Card className="rounded-q-card border border-q-primary bg-q-surface-2 p-4 text-q-caption leading-6 text-q-link"><strong className="text-q-primary">أثر اللائحة على الموضوع: </strong>{preview.workflow.description}</Card>}
  </div>;
}

function Regulation({ topic, preview, references }: { topic: TopicDetail; preview: RegulationPreview | null; references: RegulationReference[] }) {
  if (!topic.policy_id) return <EmptyState icon={Landmark} title="لا توجد لائحة حاكمة بعد" description="لن يبدأ مسار الموضوع قبل اختيار لائحة ومادة منطبقة، أو اعتماد مسار استثنائي." />;
  return <div className="space-y-6"><SectionTitle icon={Landmark} title="اللائحة والمادة الحاكمة" description="المرجع النظامي الذي يحدد نطاق الموضوع ومساره." /><div className="grid gap-3 md:grid-cols-3"><Info label="اللائحة" value="لائحة مرتبطة بالموضوع" /><Info label="الإصدار" value={topic.policy_version_id ? "الإصدار النافذ المختار" : "—"} /><Info label="المادة" value={preview?.article?.title ?? "مادة مرتبطة بالموضوع"} /></div><ReferenceList references={references} />{preview ? <div className="grid gap-4 lg:grid-cols-[1.5fr_.8fr]"><div className="rounded-q-control border border-q-border p-5"><h3 className="text-q-ui font-bold text-q-text">{preview.article?.title}</h3><p className="mt-3 whitespace-pre-wrap text-q-caption leading-7 text-q-text-2">{preview.article?.official_text}</p>{preview.article?.interpretation && <p className="mt-4 rounded-q-control bg-q-surface-2 p-3 text-q-caption leading-6 text-q-text-3"><strong>التفسير التنفيذي: </strong>{preview.article.interpretation}</p>}</div><Card className="rounded-q-card border border-q-border bg-q-bg p-5"><h3 className="mt-2 text-q-ui font-bold text-q-text">{preview.scope?.target_name}</h3>
<p className="text-q-caption font-bold text-q-primary">نطاق التطبيق</p><p className="mt-2 text-q-caption leading-6 text-q-text-2">{preview.scope?.description}</p></Card></div> : <EmptyState icon={ShieldCheck} title="المرجع مرتبط ومحمي" description="تعذر تحميل النص التفصيلي لهذه اللائحة بحسابك الحالي، بينما يبقى ربط الموضوع باللائحة والمادة محفوظًا." />}</div>;
}

function Requirements({ preview, requirementsStatus, attachments, priorRouteRequest, busy, onUpload, onUploadPriorEvidence, onSubmitPriorRoute, onRemove, onFulfill }: { preview: RegulationPreview | null; requirementsStatus: RequirementsStatus | null; attachments: TopicAttachment[]; priorRouteRequest: PriorRouteRequest | null; busy: boolean; onUpload: (file: File, requirementCode?: string) => void; onUploadPriorEvidence: (council: PriorRouteCouncil, file: File) => void; onSubmitPriorRoute: () => void; onRemove: (id: string) => void; onFulfill: (code: string) => void }) {
  const priorCouncils = groupPriorRouteCouncils(priorRouteRequest?.steps ?? []);
  const priorRouteReady = priorCouncils.length > 0 && priorCouncils.every((council) => council.all_steps_have_evidence);
  return <div className="space-y-6">
    <SectionTitle icon={Paperclip} title="المتطلبات والمرفقات" description="استكمل المستندات المطلوبة قبل الإحالة أو العرض على الجهة المختصة." />
    {priorRouteRequest && <Card className="overflow-hidden rounded-q-card border border-q-primary bg-q-bg">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-q-border bg-q-surface-2 p-4"><div><h3 className="mt-1 text-q-ui font-bold text-q-text">محاضر وقرارات المجالس السابقة</h3>
<p className="text-q-caption font-bold text-q-primary">استكمال مسار سابق</p><p className="mt-1 text-q-caption leading-5 text-q-text-2">البيانات محفوظة. أكمل المرفقات الناقصة ثم أرسلها للمراجعة المستقلة.</p></div><span className={`rounded-full px-3 py-1.5 text-q-caption font-bold ${priorRouteRequest.status === "draft" ? "bg-q-warning-soft text-q-warning" : priorRouteRequest.status === "submitted" ? "bg-q-surface-2 text-q-link" : priorRouteRequest.status === "approved" ? "bg-q-success-soft text-q-success" : "bg-q-surface-2 text-q-text-2"}`}>{priorRouteRequest.status === "draft" ? "مسودة تحتاج استكمال" : priorRouteRequest.status === "submitted" ? "بانتظار المراجعة" : priorRouteRequest.status === "approved" ? "تم اعتماد الأدلة" : priorRouteRequest.status === "rejected" ? "أعيدت الأدلة للتصحيح" : "حالة الطلب غير معرّفة"}</span></div>
      <div className="space-y-3 p-4">{priorCouncils.map((council, index) => <article key={council.id} className="rounded-q-control border border-q-border bg-q-surface p-4"><div className="flex flex-wrap items-start gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-q-control bg-q-primary text-q-caption font-bold text-q-on-primary">{index + 1}</span><div className="min-w-0 flex-1"><h4 className="text-q-caption font-bold text-q-text">{council.responsible_unit_name_ar || council.step_title}</h4><p className="mt-1 text-q-caption text-q-text-2">{dateLabel(council.meeting_date)}{council.meeting_reference ? ` · ${council.meeting_reference}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-q-caption font-bold ${council.all_steps_have_evidence ? "bg-q-success-soft text-q-success" : "bg-q-warning-soft text-q-warning"}`}>{council.all_steps_have_evidence ? "المحضر مرفوع" : "المحضر مطلوب"}</span></div><div className="mt-3 grid gap-2 rounded-q-control bg-q-surface-2 p-3 text-q-caption leading-5 text-q-link md:grid-cols-2"><p><b className="text-q-link">القرار: </b>{council.decision_text}</p><p><b className="text-q-link">سبب التجاوز: </b>{council.bypass_reason}</p></div><div className="mt-3 flex flex-wrap items-center gap-2">{council.attachments.map((attachment) => <a key={attachment.id} href={attachment.file_url} target="_blank" rel="noreferrer" className="rounded-q-control border border-q-primary bg-q-surface-2 px-2.5 py-1.5 text-q-caption font-bold text-q-primary">عرض {attachment.file_name}</a>)}{priorRouteRequest.status === "draft" && priorRouteRequest.is_requester && <label className={`cursor-pointer rounded-q-control bg-q-primary px-3 py-2 text-q-caption font-bold text-q-on-primary ${busy ? "pointer-events-none opacity-50" : ""}`}>{council.all_steps_have_evidence ? "إضافة محضر آخر" : "رفع محضر المجلس"}<input className="hidden" type="file" accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onUploadPriorEvidence(council, file); event.currentTarget.value = ""; }} /></label>}</div></article>)}</div>
      {priorRouteRequest.status === "draft" && priorRouteRequest.is_requester && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-q-border bg-q-surface p-4"><p className="text-q-caption text-q-text-2">لن تتغير بداية المسار إلا بعد إرسال الأدلة واعتمادها من مراجع مستقل.</p><Button variant="success" type="submit" disabled={!priorRouteReady || busy} onClick={onSubmitPriorRoute} className="rounded-q-control px-4 py-2.5 font-bold disabled:cursor-not-allowed ">{busy ? "جارٍ الحفظ…" : "إرسال الأدلة للمراجعة"}</Button></div>}
    </Card>}
    <RequirementsChecklist status={requirementsStatus} busy={busy} onUpload={onUpload} onFulfill={onFulfill} />
    {preview ? <div className="overflow-hidden rounded-q-control border border-q-border">
      <div className="grid grid-cols-[1fr_auto_auto] gap-4 bg-q-bg px-4 py-3 text-q-caption font-bold text-q-text-3"><span>المتطلب</span><span>موعده</span><span>الحالة</span></div>
      {preview.requirements?.length ? preview.requirements.map((requirement, index) => <div key={`${requirement.name}-${index}`} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-t border-q-border px-4 py-3 text-q-caption"><span className="font-bold text-q-link">{requirement.name}</span><span className="text-q-text-2">{requirement.timing || "عند الإرسال"}</span><span className={`rounded-full px-2 py-1 text-q-caption font-bold ${requirement.mandatory ? "bg-q-warning-soft text-q-warning" : "bg-q-surface-2 text-q-text-2"}`}>{requirement.mandatory ? "مطلوب" : "اختياري"}</span></div>) : <div className="p-5 text-center text-q-caption text-q-text-3">لا توجد متطلبات إضافية لهذه المادة.</div>}
    </div> : <Card className="rounded-q-card border border-dashed border-q-border bg-q-bg p-4 text-q-caption leading-6 text-q-text-3">لم تُحمّل المتطلبات النظامية بعد. يمكنك مع ذلك رفع المرفقات الداعمة للموضوع.</Card>}
    <div className="rounded-q-control border border-q-border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-q-ui font-bold text-q-text">مرفقات الموضوع</h3><p className="mt-1 text-q-caption text-q-text-3">يدعم PDF وPNG وJPEG وDOCX حتى 25 ميجابايت للملف الواحد.</p></div><label className={`cursor-pointer rounded-q-control bg-q-primary px-3 py-2 text-q-caption font-bold text-q-on-primary ${busy ? "pointer-events-none opacity-50" : ""}`}>{busy ? "جارٍ الرفع…" : "إرفاق ملف"}<input className="hidden" type="file" accept="application/pdf,image/png,image/jpeg,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onUpload(file); event.currentTarget.value = ""; }} /></label></div><div className="mt-4 space-y-2">{attachments.length ? attachments.map((attachment) => <div key={attachment.id} className="flex flex-wrap items-center gap-3 rounded-q-control bg-q-bg p-3"><FolderOpen className="text-q-primary" size={17}/><a href={attachment.file_url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-q-caption font-bold text-q-link hover:underline">{attachment.file_name}</a><span className="text-q-caption text-q-text-2">{attachment.file_size_bytes ? `${Math.ceil(attachment.file_size_bytes / 1024)} KB` : ""}</span><Button variant="ghost" type="submit" disabled={busy} onClick={() => onRemove(attachment.id)} className=" font-bold disabled:opacity-50">حذف</Button></div>) : <p className="rounded-q-control bg-q-bg p-4 text-center text-q-caption text-q-text-3">لا توجد مرفقات لهذا الموضوع.</p>}</div></div>
  </div>;
}

function ReferenceList({ references }: { references: RegulationReference[] }) {
  if (!references.length) return null;
  return <Card className="rounded-q-card border border-q-border bg-q-surface-2 p-4">
    <div className="flex items-center justify-between gap-3"><h3 className="text-q-caption font-bold text-q-text">المراجع التشريعية المرتبطة</h3><span className="rounded-full bg-q-surface-2 px-2 py-1 text-q-caption font-bold text-q-primary">{references.length} مرجع</span></div>
    <div className="mt-3 grid gap-2 md:grid-cols-2">{references.map((reference) => <div key={reference.id} className={`rounded-q-control border p-3 ${reference.is_primary ? "border-q-primary bg-q-surface" : "border-q-border bg-q-bg"}`}>
      <div className="flex items-center gap-2"><span className={`rounded-full px-2 py-1 text-q-caption font-bold ${reference.is_primary ? "bg-q-primary text-q-on-primary" : "bg-q-surface-2 text-q-link"}`}>{reference.is_primary ? "المرجع الحاكم" : "مرجع مساند"}</span><span className="text-q-caption text-q-text-2">{reference.reference_type}</span></div>
      <p className="mt-2 text-q-caption font-bold text-q-text-2">{reference.label || reference.item_title || reference.policy_name || "مرجع تشريعي"}</p>
      <p className="mt-1 text-q-caption text-q-text-2">{[reference.policy_name, reference.version_no ? `الإصدار ${reference.version_no}` : null, reference.item_code].filter(Boolean).join(" · ")}</p>
    </div>)}</div>
  </Card>;
}

function RequirementsChecklist({ status, busy, onUpload, onFulfill }: { status: RequirementsStatus | null; busy: boolean; onUpload: (file: File, requirementCode?: string) => void; onFulfill: (code: string) => void }) {
  if (!status) return null;
  return <div className="overflow-hidden rounded-q-control border border-q-border">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-q-surface-2 px-4 py-3"><div><h3 className="text-q-caption font-bold text-q-text">قائمة الاستيفاء الفعلية</h3><p className="mt-1 text-q-caption text-q-text-3">تُحدّث آليًا من القواعد التنفيذية والمرفقات المرتبطة.</p></div><span className={`rounded-full px-3 py-1 text-q-caption font-bold ${status.ready_for_review ? "bg-q-success-soft text-q-success" : "bg-q-warning-soft text-q-warning"}`}>{status.ready_for_review ? "جاهز للمراجعة" : `${status.missing_mandatory} متطلب إلزامي ناقص`}</span></div>
    {status.items.length ? <div className="divide-y divide-q-border">{status.items.map((item) => {
      const complete = item.status === "fulfilled" || item.status === "waived";
      const isDocument = ["document", "attachment", "evidence"].includes(item.type);
      return <div key={item.code} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto_auto] md:items-center">
        <div><p className="text-q-caption font-bold text-q-text-2">{item.name}</p><p className="mt-1 text-q-caption text-q-text-2">{item.mandatory ? "إلزامي" : "اختياري"} · {item.timing || "قبل المراجعة"}{item.note ? ` · ${item.note}` : ""}</p></div>
        <span className={`w-fit rounded-full px-2 py-1 text-q-caption font-bold ${complete ? "bg-q-success-soft text-q-success" : "bg-q-warning-soft text-q-warning"}`}>{complete ? "مكتمل" : "ناقص"}</span>
        {!complete && isDocument ? <label className={`w-fit cursor-pointer rounded-q-control bg-q-primary px-3 py-2 text-q-caption font-bold text-q-on-primary ${busy ? "pointer-events-none opacity-50" : ""}`}>إرفاق المطلوب<input className="hidden" type="file" onChange={(event) => { const file = event.currentTarget.files?.[0]; if (file) onUpload(file, item.code); event.currentTarget.value = ""; }} /></label> : !complete ? <Button variant="secondary" type="submit" disabled={busy} onClick={() => onFulfill(item.code)} className="w-fit rounded-q-control border px-3 py-2 font-bold disabled:opacity-50">تأكيد الاستيفاء</Button> : <span className="text-q-caption font-bold text-q-success">تم التحقق</span>}
      </div>;
    })}</div> : <p className="p-5 text-center text-q-caption text-q-text-3">لا توجد متطلبات تنفيذية إضافية.</p>}
  </div>;
}

function Workflow({ workflow, priorRouteRequest }: { workflow: Workflow | null; priorRouteRequest: PriorRouteRequest | null }) {
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
        const stepStatus = priorEvidence && !priorApproved
          ? priorRouteRequest?.status === "submitted" ? "موثقة سابقاً — بانتظار اعتماد الأدلة" : "موثقة كمسودة — تحتاج استكمال"
          : statusLabels[step.status ?? ""] ?? "حالة المرحلة غير معرّفة";

        return <div key={step.id} className={`relative rounded-q-control border p-4 ${active ? "border-q-primary bg-q-surface-2" : done ? "border-q-success bg-q-surface-2/40" : "border-q-border bg-q-surface"}`}>
          <div className="flex items-start gap-3">
            <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-q-caption font-bold ${active ? "bg-q-primary text-q-on-primary" : done ? "bg-q-success-soft text-q-success" : "bg-q-surface-2 text-q-link"}`}>
              {done ? <CheckCircle2 size={16} /> : sequence}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-q-caption font-bold text-q-text">{step.snapshot?.name_ar ?? `الخطوة ${sequence}`}</h3>
                <span className={`text-q-caption font-bold ${priorEvidence && !priorApproved ? "text-q-warning" : "text-q-link"}`}>{stepStatus}</span>
              </div>
              <p className="mt-1 text-q-caption text-q-text-2">
                {priorEvidence && !priorApproved
                  ? `سُجل اجتماع ${priorEvidence.responsible_unit_name_ar || "المجلس"} بتاريخ ${dateLabel(priorEvidence.meeting_date)}، ولا تُعد المرحلة مكتملة نظامياً قبل اعتماد الأدلة.`
                  : active ? "تُتخذ قرارات الموضوع داخل الاجتماع بعد المناقشة." : done ? `تمت في ${dateLabel(step.acted_at ?? priorRouteRequest?.reviewed_at)}` : "تُفتح بعد اكتمال الخطوة السابقة."}
              </p>
              {step.required_permission_code && <p className="mt-1 text-q-caption text-q-text-3">هذه الخطوة موجهة للدور المختص ضمن المسار.</p>}
              {step.comment && <p className="mt-2 rounded-q-control bg-q-surface/70 p-2 text-q-caption text-q-text-2"><strong>ملاحظة الإجراء: </strong>{step.comment}</p>}
            </div>
          </div>
        </div>;
      })}
    </div>
  </div>;
}

function Referrals({ referrals }: { referrals: Referral[] }) { if (!referrals.length) return <EmptyState icon={GitPullRequestArrow} title="لا توجد إحالات" description="ستظهر الإحالات بين الجهات هنا فور تسجيلها على الموضوع." />; return <div className="space-y-6"><SectionTitle icon={GitPullRequestArrow} title="الإحالات" description="سجل انتقال الموضوع بين الجهات واختصاصاتها." />{referrals.map((referral) => <div key={referral.id} className="rounded-q-control border border-q-border p-4"><div className="flex flex-wrap items-center gap-2 text-q-caption font-bold text-q-link"><span>{referral.from_unit_name_ar || "الجهة السابقة"}</span><ArrowRight className="text-q-link" size={15}/><span>{referral.to_unit_name_ar || "الجهة المحال إليها"}</span><span className="mr-auto rounded-full bg-q-surface-2 px-2 py-1 text-q-caption text-q-primary">{statusLabels[referral.status ?? ""] ?? "قيد المعالجة"}</span></div><p className="mt-2 text-q-caption leading-6 text-q-text-2">{referral.referral_reason || "لم يُسجل سبب الإحالة."}</p><p className="mt-2 text-q-caption text-q-text-2">أحيل في {dateLabel(referral.referred_at)}</p></div>)}</div>; }

function Decisions({ preview, meetings, priorRouteRequest }: { preview: RegulationPreview | null; meetings: TopicMeetingHistory[]; priorRouteRequest: PriorRouteRequest | null }) {
  const hasResults = meetings.some((meeting) => meeting.voting_rounds.length || meeting.decisions.length);
  const priorCouncils = groupPriorRouteCouncils(priorRouteRequest?.steps ?? []);
  return <div className="space-y-6"><SectionTitle icon={Gavel} title="القرارات والتصويت" description="سجل الاجتماعات وجولات التصويت والقرارات المرتبطة بهذا الموضوع." />
    {preview?.approval_effect && <Card className="rounded-q-card border border-q-primary bg-q-surface-2 p-4 text-q-caption leading-6 text-q-link"><strong className="text-q-primary">أثر اللائحة على الاعتماد: </strong>{preview.approval_effect}<br/><strong className="text-q-primary">أثرها على التصويت: </strong>{preview.voting_effect}</Card>}
    {priorCouncils.length > 0 && <section className="overflow-hidden rounded-q-control border border-q-primary">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-q-surface-2 px-4 py-3"><div><h3 className="text-q-caption font-bold text-q-text">المجالس السابقة الموثقة</h3><p className="mt-1 text-q-caption text-q-text-2">اجتماعات عُقدت قبل إدخال الموضوع إلى النظام، لذلك لا توجد لها جولة تصويت إلكترونية داخل قرار.</p></div><span className={`rounded-full px-2.5 py-1 text-q-caption font-bold ${priorRouteRequest?.status === "approved" ? "bg-q-success-soft text-q-success" : priorRouteRequest?.status === "submitted" ? "bg-q-surface-2 text-q-link" : "bg-q-warning-soft text-q-warning"}`}>{priorRouteRequest?.status === "approved" ? "معتمدة ومكتملة" : priorRouteRequest?.status === "submitted" ? "بانتظار اعتماد الأدلة" : "مسودة تحتاج استكمال"}</span></header>
      <div className="grid gap-3 p-4 lg:grid-cols-2">{priorCouncils.map((council) => <article key={council.id} className="rounded-q-control border border-q-border bg-q-surface p-4"><div className="flex items-start justify-between gap-3"><div><h4 className="text-q-caption font-bold text-q-text">{council.responsible_unit_name_ar || council.step_title}</h4><p className="mt-1 text-q-caption text-q-text-2">{council.meeting_reference || "اجتماع سابق"} · {dateLabel(council.meeting_date)}</p></div><span className="rounded-full bg-q-surface-2 px-2 py-1 text-q-caption font-bold text-q-link">{decisionTypeLabels[council.decision_type] ?? "قرار موثق"}</span></div><div className="mt-3 rounded-q-control bg-q-surface-2/60 p-3"><p className="text-q-caption font-bold text-q-success">القرار المسجل</p><p className="mt-1 text-q-caption leading-6 text-q-text-2">{council.decision_text}</p></div><div className="mt-2 rounded-q-control bg-q-bg p-3 text-q-caption leading-5 text-q-text-3"><strong>سبب تجاوز المرحلة: </strong>{council.bypass_reason}</div><p className="mt-2 text-q-caption text-q-text-2">التصويت الإلكتروني: غير متاح — الاجتماع تم خارج النظام.</p></article>)}</div>
    </section>}
    {meetings.length ? <div className="space-y-4">{meetings.map((entry) => <article key={entry.agenda_item_id} className="overflow-hidden rounded-q-control border border-q-border">
      <header className="flex flex-wrap items-center justify-between gap-3 bg-q-bg px-4 py-3"><div><h3 className="text-q-caption font-bold text-q-text">{entry.meeting.title}</h3><p className="mt-1 text-q-caption text-q-text-2">{entry.meeting.meeting_no || "اجتماع"} · {dateLabel(entry.meeting.scheduled_date)} · {entry.meeting.unit_name || "الجهة المختصة"}</p></div><span className="rounded-full bg-q-surface-2 px-2 py-1 text-q-caption font-bold text-q-link">{statusLabels[entry.meeting.status] ?? "حالة الاجتماع غير معرّفة"}</span></header>
      <div className="grid gap-3 p-4 lg:grid-cols-2">
        <div><p className="text-q-caption font-bold text-q-text-2">جولات التصويت</p>{entry.voting_rounds.length ? <div className="mt-2 space-y-2">{entry.voting_rounds.map((round) => <div key={round.id} className="rounded-q-control border border-q-border p-3 text-q-caption text-q-link"><div className="flex justify-between gap-2"><strong>الجولة {round.round_number}</strong><span>{round.result ? decisionTypeLabels[round.result] ?? "نتيجة مسجلة" : statusLabels[round.status] ?? "حالة التصويت غير معرّفة"}</span></div>{round.status === "closed" ? <p className="mt-2">موافق: {round.approve_count ?? 0} · رافض: {round.reject_count ?? 0} · ممتنع: {round.abstain_count ?? 0} · المؤهلون: {round.eligible_voter_count ?? 0}</p> : <p className="mt-2">تظهر نتيجة الجولة وأعداد الأصوات بعد إغلاق التصويت.</p>}</div>)}</div> : <p className="mt-2 rounded-q-control bg-q-surface-2 p-3 text-q-caption text-q-text-2">لم تُفتح جولة تصويت بعد.</p>}</div>
        <div><p className="text-q-caption font-bold text-q-text-2">القرارات الصادرة</p>{entry.decisions.length ? <div className="mt-2 space-y-2">{entry.decisions.map((decision) => <Card key={decision.id} className="rounded-q-card border border-q-success-soft bg-q-success-soft p-3"><div className="flex flex-wrap justify-between gap-2 text-q-caption font-bold text-q-success"><span>{decision.decision_no}</span><span className="flex items-center gap-2">{decision.is_corrected && <span className="rounded-q-pill bg-q-surface px-2 py-1">مصحح · {decision.correction_no}</span>}{statusLabels[decision.decision_status] ?? "حالة القرار غير معرّفة"}</span></div><p className="mt-2 whitespace-pre-wrap text-q-ui leading-6 text-q-text-2">{decision.decision_text}</p>{decision.is_corrected && <details className="mt-2 rounded-q-control border border-q-border bg-q-surface p-2 text-q-caption text-q-text-2"><summary className="cursor-pointer font-bold text-q-link">عرض النص الأصلي</summary><p className="mb-0 whitespace-pre-wrap leading-6">{decision.original_decision_text || "لا يتوفر نص أصلي للعرض."}</p></details>}</Card>)}</div> : <p className="mt-2 rounded-q-control bg-q-surface-2 p-3 text-q-caption text-q-text-3">لم يصدر قرار بعد.</p>}</div>
      </div>
      {entry.minutes && <section className="border-t border-q-border bg-q-surface-2 p-4" aria-label={`محضر ${entry.meeting.title}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><div className="flex flex-wrap items-center gap-2"><h4 className="text-q-ui font-bold text-q-text">محضر المجلس السابق</h4>{entry.minutes.is_corrected && <span className="rounded-q-pill bg-q-info-soft px-2 py-1 text-q-caption font-bold text-q-link">مصحح · {entry.minutes.correction_no}</span>}</div><p className="mt-1 text-q-caption text-q-text-3">{entry.meeting.unit_name || "المجلس المختص"} · {entry.meeting.meeting_no || "اجتماع موثق"}</p></div>
          <div className="flex flex-wrap items-center gap-2"><span className={`rounded-q-pill px-3 py-1 text-q-caption font-bold ${entry.minutes.status === "approved" ? "bg-q-success-soft text-q-success" : "bg-q-warning-soft text-q-warning"}`}>{entry.minutes.status === "approved" ? "محضر معتمد" : "المحضر قيد الاعتماد"}</span>{entry.minutes.status === "approved" && <MeetingMinutesDownloadButton meetingId={entry.meeting.id} meetingTitle={entry.meeting.title} />}</div>
        </div>
        {entry.minutes.content ? <Card className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap rounded-q-card border border-q-border bg-q-surface p-4 text-q-ui leading-7 text-q-text-2">{entry.minutes.content}</Card> : <InlineMessage className="mt-3" tone="warning">يظهر النص الرسمي للمحضر بعد اكتمال المصادقة واعتماده.</InlineMessage>}
        {entry.minutes.is_corrected && <div className="mt-2"><p className="m-0 text-q-caption text-q-text-2">توقيعات النسخة المصححة: {entry.minutes.signature_count ?? 0} من 2. تواقيع الحاضرين محفوظة على المحضر الأصلي.</p><details className="mt-2 rounded-q-control border border-q-border bg-q-surface p-3 text-q-caption text-q-text-2"><summary className="cursor-pointer font-bold text-q-link">عرض المحضر الأصلي</summary><p className="mb-0 whitespace-pre-wrap leading-7">{entry.minutes.original_content || "لا يتوفر نص أصلي للعرض."}</p></details></div>}
        <p className="mt-2 text-q-caption text-q-text-3">{entry.minutes.approved_at ? `اعتمد في ${dateLabel(entry.minutes.approved_at)}` : `آخر تحديث ${dateLabel(entry.minutes.updated_at)}`}</p>
      </section>}
    </article>)}</div> : priorCouncils.length === 0 ? <EmptyState icon={hasResults ? Vote : Gavel} title="لم يُدرج الموضوع في اجتماع بعد" description="بعد إدراج الموضوع في اجتماع ومناقشته، ستظهر هنا الجلسة وجولات التصويت والقرارات الناتجة." /> : null}
  </div>;
}

function ActivityLog({ items, priorRouteRequest, topicCreatedAt, typedTopic }: { items: TopicActivity[]; priorRouteRequest: PriorRouteRequest | null; topicCreatedAt?: string; typedTopic?: boolean }) {
  const priorCouncils = groupPriorRouteCouncils(priorRouteRequest?.steps ?? []);
  if (!items.length && !priorRouteRequest) return <EmptyState icon={Activity} title="لا يوجد نشاط مسجل بعد" description="سيظهر هنا سجل إنشاء الموضوع وتغير حالته والإجراءات المصرح بها." />;
  return <div className="space-y-6"><SectionTitle icon={Activity} title="سجل النشاط والتدقيق" description="سجل زمني غير قابل للتعديل لتغيرات الموضوع وإجراءاته." /><div className="space-y-3">
    {priorRouteRequest && <Card className="flex gap-3 rounded-q-card border border-q-border bg-q-bg p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-q-primary"/><div><p className="text-q-caption font-bold text-q-text-2">تسجيل مسار سابق لـ {priorCouncils.length} {priorCouncils.length === 1 ? "مجلس" : "مجالس"}</p><p className="mt-1 text-q-caption leading-6 text-q-text-2">{priorCouncils.map((council) => council.responsible_unit_name_ar || council.step_title).join("، ")}</p><p className="mt-2 text-q-caption text-q-text-2">{dateLabel(topicCreatedAt)} · {priorRouteRequest.status === "approved" ? "اعتمدت الأدلة وأغلقت المراحل السابقة" : priorRouteRequest.status === "submitted" ? "أرسلت الأدلة للمراجعة المستقلة" : "حُفظت كمسودة تحتاج استكمال"}</p></div></Card>}
    {priorRouteRequest?.submitted_at && <Card className="flex gap-3 rounded-q-card border border-q-primary bg-q-surface-2/40 p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-q-primary"/><div><p className="text-q-caption font-bold text-q-text-2">إرسال أدلة المسار السابق للمراجعة</p><p className="mt-1 text-q-caption leading-6 text-q-text-2">اكتملت مرفقات المجالس السابقة وأُحيلت إلى مراجع مستقل.</p><p className="mt-2 text-q-caption text-q-text-2">{dateLabel(priorRouteRequest.submitted_at)}</p></div></Card>}
    {priorRouteRequest?.reviewed_at && <Card className="flex gap-3 rounded-q-card border border-q-success bg-q-surface-2/40 p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-q-success-soft"/><div><p className="text-q-caption font-bold text-q-text-2">{priorRouteRequest.status === "approved" ? "اعتماد أدلة المجالس السابقة" : "إعادة أدلة المجالس السابقة للتصحيح"}</p>{priorRouteRequest.review_comment && <p className="mt-1 text-q-caption leading-6 text-q-text-2">{priorRouteRequest.review_comment}</p>}<p className="mt-2 text-q-caption text-q-text-2">{dateLabel(priorRouteRequest.reviewed_at)}</p></div></Card>}
    {items.map((item) => {
      const title = item.source === "status_history"
        ? (typedTopic && item.to_status === "new" ? "تم تقديم الموضوع" : `${item.from_status ? `${statusLabels[item.from_status] ?? "الحالة السابقة"} ← ` : ""}${item.to_status ? statusLabels[item.to_status] ?? "تحديث حالة الموضوع" : "تحديث حالة الموضوع"}`)
        : activityActionLabels[item.action] ?? "إجراء موثق على الموضوع";
      const summary = item.summary ? activityReasonLabels[item.summary] ?? item.summary : null;
      return <div key={item.id} className="flex gap-3 rounded-q-card border border-q-border bg-q-surface p-4"><span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-q-primary"/><div><p className="text-q-ui font-bold text-q-text">{title}</p>{summary && <p className="mt-1 text-q-ui leading-6 text-q-text-2">{summary}</p>}<p className="mt-2 text-q-caption text-q-text-3">{item.actor_name_ar || "النظام"} · {dateLabel(item.occurred_at)}</p></div></div>;
    })}
  </div></div>;
}

function SectionTitle({ icon: Icon, title, description }: { icon: typeof FileText; title: string; description: string }) { return <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-primary"><Icon size={19}/></span><div><h2 className="text-q-body font-bold text-q-text">{title}</h2><p className="mt-1 text-q-caption leading-5 text-q-text-2">{description}</p></div></div>; }
function Info({ label, value }: { label: string; value: string }) { return <Card className="rounded-q-card border border-q-border bg-q-bg p-3"><p className="text-q-caption font-bold text-q-text-3">{label}</p><p className="mt-1.5 text-q-caption font-bold text-q-text-2">{value}</p></Card>; }
