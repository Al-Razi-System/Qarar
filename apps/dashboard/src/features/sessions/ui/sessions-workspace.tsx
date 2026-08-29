"use client";

import { useCallback, useEffect, useState } from "react";
import { Laptop, RefreshCw, Trash2 } from "lucide-react";

type SessionSummary = {
  id: string;
  device_name?: string | null;
  platform?: string | null;
  app_version?: string | null;
  last_seen_at?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
};

function activityLabel(value?: string | null) {
  if (!value) return "لا توجد بيانات نشاط مسجلة";

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "وقت النشاط غير متاح"
    : date.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" });
}

export function SessionsWorkspace() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadSessions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/sessions", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر تحميل الجلسات.");
      setSessions(Array.isArray(data.sessions) ? data.sessions : []);
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "تعذر تحميل الجلسات." });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/admin/sessions", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "تعذر تحميل الجلسات.");
        if (!cancelled) setSessions(Array.isArray(data.sessions) ? data.sessions : []);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setNotice({ type: "error", text: err instanceof Error ? err.message : "تعذر تحميل الجلسات." });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleRevoke(sessionId: string) {
    if (!confirm("هل أنت تأكد من طرد وتأمين هذه الجلسة فوراً؟")) return;
    setNotice(null);
    setRevokingSessionId(sessionId);

    try {
      const response = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, reason: "revoked from dashboard session management" }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر إلغاء الجلسة.");

      setNotice({ type: "success", text: "تم إبطال الجلسة وسلسلة التحديث المرتبطة بها." });
      await loadSessions();
    } catch (err) {
      setNotice({ type: "error", text: err instanceof Error ? err.message : "حدث خطأ." });
    } finally {
      setRevokingSessionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {notice && (
        <div
          className={`rounded-xl border p-4 text-xs font-bold ${
            notice.type === "success"
              ? "border-[#bfe9d9] bg-[#ecfaf4] text-[#167957]"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {notice.text}
        </div>
      )}

      <div className="rounded-2xl border border-[#e2e9f1] bg-white p-6 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
        <h2 className="text-base font-black text-[#0a1330]">
          مراقبة وتأمين الجلسات والأجهزة النشطة
        </h2>
        <p className="mt-1 text-xs text-[#718196]">
          تعرض هذه الصفحة جلسات حسابك الفعلية فقط. إبطال جلسة يلغي سلسلة رموز التحديث المرتبطة بها.
        </p>
        <button
          type="button"
          onClick={() => void loadSessions()}
          disabled={isLoading}
          className="mt-4 inline-flex items-center gap-2 rounded-xl border border-[#dfe7ef] bg-white px-3 py-2 text-xs font-bold text-[#234] hover:bg-[#f7faff] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw size={15} className={isLoading ? "animate-spin" : ""} /> تحديث القائمة
        </button>
      </div>

      <div className="rounded-2xl border border-[#e2e9f1] bg-white p-6 shadow-[0_3px_16px_rgba(24,48,80,.035)]">
        <h3 className="mb-4 text-sm font-black text-[#1c2b42]">
          الجلسات المكتشفة
        </h3>

        {isLoading ? (
          <p className="text-xs text-[#718196]">يجري تحميل الجلسات الفعلية…</p>
        ) : sessions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#dfe7ef] p-4 text-xs text-[#718196]">
            لا توجد جلسات تطبيق مسجلة لهذا الحساب بعد.
          </p>
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const isRevoked = Boolean(session.revoked_at);
              const isRevoking = revokingSessionId === session.id;
              return (
                <div key={session.id} className="flex items-center justify-between gap-4 rounded-xl border border-[#eef2f6] bg-[#fbfdff] p-4 text-xs">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#e7f2ff] text-[#0066cc]">
                      <Laptop size={20} />
                    </span>
                    <div className="min-w-0">
                      <strong className="block truncate text-[#16243b]">{session.device_name || "جهاز غير مسمى"}</strong>
                      <span className="mt-1 block text-[10px] text-[#8493a6]">
                        {[session.platform, session.app_version].filter(Boolean).join(" · ") || "بيانات الجهاز غير مكتملة"}
                        {" · "}{activityLabel(session.last_seen_at)}
                      </span>
                      {isRevoked && (
                        <span className="mt-1 block text-[10px] font-bold text-[#a74545]">
                          أُبطلت{session.revocation_reason ? `: ${session.revocation_reason}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={isRevoked || isRevoking}
                    onClick={() => void handleRevoke(session.id)}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl border border-red-200 bg-white px-3 py-2 text-[11px] font-bold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Trash2 size={15} /> {isRevoking ? "جارٍ الإبطال" : isRevoked ? "أُبطلت" : "إبطال الجلسة"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
