"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle, Check, ClipboardList, Download, LoaderCircle, Search, ShieldAlert,
} from "lucide-react";

type AuditLog = {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  actor_name_ar: string;
  actor_id: string;
  ip_address?: string;
  created_at: string;
  details?: Record<string, unknown>;
};

type Notice = { kind: "success" | "error"; text: string };

const actionLabels: Record<string, string> = {
  create: "إنشاء", update: "تحديث", delete: "حذف",
  approve: "اعتماد", reject: "رفض", login: "تسجيل دخول",
  logout: "تسجيل خروج", lock: "قفل", unlock: "فتح قفل",
  assign: "تعيين", revoke: "سحب", refer: "إحالة",
  vote: "تصويت", transition: "تغيير حالة",
};

async function rpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const res = await fetch("/api/admin/audit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}

export function AuditWorkspace() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [selected, setSelected] = useState<AuditLog | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter] = useState("");
  const [exporting, setExporting] = useState(false);

  useEffect(() => { void loadLogs(); }, [query, actionFilter, entityFilter]);

  async function loadLogs() {
    setLoading(true); setNotice(null);
    try {
      const result = await rpc<{ items: AuditLog[]; total: number }>("admin_search_audit_logs", {
        p_query: query || null,
        p_action: actionFilter || null,
        p_entity_type: entityFilter || null,
        p_from_date: null, p_to_date: null,
        p_limit: 50, p_offset: 0,
      });
      setLogs(result.items ?? []);
      setTotal(result.total ?? 0);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التحميل." });
    } finally {
      setLoading(false);
    }
  }

  async function openDetail(logId: string) {
    setDetailLoading(true); setNotice(null);
    try {
      const detail = await rpc<AuditLog>("admin_get_audit_log", { p_audit_log_id: logId });
      setSelected(detail);
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التحميل." });
    } finally {
      setDetailLoading(false);
    }
  }

  async function exportLogs() {
    setExporting(true); setNotice(null);
    try {
      const result = await rpc<{ url: string }>("admin_export_audit_logs", {
        p_action: actionFilter || null,
        p_entity_type: entityFilter || null,
        p_from_date: null, p_to_date: null,
      });
      if (result.url) window.open(result.url, "_blank");
      setNotice({ kind: "success", text: "تم تصدير السجلات بنجاح." });
    } catch (err) {
      setNotice({ kind: "error", text: err instanceof Error ? err.message : "تعذر التصدير." });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {notice && (
        <div className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${notice.kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>
          {notice.kind === "success" ? <Check size={15} /> : <AlertCircle size={15} />} {notice.text}
        </div>
      )}

      <div className="flex items-center justify-between rounded-2xl border border-[#e2e9f1] bg-white p-4 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8796a9]" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && loadLogs()} placeholder="ابحث بالاسم أو المعرف..." className="h-10 w-64 rounded-xl border border-[#dfe7ef] bg-[#fafcfe] pr-9 pl-3 text-xs outline-none focus:border-[#9bc9f2]" />
          </div>
          <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} className="h-10 rounded-xl border border-[#dfe7ef] bg-white px-3 text-xs outline-none">
            <option value="">كل الأحداث</option>
            <option value="create">إنشاء</option>
            <option value="update">تحديث</option>
            <option value="delete">حذف</option>
            <option value="approve">اعتماد</option>
            <option value="reject">رفض</option>
            <option value="login">تسجيل دخول</option>
          </select>
          <button onClick={loadLogs} className="h-10 rounded-xl border border-[#dfe7ef] px-4 text-xs font-bold text-[#52647a] hover:bg-[#f6f9fc]">بحث</button>
        </div>
        <button onClick={exportLogs} disabled={exporting} className="flex items-center gap-2 rounded-xl border border-[#cbd9e8] px-4 py-2.5 text-xs font-bold text-[#3d4f66] hover:border-[#0066cc] hover:text-[#0066cc] disabled:opacity-50">
          <Download size={14} /> {exporting ? "جارٍ التصدير..." : "تصدير"}
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_minmax(380px,.55fr)]">
        <div className="rounded-2xl border border-[#e2e9f1] bg-white shadow-[0_3px_16px_rgba(24,48,80,.035)]">
          <div className="flex items-center justify-between border-b border-[#edf1f5] px-5 py-3">
            <h2 className="text-sm font-black text-[#0a1330]">سجل التدقيق</h2>
            <span className="text-[10px] font-bold text-[#7a8b9e]">إجمالي: <strong className="text-[#0a1330]">{total}</strong></span>
          </div>
          {loading ? (
            <div className="grid min-h-[350px] place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={28} /></div>
          ) : logs.length === 0 ? (
            <div className="grid min-h-[350px] place-items-center text-center p-8">
              <div><ShieldAlert className="mx-auto text-[#86a8c9]" size={34} /><h3 className="mt-3 text-sm font-black text-[#24364e]">لا توجد سجلات</h3></div>
            </div>
          ) : (
            <div className="divide-y divide-[#eef2f6]">
              {logs.map((log) => (
                <button key={log.id} onClick={() => openDetail(log.id)} className={`flex w-full items-center gap-3 px-5 py-3 text-right transition hover:bg-[#fbfdff] ${selected?.id === log.id ? "bg-[#edf6ff]" : ""}`}>
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]">
                    <ClipboardList size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-black text-[#0a1330]">{log.actor_name_ar}</h4>
                    <p className="text-[10px] text-[#7b8ba0]">
                      {actionLabels[log.action] ?? log.action} · {log.entity_type} · {new Date(log.created_at).toLocaleString("ar-SA")}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[#e2e9f1] bg-white shadow-[0_3px_16px_rgba(24,48,80,.035)]">
          {detailLoading ? (
            <div className="grid min-h-[300px] place-items-center"><LoaderCircle className="animate-spin text-[#0066cc]" size={28} /></div>
          ) : !selected ? (
            <div className="grid min-h-[300px] place-items-center text-center p-8">
              <div><ClipboardList className="mx-auto text-[#86a8c9]" size={30} /><h3 className="mt-3 text-sm font-black text-[#24364e]">اختر سجلاً</h3></div>
            </div>
          ) : (
            <div className="p-5 space-y-4">
              <h3 className="text-base font-black text-[#0a1330]">تفاصيل الحدث</h3>
              <div className="grid grid-cols-2 gap-3 text-[11px]">
                <div className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3"><p className="text-[10px] font-black text-[#617287]">العملية</p><strong className="mt-1 block text-[#0a1330]">{actionLabels[selected.action] ?? selected.action}</strong></div>
                <div className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3"><p className="text-[10px] font-black text-[#617287]">الكيان</p><strong className="mt-1 block text-[#0a1330]">{selected.entity_type}</strong></div>
                <div className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3"><p className="text-[10px] font-black text-[#617287]">المنفذ</p><strong className="mt-1 block text-[#0a1330]">{selected.actor_name_ar}</strong></div>
                <div className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3"><p className="text-[10px] font-black text-[#617287]">الوقت</p><strong className="mt-1 block text-[#0a1330]">{new Date(selected.created_at).toLocaleString("ar-SA")}</strong></div>
                {selected.ip_address && <div className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3"><p className="text-[10px] font-black text-[#617287]">IP</p><strong className="mt-1 block text-[#0a1330] font-mono">{selected.ip_address}</strong></div>}
              </div>
              {selected.details && (
                <div className="rounded-xl border border-[#edf2f7] bg-[#fbfdff] p-3 overflow-auto max-h-48">
                  <p className="text-[10px] font-black text-[#617287] mb-2">البيانات</p>
                  <pre className="text-[10px] text-[#3d4f66] font-mono whitespace-pre-wrap">{JSON.stringify(selected.details, null, 2)}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
