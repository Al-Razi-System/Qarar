"use client";

import { useDeferredValue, useEffect, useEffectEvent, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Calendar, CalendarDays, Check, ChevronLeft, Clock, FileText, LoaderCircle, MapPin, Pencil, Play, Plus, Search, Users, X, SlidersHorizontal,
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
import { meetingLocationLabel, meetingScheduleLabel, meetingTimeLabel } from "../model/meeting-schedule";
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
import { MeetingPreparationConfirmationDialog } from "./meeting-preparation-confirmation-dialog";
import { DirectAgendaTopicDialog } from "./direct-agenda-topic-dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { Dialog } from "@/shared/ui/dialog";
import { SegmentedControl } from "@/shared/ui/segmented-control";
import { Card } from "@/shared/ui/card";
import { Badge } from "@/shared/ui/badge";
import { cn } from "@/shared/lib/utils";
import { MeetingRow } from "./meeting-row";
import { calendarRange, MeetingsCalendar, type CalendarMode } from "./meetings-calendar";

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


const filterField = "h-11 rounded-q-control border border-q-border bg-q-surface px-3 text-q-ui font-normal text-q-text outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary/20";

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

export function MeetingsWorkspace({ initialMeetingId }: { initialMeetingId?: string }) {
  const router = useRouter();
  const focused = Boolean(initialMeetingId);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [series, setSeries] = useState<MeetingSeries[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(!initialMeetingId);
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
  const [preparationConfirmationOpen, setPreparationConfirmationOpen] = useState(false);
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
  const [directTopicModal, setDirectTopicModal] = useState(false);
  const [directTopicPending, setDirectTopicPending] = useState(false);
  const [directTopicError, setDirectTopicError] = useState<string | null>(null);
  const [agendaQuery, setAgendaQuery] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const [viewMode, setViewMode] = useState<"list" | CalendarMode>("list");
  const [calendarCursor, setCalendarCursor] = useState(() => new Date());
  const [calendarItems, setCalendarItems] = useState<Meeting[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [unitFilter, setUnitFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [minutesLoading, setMinutesLoading] = useState(false);
  const [minutesText, setMinutesText] = useState("");
  const [readiness, setReadiness] = useState<MeetingReadiness | null>(null);
  const [topicAttachments, setTopicAttachments] = useState<MeetingTopicAttachment[]>([]);
  const listRequestRef = useRef<AbortController | null>(null);
  const lastListSuccessAtRef = useRef(0);
  const initialManagedMeetingRef = useRef<string | null>(null);
  const today = localDateKey();
  const councilOptions = Array.from(new Map([...meetings, ...calendarItems].filter((item) => item.governance_unit_id).map((item) => [item.governance_unit_id!, item.unit_name_ar ?? item.governance_unit_name_ar ?? "مجلس"])));
  const search = query.trim();
  const matchesSearch = (meeting: Meeting) => !search || [meeting.title_ar, meeting.meeting_no, meeting.unit_name_ar, meeting.governance_unit_name_ar].some((value) => value?.includes(search));
  // The list is searched on the server; the council narrows it here. The calendar
  // is read per council on the server, and searched and narrowed by status here.
  const visibleMeetings = unitFilter ? meetings.filter((meeting) => meeting.governance_unit_id === unitFilter) : meetings;
  const visibleCalendarItems = calendarItems.filter((meeting) => matchesSearch(meeting) && (activeGroup === "all" || meetingOperationalGroup(meeting, today) === activeGroup));
  const refinements = [unitFilter, activeGroup !== "all", viewMode === "list" && fromDate, viewMode === "list" && toDate].filter(Boolean).length;
  const filtersActive = Boolean(query || fromDate || toDate || unitFilter || activeGroup !== "all");

  const loadCalendar = useEffectEvent(async () => {
    if (viewMode === "list") return;
    const range = calendarRange(calendarCursor, viewMode);
    setCalendarLoading(true); setLoadError(null);
    try {
      const result = await rpc<Meeting[]>("list_meetings_calendar_v2", { p_from_date: range.from, p_to_date: range.to, p_unit_ids: unitFilter ? [unitFilter] : null }, { timeoutMs: 12_000 });
      setCalendarItems(result ?? []);
    } catch (error) { setLoadError(error instanceof Error ? error.message : "تعذر تحميل تقويم الاجتماعات."); }
    finally { setCalendarLoading(false); }
  });

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
      if (!focused && (!nextMeetings.length || (selected && !nextMeetings.some((meeting) => meeting.id === selected.id)))) {
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
    if (!selected) return false;
    setDetailLoading(true); setNotice(null);
    try {
      const needsReason = toStatus === "cancelled";
      const reason = needsReason ? window.prompt("أدخل سبب الإلغاء (5 أحرف على الأقل):") : null;
      if (needsReason && (!reason || reason.trim().length < 5)) { setDetailLoading(false); return false; }
      await rpc("transition_meeting", {
        p_meeting_id: selected.id,
        p_to_status: toStatus,
        p_reason: reason,
        p_expected_updated_at: selected.updated_at ?? null,
      });
      setNotice({ kind: "success", text: `تم تحويل الاجتماع إلى "${statusLabels[toStatus] ?? toStatus}" بنجاح.` });
      await openDetail(selected.id);
      if (!focused) await loadMeetings();
      return true;
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التنفيذ." });
      return false;
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

  async function addDirectAgendaTopic(input: { requestId: string; title: string; description: string; priority: "low" | "medium" | "high" | "urgent"; requiresVoting: boolean }) {
    if (!selected) return;
    setDirectTopicPending(true); setDirectTopicError(null);
    try {
      await rpc("create_direct_agenda_topic_v2", {
        p_meeting_id: selected.id,
        p_title_ar: input.title,
        p_description: input.description || null,
        p_priority: input.priority,
        p_requires_voting: input.requiresVoting,
        p_client_request_id: input.requestId,
      });
      setDirectTopicModal(false);
      await openDetail(selected.id);
      await loadMeetings({ background: true });
      setNotice({ kind: "success", text: input.requiresVoting ? "أُضيف الموضوع المباشر مع التصويت إلى جدول الأعمال." : "أُضيف موضوع المناقشة المباشر إلى جدول الأعمال." });
    } catch (err) {
      setDirectTopicError(meetingErrorMessage(err, "تعذر إضافة الموضوع المباشر."));
    } finally { setDirectTopicPending(false); }
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
        p_governance_mode: fd.get("governance_mode") || "governed",
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
    if (focused) return;
    const timer = window.setTimeout(() => void loadMeetingsOnFilterChange(), 250);
    return () => {
      window.clearTimeout(timer);
      listRequestRef.current?.abort();
    };
  }, [deferredQuery, fromDate, toDate, focused]);

  useEffect(() => { const timer = window.setTimeout(() => { if (!focused && typeof window.matchMedia === "function" && window.matchMedia("(min-width: 768px)").matches) setViewMode("month"); }, 0); return () => window.clearTimeout(timer); }, [focused]);
  useEffect(() => {
    if (focused) return;
    const timer = window.setTimeout(() => void loadCalendar(), 0);
    return () => window.clearTimeout(timer);
  }, [viewMode, calendarCursor, unitFilter, focused]);
  const openInitialMeeting = useEffectEvent(openDetail);
  useEffect(() => {
    if (!initialMeetingId || initialManagedMeetingRef.current === initialMeetingId) return;
    const timer = window.setTimeout(() => {
      initialManagedMeetingRef.current = initialMeetingId;
      setViewMode("list");
      void openInitialMeeting(initialMeetingId);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialMeetingId]);

  const refreshWorkspaceOnReturn = useEffectEvent(() => {
    if (focused) {
      if (selected?.id) void openDetail(selected.id);
      return;
    }
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
      {focused && <div className="flex flex-wrap items-center justify-between gap-3 rounded-q-card border border-q-border bg-q-surface p-4"><div><p className="text-q-caption font-bold text-q-live">إعداد الاجتماع</p><h2 className="mt-1 text-q-h2 font-bold text-q-text">إدارة جدول الأعمال</h2><p className="mt-1 text-q-ui text-q-text-2">أضف الموضوعات المقترحة أو أنشئ موضوعاً مباشراً لهذا الاجتماع.</p></div><Link href="/admin/meetings" className="inline-flex min-h-11 items-center rounded-q-control border border-q-border px-4 text-q-ui font-bold text-q-link"><ChevronLeft size={18}/>كل الاجتماعات</Link></div>}
      {loadError && (
        <div className="space-y-2">
          <InlineMessage tone="error">{loadError}</InlineMessage>
          <Button variant="secondary" onClick={() => void loadMeetings()} disabled={loading}>
            إعادة تحميل الاجتماعات
          </Button>
        </div>
      )}
      {notice && (
        <div className={`flex items-center gap-2 rounded-q-control border p-3 text-q-caption font-bold ${notice.kind === "success" ? "border-q-success bg-q-success-soft text-q-success" : "border-q-danger bg-q-danger-soft text-q-danger"}`}>
          {notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />} {notice.text}
        </div>
      )}

      {!focused && <section aria-label="عرض الاجتماعات وتصفيتها" className="space-y-4 rounded-q-card border border-q-border bg-q-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SegmentedControl label="طريقة عرض الاجتماعات" className="w-full sm:w-auto" value={viewMode} onChange={setViewMode} options={[{ value: "list", label: "القائمة" }, { value: "week", label: "أسبوع" }, { value: "month", label: "شهر" }]}/>
          <div className="flex items-center gap-3">
            <span className="text-q-caption text-q-text-2" role="status">{viewMode === "list" ? `${unitFilter ? visibleMeetings.length : total} اجتماع` : `${visibleCalendarItems.length} اجتماع في الفترة`}</span>
            <Button onClick={() => void openCreateModal()}><Plus size={17} aria-hidden="true"/>إنشاء اجتماع</Button>
          </div>
        </div>
        {/* One set of filters for the list and the calendar alike. On a phone only
            the search stays open; the rest fold behind one button. */}
        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end">
          <label className="flex min-w-0 flex-col gap-1.5 text-q-caption font-bold text-q-text-2 lg:min-w-64 lg:flex-1">البحث
            <span className="relative">
              <Search size={16} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-q-text-3"/>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="العنوان أو رقم الاجتماع أو المجلس" className={`${filterField} w-full ps-9`}/>
            </span>
          </label>
          <Button variant="secondary" className="sm:hidden" aria-expanded={filtersOpen} aria-controls="meeting-filters" onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={17} aria-hidden="true"/>{refinements ? `خيارات التصفية (${refinements})` : "خيارات التصفية"}</Button>
          <div id="meeting-filters" className={`${filtersOpen ? "grid" : "hidden"} gap-3 sm:contents`}>
          <label className="flex min-w-0 flex-col gap-1.5 text-q-caption font-bold text-q-text-2">المجلس
            <select value={unitFilter} onChange={(event) => setUnitFilter(event.target.value)} className={`${filterField} lg:min-w-56`}>
              <option value="">كل المجالس المتاحة</option>
              {councilOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          {/* In the list the status tabs below do this; the calendar has no room for them. */}
          {viewMode !== "list" && <label className="flex min-w-0 flex-col gap-1.5 text-q-caption font-bold text-q-text-2">الحالة
            <select value={activeGroup} onChange={(event) => { setActiveGroup(event.target.value); setSelected(null); }} className={`${filterField} lg:min-w-48`}>
              <option value="all">كل الحالات</option>
              {meetingGroups.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
            </select>
          </label>}
          {viewMode === "list" && <>
            <label className="flex min-w-0 flex-col gap-1.5 text-q-caption font-bold text-q-text-2">من تاريخ<input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} className={filterField}/></label>
            <label className="flex min-w-0 flex-col gap-1.5 text-q-caption font-bold text-q-text-2">إلى تاريخ<input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} className={filterField}/></label>
          </>}
          </div>
          {filtersActive && <Button variant="ghost" onClick={() => { setQuery(""); setFromDate(""); setToDate(""); setUnitFilter(""); setActiveGroup("all"); }}>مسح الفلاتر</Button>}
        </div>
      </section>}

      {viewMode === "list" ? <>
      {!focused && <nav className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="حالات الاجتماعات">
        {[{ key: "all", label: "كل الاجتماعات" }, ...meetingGroups].map((group) => {
          const count = group.key === "all" ? visibleMeetings.length : visibleMeetings.filter((meeting) => meetingOperationalGroup(meeting, today) === group.key).length;
          const active = activeGroup === group.key;
          return <button key={group.key} type="button" aria-pressed={active} onClick={() => { setActiveGroup(group.key); setSelected(null); }}
            className={cn("inline-flex min-h-11 shrink-0 items-center gap-2 rounded-q-control border px-4 font-sans text-q-ui font-bold transition-colors", active ? "border-q-primary bg-q-primary text-q-on-primary" : "border-q-border bg-q-surface text-q-text hover:bg-q-surface-2", !count && !active && "text-q-text-3")}>
            {group.label}
            <span className={cn("min-w-6 rounded-full px-1.5 text-center text-q-caption", active ? "bg-q-on-primary/20" : "bg-q-surface-2 text-q-text-2")}>{count}</span>
          </button>;
        })}
      </nav>}

      {!focused && series.length > 0 && (activeGroup === "all" || activeGroup === "upcoming") && <Card className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="m-0 text-q-h3 font-bold">الاجتماعات الدورية</h2><Badge tone="info">{series.length} سلسلة</Badge></div>
        <div className="grid gap-3 lg:grid-cols-2">{series.map((item) => <details key={item.id} className="group rounded-q-control border border-q-border bg-q-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 p-3">
            <span className="min-w-0"><span className="block text-q-ui font-bold text-q-text">{item.title_ar}</span><span className="block text-q-caption text-q-text-2">{frequencyLabels[item.frequency] ?? "دورية"}{item.frequency === "custom" ? ` · كل ${item.interval_count} يوم` : ""} · {item.occurrence_count} اجتماعات</span></span>
            <ChevronLeft size={18} aria-hidden="true" className="shrink-0 text-q-text-2 transition-transform group-open:-rotate-90"/>
          </summary>
          <ul className="m-0 list-none divide-y divide-q-border border-t border-q-border p-0">{item.occurrences.map((occurrence) => <li key={occurrence.meeting_id}>
            <button type="button" onClick={() => router.push(`/admin/meetings/${occurrence.meeting_id}`)} className="flex min-h-11 w-full items-center justify-between gap-3 px-3 py-2 text-start hover:bg-q-surface-2">
              <span className="text-q-caption font-bold text-q-text">الاجتماع {occurrence.occurrence_number} · {occurrence.scheduled_date}</span>
              <Badge tone={statusTone[occurrence.status] ?? "neutral"}>{statusLabels[occurrence.status] ?? "اجتماع"}</Badge>
            </button>
          </li>)}</ul>
        </details>)}</div>
      </Card>}

      <div className={cn("grid items-start gap-5", !focused && selected && "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]")}>
        <div className={cn("space-y-4", focused && "hidden")}>
          {refreshing && !loading && <p role="status" className="m-0 rounded-q-control bg-q-surface-2 px-3 py-2 text-q-caption text-q-text-2">جارٍ تحديث الاجتماعات في الخلفية…</p>}
          {loading ? (
            <Card aria-busy="true" className="grid min-h-72 place-items-center"><p role="status" className="m-0 flex items-center gap-2 text-q-ui text-q-text-2"><LoaderCircle className="animate-spin text-q-link" size={20} aria-hidden="true"/>جارٍ تحميل الاجتماعات…</p></Card>
          ) : visibleMeetings.length === 0 ? (
            <Card className="grid min-h-72 place-items-center text-center">
              <div>
                <CalendarDays className="mx-auto text-q-text-3" size={32} aria-hidden="true"/>
                <h2 className="m-0 mt-3 text-q-h3 font-bold">لا توجد اجتماعات</h2>
                <p className="m-0 mt-1 text-q-ui text-q-text-2">{filtersActive ? "لا يطابق الفلاترَ المختارة أيُّ اجتماع." : "ابدأ بإنشاء اجتماع لمجلسك."}</p>
              </div>
            </Card>
          ) : groupedMeetings(visibleMeetings, today).filter((group) => activeGroup === "all" || group.key === activeGroup).map((group) => <section key={group.key} aria-labelledby={`meeting-group-${group.key}`} className="overflow-hidden rounded-q-card border border-q-border bg-q-surface">
            <header className="flex items-center justify-between gap-3 border-b border-q-border px-4 py-3">
              <h2 id={`meeting-group-${group.key}`} className="m-0 text-q-ui font-bold text-q-text">{group.label}</h2>
              <span className="text-q-caption text-q-text-2">{group.meetings.length} اجتماع</span>
            </header>
            <ul className="m-0 list-none divide-y divide-q-border p-0">{group.meetings.map((meeting) => <li key={meeting.id}><MeetingRow meeting={meeting} today={today} onOpen={() => router.push(`/admin/meetings/${meeting.id}`)}/></li>)}</ul>
          </section>)}
        </div>

        {/* Detail Panel */}
        {selected ? <div className={cn("scroll-mt-5 overflow-hidden rounded-q-card border border-q-border bg-white", !focused && "xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto")}>
          {detailLoading ? (
            <div className="grid min-h-[400px] place-items-center"><LoaderCircle className="animate-spin text-q-link" size={28} /></div>
          ) : (
            <div className="divide-y divide-q-border">
              <div className="p-5">
                <Badge className="mb-2" tone={statusTone[selected.status] ?? "neutral"}>{statusLabels[selected.status] ?? "اجتماع"}</Badge>
                <h2 className="text-q-h3 font-bold text-q-text">{selected.title_ar}</h2>
                <p className="mt-1 text-q-caption text-q-text-2">{selected.meeting_no ?? selected.id}</p>
                {!isAgendaEditable(selected.status) && <p className={`mt-3 rounded-q-control px-3 py-2 text-q-caption font-bold leading-5 ${["closed", "archived"].includes(selected.status) ? "bg-q-success-soft text-q-success" : "bg-q-warning-soft text-q-warning"}`}>{agendaLockMessage(selected.status)}</p>}
                <div className="mt-3 grid grid-cols-2 gap-2 text-q-caption">
                  <div className="flex items-center gap-1.5 text-q-text-2"><Calendar size={13} /> {meetingScheduleLabel(selected)}</div>
                  <div className="flex items-center gap-1.5 text-q-text-2"><Clock size={13} /> {meetingTimeLabel(selected)}</div>
                  <div className="flex items-center gap-1.5 text-q-text-2"><MapPin size={13} /> {meetingLocationLabel(selected, "—")}</div>
                  <div className="flex items-center gap-1.5 text-q-text-2"><Users size={13} /> {selected.unit_name_ar ?? "—"}</div>
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
                canAddDirect={selected.capabilities?.can_add_direct_topic}
                onAddProposals={() => void openAgendaModal()}
                onAddDirect={() => { setDirectTopicError(null); setDirectTopicModal(true); }}
                onMove={(index, direction) => void moveAgendaItem(index, direction)}
                onRemove={(id) => void removeAgendaItem(id)}
                onEditInstructions={selected.capabilities?.can_edit_topic_instructions?item=>{if(item.topic)setInstructionTarget({topicId:item.topic.id,title:item.topic.title_ar,text:item.discussion_instructions??"",updatedAt:item.updated_at});}:undefined}
              />}

              {readiness && ["draft","scheduled","ready_to_start"].includes(selected.status) && <div className="p-5"><h3 className="mb-3 text-q-caption font-bold text-q-text">جاهزية الاجتماع</h3><div className="grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <div key={check.code} className={`flex items-center gap-2 rounded-q-control border px-3 py-2 text-q-caption font-bold ${check.complete ? "border-q-success bg-q-success-soft text-q-success" : "border-q-warning bg-q-warning-soft text-q-warning"}`}><span className={`grid h-5 w-5 place-items-center rounded-full ${check.complete ? "bg-q-success text-q-on-primary" : "bg-q-warning text-q-on-primary"}`}>{check.complete ? "✓" : "!"}</span><span>{check.label}{typeof check.count === "number" ? ` (${check.count})` : ""}</span></div>)}</div></div>}

              {(["waiting_for_minutes", "waiting_for_approval"].includes(selected.status)) && (
                <div className="p-5"><MeetingMinutesWorkspace meeting={selected} minutes={minutes} text={minutesText} loading={minutesLoading} onTextChange={setMinutesText} onGenerate={() => void generateMinutesDraft()} onSave={() => void saveMinutesDraft()} onSubmit={() => void submitMinutes()} onSign={signMinutes} onReturn={returnMinutes} /></div>
              )}

              {/* Transition Actions */}
              <div className="flex flex-wrap gap-2 p-5">
                {["draft", "scheduled"].includes(selected.status) && selected.capabilities?.can_manage && <Button variant="secondary" onClick={() => void openEditModal()}><Clock size={18} /> تحديد وقت الاجتماع</Button>}
                {(["waiting_for_minutes", "waiting_for_approval", "closed", "archived"].includes(selected.status)) && <Link href={`/admin/meetings/${selected.id}/minutes`} className="flex items-center gap-1.5 rounded-q-control bg-q-primary px-4 py-2.5 text-q-caption font-bold text-q-on-primary "><FileText size={14} />{["closed", "archived"].includes(selected.status) ? "عرض المحضر النهائي والتواقيع" : "فتح مساحة المحضر والمصادقات"}</Link>}
                {(selected.capabilities?.can_schedule || (selected.status === "draft" && selected.capabilities?.can_manage && selected.schedule_date_confirmed === false)) && <div><Button pending={detailLoading} disabled={selected.schedule_date_confirmed === false} onClick={() => transitionMeeting("scheduled")}><Play size={14}/>جدولة</Button>{selected.schedule_date_confirmed === false && <p className="mt-2 text-q-caption text-q-text-2">حدد يوم الاجتماع ووقتي البداية والنهاية من تعديل الاجتماع أولاً.</p>}</div>}
                {selected.status === "scheduled" && <>{selected.capabilities?.can_send_invitations && <button onClick={() => setInvitationModal(true)} disabled={detailLoading || !readiness?.ready} title={!readiness?.ready ? "أكمل متطلبات الجاهزية أولاً" : selected.invitation_summary?.prepared ? "عرض الدعوة المجهزة" : "تجهيز دعوات أعضاء المجلس"} className="flex items-center gap-1.5 rounded-q-control border border-q-border px-3 py-2 text-q-caption font-bold text-q-link disabled:opacity-40"><Users size={14} /> {selected.invitation_summary?.prepared ? "عرض الدعوة" : "تجهيز الدعوات"}</button>}{selected.capabilities?.can_prepare_session && <Button variant="secondary" disabled={detailLoading || !readiness?.ready} onClick={() => setPreparationConfirmationOpen(true)}>اعتماد جدول الأعمال وتجهيز الاجتماع للبدء</Button>}</>}
                {selected.capabilities?.can_start_session && <Button variant="success" pending={startSessionPending} pendingLabel="جارٍ التحقق من الموعد…" onClick={() => void openLiveSession()}><Play size={14} /> فتح الجلسة الحية</Button>}
                {selected.status === "in_progress" && <Link href={`/admin/meetings/${selected.id}/live`} className="flex items-center gap-1.5 rounded-q-control bg-q-success px-3 py-2 text-q-caption font-bold text-q-on-primary"><Play size={14} /> متابعة الجلسة الحية</Link>}
                {selected.status === "waiting_for_minutes" && <span className="rounded-q-control bg-q-warning-soft px-3 py-2 text-q-caption font-bold text-q-warning">أكمل المحضر وأرسله للمصادقة من القسم أعلاه.</span>}
                {selected.capabilities?.can_cancel && <button onClick={() => void transitionMeeting("cancelled")} className="rounded-q-control border border-q-danger px-3 py-2 text-q-caption font-bold text-q-danger">إلغاء الاجتماع</button>}
                {selected.capabilities?.can_archive && <button onClick={() => void transitionMeeting("archived")} className="rounded-q-control border border-q-border px-3 py-2 text-q-caption font-bold text-q-text-2">أرشفة الاجتماع</button>}
              </div>
            </div>
          )}
        </div> : <div className={`${focused ? "grid" : "hidden xl:grid xl:sticky xl:top-4"} min-h-[360px] place-items-center rounded-q-card border border-dashed border-q-border bg-q-surface p-8 text-center`}><div>{focused && detailLoading ? <LoaderCircle className="mx-auto animate-spin text-q-link" size={28}/> : <CalendarDays className="mx-auto text-q-text-3" size={28}/>}<h2 className="mt-4 text-q-h3 font-bold text-q-text">{focused ? "جارٍ فتح جدول أعمال الاجتماع…" : "اختر اجتماعاً لعرض تفاصيله"}</h2><p className="mx-auto mt-2 max-w-xs text-q-caption leading-6 text-q-text-2">{focused ? "تُحمّل صلاحيات الاجتماع وموضوعاته المقترحة الآن." : "اضغط على أي بطاقة من القائمة، وستظهر هنا بيانات الموعد وجدول الأعمال والجاهزية والإجراءات المتاحة دون الانتقال إلى أسفل الصفحة."}</p></div></div>}
      </div>
      </> : <MeetingsCalendar items={visibleCalendarItems} cursor={calendarCursor} mode={viewMode} loading={calendarLoading} onCursorChange={setCalendarCursor} onOpen={(meetingId) => router.push(`/admin/meetings/${meetingId}`)} onShowDay={(day) => { setCalendarCursor(day); setViewMode("week"); }} />}

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
      {directTopicModal && selected && <DirectAgendaTopicDialog
        pending={directTopicPending}
        error={directTopicError}
        onClose={() => { if (!directTopicPending) { setDirectTopicModal(false); setDirectTopicError(null); } }}
        onSubmit={addDirectAgendaTopic}
      />}

      {/* Create Meeting Modal */}
      {invitationModal && selected && selected.updated_at && <InvitationTimingDialog key={selected.id} meetingId={selected.id} expectedUpdatedAt={selected.updated_at} startTime={selected.start_time} endTime={selected.end_time} invitationSummary={selected.invitation_summary} onClose={() => setInvitationModal(false)} onSent={() => { void openDetail(selected.id); }} />}
      {startTiming && <MeetingStartConfirmationDialog
        timing={startTiming}
        pending={startSessionPending}
        error={startSessionError}
        onClose={() => { if (!startSessionPending) { setStartTiming(null); setStartSessionError(null); } }}
        onConfirm={() => void performOpenLiveSession(true)}
      />}
      {preparationConfirmationOpen && <MeetingPreparationConfirmationDialog
        pending={detailLoading}
        error={notice?.kind === "error" ? notice.text : null}
        onClose={() => { if (!detailLoading) { setPreparationConfirmationOpen(false); setNotice(null); } }}
        onConfirm={() => void (async () => { if (await transitionMeeting("ready_to_start")) setPreparationConfirmationOpen(false); })()}
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
        <div className="fixed inset-0 z-50 grid place-items-center bg-q-scrim p-4" role="dialog" aria-modal="true" aria-label="إنشاء اجتماع جديد">
          <form onSubmit={handleCreate} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-q-card bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-q-border px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-link"><Calendar size={20} /></span>
                <div><h2 className="text-q-h3 font-bold text-q-text">إنشاء اجتماع جديد</h2><p className="text-q-caption text-q-text-2">حدد بيانات الاجتماع وموعده ومكانه.</p></div>
              </div>
              <button type="button" onClick={() => setCreateModal(false)} className="text-q-text-2 hover:text-q-text"><X size={20} /></button>
            </div>
            <div className="grid overflow-y-auto gap-4 p-6">
              {notice?.kind === "error" && <p role="alert" className="rounded-q-control border border-q-danger bg-q-danger-soft p-3 text-q-ui text-q-danger">{notice.text}</p>}
              <p className="text-q-caption leading-6 text-q-text-2">يُحدد وقت البداية والنهاية عند تجهيز الدعوات، وليس عند إنشاء الاجتماع.</p>
              <MeetingQuorumField disabled={creating}/>
              <fieldset className="grid gap-3 rounded-q-card border border-q-border p-4">
                <legend className="px-2 text-q-ui font-bold text-q-text">حوكمة جدول الأعمال</legend>
                <label className="flex cursor-pointer items-start gap-3 rounded-q-control border border-q-border bg-q-surface p-3 has-[:checked]:border-q-primary has-[:checked]:bg-q-primary-soft">
                  <input type="radio" name="governance_mode" value="governed" defaultChecked className="mt-1 h-5 w-5 accent-q-primary"/>
                  <span><strong className="block text-q-ui text-q-text">اجتماع محكوم</strong><span className="mt-1 block text-q-caption leading-6 text-q-text-2">يعرض الموضوعات الواردة عبر مسارات المجالس، ويمكن للرئيس أيضاً إضافة موضوع مباشر خاص بالاجتماع.</span></span>
                </label>
                <label className="flex cursor-pointer items-start gap-3 rounded-q-control border border-q-border bg-q-surface p-3 has-[:checked]:border-q-primary has-[:checked]:bg-q-primary-soft">
                  <input type="radio" name="governance_mode" value="custom" className="mt-1 h-5 w-5 accent-q-primary"/>
                  <span><strong className="block text-q-ui text-q-text">اجتماع غير محكوم</strong><span className="mt-1 block text-q-caption leading-6 text-q-text-2">جدول أعمال مستقل يبنيه الرئيس من موضوعات مباشرة، من دون لائحة أو تصنيف أو مسار اعتماد.</span></span>
                </label>
              </fieldset>
              <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">المجلس أو الجهة *</span><select required name="governance_unit_id" disabled={meetingOptionsLoading || !(meetingOptions?.meeting_units?.length)} className="h-11 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui outline-none focus:border-q-primary disabled:cursor-not-allowed disabled:bg-q-surface-2"><option value="">{meetingOptionsLoading ? "جارٍ تحميل الجهات…" : meetingOptions?.meeting_units?.length ? "اختر المجلس أو الجهة" : "لا توجد جهة متاحة ضمن صلاحياتك"}</option>{meetingOptions?.meeting_units?.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}</select><small className="mt-1 block text-q-caption text-q-text-2">تظهر الجهات التي تملك صلاحية إنشاء اجتماع فيها فقط.</small></label>
              <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">نوع الاجتماع *</span><select required name="meeting_type_id" value={selectedMeetingTypeId} onChange={(event) => { const meetingTypeId = event.target.value; setSelectedMeetingTypeId(meetingTypeId); const meetingType = meetingOptions?.meeting_types?.find((type) => type.id === meetingTypeId); if (meetingType?.name_ar.includes("دوري")) setRecurring(true); }} disabled={meetingOptionsLoading || !(meetingOptions?.meeting_types?.length)} className="h-11 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui outline-none focus:border-q-primary disabled:cursor-not-allowed disabled:bg-q-surface-2"><option value="">{meetingOptionsLoading ? "جارٍ تحميل الأنواع…" : meetingOptions?.meeting_types?.length ? "اختر نوع الاجتماع" : "لا توجد أنواع اجتماعات نشطة"}</option>{meetingOptions?.meeting_types?.map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}</select><small className="mt-1 block text-q-caption text-q-text-2">عند اختيار «اجتماع دوري» ستظهر إعدادات دورة الانعقاد تلقائياً.</small></label>
              <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">عنوان الاجتماع *</span><input required name="title_ar" placeholder="مثال: الاجتماع الثالث لمجلس القسم" className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary" /></label>
              <label className={`flex cursor-pointer items-center justify-between rounded-q-card border p-4 transition ${recurring ? "border-q-primary bg-q-surface-2 ring-2 ring-q-primary/20" : "border-q-border bg-q-surface-2"}`}><span><strong className="block text-q-caption text-q-text-2">تفعيل التكرار التلقائي</strong><small className="mt-1 block text-q-caption text-q-text-2">ينشئ النظام جميع مواعيد الدورة ويربطها في سلسلة واحدة.</small></span><span className={`relative h-6 w-11 rounded-full transition ${recurring ? "bg-q-primary" : "bg-q-neutral-soft"}`}><input aria-label="تفعيل الاجتماع الدوري" type="checkbox" checked={recurring} onChange={(event) => setRecurring(event.target.checked)} className="sr-only"/><span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition ${recurring ? "right-6" : "right-1"}`}/></span></label>
              {recurring && <div className="grid gap-3 rounded-q-card border border-q-border bg-q-surface-2 p-4 sm:grid-cols-3"><label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">دورة الاجتماع</span><select name="frequency" value={recurrenceFrequency} onChange={(event) => setRecurrenceFrequency(event.target.value as MeetingSeries["frequency"])} className="h-10 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui"><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option><option value="quarterly">ربعية (كل 3 أشهر)</option><option value="semiannual">نصف سنوية (كل 6 أشهر)</option><option value="annual">سنوية</option><option value="custom">مخصصة</option></select></label>{recurrenceFrequency === "custom" ? <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">التكرار كل كم يوم؟</span><input name="interval_count" type="number" min="1" max="365" defaultValue="14" className="h-10 w-full rounded-q-control border border-q-border px-3 text-q-ui" /></label> : <input type="hidden" name="interval_count" value="1"/>}<label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">عدد الاجتماعات</span><input name="occurrence_count" type="number" min="2" max="36" defaultValue="6" className="h-10 w-full rounded-q-control border border-q-border px-3 text-q-ui" /></label><p className="self-end text-q-caption leading-5 text-q-text-2">سيبدأ التكرار من تاريخ أول اجتماع، ويمكن تعديل كل موعد لاحقاً قبل انعقاده.</p></div>}
              <div className="grid gap-4 sm:grid-cols-3">
                <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">التاريخ *</span><input required type="date" name="scheduled_date" className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary" /></label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">نوع المكان</span><select name="location_type" defaultValue="onsite" className="h-11 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui outline-none focus:border-q-primary"><option value="onsite">حضوري</option><option value="online">افتراضي</option><option value="hybrid">مختلط</option></select></label>
                <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">تفاصيل المكان</span><input name="location_details" placeholder="مثال: قاعة A-201" className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui outline-none focus:border-q-primary" /></label>
              </div>
            </div>
            <div className="flex justify-end gap-3 border-t border-q-border bg-q-surface-2 px-6 py-4">
              <button type="button" onClick={() => setCreateModal(false)} disabled={creating} className="h-10 rounded-q-control border border-q-border px-4 text-q-caption font-bold text-q-text-2">إلغاء</button>
              <button disabled={creating || meetingOptionsLoading || !(meetingOptions?.meeting_units?.length) || !(meetingOptions?.meeting_types?.length)} className="h-10 rounded-q-control bg-q-primary px-5 text-q-caption font-bold text-q-on-primary disabled:opacity-60">{creating ? "جارٍ الإنشاء…" : "إنشاء الاجتماع"}</button>
            </div>
          </form>
        </div>
      )}

      {editModal && selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-q-scrim p-4" role="dialog" aria-modal="true" aria-label="تعديل إعدادات الاجتماع">
          <form onSubmit={handleUpdate} className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-q-card bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-q-border px-6 py-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-q-control bg-q-surface-2 text-q-link"><Pencil size={19}/></span><div><h2 className="text-q-h3 font-bold text-q-text">تعديل إعدادات الاجتماع</h2><p className="text-q-caption text-q-text-2">متاح للمسودة والاجتماع المجدول قبل بدء الجلسة.</p></div></div><button type="button" onClick={() => setEditModal(false)} aria-label="إغلاق"><X size={20}/></button></div>
            <div className="grid gap-4 overflow-y-auto p-6">
              {notice?.kind === "error" && <p role="alert" className="text-q-ui text-q-danger">{notice.text}</p>}
              <MeetingQuorumField defaultValue={selected.quorum_percentage} disabled={creating}/>
              <div className="rounded-q-control bg-q-surface-2 px-4 py-3 text-q-caption font-bold text-q-text-2">المجلس: {selected.unit_name_ar ?? selected.governance_unit_name_ar ?? "—"}</div>
              <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">نوع الاجتماع *</span><select required name="meeting_type_id" defaultValue={selected.meeting_type_id} onChange={(event) => { const type = meetingOptions?.meeting_types?.find((item) => item.id === event.target.value); setEditRecurring(Boolean(type?.name_ar.includes("دوري"))); }} className="h-11 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui">{meetingOptions?.meeting_types?.map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}</select></label>
              <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">اسم الاجتماع *</span><input required name="title_ar" defaultValue={selected.title_ar} className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui"/></label>
              {(() => {
                const currentSeries = series.find((item) => item.occurrences.some((occurrence) => occurrence.meeting_id === selected.id));
                if (selected.planned_window_start || (!currentSeries && !editRecurring)) return null;
                const occurrence = currentSeries?.occurrences.find((item) => item.meeting_id === selected.id);
                return <div className="rounded-q-card border border-q-border bg-q-surface-2 p-4">
                  <div className="mb-3 flex items-start justify-between gap-3"><div><strong className="block text-q-caption text-q-text">إعدادات السلسلة الدورية</strong><small className="mt-1 block text-q-caption leading-5 text-q-text-2">{currentSeries ? `هذا الموعد رقم ${occurrence?.occurrence_number ?? "—"} من ${currentSeries.occurrence_count}. سيُطبق تغيير الدورة على هذا الموعد والمواعيد اللاحقة غير المنعقدة.` : "هذا اجتماع دوري قديم غير مرتبط بسلسلة. عند الحفظ سيصبح الموعد الأول وتُنشأ مواعيده اللاحقة تلقائياً."}</small></div><span className="rounded-full bg-white px-2.5 py-1 text-q-caption font-bold text-q-link">دوري</span></div>
                  <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">نوع الدورة</span><select name="frequency" value={editRecurrenceFrequency} onChange={(event) => setEditRecurrenceFrequency(event.target.value as MeetingSeries["frequency"])} className="h-10 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui"><option value="weekly">أسبوعية</option><option value="monthly">شهرية</option><option value="quarterly">ربعية (كل 3 أشهر)</option><option value="semiannual">نصف سنوية (كل 6 أشهر)</option><option value="annual">سنوية</option><option value="custom">مخصصة</option></select></label>{editRecurrenceFrequency === "custom" ? <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">التكرار كل كم يوم؟</span><input required name="interval_count" type="number" min="1" max="365" defaultValue={currentSeries?.frequency === "custom" ? currentSeries.interval_count : 14} className="h-10 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui"/></label> : <input type="hidden" name="interval_count" value="1"/>}{!currentSeries && <label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">إجمالي عدد الاجتماعات</span><input required name="occurrence_count" type="number" min="2" max="36" defaultValue="6" className="h-10 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui"/></label>}</div>
                </div>;
              })()}
              <div className="grid gap-4 sm:grid-cols-3">
                <AdministrativeInput label="تاريخ الانعقاد" required type="date" name="scheduled_date" min={selected.planned_window_start ?? undefined} max={selected.planned_window_end ?? undefined} defaultValue={selected.schedule_date_confirmed === false ? "" : selected.scheduled_date}/>
                <AdministrativeInput label="وقت البداية" required={selected.schedule_date_confirmed === false} type="time" name="start_time" defaultValue={selected.start_time ?? ""}/>
                <AdministrativeInput label="وقت النهاية" required={selected.schedule_date_confirmed === false} type="time" name="end_time" defaultValue={selected.end_time ?? ""}/>
              </div>
              {selected.schedule_date_confirmed === false && <p className="text-q-caption text-q-text-2">{meetingScheduleLabel(selected)}</p>}
              <div className="grid gap-3 sm:grid-cols-2"><label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">نوع المكان</span><select name="location_type" defaultValue={selected.location_type ?? "onsite"} className="h-11 w-full rounded-q-control border border-q-border bg-white px-3 text-q-ui"><option value="onsite">حضوري</option><option value="online">افتراضي</option><option value="hybrid">مختلط</option></select></label><label><span className="mb-1.5 block text-q-caption font-bold text-q-text-2">تفاصيل المكان</span><input name="location_details" defaultValue={selected.location_details ?? ""} placeholder="القاعة أو رابط الاجتماع" className="h-11 w-full rounded-q-control border border-q-border px-3 text-q-ui"/></label></div>
            </div>
            <div className="flex justify-end gap-3 border-t border-q-border bg-q-surface-2 px-6 py-4"><button type="button" onClick={() => setEditModal(false)} disabled={creating} className="h-10 rounded-q-control border border-q-border px-4 text-q-caption font-bold text-q-text-2">إلغاء</button><button disabled={creating} className="h-10 rounded-q-control bg-q-primary px-5 text-q-caption font-bold text-q-on-primary disabled:opacity-50">{creating ? "جارٍ الحفظ…" : "حفظ التعديلات"}</button></div>
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
