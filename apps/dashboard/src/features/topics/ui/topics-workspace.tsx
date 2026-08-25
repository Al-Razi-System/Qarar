"use client";

import { useCallback, useDeferredValue, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, FileCheck2, Forward, Inbox, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { topicsRpc } from "../api/topics-client";
import type { ReviewAction, Topic, TopicDetail } from "../model/topic-view";
import { TopicActionDialog } from "./topic-action-dialog";
import { TopicList } from "./topic-list";
import { TopicRegulationCreator } from "./topic-regulation-creator";
import { TopicSummaryPanel } from "./topic-summary-panel";

type Notice = { kind: "success" | "error"; text: string };
type GovernanceUnit = { id: string; name_ar: string };
type ReviewResult = { status?: string; updated_at?: string };

const reviewStatusOptions = [
  ["", "جميع الحالات النشطة"], ["new", "بانتظار المراجعة"],
  ["under_review", "قيد المراجعة"], ["deferred", "مؤجل"],
] as const;
const myStatusOptions = [
  ["", "جميع الحالات"], ["new", "بانتظار المراجعة"],
  ["under_review", "قيد المراجعة"], ["returned", "مطلوب استكمال"],
  ["approved", "معتمد للمسار"], ["rejected", "مرفوض"],
  ["deferred", "مؤجل"], ["listed", "مدرج في اجتماع"], ["closed", "مغلق"],
] as const;
const priorityOptions = [
  ["", "كل الأولويات"], ["urgent", "عاجلة"], ["high", "عالية"],
  ["medium", "متوسطة"], ["low", "منخفضة"],
] as const;

export function TopicsWorkspace({ initialQuery = "", initialTab = "mine" }: { initialQuery?: string; initialTab?: "mine" | "review" }) {
  const router = useRouter();
  const [tab, setTab] = useState<"mine" | "review">(initialTab);
  const [query, setQuery] = useState(initialQuery);
  const deferredQuery = useDeferredValue(query);
  const [statusFilter, setStatusFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<TopicDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [reviewDialog, setReviewDialog] = useState<"reject" | "return" | null>(null);
  const [reviewReason, setReviewReason] = useState("");
  const [referModal, setReferModal] = useState(false);
  const [referUnit, setReferUnit] = useState("");
  const [referReason, setReferReason] = useState("");
  const [referUnits, setReferUnits] = useState<GovernanceUnit[]>([]);
  const [referUnitsLoading, setReferUnitsLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const loadTopics = useCallback(async () => {
    setLoading(true);
    try {
      const contract = tab === "mine" ? "search_my_topics" : "search_topic_review_queue";
      const params: Record<string, unknown> = {
        p_query: deferredQuery.trim() || null,
        p_status: statusFilter || null,
        p_priority: priorityFilter || null,
        p_limit: 50,
        p_offset: 0,
      };
      if (tab === "review") {
        params.p_category_id = null;
        params.p_governance_unit_id = null;
      }
      const result = await topicsRpc<{ items: Topic[]; total: number }>(contract, params);
      setTopics(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (error) {
      setTopics([]);
      setTotal(0);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل الموضوعات." });
    } finally {
      setLoading(false);
    }
  }, [deferredQuery, priorityFilter, statusFilter, tab]);

  useEffect(() => {
    const task = window.setTimeout(() => { void loadTopics(); }, 0);
    return () => window.clearTimeout(task);
  }, [loadTopics]);

  function changeTab(next: "mine" | "review") {
    setTab(next);
    setStatusFilter("");
    setSelected(null);
    setNotice(null);
  }

  async function openDetail(topicId: string) {
    setDetailLoading(true);
    try {
      setSelected(await topicsRpc<TopicDetail>("get_topic_detail", { p_topic_id: topicId }));
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل تفاصيل الموضوع." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function reviewTopic(action: ReviewAction, reason?: string) {
    if (!selected || actionBusy) return;
    setActionBusy(true);
    setNotice(null);
    try {
      await topicsRpc<ReviewResult>("review_topic", {
        p_topic_id: selected.id,
        p_action: action,
        p_reason: reason?.trim() || null,
        p_expected_updated_at: selected.updated_at ?? null,
      });
      const successText = action === "approve"
        ? "تم اعتماد الموضوع وأصبح جاهزاً للمرحلة التالية."
        : action === "reject"
          ? "تم رفض الموضوع وتوثيق السبب في سجل الحالة."
          : "تم إرسال طلب الاستكمال إلى مقدم الموضوع وإزالته من قائمة المراجعة.";
      setSelected(null);
      setReviewDialog(null);
      setReviewReason("");
      await loadTopics();
      setNotice({ kind: "success", text: successText });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تنفيذ إجراء المراجعة." });
      if (selected) await openDetail(selected.id);
    } finally {
      setActionBusy(false);
    }
  }

  function requestReview(action: ReviewAction) {
    if (action === "approve") {
      void reviewTopic("approve");
      return;
    }
    setReviewReason("");
    setReviewDialog(action);
  }

  async function openReferDialog() {
    setReferModal(true);
    setReferUnit("");
    setReferReason("");
    setReferUnitsLoading(true);
    try {
      const references = await topicsRpc<{ governance_units?: GovernanceUnit[] }>("get_topic_form_options");
      setReferUnits(references.governance_units ?? []);
    } catch (error) {
      setReferUnits([]);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل الجهات المتاحة للإحالة." });
    } finally {
      setReferUnitsLoading(false);
    }
  }

  async function referTopic() {
    if (!selected || !referUnit || referReason.trim().length < 5) return;
    setActionBusy(true);
    setNotice(null);
    try {
      await topicsRpc("refer_topic", {
        p_topic_id: selected.id,
        p_to_unit_id: referUnit,
        p_reason: referReason.trim(),
        p_expected_updated_at: selected.updated_at ?? null,
      });
      setReferModal(false);
      setSelected(null);
      await loadTopics();
      setNotice({ kind: "success", text: "تمت إحالة الموضوع إلى الجهة المختارة وتوثيق الإجراء." });
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر إحالة الموضوع." });
    } finally {
      setActionBusy(false);
    }
  }

  function followCreatedTopic(topicId: string) {
    setCreateDialogOpen(false);
    router.push(`/admin/topics/${topicId}`);
  }

  const statusOptions = tab === "review" ? reviewStatusOptions : myStatusOptions;

  return <div className="space-y-5">
    {notice && <div role="status" className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs font-bold shadow-sm ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800"}`}>
      {notice.kind === "success" ? <Check className="mt-0.5 shrink-0" size={16} /> : <AlertCircle className="mt-0.5 shrink-0" size={16} />}<span className="leading-6">{notice.text}</span>
      <button aria-label="إغلاق الإشعار" onClick={() => setNotice(null)} className="mr-auto grid h-7 w-7 shrink-0 place-items-center rounded-lg hover:bg-black/5"><X size={14} /></button>
    </div>}

    <section className="rounded-3xl border border-[#dce7f1] bg-white p-3 shadow-[0_10px_32px_rgba(13,42,76,.05)]">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setCreateDialogOpen(true)} className="flex h-11 items-center gap-2 rounded-xl bg-[#0877df] px-5 text-xs font-black text-white shadow-[0_8px_20px_rgba(8,119,223,.2)] hover:bg-[#0669c7]"><Plus size={16} /> إنشاء موضوع</button>
        <button onClick={() => changeTab("mine")} className={`flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-black transition ${tab === "mine" ? "bg-[#0b2f59] text-white" : "text-[#53677d] hover:bg-[#f3f7fb]"}`}><Inbox size={15} /> موضوعاتي</button>
        <button onClick={() => changeTab("review")} className={`flex h-11 items-center gap-2 rounded-xl px-4 text-xs font-black transition ${tab === "review" ? "bg-[#0b2f59] text-white" : "text-[#53677d] hover:bg-[#f3f7fb]"}`}><FileCheck2 size={15} /> قائمة المراجعة</button>
        <div className="mr-auto flex flex-wrap items-center gap-2">
          <div className="relative"><Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8294a8]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالرقم أو العنوان..." className="h-11 w-64 rounded-xl border border-[#d8e3ed] bg-[#f9fbfd] pr-9 pl-3 text-[11px] outline-none focus:border-[#0877df] focus:bg-white" /></div>
          <label className="relative"><SlidersHorizontal size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#8294a8]" /><select aria-label="تصفية حسب الحالة" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-11 min-w-40 appearance-none rounded-xl border border-[#d8e3ed] bg-white pr-9 pl-7 text-[11px] font-bold text-[#41566e] outline-none focus:border-[#0877df]">{statusOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <select aria-label="تصفية حسب الأولوية" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)} className="h-11 min-w-36 rounded-xl border border-[#d8e3ed] bg-white px-3 text-[11px] font-bold text-[#41566e] outline-none focus:border-[#0877df]">{priorityOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        </div>
      </div>
    </section>

    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(390px,.62fr)]">
      <TopicList topics={topics} total={total} loading={loading} selectedId={selected?.id} title={tab === "mine" ? "موضوعاتي" : "الموضوعات المطلوب مراجعتها"} onSelect={(id) => void openDetail(id)} />
      <TopicSummaryPanel topic={selected} loading={detailLoading} reviewMode={tab === "review"} busy={actionBusy} onReview={requestReview} onRefer={() => void openReferDialog()} onOpenDetails={() => selected && router.push(`/admin/topics/${selected.id}`)} />
    </div>

    <TopicActionDialog action={reviewDialog} topic={selected} reason={reviewReason} busy={actionBusy} onReasonChange={setReviewReason} onClose={() => setReviewDialog(null)} onConfirm={() => reviewDialog && void reviewTopic(reviewDialog, reviewReason)} />

    {referModal && <div className="fixed inset-0 z-50 grid place-items-center bg-[#061329]/60 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="refer-topic-title" className="w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl">
      <header className="flex items-start gap-3 border-b border-[#e6edf4] bg-[#f5f9fd] p-6"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-[#e1f0ff] text-[#0877df]"><Forward size={19} /></span><div><h2 id="refer-topic-title" className="text-base font-black text-[#0a1330]">إحالة الموضوع</h2><p className="mt-1 text-[11px] text-[#718196]">اختر الجهة المختصة ووثّق سبب الإحالة.</p></div></header>
      <div className="space-y-4 p-6"><label className="block"><span className="mb-2 block text-xs font-black text-[#34465e]">الجهة المحال إليها *</span><select value={referUnit} onChange={(event) => setReferUnit(event.target.value)} disabled={referUnitsLoading} className="h-11 w-full rounded-xl border border-[#d4e0eb] bg-white px-3 text-xs outline-none focus:border-[#0877df]"><option value="">{referUnitsLoading ? "جارٍ تحميل الجهات..." : "اختر الجهة أو المجلس"}</option>{referUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}</select></label>
      <label className="block"><span className="mb-2 block text-xs font-black text-[#34465e]">سبب الإحالة *</span><textarea value={referReason} onChange={(event) => setReferReason(event.target.value)} rows={3} maxLength={2000} placeholder="اشرح سبب الإحالة واختصاص الجهة..." className="w-full rounded-xl border border-[#d4e0eb] p-3 text-xs leading-6 outline-none focus:border-[#0877df]" /><span className="mt-1 block text-[10px] text-[#7b8b9d]">الحد الأدنى 5 أحرف.</span></label></div>
      <footer className="flex justify-end gap-2 border-t border-[#e6edf4] bg-[#fbfcfe] p-4"><button onClick={() => setReferModal(false)} disabled={actionBusy} className="h-10 rounded-xl border border-[#d8e2ec] px-5 text-xs font-bold text-[#53667c]">إلغاء</button><button onClick={() => void referTopic()} disabled={actionBusy || !referUnit || referReason.trim().length < 5} className="h-10 rounded-xl bg-[#0877df] px-5 text-xs font-black text-white disabled:opacity-45">{actionBusy ? "جارٍ الإحالة..." : "تأكيد الإحالة"}</button></footer>
    </section></div>}

    {createDialogOpen && <div className="fixed inset-0 z-50 overflow-y-auto bg-[#061329]/60 p-3 backdrop-blur-sm sm:p-6"><div role="dialog" aria-modal="true" aria-labelledby="create-topic-dialog-title" className="mx-auto min-h-full w-full max-w-[1480px] rounded-3xl bg-[#f4f7fb] shadow-2xl"><div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#dce7f1] bg-white/95 px-5 py-4 backdrop-blur sm:px-7"><div><p className="text-[10px] font-black text-[#ff7a00]">معالج إنشاء موضوع</p><h2 id="create-topic-dialog-title" className="mt-1 text-base font-black text-[#0a1330]">إنشاء موضوع وربطه باللائحة ومسار الاعتماد</h2></div><button onClick={() => setCreateDialogOpen(false)} aria-label="إغلاق معالج إنشاء الموضوع" className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce7f1] text-[#60738a] hover:bg-[#f4f7fb]"><X size={19} /></button></div><div className="p-4 sm:p-6"><TopicRegulationCreator onFollowTopic={followCreatedTopic} /></div></div></div>}
  </div>;
}
