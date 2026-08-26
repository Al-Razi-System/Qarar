"use client";

import { useDeferredValue, useEffect, useEffectEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Calendar, Check, Clock, FileText, LoaderCircle, MapPin, Play, Plus, Search, Users, X,
} from "lucide-react";
import { meetingRpc as rpc } from "../api/meetings-client";
import {
  isAgendaEditable, meetingStatusLabels as statusLabels, meetingStatusTone as statusTone,
  type AgendaCandidate, type Meeting, type MeetingDetail, type MeetingFormOptions,
  type MeetingMinutes, type MeetingReadiness, type MinuteApproval, type SignatureStrokes,
} from "../model/meeting";
import { MeetingAgendaPanel } from "./meeting-agenda-panel";
import { MeetingMinutesWorkspace } from "./meeting-minutes-workspace";

type Notice = { kind: "success" | "error"; text: string };
function meetingErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.includes("agenda is locked in meeting status")) {
    return "لا يمكن تعديل جدول الأعمال بعد بدء الاجتماع. اختر اجتماعًا في حالة مسودة أو مجدولًا.";
  }
  return message;
}

function minutesStatusLabel(status?: string | null) {
  if (status === "approved") return "محضر معتمد";
  if (status === "ready_for_approval") return "محضر بانتظار المصادقة";
  if (status === "draft") return "مسودة محضر";
  return status ? `حالة المحضر: ${status}` : null;
}

function truncateText(value?: string | null, max = 150) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function MeetingsWorkspace() {
  const router = useRouter();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<MeetingDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createModal, setCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [meetingOptions, setMeetingOptions] = useState<MeetingFormOptions | null>(null);
  const [meetingOptionsLoading, setMeetingOptionsLoading] = useState(false);
  const [agendaCandidates, setAgendaCandidates] = useState<AgendaCandidate[]>([]);
  const [eligibleAgendaCount, setEligibleAgendaCount] = useState<number | null>(null);
  const [agendaLoading, setAgendaLoading] = useState(false);
  const [agendaModal, setAgendaModal] = useState(false);
  const [agendaQuery, setAgendaQuery] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState("");
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null);
  const [minutesLoading, setMinutesLoading] = useState(false);
  const [minutesText, setMinutesText] = useState("");
  const [readiness, setReadiness] = useState<MeetingReadiness | null>(null);

  async function loadMeetings() {
    setLoading(true); setNotice(null);
    try {
      const result = await rpc<{ items: Meeting[]; total: number }>("search_meetings", {
        p_query: deferredQuery.trim() || null, p_status: statusFilter || null, p_unit_id: null,
        p_from_date: null, p_to_date: null, p_limit: 50, p_offset: 0,
      });
      setMeetings(result.items ?? []);
      setTotal(result.total ?? 0);
      const nextMeetings = result.items ?? [];
      if (nextMeetings.length && (!selected || !nextMeetings.some((meeting) => meeting.id === selected.id))) {
        void openDetail(nextMeetings[0].id);
      } else if (!nextMeetings.length) {
        setSelected(null);
      }
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التحميل." });
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(meetingId: string) {
    setDetailLoading(true); setNotice(null);
    try {
      const detail = await rpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId });
      setSelected(detail);
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
      if (["waiting_for_minutes", "waiting_for_approval", "closed"].includes(detail.status)) {
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

  async function sendInvitations() {
    if (!selected) return;
    setDetailLoading(true); setNotice(null);
    try {
      const result = await rpc<{ queued: number }>("send_meeting_invitations", { p_meeting_id: selected.id, p_expected_updated_at: selected.updated_at });
      setNotice({ kind: "success", text: `جُهزت دعوات الاجتماع للأعضاء (${result.queued} دعوة جديدة) وسُجلت في قائمة الإرسال.` });
      await openDetail(selected.id);
    } catch (err) { setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تجهيز الدعوات." }); }
    finally { setDetailLoading(false); }
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
    setAgendaLoading(true);
    try {
      const result = await rpc<{ items: AgendaCandidate[]; total?: number; locked?: boolean }>("search_eligible_agenda_topics", {
        p_meeting_id: selected.id, p_query: (queryOverride ?? agendaQuery).trim() || null, p_limit: 30, p_offset: 0,
      });
      setAgendaCandidates(result.items ?? []);
      setEligibleAgendaCount(result.total ?? 0);
      if (result.locked) setNotice({ kind: "error", text: "جدول الأعمال مقفل لأن الاجتماع بدأ. يمكن التعديل فقط في حالة مسودة أو مجدول." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تحميل الموضوعات المؤهلة." });
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

  async function openLiveSession() {
    if (!selected) return;
    setDetailLoading(true); setNotice(null);
    try {
      await rpc("open_meeting_session", { p_meeting_id: selected.id, p_expected_updated_at: selected.updated_at });
      router.push(`/admin/meetings/${selected.id}/live`);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر فتح الجلسة." });
      setDetailLoading(false);
    }
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreating(true); setNotice(null);
    const fd = new FormData(event.currentTarget);
    try {
      const created = await rpc<{ id: string }>("create_meeting", {
        p_governance_unit_id: String(fd.get("governance_unit_id") ?? ""),
        p_meeting_type_id: String(fd.get("meeting_type_id") ?? ""),
        p_title_ar: fd.get("title_ar"),
        p_scheduled_date: fd.get("scheduled_date"),
        p_start_time: fd.get("start_time"),
        p_end_time: fd.get("end_time"),
        p_location_type: fd.get("location_type") || "onsite",
        p_location_details: fd.get("location_details") || null,
        p_title_en: null,
        p_client_request_id: crypto.randomUUID(),
      });
      setCreateModal(false);
      setNotice({ kind: "success", text: "تم إنشاء الاجتماع بنجاح." });
      await loadMeetings();
      await openDetail(created.id);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر الإنشاء." });
    } finally {
      setCreating(false);
    }
  }

  const loadMeetingsOnFilterChange = useEffectEvent(loadMeetings);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadMeetingsOnFilterChange(), 0);
    return () => window.clearTimeout(timer);
  }, [deferredQuery, statusFilter]);

  return (
    <div className="space-y-5">
      {notice && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />} {notice.text}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#dce7f0] bg-white p-4 shadow-[0_8px_28px_rgba(24,48,80,.055)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8796a9]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث بالعنوان أو رقم الاجتماع..." aria-label="البحث في الاجتماعات" className="h-10 w-64 rounded-xl border border-[#dfe7ef] bg-[#fafcfe] pr-9 pl-3 text-xs outline-none focus:border-[#9bc9f2]" />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="تصفية الاجتماعات حسب الحالة" className="h-10 rounded-xl border border-[#dfe7ef] bg-[#fafcfe] px-3 text-xs font-bold text-[#40566f] outline-none focus:border-[#9bc9f2]">
            <option value="">جميع الحالات</option>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <span className="text-[10px] font-bold text-[#7a8b9e]">إجمالي: <strong className="text-[#0a1330]">{total}</strong></span>
        </div>
        <button onClick={() => void openCreateModal()} className="flex items-center gap-2 rounded-xl bg-[#0066cc] px-4 py-2.5 text-xs font-bold text-white shadow-[0_4px_14px_rgba(0,102,204,.25)] hover:bg-[#0055b3]">
          <Plus size={16} /> إنشاء اجتماع
        </button>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(360px,.72fr)_minmax(560px,1.28fr)]">
        {/* Meetings List */}
        <div className="rounded-2xl border border-[#e2e9f1] bg-white shadow-[0_3px_16px_rgba(24,48,80,.035)]">
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
            <div className="divide-y divide-[#eef2f6]">
              {meetings.map((m) => (
                <button key={m.id} onClick={() => openDetail(m.id)} className={`flex w-full items-center gap-4 px-5 py-4 text-right transition hover:bg-[#fbfdff] ${selected?.id === m.id ? "bg-[#edf6ff]" : ""}`}>
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
                      {m.scheduled_date ?? "—"} · {m.start_time ?? ""}-{m.end_time ?? ""} · {m.unit_name_ar ?? "—"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel */}
        <div className="rounded-2xl border border-[#e2e9f1] bg-white shadow-[0_3px_16px_rgba(24,48,80,.035)]">
          {detailLoading ? (
            <div className="grid min-h-[400px] place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={28} /></div>
          ) : !selected ? (
            <div className="grid min-h-[400px] place-items-center text-center p-8">
              <div><Calendar className="mx-auto text-[#86a8c9]" size={30} /><h3 className="mt-3 text-sm font-black text-[#24364e]">اختر اجتماعاً</h3></div>
            </div>
          ) : (
            <div className="divide-y divide-[#edf1f5]">
              <div className="p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-[10px] text-[#7b8ba0]">أضف الموضوعات المؤهلة إلى جدول الأعمال قبل بدء الجلسة.</p>
                  <button onClick={() => void openAgendaModal()} disabled={agendaLoading || !selected.capabilities?.can_manage_agenda} title={selected.capabilities?.can_manage_agenda ? "إضافة موضوع مؤهل إلى جدول الأعمال" : "لا تملك صلاحية التعديل أو أن جدول الأعمال مقفل"} className="rounded-xl border border-[#cfe0f0] px-3 py-2 text-[10px] font-bold text-[#0066cc] disabled:cursor-not-allowed disabled:border-[#e4e9ef] disabled:bg-[#f5f7fa] disabled:text-[#94a1b0] disabled:opacity-100">{agendaLoading ? "جارٍ التحميل…" : "إضافة موضوع"}</button>
                </div>
                <span className={`mb-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone[selected.status] ?? ""}`}>{statusLabels[selected.status] ?? selected.status}</span>
                <h2 className="text-base font-black text-[#0a1330]">{selected.title_ar}</h2>
                <p className="mt-1 text-[10px] text-[#7b8ba0]">{selected.meeting_no ?? selected.id}</p>
                {!isAgendaEditable(selected.status) && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-bold leading-5 text-amber-800">بدأ الاجتماع، لذلك أصبح جدول الأعمال مقفلًا ولا يمكن إضافة أو إزالة موضوعات.</p>}
                <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center gap-1.5 text-[#52647a]"><Calendar size={13} /> {selected.scheduled_date ?? "—"}</div>
                  <div className="flex items-center gap-1.5 text-[#52647a]"><Clock size={13} /> {selected.start_time ?? "—"} - {selected.end_time ?? "—"}</div>
                  <div className="flex items-center gap-1.5 text-[#52647a]"><MapPin size={13} /> {selected.location_details ?? selected.location_type ?? "—"}</div>
                  <div className="flex items-center gap-1.5 text-[#52647a]"><Users size={13} /> {selected.unit_name_ar ?? "—"}</div>
                </div>
              </div>

              <MeetingAgendaPanel
                items={selected.agenda_items ?? []}
                editable={Boolean(selected.capabilities?.can_manage_agenda)}
                busy={detailLoading}
                eligibleCount={eligibleAgendaCount}
                onAdd={() => void openAgendaModal()}
                onMove={(index, direction) => void moveAgendaItem(index, direction)}
                onRemove={(id) => void removeAgendaItem(id)}
              />

              {readiness && ["draft","scheduled","ready_to_start"].includes(selected.status) && <div className="p-5"><h3 className="mb-3 text-xs font-black text-[#0a1330]">جاهزية الاجتماع</h3><div className="grid gap-2 sm:grid-cols-2">{readiness.checks.map((check) => <div key={check.code} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-bold ${check.complete ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}><span className={`grid h-5 w-5 place-items-center rounded-full ${check.complete ? "bg-emerald-600 text-white" : "bg-amber-400 text-white"}`}>{check.complete ? "✓" : "!"}</span><span>{check.label}{typeof check.count === "number" ? ` (${check.count})` : ""}</span></div>)}</div></div>}

              {(["waiting_for_minutes", "waiting_for_approval", "closed"].includes(selected.status)) && (
                <div className="p-5"><MeetingMinutesWorkspace meeting={selected} minutes={minutes} text={minutesText} loading={minutesLoading} onTextChange={setMinutesText} onGenerate={() => void generateMinutesDraft()} onSave={() => void saveMinutesDraft()} onSubmit={() => void submitMinutes()} onSign={signMinutes} onReturn={returnMinutes} /></div>
              )}

              {/* Transition Actions */}
              <div className="flex flex-wrap gap-2 p-5">
                {(["waiting_for_minutes", "waiting_for_approval", "closed"].includes(selected.status)) && <Link href={`/admin/meetings/${selected.id}/minutes`} className="flex items-center gap-1.5 rounded-xl bg-[#0877d6] px-4 py-2.5 text-[11px] font-black text-white shadow-[0_7px_18px_rgba(8,119,214,.2)]"><FileText size={14} />فتح مساحة المحضر والمصادقات</Link>}
                {selected.capabilities?.can_schedule && <button onClick={() => transitionMeeting("scheduled")} className="flex items-center gap-1.5 rounded-xl bg-[#0066cc] px-3 py-2 text-[11px] font-bold text-white"><Play size={14} /> جدولة</button>}
                {selected.status === "scheduled" && <>{selected.capabilities?.can_send_invitations && <button onClick={() => void sendInvitations()} disabled={!readiness?.ready} title={!readiness?.ready ? "أكمل متطلبات الجاهزية أولاً" : "تجهيز دعوات أعضاء المجلس"} className="flex items-center gap-1.5 rounded-xl border border-[#bfd5e8] px-3 py-2 text-[11px] font-bold text-[#0066cc] disabled:opacity-40"><Users size={14} /> تجهيز الدعوات</button>}{selected.capabilities?.can_prepare_session && <button onClick={() => transitionMeeting("ready_to_start")} disabled={!readiness?.ready} title={!readiness?.ready ? "أكمل متطلبات الجاهزية أولاً" : "قفل التحضير وتجهيز الجلسة"} className="flex items-center gap-1.5 rounded-xl bg-[#f28c28] px-3 py-2 text-[11px] font-bold text-white disabled:bg-[#a9b6c5]"><Users size={14} /> تجهيز الجلسة</button>}</>}
                {selected.capabilities?.can_start_session && <button onClick={() => void openLiveSession()} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"><Play size={14} /> فتح الجلسة الحية</button>}
                {selected.status === "in_progress" && <Link href={`/admin/meetings/${selected.id}/live`} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"><Play size={14} /> متابعة الجلسة الحية</Link>}
                {selected.status === "waiting_for_minutes" && <span className="rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-bold text-amber-800">أكمل المحضر وأرسله للمصادقة من القسم أعلاه.</span>}
                {selected.capabilities?.can_cancel && <button onClick={() => void transitionMeeting("cancelled")} className="rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold text-red-600">إلغاء الاجتماع</button>}
                {selected.capabilities?.can_archive && <button onClick={() => void transitionMeeting("archived")} className="rounded-xl border border-[#cbd7e3] px-3 py-2 text-[11px] font-bold text-[#52647a]">أرشفة الاجتماع</button>}
              </div>
            </div>
          )}
        </div>
      </div>

      {agendaModal && selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="إضافة موضوع إلى جدول الأعمال">
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e7edf3] px-6 py-5">
              <div><h2 className="text-base font-black text-[#0a1330]">إضافة موضوع إلى جدول الأعمال</h2><p className="mt-1 text-xs text-[#718196]">تظهر الموضوعات المطابقة للجهة وحالة المسار فقط.</p></div>
              <button type="button" onClick={() => setAgendaModal(false)} className="rounded-lg p-2 text-[#73849a] hover:bg-[#f2f6fa] hover:text-[#0a1330]" aria-label="إغلاق"><X size={19} /></button>
            </div>
            <div className="p-6">
              <div className="flex gap-2 rounded-xl border border-[#dce7f0] bg-[#fafcfe] p-1.5">
                <input autoFocus value={agendaQuery} onChange={(event) => setAgendaQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadAgendaCandidates(); }} placeholder="ابحث باسم الموضوع أو رقمه" className="h-9 min-w-0 flex-1 bg-transparent px-2 text-xs outline-none" />
                <button type="button" onClick={() => void loadAgendaCandidates()} disabled={agendaLoading} className="rounded-lg bg-[#0066cc] px-4 text-xs font-bold text-white disabled:opacity-50">بحث</button>
              </div>
              <div className="mt-4 max-h-[45vh] space-y-2 overflow-y-auto">
                {agendaLoading ? <div className="grid min-h-36 place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={24} /></div> : agendaCandidates.length ? agendaCandidates.map((topic) => {
                  const sourceLabel = [topic.source_unit_name_ar, topic.source_meeting_no].filter(Boolean).join(" · ");
                  const sourceMinutesLabel = minutesStatusLabel(topic.source_minutes_status);
                  return (
                    <div key={topic.id} className="rounded-2xl border border-[#d7e7f5] bg-[#fbfdff] p-4 shadow-[0_10px_24px_rgba(14,52,89,.055)]">
                      <div className="flex flex-wrap items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {topic.topic_no && <span className="rounded-full bg-[#eaf4ff] px-2.5 py-1 text-[9px] font-black text-[#0877d1]">{topic.topic_no}</span>}
                            {topic.priority && <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[9px] font-black text-orange-700">{topic.priority}</span>}
                            {sourceMinutesLabel && <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[9px] font-black text-emerald-700">{sourceMinutesLabel}</span>}
                            {topic.source_decision_no && <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[9px] font-black text-slate-700">{topic.source_decision_no}</span>}
                          </div>
                          <h3 className="text-sm font-black leading-6 text-[#0a1330]">{topic.title_ar}</h3>
                          {topic.current_step && <p className="mt-1 text-[10px] font-bold text-[#0066cc]">الخطوة الحالية: {topic.current_step}</p>}
                          {sourceLabel && <p className="mt-2 text-[10px] font-bold text-[#60748a]">مرحل من: {sourceLabel}</p>}
                          {topic.source_decision_text && <p className="mt-2 rounded-xl border border-[#e3edf6] bg-white px-3 py-2 text-[10px] leading-5 text-[#40566f]">القرار السابق: {truncateText(topic.source_decision_text)}</p>}
                        </div>
                        <button type="button" onClick={() => void addAgendaItem(topic.id)} disabled={detailLoading} className="rounded-xl bg-[#0066cc] px-4 py-2 text-[11px] font-bold text-white shadow-[0_8px_18px_rgba(0,102,204,.16)] disabled:opacity-50">إضافة إلى الجدول</button>
                      </div>
                    </div>
                  );
                }) : <div className="rounded-2xl border border-dashed border-[#caddec] bg-[#fbfdff] p-8 text-center"><Search className="mx-auto text-[#84a4c2]" size={28} /><h3 className="mt-3 text-sm font-black text-[#193451]">لا توجد موضوعات مؤهلة حاليًا</h3><div className="mx-auto mt-3 max-w-lg rounded-xl bg-[#f5f9fd] p-3 text-right text-[10px] leading-6 text-[#60748a]"><p>يظهر الموضوع هنا عندما:</p><p>1. تكون الخطوة موجهة إلى مجلس هذا الاجتماع وحالة الموضوع قابلة للإدراج.</p><p>2. يكون محضر الاجتماع السابق معتمدًا إذا كان الموضوع مرحلًا من مجلس آخر.</p><p>3. لا يكون الموضوع عالقًا في حالة إدراج لاجتماع سابق أو مدرجًا في اجتماع آخر مفتوح.</p></div><Link href="/admin/topics" className="mt-3 inline-flex rounded-xl bg-[#0066cc] px-4 py-2 text-[11px] font-bold text-white">فتح الموضوعات والتحقق من المسار</Link></div>}
              </div>
            </div>
            <div className="flex justify-end border-t border-[#e7edf3] bg-[#fbfcfe] px-6 py-4"><button type="button" onClick={() => setAgendaModal(false)} className="rounded-xl border border-[#dbe5ef] px-4 py-2 text-xs font-bold text-[#52647a]">إغلاق</button></div>
          </div>
        </div>
      )}

      {/* Create Meeting Modal */}
      {createModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm">
          <form onSubmit={handleCreate} className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#e7edf3] px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]"><Calendar size={20} /></span>
                <div><h2 className="text-base font-black text-[#0a1330]">إنشاء اجتماع جديد</h2><p className="text-xs text-[#718196]">حدد بيانات الاجتماع وموعده ومكانه.</p></div>
              </div>
              <button type="button" onClick={() => setCreateModal(false)} className="text-[#73849a] hover:text-[#0a1330]"><X size={20} /></button>
            </div>
            <div className="grid gap-4 p-6">
              <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">المجلس أو الجهة *</span><select required name="governance_unit_id" disabled={meetingOptionsLoading || !(meetingOptions?.meeting_units?.length)} className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs outline-none focus:border-[#0066cc] disabled:cursor-not-allowed disabled:bg-[#f4f7fa]"><option value="">{meetingOptionsLoading ? "جارٍ تحميل الجهات…" : meetingOptions?.meeting_units?.length ? "اختر المجلس أو الجهة" : "لا توجد جهة متاحة ضمن صلاحياتك"}</option>{meetingOptions?.meeting_units?.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}</select><small className="mt-1 block text-[10px] text-[#718196]">تظهر الجهات التي تملك صلاحية إنشاء اجتماع فيها فقط.</small></label>
              <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">نوع الاجتماع *</span><select required name="meeting_type_id" disabled={meetingOptionsLoading || !(meetingOptions?.meeting_types?.length)} className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs outline-none focus:border-[#0066cc] disabled:cursor-not-allowed disabled:bg-[#f4f7fa]"><option value="">{meetingOptionsLoading ? "جارٍ تحميل الأنواع…" : meetingOptions?.meeting_types?.length ? "اختر نوع الاجتماع" : "لا توجد أنواع اجتماعات نشطة"}</option>{meetingOptions?.meeting_types?.map((type) => <option key={type.id} value={type.id}>{type.name_ar}</option>)}</select></label>
              <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">عنوان الاجتماع *</span><input required name="title_ar" placeholder="مثال: الاجتماع الثالث لمجلس القسم" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]" /></label>
              <div className="grid gap-4 sm:grid-cols-3">
                <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">التاريخ *</span><input required type="date" name="scheduled_date" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]" /></label>
                <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">بداية *</span><input required type="time" name="start_time" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]" /></label>
                <label><span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">نهاية *</span><input required type="time" name="end_time" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs outline-none focus:border-[#0066cc]" /></label>
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
    </div>
  );
}
