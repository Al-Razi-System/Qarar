"use client";

import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Calendar, CalendarDays, Check, CheckCircle2, ChevronLeft, CircleDot, Clock, FileText, Layers3, LoaderCircle, MapPin, Pencil, Play, Plus, Search, Users, X,
} from "lucide-react";
import { meetingRpc as rpc } from "../api/meetings-client";
import {
  isAgendaEditable, meetingStatusLabels as statusLabels, meetingStatusTone as statusTone,
  type AgendaCandidate, type Meeting, type MeetingDetail, type MeetingFormOptions,
  type MeetingMinutes, type MeetingReadiness, type MeetingStartTiming, type MeetingTopicAttachment, type MinuteApproval, type SignatureStrokes,
} from "../model/meeting";
import { Button } from "@/shared/ui/button";
import { AdministrativeInput } from "@/shared/ui/administrative-field";
import { MeetingQuorumField } from "./meeting-quorum-field";
import { meetingScheduleLabel } from "../model/meeting-schedule";
import { localDateKey, meetingOperationalGroup } from "../model/meeting-operational-state";
import { MeetingAgendaPanel } from "./meeting-agenda-panel";
import { ScheduledAgendaSuggestions } from "./scheduled-agenda-suggestions";
import {AgendaCandidateCard} from "./submitted-agenda-suggestions";
import {AgendaInstructionsDialog} from "./agenda-instructions-dialog";
import {AgendaCandidateDetailsDialog} from "./agenda-candidate-details-dialog";
import { CompletedMeetingSummary } from "./completed-meeting-summary";
import { MeetingMinutesWorkspace } from "./meeting-minutes-workspace";
import { InvitationTimingDialog } from "./invitation-timing-dialog";
import { MeetingStartConfirmationDialog } from "./meeting-start-confirmation-dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { Dialog } from "@/shared/ui/dialog";

type Notice = { kind: "success" | "error"; text: string };
type MeetingSeries = {
  id: string; title_ar: string; frequency: "weekly" | "monthly" | "quarterly" | "semiannual" | "annual" | "custom"; interval_count: number;
  occurrence_count: number; starts_on: string;
  occurrences: Array<{ meeting_id: string; occurrence_number: number; scheduled_date: string; meeting_no: string; status: string; title_ar: string }>;
};
const frequencyLabels: Record<MeetingSeries["frequency"], string> = {
  weekly: "أسبوعية", monthly: "شهرية", quarterly: "ربعية", semiannual: "نصف سنوية",
  annual: "سنوية", custom: "مخصصة",
};
function meetingErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("agenda is locked in meeting status")) {
    return "لا يمكن تعديل جدول الأعمال بعد بدء الاجتماع. اختر اجتماعًا في حالة مسودة أو مجدولًا.";
  }
  return message;
}

const meetingGroups = [
  { key: "upcoming", label: "القادمة", description: "مجدولة وجاهزة للبدء", statuses: ["ready_to_start", "scheduled"] },
  { key: "missed", label: "تحتاج إجراء", description: "فات موعدها ولم تُفتح", statuses: [] },
  { key: "live", label: "منعقدة الآن", description: "جلسات قيد الانعقاد", statuses: ["in_progress"] },
  { key: "completion", label: "قيد الإكمال", description: "المحاضر والمصادقات", statuses: ["waiting_for_minutes", "waiting_for_approval"] },
  { key: "completed", label: "المكتملة", description: "السجل النهائي والأرشيف", statuses: ["closed", "archived"] },
  { key: "drafts", label: "المسودات", description: "اجتماعات قيد التجهيز", statuses: ["draft"] },
  { key: "cancelled", label: "الملغاة", description: "اجتماعات أُلغي انعقادها", statuses: ["cancelled"] },
] as const;

const groupPresentation = {
  all: { icon: Layers3, tone: "border-slate-200 bg-white text-slate-700", active: "border-[#0877d6] bg-[#0877d6] text-white" },
  upcoming: { icon: CalendarDays, tone: "border-blue-100 bg-blue-50/70 text-blue-800", active: "border-blue-600 bg-blue-600 text-white" },
  missed: { icon: AlertCircle, tone: "border-amber-200 bg-amber-50/70 text-amber-900", active: "border-amber-500 bg-amber-500 text-white" },
  live: { icon: CircleDot, tone: "border-emerald-100 bg-emerald-50/70 text-emerald-800", active: "border-emerald-600 bg-emerald-600 text-white" },
  completion: { icon: FileText, tone: "border-amber-100 bg-amber-50/70 text-amber-900", active: "border-amber-500 bg-amber-500 text-white" },
  completed: { icon: CheckCircle2, tone: "border-violet-100 bg-violet-50/70 text-violet-800", active: "border-violet-600 bg-violet-600 text-white" },
  drafts: { icon: FileText, tone: "border-slate-200 bg-slate-50 text-slate-700", active: "border-slate-700 bg-slate-700 text-white" },
  cancelled: { icon: X, tone: "border-red-100 bg-red-50/70 text-red-800", active: "border-red-600 bg-red-600 text-white" },
} as const;

function groupedMeetings(meetings: Meeting[], today: string) {
  return meetingGroups.map((group) => ({
    ...group,
    meetings: meetings.filter((meeting) => meetingOperationalGroup(meeting, today) === group.key),
  })).filter((group) => group.meetings.length > 0);
}

function agendaLockMessage(status: string) {
  if (status === "waiting_for_minutes") return "انتهت الجلسة، وأصبح جدول الأعمال ثابتًا لحين إعداد المحضر.";
  if (status === "waiting_for_approval") return "انتهت الجلسة، والمحضر الآن بانتظار المصادقات النهائية.";
  if (status === "closed" || status === "archived") return "اكتمل الاجتماع واعتمد محضره؛ جدول الأعمال محفوظ كسجل نهائي.";
  if (status === "cancelled") return "أُلغي الاجتماع وأصبح جدول أعماله للعرض فقط.";
  return "بدأ الاجتماع، لذلك أصبح جدول الأعمال مقفلًا ولا يمكن إضافة أو إزالة موضوعات.";
}

export function MeetingsWorkspace() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [series, setSeries] = useState<MeetingSeries[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [instructionTarget,setInstructionTarget]=useState<{topicId:string;title:string;text:string;updatedAt?:string}|null>(null);
  const [candidateTarget,setCandidateTarget]=useState<AgendaCandidate|null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [editModal, setEditModal] = useState(false);
  const [invitationModal, setInvitationModal] = useState(false);
  const [startTiming, setStartTiming] = useState<MeetingStartTiming | null>(null);
  const [startSessionPending, setStartSessionPending] = useState(false);
  const [startSessionError, setStartSessionError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<MeetingSeries["frequency"]>("monthly");
  const [editRecurrenceFrequency, setEditRecurrenceFrequency] = useState<MeetingSeries["frequency"]>("monthly");
  const [editRecurring, setEditRecurring] = useState(false);
  const [selectedMeetingTypeId, setSelectedMeetingTypeId] = useState("");
  const [meetingOptions, setMeetingOptions] = useState<MeetingFormOptions | null>(null);
  const [meetingOptionsLoading, setMeetingOptionsLoading] = useState(false);
  const [agendaCandidates, setAgendaCandidates] = useState<AgendaCandidate[]>([]);
  const [agendaSearchNotice,setAgendaSearchNotice]=useState<string|null>(null);
  const [eligibleAgendaCount, setEligibleAgendaCount] = useState<number | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaModal, setAgendaModal] = useState(false);
  const [agendaQuery, setAgendaQuery] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [minutesLoading, setMinutesLoading] = useState(false);
  const [minutesText, setMinutesText] = useState("");
  const [readiness, setReadiness] = useState<MeetingReadiness | null>(null);
  const [topicAttachments, setTopicAttachments] = useState<MeetingTopicAttachment[]>([]);
  const listRequestRef = useRef<AbortController | null>(null);
  const lastListSuccessAtRef = useRef(0);
  const today = localDateKey();

  async function loadMeetings(options: { background?: boolean } = {}) {
    listRequestRef.current?.abort();
    const controller = new AbortController();
    listRequestRef.current = controller;
    if (options.background) setRefreshing(true);
    else setLoading(true);
    setLoadError(null);
    try {
      const seriesRequest = rpc<MeetingSeries[]>("list_meeting_series", {}, { signal: controller.signal, timeoutMs: 12_000 })
        .catch(() => []);
      const result = await rpc<{ items: Meeting[]; total: number }>("search_meetings", {
        p_query: deferredQuery.trim() || null, p_status: null, p_unit_id: null,
        p_from_date: fromDate || null, p_to_date: toDate || null, p_limit: 50, p_offset: 0,
      }, { signal: controller.signal, timeoutMs: 12_000 });
      if (controller.signal.aborted) return;
      setMeetings(result.items ?? []);
      setTotal(result.total ?? 0);
      lastListSuccessAtRef.current = Date.now();
      setLoading(false);
      const nextMeetings = result.items ?? [];
      if (!nextMeetings.length || (selected && !nextMeetings.some((meeting) => meeting.id === selected.id))) {
        setSelected(null);
      }
      const nextSeries = await seriesRequest;
      if (!controller.signal.aborted) setSeries(nextSeries);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return;
      controller.abort();
      const message = err instanceof Error ? err.message : "تعذر تحميل الاجتماعات.";
      const requestId = typeof err === "object" && err !== null && "requestId" in err && typeof err.requestId === "string"
        ? err.requestId
        : null;
      setLoadError(requestId ? `${message} مرجع المتابعة: ${requestId}` : message);
    } finally {
      if (listRequestRef.current === controller) {
        listRequestRef.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }

  async function openDetail(meetingId: string) {
    setDetailLoading(true); setNotice(null);
    try {
      const detail = await rpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId });
      setSelected(detail);
      try { setTopicAttachments(await rpc<MeetingTopicAttachment[]>("list_meeting_topic_attachments", { p_meeting_id: meetingId })); }
      catch { setTopicAttachments([]); }
      if (isAgendaEditable(detail.status) && detail.capabilities?.can_manage_agenda) {
        try {
          const candidates = await rpc<{ total?: number }>("search_eligible_agenda_topics", {
            p_meeting_id: meetingId, p_query: null, p_limit: 1, p_offset: 0,
          });
          setEligibleAgendaCount(candidates.total ?? 0);
        } catch {
          setEligibleAgendaCount(null);
        }
      } else {
        setEligibleAgendaCount(null);
      }
      if (["draft","scheduled","ready_to_start"].includes(detail.status)) {
        try { setReadiness(await rpc<MeetingReadiness>("get_meeting_readiness", { p_meeting_id: meetingId })); }
        catch (error) {
          setReadiness(null);
          setNotice({ kind: "error", text: error instanceof Error ? `تعذر فحص جاهزية الاجتماع: ${error.message}` : "تعذر فحص جاهزية الاجتماع." });
        }
      } else setReadiness(null);
      if (["waiting_for_minutes", "waiting_for_approval"].includes(detail.status)) {
        await loadMinutes(meetingId);
      } else {
        setMinutes(null); setMinutesText("");
      }
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التحميل." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function loadMinutes(meetingId: string) {
    setMinutesLoading(true);
    try {
      const result = await rpc<MeetingMinutes | null>("get_meeting_minutes", { p_meeting_id: meetingId });
      setMinutes(result);
      setMinutesText(result?.content_final ?? result?.content_draft ?? "");
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تحميل المحضر." });
    } finally { setMinutesLoading(false); }
  }

  async function saveMinutesDraft() {
    if (!selected) return;
    setMinutesLoading(true); setNotice(null);
    try {
      await rpc("save_meeting_minutes_draft", { p_meeting_id: selected.id, p_content: minutesText, p_expected_updated_at: minutes?.updated_at ?? null });
      await loadMinutes(selected.id);
      setNotice({ kind: "success", text: "حُفظت مسودة المحضر مع توثيق آخر تعديل." });
    } catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر حفظ المحضر." }); }
    finally { setMinutesLoading(false); }
  }

  async function generateMinutesDraft() {
    if (!selected) return;
    setMinutesLoading(true); setNotice(null);
    try {
      await rpc("generate_meeting_minutes_draft", { p_meeting_id: selected.id });
      await loadMinutes(selected.id);
      setNotice({ kind: "success", text: "جُهزت مسودة مرتبة من الحضور ونتائج بنود الجلسة. راجعها قبل الإرسال." });
    } catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تجهيز مسودة المحضر." }); }
    finally { setMinutesLoading(false); }
  }

  async function submitMinutes() {
    if (!selected || !minutes?.id || !minutes.updated_at) return;
    setMinutesLoading(true); setNotice(null);
    try {
      await rpc("submit_meeting_minutes", { p_meeting_id: selected.id, p_content_final: minutesText, p_expected_updated_at: minutes.updated_at });
      await openDetail(selected.id); await loadMeetings();
      setNotice({ kind: "success", text: "أُرسل المحضر للمصادقة وحددت الجهات المسؤولة تلقائيًا." });
    } catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر إرسال المحضر." }); }
    finally { setMinutesLoading(false); }
  }

  async function returnMinutes(approval: MinuteApproval, notes: string) {
    if (!selected) return;
    setMinutesLoading(true); setNotice(null);
    try {
      await rpc("respond_meeting_minutes_approval", { p_approval_id: approval.id, p_decision: "return", p_notes: notes, p_expected_updated_at: approval.updated_at });
      await openDetail(selected.id); await loadMeetings();
      setNotice({ kind: "success", text: "أُعيد المحضر للمقرر مع إلغاء طلبات التوقيع المرتبطة بالنسخة السابقة." });
    } catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر حسم المصادقة." }); }
    finally { setMinutesLoading(false); }
  }

  async function signMinutes(approval: MinuteApproval, signature: SignatureStrokes) {
    if (!selected) return;
    setMinutesLoading(true); setNotice(null);
    try {
      await rpc("sign_meeting_minutes_approval", { p_approval_id: approval.id, p_signature_strokes: signature, p_expected_updated_at: approval.updated_at });
      await openDetail(selected.id); await loadMeetings();
      setNotice({ kind: "success", text: "حُفظ توقيعك وربط ببصمة النسخة النهائية للمحضر." });
    } catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر توقيع المحضر." }); throw err; }
    finally { setMinutesLoading(false); }
  }

  async function openCreateModal() {
    setCreateModal(true);
    setRecurring(false);
    setRecurrenceFrequency("monthly");
    setSelectedMeetingTypeId("");
    setNotice(null);
    setMeetingOptionsLoading(true);
    try {
      const options = await rpc<MeetingFormOptions>("get_sprint02_form_options");
      setMeetingOptions(options);
    } catch (err) {
      setMeetingOptions(null);
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تحميل الجهات وأنواع الاجتماعات المتاحة." });
    } finally {
      setMeetingOptionsLoading(false);
    }
  }

  async function openEditModal() {
    if (!selected || !["draft", "scheduled"].includes(selected.status)) return;
    setNotice(null);
    let availableOptions = meetingOptions;
    if (!availableOptions) {
      setMeetingOptionsLoading(true);
      try {
        availableOptions = await rpc<MeetingFormOptions>("get_sprint02_form_options");
        setMeetingOptions(availableOptions);
      }
      catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تحميل إعدادات الاجتماع." }); return; }
      finally { setMeetingOptionsLoading(false); }
    }
    const currentSeries = series.find((item) => item.occurrences.some((occurrence) => occurrence.meeting_id === selected.id));
    const selectedType = availableOptions?.meeting_types?.find((type) => type.id === selected.meeting_type_id);
    const isLegacyRecurring = Boolean(selectedType?.name_ar.includes("دوري"));
    setEditRecurring(!selected.planned_window_start && (Boolean(currentSeries) || isLegacyRecurring));
    setEditRecurrenceFrequency(currentSeries?.frequency ?? (selected.title_ar.includes("سنوي") ? "annual" : "monthly"));
    setEditModal(true);
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const fd = new FormData(event.currentTarget);
    setCreating(true); setNotice(null);
    try {
      await rpc("save_meeting_with_quorum_v2", {
        p_action: "update",
        p_quorum_percentage: fd.get("quorum_percentage") ? Number(fd.get("quorum_percentage")) : null,
        p_values: {
        p_meeting_id: selected.id,
        p_title_ar: fd.get("title_ar"),
        p_scheduled_date: fd.get("scheduled_date"),
        p_start_time: fd.get("start_time") || null,
        p_end_time: fd.get("end_time") || null,
        p_location_type: fd.get("location_type"),
        p_location_details: fd.get("location_details") || null,
        p_title_en: selected.title_en ?? null,
        p_meeting_type_id: fd.get("meeting_type_id"),
        p_expected_updated_at: selected.updated_at ?? null,
        },
      });
      const currentSeries = series.find((item) => item.occurrences.some((occurrence) => occurrence.meeting_id === selected.id));
      if (!selected.planned_window_start && currentSeries) {
        await rpc("update_meeting_series_recurrence", {
          p_series_id: currentSeries.id,
          p_anchor_meeting_id: selected.id,
          p_frequency: fd.get("frequency"),
          p_interval_count: Number(fd.get("interval_count") || 1),
          p_anchor_date: fd.get("scheduled_date"),
        });
      } else if (!selected.planned_window_start && editRecurring) {
        await rpc("create_meeting_series_from_existing", {
          p_meeting_id: selected.id,
          p_frequency: fd.get("frequency"),
          p_interval_count: Number(fd.get("interval_count") || 1),
          p_occurrence_count: Number(fd.get("occurrence_count") || 6),
        });
      }
      setEditModal(false);
      await openDetail(selected.id);
      await loadMeetings();
      setNotice({ kind: "success", text: "تم تحديث اسم الاجتماع وموعده ومكانه وإعداداته بنجاح." });
    } catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تحديث الاجتماع." }); }
    finally { setCreating(false); }
  }

  async function transitionMeeting(toStatus: string) {
    if (!selected) return;
    setDetailLoading(true); setNotice(null);
    try {
      const needsReason = toStatus === "cancelled";
      const reason = needsReason ? window.prompt("أدخل سبب الإلغاء (5 أحرف على الأقل):") : null;
      if (needsReason && (!reason || reason.trim().length < 5)) { setDetailLoading(false); return; }
      await rpc("transition_meeting", {
        p_meeting_id: selected.id,
        p_to_status: toStatus,
        p_reason: reason,
        p_expected_updated_at: selected.updated_at ?? null,
      });
      setNotice({ kind: "success", text: `تم تحويل الاجتماع إلى "${statusLabels[toStatus] ?? toStatus}" بنجاح.` });
      await openDetail(selected.id);
      await loadMeetings();
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التنفيذ." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function moveAgendaItem(index: number, direction: -1 | 1) {
    if (!selected?.agenda_items) return;
    const target = index + direction;
    if (target < 0 || target >= selected.agenda_items.length) return;
    const ordered = [...selected.agenda_items];
    [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
    setDetailLoading(true); setNotice(null);
    try {
      await rpc("reorder_agenda_items", { p_meeting_id: selected.id, p_ordered_item_ids: ordered.map((item) => item.id), p_expected_meeting_updated_at: selected.updated_at });
      await openDetail(selected.id);
      setNotice({ kind: "success", text: "حُفظ ترتيب جدول الأعمال." });
    } catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر ترتيب جدول الأعمال." }); }
    finally { setDetailLoading(false); }
  }

  async function loadAgendaCandidates(queryOverride?: string) {
    if (!selected) return;
    setAgendaLoading(true);setAgendaSearchNotice(null);
    try {
      const result = await rpc<{ items: AgendaCandidate[]; total?: number; locked?: boolean }>("search_eligible_agenda_topics", {
        p_meeting_id: selected.id, p_query: (queryOverride ?? agendaQuery).trim() || null, p_limit: 30, p_offset: 0,
      });
      setAgendaCandidates(result.items ?? []);
      setEligibleAgendaCount(result.total ?? 0);
      if (result.locked) setNotice({ kind: "error", text: "جدول الأعمال مقفل لأن الاجتماع بدأ. يمكن التعديل فقط في حالة مسودة أو مجدول." });
    } catch (err) {
      const message=meetingErrorMessage(err,"تعذر تحميل الموضوعات المؤهلة. تحقق من الاتصال ثم أعد المحاولة.");
      setAgendaSearchNotice(message);
      setNotice({ kind: "error", text: message });
    } finally { setAgendaLoading(false); }
  }

  async function openAgendaModal() {
    if (!selected) return;
    if (!isAgendaEditable(selected.status)) {
      setNotice({ kind: "error", text: "لا يمكن إضافة موضوعات بعد بدء الاجتماع. اختر اجتماعًا في حالة مسودة أو مجدولًا." });
      return;
    }
    setAgendaModal(true);
    setAgendaCandidates([]);
    setAgendaQuery("");
    await loadAgendaCandidates("");
  }

  async function addAgendaItem(topicId: string) {
    if (!selected) return;
    if (!isAgendaEditable(selected.status)) {
      setNotice({ kind: "error", text: "لا يمكن إضافة موضوعات بعد بدء الاجتماع. اختر اجتماعًا في حالة مسودة أو مجدولًا." });
      return;
    }
    setDetailLoading(true); setNotice(null);
    try {
      await rpc("add_agenda_item", { p_meeting_id: selected.id, p_topic_id: topicId, p_is_exception: false, p_exception_reason: null });
      await openDetail(selected.id); await loadAgendaCandidates();
      setNotice({ kind: "success", text: "تمت إضافة الموضوع إلى جدول الأعمال." });
    } catch (err) {
      setNotice({ kind: "error", text: meetingErrorMessage(err, "تعذر إضافة الموضوع.") });
    } finally { setDetailLoading(false); }
  }

  async function removeAgendaItem(agendaItemId: string) {
    if (!selected || !window.confirm("هل تريد إزالة الموضوع من جدول الأعمال؟")) return;
    if (!isAgendaEditable(selected.status)) {
      setNotice({ kind: "error", text: "لا يمكن تعديل جدول الأعمال بعد بدء الاجتماع." });
      return;
    }
    setDetailLoading(true); setNotice(null);
    try {
      await rpc("remove_agenda_item", { p_agenda_item_id: agendaItemId, p_reason: "إزالة من جدول الأعمال" });
      await openDetail(selected.id); await loadAgendaCandidates();
      setNotice({ kind: "success", text: "تمت إزالة الموضوع من جدول الأعمال." });
    } catch (err) {
      setNotice({ kind: "error", text: meetingErrorMessage(err, "تعذر إزالة الموضوع.") });
    } finally { setDetailLoading(false); }
  }

  async function performOpenLiveSession(confirmedOffSchedule: boolean) {
    if (!selected) return;
    setStartSessionPending(true); setStartSessionError(null); setNotice(null);
    try {
      await rpc("open_meeting_session", {
        p_meeting_id: selected.id,
        p_expected_updated_at: selected.updated_at,
        p_confirmed_off_schedule: confirmedOffSchedule,
      });
      router.push(`/admin/meetings/${selected.id}/live`);
    } catch (err) {
      const text = err instanceof Error ? err.message : "تعذر فتح الجلسة.";
      if (confirmedOffSchedule) setStartSessionError(text);
      else setNotice({ kind: "error", text });
    } finally {
      setStartSessionPending(false);
    }
  }

  async function openLiveSession() {
    if (!selected) return;
    setStartSessionPending(true); setStartSessionError(null); setNotice(null);
    try {
      const timing = await rpc<MeetingStartTiming>("get_meeting_session_start_timing_v2", { p_meeting_id: selected.id });
      if (timing.requires_confirmation) {
        setStartTiming(timing);
        return;
      }
      await performOpenLiveSession(false);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التحقق من موعد الاجتماع." });
    } finally {
      setStartSessionPending(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true); setNotice(null);
    const fd = new FormData(event.currentTarget);
    try {
      const common = {
        p_governance_unit_id: String(fd.get("governance_unit_id") ?? ""),
        p_meeting_type_id: String(fd.get("meeting_type_id") ?? ""),
        p_title_ar: fd.get("title_ar"),
        p_start_time: null,
        p_end_time: null,
        p_location_type: fd.get("location_type") || "onsite",
        p_location_details: fd.get("location_details") || null,
      };
      const values = recurring ? {
        ...common,
        p_first_date: fd.get("scheduled_date"),
        p_frequency: fd.get("frequency"),
        p_interval_count: Number(fd.get("interval_count") || 1),
        p_occurrence_count: Number(fd.get("occurrence_count") || 2),
      } : {
        ...common,
        p_scheduled_date: fd.get("scheduled_date"),
        p_title_en: null,
        p_client_request_id: crypto.randomUUID(),
      };
      const created = await rpc<{ id: string; occurrences?: Array<{ id: string }> }>("save_meeting_with_quorum_v2", {
        p_action: recurring ? "series" : "create",
        p_values: values,
        p_quorum_percentage: fd.get("quorum_percentage") ? Number(fd.get("quorum_percentage")) : null,
      });
      setCreateModal(false);
      setRecurring(false);
      setRecurrenceFrequency("monthly");
      setSelectedMeetingTypeId("");
      setNotice({ kind: "success", text: recurring ? "تم إنشاء سلسلة الاجتماعات وجميع مواعيدها بنجاح." : "تم إنشاء الاجتماع بنجاح." });
      await loadMeetings();
      const firstMeetingId = created.occurrences?.[0]?.id ?? created.id;
      if (firstMeetingId) await openDetail(firstMeetingId);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر الإنشاء." });
    } finally {
      setCreating(false);
    }
  }

  const loadMeetingsOnFilterChange = useEffectEvent(loadMeetings);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadMeetingsOnFilterChange(), 250);
    return () => {
      window.clearTimeout(timer);
      listRequestRef.current?.abort();
    };
  }, [deferredQuery, fromDate, toDate]);

  const refreshWorkspaceOnReturn = useEffectEvent(() => {
    if (listRequestRef.current || Date.now() - lastListSuccessAtRef.current < 30_000) return;
    void loadMeetings({ background: true });
    if (selected?.id) void openDetail(selected.id);
  });
  useEffect(() => {
    const refresh = () => refreshWorkspaceOnReturn();
    const refreshVisible = () => { if (document.visibilityState === "visible") refreshWorkspaceOnReturn(); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshVisible);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, []);

  return (
    <div className="space-y-5">
      {loadError && (
        <div className="space-y-2">
          <InlineMessage tone="error">{loadError}</InlineMessage>
          <Button variant="secondary" onClick={() => void loadMeetings()} disabled={loading}>
            إعادة تحميل الاجتماعات
          </Button>
        </div>
      )}
      {notice && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />} {notice.text}
        </div>
      )}

      <div className="rounded-3xl border border-[#dce7f0] bg-white p-4 shadow-[0_10px_35px_rgba(24,48,80,.055)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-1 flex-wrap items-end gap-3">
          <label className="min-w-64 flex-1"><span className="mb-1.5 block text-[9px] font-black text-[#718399]">البحث</span><div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8796a9]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="العنوان أو رقم الاجتماع" aria-label="البحث في الاجتماعات" className="h-11 w-full rounded-xl border border-[#dfe7ef] bg-[#fafcfe] pr-9 pl-3 text-xs outline-none transition focus:border-[#0877d6] focus:bg-white focus:ring-4 focus:ring-blue-50" />
          </div></label>
          <label><span className="mb-1.5 block text-[9px] font-black text-[#718399]">من تاريخ</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className="h-11 rounded-xl border border-[#dfe7ef] bg-[#fafcfe] px-3 text-[10px] outline-none focus:border-[#0877d6]" /></label>
          <label><span className="mb-1.5 block text-[9px] font-black text-[#718399]">إلى تاريخ</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className="h-11 rounded-xl border border-[#dfe7ef] bg-[#fafcfe] px-3 text-[10px] outline-none focus:border-[#0877d6]" /></label>
          {(query || fromDate || toDate) && <button type="button" onClick={() => { setQuery(""); setFromDate(""); setToDate(""); }} className="h-11 rounded-xl border border-[#dbe5ee] px-4 text-[10px] font-black text-[#60758a] hover:bg-[#f7fafc]">مسح الفلاتر</button>}
          </div>
          <div className="flex items-center gap-3"><span className="rounded-xl bg-[#f2f7fb] px-3 py-2 text-[10px] font-bold text-[#667b90]">{total} اجتماع</span>
          <button onClick={() => void openCreateModal()} className="flex h-11 items-center gap-2 rounded-xl bg-[#0877d6] px-5 text-xs font-black text-white shadow-[0_8px_20px_rgba(8,119,214,.22)] hover:bg-[#0668bd]"><Plus size={16} /> إنشاء اجتماع</button></div>
        </div>
      </div>

      <nav className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8" aria-label="تصنيف الاجتماعات">
        {[{ key: "all", label: "كل الاجتماعات", description: "جميع الحالات", statuses: [] as readonly string[] }, ...meetingGroups].map((group) => {
          const count = group.key === "all" ? meetings.length : meetings.filter((meeting) => meetingOperationalGroup(meeting, today) === group.key).length;
          const presentation = groupPresentation[group.key as keyof typeof groupPresentation]; const Icon = presentation.icon;
          return <button key={group.key} type="button" onClick={() => { setActiveGroup(group.key); setSelected(null); }} className={`min-h-24 rounded-2xl border p-3 text-right transition hover:-translate-y-0.5 hover:shadow-md ${activeGroup === group.key ? presentation.active : presentation.tone}`}><div className="flex items-start justify-between"><span className={`grid h-9 w-9 place-items-center rounded-xl ${activeGroup === group.key ? "bg-white/15" : "bg-white/80"}`}><Icon size={17} /></span><strong className="text-xl font-black">{count}</strong></div><h3 className="mt-2 text-[11px] font-black">{group.label}</h3><p className={`mt-0.5 text-[8px] ${activeGroup === group.key ? "text-white/75" : "opacity-70"}`}>{group.description}</p></button>;
        })}
      </nav>

      {series.length > 0 && (activeGroup === "all" || activeGroup === "upcoming") && <section className="rounded-2xl border border-[#cfe1f1] bg-gradient-to-l from-[#f3f9ff] to-white p-4">
        <div className="mb-3 flex items-center justify-between"><div><p className="text-[9px] font-black text-[#f17822]">الاجتماعات الدورية</p><h2 className="mt-1 text-sm font-black text-[#173652]">السلاسل ومواعيد الانعقاد</h2></div><span className="rounded-full bg-white px-3 py-1 text-[9px] font-black text-[#0877d6]">{series.length} سلسلة</span></div>
        <div className="grid gap-3 lg:grid-cols-2">{series.map((item) => <details key={item.id} className="group rounded-2xl border border-[#dbe8f3] bg-white p-4"><summary className="cursor-pointer list-none"><div className="flex items-start justify-between gap-3"><div><h3 className="text-xs font-black text-[#173652]">{item.title_ar}</h3><p className="mt-1 text-[9px] text-[#718399]">{frequencyLabels[item.frequency] ?? item.frequency}{item.frequency === "custom" ? ` · كل ${item.interval_count} يوم` : ""} · {item.occurrence_count} اجتماعات</p></div><span className="rounded-full bg-[#edf6ff] px-2 py-1 text-[9px] font-black text-[#0877d6]">عرض المواعيد</span></div></summary><div className="mt-3 space-y-2 border-t border-[#edf2f6] pt-3">{item.occurrences.map((occurrence) => <button key={occurrence.meeting_id} type="button" onClick={() => void openDetail(occurrence.meeting_id)} className="flex w-full items-center justify-between rounded-xl bg-[#f8fbfe] px-3 py-2 text-right hover:bg-[#edf6ff]"><span className="text-[10px] font-bold text-[#29455f]">الاجتماع {occurrence.occurrence_number} · {occurrence.scheduled_date}</span><span className={`rounded-full px-2 py-0.5 text-[8px] font-black ${statusTone[occurrence.status] ?? "bg-slate-100"}`}>{statusLabels[occurrence.status] ?? occurrence.status}</span></button>)}</div></details>)}</div>
      </section>}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(420px,.78fr)_minmax(0,1.22fr)]">
        {/* Meetings List */}
        <div className="rounded-2xl border border-[#e2e9f1] bg-white shadow-[0_3px_16px_rgba(24,48,80,.035)]">
          {refreshing && !loading && <p role="status" className="m-3 rounded-q-control bg-q-surface-2 px-3 py-2 text-q-caption text-q-text-2">جارٍ تحديث الاجتماعات في الخلفية…</p>}
          {loading ? (
            <div className="grid min-h-[350px] place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={28} /></div>
          ) : meetings.length === 0 ? (
            <div className="grid min-h-[350px] place-items-center text-center p-8">
              <div>
                <Calendar className="mx-auto text-[#86a8c9]" size={34} />
                <h3 className="mt-3 text-sm font-black text-[#24364e]">لا توجد اجتماعات</h3>
              </div>
            </div>
          ) : (
            <div className="space-y-4 p-4">
              {groupedMeetings(meetings, today).filter((group) => activeGroup === "all" || group.key === activeGroup).map((group) => <section key={group.key} aria-labelledby={`meeting-group-${group.key}`} className="overflow-hidden rounded-2xl border border-[#e4ebf2]">
                <header className="flex items-center justify-between border-y border-[#e9f0f6] bg-[#f8fbfe] px-5 py-2.5 first:border-t-0">
                  <h3 id={`meeting-group-${group.key}`} className="text-[10px] font-black text-[#40566f]">{group.label}</h3>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[9px] font-black text-[#6f8297] ring-1 ring-[#dfe8f0]">{group.meetings.length}</span>
                </header>
                <div className="grid gap-3 p-3">{group.meetings.map((m) => (
                <button key={m.id} onClick={() => void openDetail(m.id)} aria-expanded={selected?.id === m.id} className={`group flex min-h-32 w-full items-start gap-4 rounded-2xl border px-5 py-4 text-right transition focus:outline-none focus:ring-4 focus:ring-blue-100 ${selected?.id === m.id ? "border-[#0877d6] bg-gradient-to-l from-[#e9f5ff] to-white shadow-[0_10px_28px_rgba(8,119,214,.13)]" : "border-[#e6edf3] bg-white hover:-translate-y-0.5 hover:border-[#9bc9f2] hover:shadow-md"}`}>
                  <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e7f2ff] text-[#0066cc]">
                    <Calendar size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${statusTone[m.status] ?? "bg-slate-100 text-slate-600"}`}>{statusLabels[m.status] ?? m.status}</span>
                        <span className="rounded-full bg-[#f2f6fa] px-2 py-0.5 text-[9px] font-bold text-[#60748a]">{m.agenda_item_count ?? m.agenda_count ?? 0} بند</span>
                    </div>
                    <h3 className="text-xs font-black text-[#0a1330]">{m.title_ar}</h3>
                    <p className="mt-1 text-[10px] text-[#7b8ba0]">
                      {meetingScheduleLabel(m)} · {m.start_time ?? ""}-{m.end_time ?? ""} · {m.unit_name_ar ?? "—"}
                    </p>
                    <span className={`mt-3 inline-flex items-center gap-1 text-[9px] font-black ${selected?.id === m.id ? "text-[#0877d6]" : "text-[#718399] group-hover:text-[#0877d6]"}`}>{selected?.id === m.id ? "التفاصيل معروضة" : "عرض تفاصيل الاجتماع"}<ChevronLeft size={12}/></span>
                  </div>
                </button>
                ))}</div>
              </section>)}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        {selected ? <div className="scroll-mt-5 overflow-hidden rounded-2xl border border-[#cfe0ef] bg-white shadow-[0_14px_40px_rgba(24,48,80,.09)] xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
          {detailLoading ? (
            <div className="grid min-h-[400px] place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={28} /></div>
          ) : (
            <div className="divide-y divide-[#edf1f5]">
              <div className="p-5">
                <span className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone[selected.status] ?? ""}`}>{statusLabels[selected.status] ?? selected.status}</span>
                <h2 className="text-base font-black text-[#0a1330]">{selected.title_ar}</h2>
                <p className="mt-1 text-[10px] text-[#7b8ba0]">{selected.meeting_no ?? selected.id}</p>
                {!isAgendaEditable(selected.status) && <p className={`mt-3 rounded-lg px-3 py-2 text-[10px] font-bold leading-5 ${["closed", "archived"].includes(selected.status) ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"}`}>{agendaLockMessage(selected.status)}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-[#52647a]"><Calendar size={13} /> {meetingScheduleLabel(selected)}</div>
                  <div className="flex items-center gap-1.5 text-[#52647a]"><Clock size={13} /> {selected.start_time ?? "—"} - {selected.end_time ?? "—"}</div>
                  <div className="flex items-center gap-1.5 text-[#52647a]"><MapPin size={13} /> {selected.location_details ?? selected.location_type ?? "—"}</div>
                  <div className="flex items-center gap-1.5 text-[#52647a]"><Users size={13} /> {selected.unit_name_ar ?? "—"}</div>
                </div>
              </div>

              {selected.capabilities?.can_manage_agenda && <ScheduledAgendaSuggestions items={selected.scheduled_suggestions ?? []}/>}
              {["closed", "archived"].includes(selected.status) ? <CompletedMeetingSummary meeting={selected} attachments={topicAttachments} /> : <MeetingAgendaPanel
                meetingId={selected.id}
                items={selected.agenda_items ?? []}
                attachments={topicAttachments}
                editable={Boolean(selected.capabilities?.can_manage_agenda && isAgendaEditable(selected.status))}
                busy={detailLoading}
                eligibleCount={eligibleAgendaCount ?? selected.submitted_suggestions?.total ?? 0}
                onAdd={() => void openAgendaModal()}
                onMove={(index, direction) => void moveAgendaItem(index, direction)}
                onRemove={(id) => void removeAgendaItem(id)}
                onEditInstructions={selected.capabilities?.can_edit_topic_instructions?item=>{if(item.topic)setInstructionTarget({topicId:item.topic.id,title:item.topic.title_ar,text:item.discussion_instructions??"",updatedAt:item.updated_at});}:undefined}
              />}

              {readiness && ["draft","scheduled","ready_to_start"].includes(selected.status) && <div className="p-5"><h3 className="mb-3 text-xs font-black text-[#0a1330]">جاهزية الاجتماع</h3><div className="grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <div key={check.code} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold ${check.complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><span className={`grid h-5 w-5 place-items-center rounded-full ${check.complete ? "bg-emerald-600 text-white" : "bg-amber-400 text-white"}`}>{check.complete ? "✓" : "!"}</span><span>{check.label}{typeof check.count === "number" ? ` (${check.count})` : ""}</span></div>)}</div></div>}

              {(["waiting_for_minutes", "waiting_for_approval"].includes(selected.status)) && (
                <div className="p-5"><MeetingMinutesWorkspace meeting={selected} minutes={minutes} text={minutesText} loading={minutesLoading} onTextChange={setMinutesText} onGenerate={() => void generateMinutesDraft()} onSave={() => void saveMinutesDraft()} onSubmit={() => void submitMinutes()} onSign={signMinutes} onReturn={returnMinutes} /></div>
              )}

              {/* Transition Actions */}
              <div className="flex flex-wrap gap-2 p-5">
                {["draft", "scheduled"].includes(selected.status) && selected.capabilities?.can_manage && <Button variant="secondary" onClick={() => void openEditModal()}><Clock size={18} /> تحديد وقت الاجتماع</Button>}
                {(["waiting_for_minutes", "waiting_for_approval", "closed", "archived"].includes(selected.status)) && <Link href={`/admin/meetings/${selected.id}/minutes`} className="flex items-center gap-1.5 rounded-xl bg-[#0877d6] px-4 py-2.5 text-[11px] font-black text-white shadow-[0_7px_18px_rgba(8,119,214,.2)]"><FileText size={14} />{["closed", "archived"].includes(selected.status) ? "عرض المحضر النهائي والتواقيع" : "فتح مساحة المحضر والمصادقات"}</Link>}
                {(selected.capabilities?.can_schedule || (selected.status === "draft" && selected.capabilities?.can_manage && selected.schedule_date_confirmed === false)) && <div><Button pending={detailLoading} disabled={selected.schedule_date_confirmed === false} onClick={() => transitionMeeting("scheduled")}><Play size={14}/>جدولة</Button>{selected.schedule_date_confirmed === false && <p className="mt-2 text-q-caption text-q-text-2">حدد يوم الاجتماع ووقتي البداية والنهاية من تعديل الاجتماع أولاً.</p>}</div>}
                {selected.status === "scheduled" && <>{selected.capabilities?.can_send_invitations && <button onClick={() => setInvitationModal(true)} disabled={detailLoading || !readiness?.ready} title={!readiness?.ready ? "أكمل متطلبات الجاهزية أولاً" : "تجهيز دعوات أعضاء المجلس"} className="flex items-center gap-1.5 rounded-xl border border-[#bfd5e8] px-3 py-2 text-[11px] font-bold text-[#0066cc] disabled:opacity-40"><Users size={14} /> تجهيز الدعوات</button>}{selected.capabilities?.can_prepare_session && <button onClick={() => transitionMeeting("ready_to_start")} disabled={!readiness?.ready} title={!readiness?.ready ? "أكمل متطلبات الجاهزية أولاً" : "قفل التحضير وتجهيز الجلسة"} className="flex items-center gap-1.5 rounded-xl bg-[#f28c28] px-3 py-2 text-[11px] font-bold text-white disabled:bg-[#a9b6c5]"><Users size={14} /> تجهيز الجلسة</button>}</>}
                {selected.capabilities?.can_start_session && <Button variant="success" pending={startSessionPending} pendingLabel="جارٍ التحقق من الموعد…" onClick={() => void openLiveSession()}><Play size={14} /> فتح الجلسة الحية</Button>}
                {selected.status === "in_progress" && <Link href={`/admin/meetings/${selected.id}/live`} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"><Play size={14} /> متابعة الجلسة الحية</Link>}
                {selected.status === "waiting_for_minutes" && <span className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">أكمل المحضر وأرسله للمصادقة من القسم أعلاه.</span>}
                {selected.capabilities?.can_cancel && <button onClick={() => void transitionMeeting("cancelled")} className="rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold text-red-600">إلغاء الاجتماع</button>}
                {selected.capabilities?.can_archive && <button onClick={() => void transitionMeeting("archived")} className="rounded-xl border border-[#cbd7e3] px-3 py-2 text-[11px] font-bold text-[#52647a]">أرشفة الاجتماع</button>}
              </div>
            </div>
          )}
        </div> : <div className="hidden min-h-[360px] place-items-center rounded-2xl border border-dashed border-[#cdddea] bg-gradient-to-b from-white to-[#f7fbff] p-8 text-center xl:grid xl:sticky xl:top-4"><div><span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[#eaf4ff] text-[#0877d6]"><CalendarDays size={28}/></span><h2 className="mt-4 text-sm font-black text-[#173652]">اختر اجتماعاً لعرض تفاصيله</h2><p className="mx-auto mt-2 max-w-xs text-[10px] leading-6 text-[#718399]">اضغط على أي بطاقة من القائمة، وستظهر هنا بيانات الموعد وجدول الأعمال والجاهزية والإجراءات المتاحة دون الانتقال إلى أسفل الصفحة.</p></div></div>}
      </div>

      {agendaModal && selected && <Dialog title="الموضوعات المقترحة" description={`${eligibleAgendaCount ?? agendaCandidates.length} موضوعات وصلت إلى ${selected.unit_name_ar ?? selected.governance_unit_name_ar ?? "هذا المجلس"} وأصبحت مؤهلة للإدراج`} size="lg" scrollContent onClose={()=>setAgendaModal(false)} closeDisabled={agendaLoading} footer={<Button variant="secondary" disabled={agendaLoading} onClick={()=>setAgendaModal(false)}>إغلاق</Button>}>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-q-card bg-q-surface-2 p-3 sm:flex-row">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-q-control border border-q-border bg-q-surface px-3"><Search className="shrink-0 text-q-text-3" size={19}/><span className="sr-only">البحث في الموضوعات المقترحة</span><input autoFocus value={agendaQuery} onChange={(event)=>setAgendaQuery(event.target.value)} onKeyDown={(event)=>{if(event.key==="Enter")void loadAgendaCandidates();}} placeholder="اسم الموضوع أو رقمه" className="min-w-0 flex-1 bg-transparent text-q-ui text-q-text outline-none placeholder:text-q-text-3"/></label>
            <Button pending={agendaLoading} onClick={()=>void loadAgendaCandidates()}>بحث</Button>
          </div>
          {agendaSearchNotice&&<InlineMessage tone="error">{agendaSearchNotice}</InlineMessage>}
          {agendaLoading?<div className="grid min-h-48 place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-q-link" size={28}/><p className="mt-3 text-q-ui font-bold">جاري تحديث المقترحات…</p></div></div>:agendaCandidates.length?<ul className="grid gap-4">{agendaCandidates.map(topic=><li key={topic.id}><AgendaCandidateCard item={topic} busy={detailLoading} onReview={(item)=>{setAgendaModal(false);setCandidateTarget(item);}}/></li>)}</ul>:<div className="rounded-q-card border border-dashed border-q-border p-6 text-center"><Search className="mx-auto text-q-text-3" size={28}/><h3 className="mt-3 text-q-h3 font-bold">لا توجد موضوعات مؤهلة حاليًا</h3><p className="mx-auto mt-2 max-w-lg text-q-ui leading-7 text-q-text-2">يظهر الموضوع عندما تصل مرحلته إلى هذا المجلس، يعتمد محضر المجلس السابق إن وجد، ولا يكون مرتبطًا باجتماع آخر مفتوح.</p><Link href="/admin/topics" className="mt-4 inline-flex min-h-11 items-center rounded-q-control border border-q-primary px-4 text-q-ui font-bold text-q-link">فتح الموضوعات والتحقق من المسار</Link></div>}
        </div>
      </Dialog>}

      {/* Create Meeting Modal */}
      {invitationModal && selected && selected.updated_at && <InvitationTimingDialog key={selected.id} meetingId={selected.id} expectedUpdatedAt={selected.updated_at} startTime={selected.start_time} endTime={selected.end_time} onClose={() => setInvitationModal(false)} onSent={() => { void openDetail(selected.id); }} />}
      {startTiming && <MeetingStartConfirmationDialog
        timing={startTiming}
        pending={startSessionPending}
        error={startSessionError}
        onClose={() => { if (!startSessionPending) { setStartTiming(null); setStartSessionError(null); } }}
        onConfirm={() => void performOpenLiveSession(true)}
      />}
      {candidateTarget && selected && (
        <AgendaCandidateDetailsDialog
          candidate={candidateTarget}
          meetingId={selected.id}
          busy={detailLoading}
          onClose={() => setCandidateTarget(null)}
          onReturned={() => {
            setCandidateTarget(null);
            setNotice({ kind: "success", text: "أُعيد الموضوع إلى المجلس السابق مع حفظ السبب في مساره." });
            void loadAgendaCandidates();
            void openDetail(selected.id);
          }}
          actionLabel={selected.capabilities?.can_edit_topic_instructions ? "مراجعة التعليمات والإدراج" : "إدراج في هذا الاجتماع"}
          onReview={(item) => {
            setCandidateTarget(null);
            if (selected.capabilities?.can_edit_topic_instructions) {
              setInstructionTarget({ topicId: item.id, title: item.title_ar, text: item.discussion_instructions ?? "" });
            } else {
              void addAgendaItem(item.id);
            }
          }}
        />
      )}
      {createModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="إنشاء اجتماع جديد">
          <form onSubmit={handleCreate} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e7edf3] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]"><Calendar size={20} /></span>
                <div><h2 className="text-base font-black text-[#0a1330]">إنشاء اجتماع جديد</h2><p className="text-xs text-[#718196]">حدد بيانات الاجتماع وموعده ومكانه.</p></div>
              </div>
              <button type="button" onClick={() => setCreateModal(false)} className="text-[#73849a] hover:text-[#0a1330]"><X size={20} /></button>
            </div>
            <div className="grid overflow-y-auto gap-4 p-6">
              {notice?.kind === "error" && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{notice.text}</p>}
              <p className="text-xs leading-6 text-slate-500">يُحدد وقت البداية والنهاية عند تجهيز الدعوات، وليس عند إنشاء الاجتماع.</p>
              <MeetingQuorumField disabled={creating}/>
              <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">المجلس أو الجهة *</span><select required name="governance_unit_id" disabled={meetingOptionsLoading || !(meetingOptions?.meeting_units?.length)} className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs outline-none focus:border-[#0066cc] disabled:cursor-not-allowed disabled:bg-[#f4f7fa]"><option value="">{meetingOptionsLoading ? "جارٍ تحميل الجهات…" : meetingOptions?.meeting_units?.length ? "اختر المجلس أو الجهة" : "لا توجد جهة متاحة ضمن صلاحياتك"}</option>{meetingOptions?.meeting_units?.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}</select><small className="mt-1 block text-[10px] text-[#718196]">تظهر الجهات التي تملك صلاحية إنشاء اجتماع فيها فقط.</small></label>
              <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">نوع الاجتماع *</span><select required name="meeting_type_id" value={selectedMeetingTypeId} onChange={(event) => { const meetingTypeId = event.target.value; setSelectedMeetingTypeId(meetingTypeId); const meetingType = meetingOptions?.meeting_types?.find((type) => type.id === meetingTypeId); if (meetingType?.name_ar.includes("دوري")) setRecurring(true); }} disabled={meetingOptionsLoading || !(meetingOptions?.meeting_types?.length)} className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs outline-none focus:border-[#0066cc] disabled:cursor-not-allowed disabled:bg-[#f4f7fa]"><option value="">{meetingOptionsLoading ? "جارٍ تحميل الأنواع…" : meetingOptions?.meeting_types?.length ? "اختر نوع الاجتماع" : "لا توجد أنواع اجتماعات نشطة"}</option>{meetingOptions?.meeting_types?.map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}</select><small className="mt-1 block text-[10px] text-[#718196]">عند اختيار «اجتماع دوري» ستظهر إعدادات دورة الانعقاد تلقائياً.</small></label>
              <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">عنوان الاجتماع *</span><input required name="title_ar" placeholder="مثال: الاجتماع الثالث لمجلس القسم" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]" /></label>
              <label className={`flex cursor-pointer items-center justify-between rounded-2xl border p-4 transition ${recurring ? "border-[#79b9ee] bg-[#edf7ff] ring-2 ring-blue-100" : "border-[#dbe5ef] bg-[#f8fbfe]"}`}><span><strong className="block text-xs text-[#29445e]">تفعيل التكرار التلقائي</strong><small className="mt-1 block text-[9px] text-[#718196]">ينشئ النظام جميع مواعيد الدورة ويربطها في سلسلة واحدة.</small></span><span className={`relative h-6 w-11 rounded-full transition ${recurring ? "bg-[#0877d6]" : "bg-[#b8c5d1]"}`}><input aria-label="تفعيل الاجتماع الدوري" type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} className="sr-only"/><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${recurring ? "right-6" : "right-1"}`}/></span></label>
              {recurring && <div className="grid gap-3 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 sm:grid-cols-3"><label><span className="mb-1.5 block text-[10px] font-bold text-[#3d4f66]">دورة الاجتماع</span><select name="frequency" value={recurrenceFrequency} onChange={(event) => setRecurrenceFrequency(event.target.value as MeetingSeries["frequency"])} className="h-10 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs"><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option><option value="quarterly">ربعية (كل 3 أشهر)</option><option value="semiannual">نصف سنوية (كل 6 أشهر)</option><option value="annual">سنوية</option><option value="custom">مخصصة</option></select></label>{recurrenceFrequency === "custom" ? <label><span className="mb-1.5 block text-[10px] font-bold text-[#3d4f66]">التكرار كل كم يوم؟</span><input name="interval_count" type="number" min="1" max="365" defaultValue="14" className="h-10 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs" /></label> : <input type="hidden" name="interval_count" value="1"/>}<label><span className="mb-1.5 block text-[10px] font-bold text-[#3d4f66]">عدد الاجتماعات</span><input name="occurrence_count" type="number" min="2" max="36" defaultValue="6" className="h-10 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs" /></label><p className="self-end text-[9px] leading-5 text-[#60748a]">سيبدأ التكرار من تاريخ أول اجتماع، ويمكن تعديل كل موعد لاحقاً قبل انعقاده.</p></div>}
              <div className="grid gap-4 sm:grid-cols-3">
                <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">التاريخ *</span><input required type="date" name="scheduled_date" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]" /></label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">نوع المكان</span><select name="location_type" defaultValue="onsite" className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs outline-none focus:border-[#0066cc]"><option value="onsite">حضوري</option><option value="online">افتراضي</option><option value="hybrid">مختلط</option></select></label>
                <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">تفاصيل المكان</span><input name="location_details" placeholder="مثال: قاعة A-201" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]" /></label>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#e7edf3] bg-[#fbfcfe] px-6 py-4">
              <button type="button" onClick={() => setCreateModal(false)} disabled={creating} className="h-10 rounded-xl border border-[#dbe5ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button>
              <button disabled={creating || meetingOptionsLoading || !(meetingOptions?.meeting_units?.length) || !(meetingOptions?.meeting_types?.length)} className="h-10 rounded-xl bg-[#0066cc] px-5 text-xs font-bold text-white shadow-[0_8px_20px_rgba(0,102,204,.18)] disabled:opacity-60">{creating ? "جارٍ الإنشاء…" : "إنشاء الاجتماع"}</button>
            </div>
          </form>
        </div>
      )}

      {editModal && selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="تعديل إعدادات الاجتماع">
          <form onSubmit={handleUpdate} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e7edf3] px-6 py-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]"><Pencil size={19}/></span><div><h2 className="text-base font-black text-[#0a1330]">تعديل إعدادات الاجتماع</h2><p className="text-xs text-[#718196]">متاح للمسودة والاجتماع المجدول قبل بدء الجلسة.</p></div></div><button type="button" onClick={() => setEditModal(false)} aria-label="إغلاق"><X size={20}/></button></div>
            <div className="grid gap-4 overflow-y-auto p-6">
              {notice?.kind === "error" && <p role="alert" className="text-q-ui text-q-danger">{notice.text}</p>}
              <MeetingQuorumField defaultValue={selected.quorum_percentage} disabled={creating}/>
              <div className="rounded-xl bg-[#f5f9fd] px-4 py-3 text-xs font-bold text-[#40566f]">المجلس: {selected.unit_name_ar ?? selected.governance_unit_name_ar ?? "—"}</div>
              <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">نوع الاجتماع *</span><select required name="meeting_type_id" defaultValue={selected.meeting_type_id} onChange={(event) => { const type = meetingOptions?.meeting_types?.find((item) => item.id === event.target.value); setEditRecurring(Boolean(type?.name_ar.includes("دوري"))); }} className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs">{meetingOptions?.meeting_types?.map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}</select></label>
              <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">اسم الاجتماع *</span><input required name="title_ar" defaultValue={selected.title_ar} className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs"/></label>
              {(() => {
                const currentSeries = series.find((item) => item.occurrences.some((occurrence) => occurrence.meeting_id === selected.id));
                if (selected.planned_window_start || (!currentSeries && !editRecurring)) return null;
                const occurrence = currentSeries?.occurrences.find((item) => item.meeting_id === selected.id);
                return <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3"><div><strong className="block text-xs text-[#173652]">إعدادات السلسلة الدورية</strong><small className="mt-1 block text-[9px] leading-5 text-[#60748a]">{currentSeries ? `هذا الموعد رقم ${occurrence?.occurrence_number ?? "—"} من ${currentSeries.occurrence_count}. سيُطبق تغيير الدورة على هذا الموعد والمواعيد اللاحقة غير المنعقدة.` : "هذا اجتماع دوري قديم غير مرتبط بسلسلة. عند الحفظ سيصبح الموعد الأول وتُنشأ مواعيده اللاحقة تلقائياً."}</small></div><span className="rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-[#0877d6]">دوري</span></div>
                  <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-[10px] font-bold text-[#3d4f66]">نوع الدورة</span><select name="frequency" value={editRecurrenceFrequency} onChange={(event) => setEditRecurrenceFrequency(event.target.value as MeetingSeries["frequency"])} className="h-10 w-full rounded-xl border border-[#cbddeb] bg-white px-3 text-xs"><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option><option value="quarterly">ربعية (كل 3 أشهر)</option><option value="semiannual">نصف سنوية (كل 6 أشهر)</option><option value="annual">سنوية</option><option value="custom">مخصصة</option></select></label>{editRecurrenceFrequency === "custom" ? <label><span className="mb-1.5 block text-[10px] font-bold text-[#3d4f66]">التكرار كل كم يوم؟</span><input required name="interval_count" type="number" min="1" max="365" defaultValue={currentSeries?.frequency === "custom" ? currentSeries.interval_count : 14} className="h-10 w-full rounded-xl border border-[#cbddeb] bg-white px-3 text-xs"/></label> : <input type="hidden" name="interval_count" value="1"/>}{!currentSeries && <label><span className="mb-1.5 block text-[10px] font-bold text-[#3d4f66]">إجمالي عدد الاجتماعات</span><input required name="occurrence_count" type="number" min="2" max="36" defaultValue="6" className="h-10 w-full rounded-xl border border-[#cbddeb] bg-white px-3 text-xs"/></label>}</div>
                </div>;
              })()}
              <div className="grid gap-4 sm:grid-cols-3">
                <AdministrativeInput label="تاريخ الانعقاد" required type="date" name="scheduled_date" min={selected.planned_window_start ?? undefined} max={selected.planned_window_end ?? undefined} defaultValue={selected.schedule_date_confirmed === false ? "" : selected.scheduled_date}/>
                <AdministrativeInput label="وقت البداية" required={selected.schedule_date_confirmed === false} type="time" name="start_time" defaultValue={selected.start_time ?? ""}/>
                <AdministrativeInput label="وقت النهاية" required={selected.schedule_date_confirmed === false} type="time" name="end_time" defaultValue={selected.end_time ?? ""}/>
              </div>
              {selected.schedule_date_confirmed === false && <p className="text-q-caption text-q-text-2">{meetingScheduleLabel(selected)}</p>}
              <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">نوع المكان</span><select name="location_type" defaultValue={selected.location_type ?? "onsite"} className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs"><option value="onsite">حضوري</option><option value="online">افتراضي</option><option value="hybrid">مختلط</option></select></label><label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">تفاصيل المكان</span><input name="location_details" defaultValue={selected.location_details ?? ""} placeholder="القاعة أو رابط الاجتماع" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs"/></label></div>
            </div>
            <div className="flex justify-end gap-3 border-t border-[#e7edf3] bg-[#fbfcfe] px-6 py-4"><button type="button" onClick={() => setEditModal(false)} disabled={creating} className="h-10 rounded-xl border border-[#dbe5ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button><button disabled={creating} className="h-10 rounded-xl bg-[#0066cc] px-5 text-xs font-bold text-white disabled:opacity-50">{creating ? "جارٍ الحفظ…" : "حفظ التعديلات"}</button></div>
          </form>
        </div>
      )}
      {instructionTarget&&selected&&<AgendaInstructionsDialog title={instructionTarget.title} initialValue={instructionTarget.text} inserting={!instructionTarget.updatedAt} onClose={()=>setInstructionTarget(null)} onSave={async text=>{
       await rpc("save_agenda_topic_instructions",{p_meeting_id:selected.id,p_topic_id:instructionTarget.topicId,p_instructions:text,p_expected_updated_at:instructionTarget.updatedAt??null});
       await openDetail(selected.id);setNotice({kind:"success",text:"حُفظت تعليمات هذا الموضوع في الاجتماع دون تغيير التصنيف."});
      }}/>}
    </div>
  );
}
