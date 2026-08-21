"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, Check, Clock, Eye, FileCheck2, Filter, Forward, Inbox, LoaderCircle,
  Plus, Search, X,
} from "lucide-react";
import { TopicRegulationCreator } from "./topic-regulation-creator";

type Topic = {
  id: string;
  topic_no?: string | null;
  title_ar: string;
  title_en?: string | null;
  status: string;
  priority: string;
  source_type?: string;
  routing_status?: string;
  governance_source?: string | null;
  category_name_ar?: string;
  unit_name_ar?: string;
  created_at?: string;
  updated_at?: string;
};

type TopicDetail = Topic & {
  description?: string | null;
  current_unit_id?: string;
  category_id?: string;
  referrals?: Array<{
    id: string;
    to_unit_name_ar: string;
    from_unit_name_ar: string;
    reason: string;
    decision?: string;
    created_at: string;
  }>;
};

type TopicWorkflow = {
  steps?: Array<{
    status?: string;
    action_version?: number | null;
  }>;
};

type Notice = { kind: "success" | "error"; text: string };
type GovernanceUnit = { id: string; name_ar: string };

const statusLabels: Record<string, string> = {
  draft: "مسودة", pending_review: "بانتظار المراجعة", under_review: "قيد المراجعة",
  approved: "معتمد", rejected: "مرفوض", needs_info: "يحتاج استكمال",
  referred: "محال", closed: "مغلق", active: "نشط",
};
const priorityLabels: Record<string, string> = {
  low: "منخفضة", medium: "متوسطة", high: "عالية", urgent: "عاجلة",
};
const statusTone: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  pending_review: "bg-amber-50 text-amber-700",
  under_review: "bg-blue-50 text-blue-700",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  needs_info: "bg-orange-50 text-orange-700",
  referred: "bg-purple-50 text-purple-700",
  active: "bg-emerald-50 text-emerald-700",
};

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const res = await fetch("/api/admin/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

export function TopicsWorkspace({ initialQuery = "" }: { initialQuery?: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<"mine" | "review">("mine");
  const [query, setQuery] = useState(initialQuery);
  const statusFilter = "";
  const priorityFilter = "";
  const [topics, setTopics] = useState<Topic[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<TopicDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [reviewModal, setReviewModal] = useState<"approve" | "reject" | "needs_info" | null>(null);
  const [referModal, setReferModal] = useState(false);
  const [reviewReason, setReviewReason] = useState("");
  const [referUnit, setReferUnit] = useState("");
  const [referReason, setReferReason] = useState("");
  const [referUnits, setReferUnits] = useState<GovernanceUnit[]>([]);
  const [referUnitsLoading, setReferUnitsLoading] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const loadTopics = useCallback(async (preserveSelection = false) => {
    setLoading(true); setNotice(null);
    if (!preserveSelection) setSelected(null);
    try {
      const contract = tab === "mine" ? "search_my_topics" : "search_topic_review_queue";
      const params: Record<string, unknown> = {
        p_query: query || null,
        p_status: statusFilter || null,
        p_priority: priorityFilter || null,
        p_limit: 50,
        p_offset: 0,
      };
      if (tab === "review") {
        params.p_category_id = null;
        params.p_governance_unit_id = null;
      }
      const result = await rpc<{ items: Topic[]; total: number }>(contract, params);
      setTopics(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التحميل." });
    } finally {
      setLoading(false);
    }
  }, [query, tab]);

  useEffect(() => {
    const task = window.setTimeout(() => { void loadTopics(); }, 0);
    return () => window.clearTimeout(task);
  }, [loadTopics]);

  async function openDetail(topicId: string) {
    setDetailLoading(true);
    setNotice(null);
    try {
      setSelected(await rpc<TopicDetail>("get_topic_detail", { p_topic_id: topicId }));
    } catch (error) {
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل تفاصيل الموضوع." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function followCreatedTopic(topicId: string) {
    setCreateDialogOpen(false);
    router.push(`/admin/topics/${topicId}`);
  }

  async function openReferDialog() {
    setReferModal(true);
    setReferUnit("");
    setReferReason("");
    setReferUnitsLoading(true);
    try {
      const references = await rpc<{ governance_units?: GovernanceUnit[] }>("get_topic_form_options");
      setReferUnits(references.governance_units ?? []);
    } catch (error) {
      setReferUnits([]);
      setNotice({ kind: "error", text: error instanceof Error ? error.message : "تعذر تحميل الجهات المتاحة للإحالة." });
    } finally {
      setReferUnitsLoading(false);
    }
  }

  async function doReview(action: string) {
    if (!selected) return;
    setActionBusy(true); setNotice(null);
    try {
      const reviewAction = action === "needs_info" ? "return" : action;
      const workflow = await rpc<TopicWorkflow>("get_topic_workflow", { p_topic_id: selected.id }).catch(() => null);
      const activeStep = workflow?.steps?.find((step) => step.status === "active");

      // Governed topics must advance through the workflow contract. The database
      // synchronizes the review status in the same transaction, so an approved
      // topic immediately becomes eligible for the next meeting-owned step.
      if (activeStep && (reviewAction === "approve" || reviewAction === "reject")) {
        await rpc("act_topic_workflow_step", {
          p_topic_id: selected.id,
          p_outcome_code: reviewAction === "approve" ? "approved" : "rejected",
          p_comment: reviewReason || null,
          p_idempotency_key: crypto.randomUUID(),
          p_expected_version: activeStep.action_version ?? null,
        });
      } else {
        let expectedUpdatedAt = selected.updated_at || null;
        if (reviewAction === "approve" && selected.status === "new") {
        const started = await rpc<{ updated_at?: string }>("review_topic", {
          p_topic_id: selected.id,
          p_action: "start_review",
          p_reason: null,
            p_expected_updated_at: expectedUpdatedAt,
        });
        const refreshed = await rpc<TopicDetail>("get_topic_detail", { p_topic_id: selected.id });
          expectedUpdatedAt = refreshed.updated_at ?? started.updated_at ?? expectedUpdatedAt;
        }
        await rpc("review_topic", {
          p_topic_id: selected.id,
          p_action: reviewAction,
          p_reason: reviewReason || null,
          p_expected_updated_at: expectedUpdatedAt,
        });
      }
      setReviewModal(null); setReviewReason("");
      setNotice({ kind: "success", text: `تم ${action === "approve" ? "اعتماد" : action === "reject" ? "رفض" : "طلب استكمال"} الموضوع بنجاح.` });
      await openDetail(selected.id);
      await loadTopics(true);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر تنفيذ العملية." });
    } finally {
      setActionBusy(false);
    }
  }

  async function doRefer() {
    if (!selected || !referUnit) return;
    setActionBusy(true); setNotice(null);
    try {
      await rpc("refer_topic", {
        p_topic_id: selected.id,
        p_to_unit_id: referUnit,
        p_reason: referReason || "إحالة من لوحة التحكم",
        p_expected_updated_at: selected.updated_at || null,
      });
      setReferModal(false); setReferUnit(""); setReferReason("");
      setNotice({ kind: "success", text: "تم إحالة الموضوع بنجاح." });
      await openDetail(selected.id);
      await loadTopics(true);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر الإحالة." });
    } finally {
      setActionBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />} {notice.text}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 rounded-2xl border border-[#e2e9f1] bg-white p-1.5 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
        <button onClick={() => setCreateDialogOpen(true)} className="flex items-center gap-2 rounded-xl bg-[#0066cc] px-4 py-2.5 text-xs font-black text-white shadow-[0_4px_14px_rgba(0,102,204,.25)] transition hover:bg-[#005ab4]">
          <Plus size={16} /> إنشاء موضوع
        </button>
        <button onClick={() => setTab("mine")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${tab === "mine" ? "bg-[#0066cc] text-white shadow-[0_4px_14px_rgba(0,102,204,.25)]" : "text-[#52647a] hover:bg-[#f6f9fc]"}`}>
          <Inbox size={15} /> موضوعاتي
        </button>
        <button onClick={() => setTab("review")} className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${tab === "review" ? "bg-[#0066cc] text-white shadow-[0_4px_14px_rgba(0,102,204,.25)]" : "text-[#52647a] hover:bg-[#f6f9fc]"}`}>
          <FileCheck2 size={15} /> قائمة المراجعة
        </button>
        <div className="mr-auto flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8796a9]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadTopics()} placeholder="ابحث في الموضوعات..." className="h-9 w-56 rounded-lg border border-[#dfe7ef] bg-[#fafcfe] pr-9 pl-3 text-[11px] outline-none focus:border-[#9bc9f2]" />
          </div>
          <button onClick={() => void loadTopics()} className="h-9 rounded-lg border border-[#dfe7ef] px-3 text-[11px] font-bold text-[#52647a] hover:bg-[#f6f9fc]">
            <Filter size={14} />
          </button>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(400px,.6fr)]">
        {/* Topics List */}
        <div className="rounded-2xl border border-[#e2e9f1] bg-white shadow-[0_3px_16px_rgba(24,48,80,.035)]">
          <div className="flex items-center justify-between border-b border-[#edf1f5] px-5 py-3">
            <h2 className="text-sm font-black text-[#0a1330]">{tab === "mine" ? "موضوعاتي" : "قائمة المراجعة"}</h2>
            <span className="text-[10px] font-bold text-[#7a8b9e]">إجمالي: <strong className="text-[#0a1330]">{total}</strong></span>
          </div>

          {loading ? (
            <div className="grid min-h-[300px] place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={28} /></div>
          ) : topics.length === 0 ? (
            <div className="grid min-h-[300px] place-items-center text-center p-8">
              <div>
                <Inbox className="mx-auto text-[#86a8c9]" size={34} />
                <h3 className="mt-3 text-sm font-black text-[#24364e]">لا توجد موضوعات</h3>
                <p className="mt-1 text-xs text-[#8291a4]">لم تُرجع قاعدة البيانات موضوعات مطابقة.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#eef2f6]">
              {topics.map((topic) => (
                <button key={topic.id} onClick={() => openDetail(topic.id)} className={`flex w-full items-start gap-3 px-5 py-4 text-right transition hover:bg-[#fbfdff] ${selected?.id === topic.id ? "bg-[#edf6ff]" : ""}`}>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-black ${statusTone[topic.status] ?? "bg-slate-100 text-slate-600"}`}>{statusLabels[topic.status] ?? topic.status}</span>
                      <span className="rounded-full bg-[#edf5fd] px-2 py-0.5 text-[9px] font-black text-[#0066cc]">{priorityLabels[topic.priority] ?? topic.priority}</span>
                    </div>
                    <h3 className="text-xs font-black text-[#0a1330] leading-5">{topic.title_ar}</h3>
                    <p className="mt-1 text-[10px] text-[#7b8ba0]">
                      {topic.topic_no ?? topic.id.slice(0, 8)} · {topic.category_name_ar ?? "—"} · {topic.unit_name_ar ?? "—"}
                    </p>
                  </div>
                  <Eye size={16} className="mt-1 text-[#8aa0b8]" />
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
              <div>
                <Eye className="mx-auto text-[#86a8c9]" size={30} />
                <h3 className="mt-3 text-sm font-black text-[#24364e]">اختر موضوعاً لعرض تفاصيله</h3>
                <p className="mt-1 text-xs text-[#8291a4]">اضغط على أي موضوع من القائمة.</p>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-[#edf1f5]">
              <div className="p-5">
                <div className="mb-3 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${statusTone[selected.status] ?? "bg-slate-100 text-slate-600"}`}>{statusLabels[selected.status] ?? selected.status}</span>
                  <span className="rounded-full bg-[#edf5fd] px-2.5 py-1 text-[10px] font-black text-[#0066cc]">{priorityLabels[selected.priority] ?? selected.priority}</span>
                  {selected.routing_status && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black text-amber-700">{selected.routing_status}</span>}
                </div>
                <h2 className="text-base font-black text-[#0a1330]">{selected.title_ar}</h2>
                <p className="mt-1 text-[10px] text-[#7b8ba0]">{selected.topic_no ?? selected.id}</p>
                {selected.description && <p className="mt-3 rounded-xl bg-[#fbfdff] border border-[#edf2f7] p-3 text-xs leading-6 text-[#3d4f66]">{selected.description}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3 p-5">
                <div className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3">
                  <p className="text-[10px] font-black text-[#617287]">الفئة</p>
                  <strong className="mt-1 block text-xs text-[#0a1330]">{selected.category_name_ar ?? "—"}</strong>
                </div>
                <div className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3">
                  <p className="text-[10px] font-black text-[#617287]">الجهة المسؤولة</p>
                  <strong className="mt-1 block text-xs text-[#0a1330]">{selected.unit_name_ar ?? "—"}</strong>
                </div>
              </div>

              {/* Action Buttons */}
              {tab === "review" && (
                <div className="flex flex-wrap gap-2 p-5">
                  <button onClick={() => { setReviewModal("approve"); setReviewReason(""); }} className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-700">
                    <Check size={14} /> اعتماد
                  </button>
                  <button onClick={() => { setReviewModal("reject"); setReviewReason(""); }} className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-[11px] font-bold text-white hover:bg-red-700">
                    <X size={14} /> رفض
                  </button>
                  <button onClick={() => { setReviewModal("needs_info"); setReviewReason(""); }} className="flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 hover:bg-amber-100">
                    <Clock size={14} /> طلب استكمال
                  </button>
                  <button onClick={() => void openReferDialog()} className="flex items-center gap-1.5 rounded-xl border border-[#cbd9e8] bg-white px-3 py-2 text-[11px] font-bold text-[#3d4f66] hover:border-[#0066cc] hover:text-[#0066cc]">
                    <Forward size={14} /> إحالة
                  </button>
                </div>
              )}
              <div className="border-t border-[#edf1f5] p-5">
                <button onClick={() => router.push(`/admin/topics/${selected.id}`)} className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-[#bcd7ed] bg-white text-xs font-bold text-[#0066cc] hover:bg-[#edf6ff]">
                  <Eye size={15} /> فتح التفاصيل الكاملة وسجل المسار
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-base font-black text-[#0a1330]">
              {reviewModal === "approve" ? "اعتماد الموضوع" : reviewModal === "reject" ? "رفض الموضوع" : "طلب استكمال بيانات"}
            </h2>
            <p className="mt-1 text-xs text-[#718196]">{selected?.title_ar}</p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">السبب / الملاحظات</span>
              <textarea value={reviewReason} onChange={(e) => setReviewReason(e.target.value)} rows={3} placeholder="أدخل ملاحظاتك..." className="w-full rounded-xl border border-[#dbe5ef] p-3 text-xs outline-none focus:border-[#0066cc]" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReviewModal(null)} disabled={actionBusy} className="h-10 rounded-xl border border-[#dbe5ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button>
              <button onClick={() => doReview(reviewModal)} disabled={actionBusy} className="h-10 rounded-xl bg-[#0066cc] px-4 text-xs font-bold text-white disabled:opacity-60">
                {actionBusy ? "جارٍ التنفيذ..." : "تأكيد"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Refer Modal */}
      {referModal && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-[#081630]/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h2 className="text-base font-black text-[#0a1330]">إحالة الموضوع لجهة أخرى</h2>
            <p className="mt-1 text-xs text-[#718196]">{selected?.title_ar}</p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">الجهة المحال إليها *</span>
              <select value={referUnit} onChange={(e) => setReferUnit(e.target.value)} disabled={referUnitsLoading || !referUnits.length} className="h-11 w-full rounded-xl border border-[#dbe5ef] bg-white px-3 text-xs outline-none focus:border-[#0066cc] disabled:bg-slate-50">
                <option value="">{referUnitsLoading ? "جارٍ تحميل الجهات…" : referUnits.length ? "اختر الجهة أو المجلس" : "لا توجد جهات متاحة للإحالة"}</option>
                {referUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name_ar}</option>)}
              </select>
              <p className="mt-1 text-[10px] text-[#718196]">تظهر الجهات المسموح لك بالإحالة إليها؛ يتحقق النظام من صلاحيتك مرة أخرى عند التأكيد.</p>
            </label>
            <label className="mt-3 block">
              <span className="mb-1.5 block text-xs font-bold text-[#3d4f66]">سبب الإحالة</span>
              <textarea value={referReason} onChange={(e) => setReferReason(e.target.value)} rows={2} placeholder="الموضوع يخص اختصاص اللجنة المحال إليها..." className="w-full rounded-xl border border-[#dbe5ef] p-3 text-xs outline-none focus:border-[#0066cc]" />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setReferModal(false)} disabled={actionBusy} className="h-10 rounded-xl border border-[#dbe5ef] px-4 text-xs font-bold text-[#52647a]">إلغاء</button>
              <button onClick={doRefer} disabled={actionBusy || !referUnit} className="h-10 rounded-xl bg-[#0066cc] px-4 text-xs font-bold text-white disabled:opacity-60">
                {actionBusy ? "جارٍ الإحالة..." : "إحالة الموضوع"}
              </button>
            </div>
          </div>
        </div>
      )}

      {createDialogOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[#081630]/55 p-3 backdrop-blur-sm sm:p-6">
          <div role="dialog" aria-modal="true" aria-labelledby="create-topic-dialog-title" className="mx-auto min-h-full w-full max-w-[1480px] rounded-3xl bg-[#f4f7fb] shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#dce7f1] bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
              <div>
                <p className="text-[10px] font-black text-[#ff7a00]">معالج إنشاء موضوع</p>
                <h2 id="create-topic-dialog-title" className="mt-1 text-base font-black text-[#0a1330]">إنشاء موضوع وربطه باللائحة ومسار الاعتماد</h2>
              </div>
              <button onClick={() => setCreateDialogOpen(false)} aria-label="إغلاق معالج إنشاء الموضوع" className="grid h-10 w-10 place-items-center rounded-xl border border-[#dce7f1] text-[#60738a] transition hover:bg-[#f4f7fb] hover:text-[#0a1330]">
                <X size={19} />
              </button>
            </div>
            <div className="p-4 sm:p-6">
              <TopicRegulationCreator onFollowTopic={followCreatedTopic} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
