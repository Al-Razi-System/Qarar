"use client";

import { useEffect, useState } from "react";
import { Laptop, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/shared/ui/badge";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";
import { SegmentedControl } from "@/shared/ui/segmented-control";

type SessionStatus = "active" | "ended" | "revoked";

type SessionSummary = {
  id: string;
  user_name_ar?: string | null;
  user_email?: string | null;
  device_name?: string | null;
  platform?: string | null;
  app_version?: string | null;
  ip_address?: string | null;
  last_activity_at?: string | null;
  last_seen_at?: string | null;
  status?: SessionStatus;
  revoked_at?: string | null;
  revocation_reason?: string | null;
  is_current?: boolean;
};

type Scope = "mine" | "organization";
type StatusFilter = "active" | "all" | "ended" | "revoked";
type Notice = { tone: "success" | "error"; text: string };

const statusBadge: Record<SessionStatus, { label: string; tone: "success" | "neutral" | "danger" }> = {
  active: { label: "نشطة", tone: "success" },
  ended: { label: "منتهية", tone: "neutral" },
  revoked: { label: "مُبطلة", tone: "danger" },
};

const statusOptions = [
  { value: "active", label: "النشطة" },
  { value: "all", label: "الكل" },
  { value: "ended", label: "المنتهية" },
  { value: "revoked", label: "المُبطلة" },
] as const;

function sessionStatus(session: SessionSummary): SessionStatus {
  return session.status ?? (session.revoked_at ? "revoked" : "active");
}

function activityLabel(value?: string | null) {
  if (!value) return "لا توجد بيانات نشاط مسجلة";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "وقت النشاط غير متاح"
    : `آخر نشاط ${date.toLocaleString("ar-SA", { dateStyle: "medium", timeStyle: "short" })}`;
}

function platformLabel(session: SessionSummary) {
  const platform = session.platform === "web" ? "لوحة التحكم" : session.platform ? "تطبيق الجوال" : null;
  return [platform, session.app_version, session.ip_address ? `IP ${session.ip_address}` : null].filter(Boolean).join(" · ");
}

async function fetchSessions(scope: Scope, status: StatusFilter, query: string): Promise<{ items: SessionSummary[]; total: number }> {
  const params = new URLSearchParams();
  if (scope === "organization") {
    params.set("scope", "organization");
    params.set("status", status);
    if (query) params.set("q", query);
  }
  const url = params.size ? `/api/admin/sessions?${params.toString()}` : "/api/admin/sessions";
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "تعذر تحميل الجلسات.");
  if (scope === "organization") {
    return { items: Array.isArray(data.items) ? data.items : [], total: typeof data.total === "number" ? data.total : 0 };
  }
  const items: SessionSummary[] = Array.isArray(data.sessions) ? data.sessions : [];
  return { items, total: items.length };
}

export function SessionsWorkspace({ canMonitorOrganization = false }: { canMonitorOrganization?: boolean }) {
  const [scope, setScope] = useState<Scope>("mine");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirming, setConfirming] = useState<SessionSummary | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetchSessions(scope, statusFilter, appliedQuery)
      .then((result) => {
        if (cancelled) return;
        setSessions(result.items);
        setTotal(result.total);
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "تعذر تحميل الجلسات.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => { cancelled = true; };
  }, [scope, statusFilter, appliedQuery, reloadKey]);

  /** Shows the pending state at the control the user touched; the effect then loads. */
  function markLoading() {
    setIsLoading(true);
    setLoadError(null);
  }

  function reload() {
    markLoading();
    setReloadKey((value) => value + 1);
  }

  async function revoke() {
    if (!confirming || isRevoking) return;
    setIsRevoking(true);
    setRevokeError(null);
    try {
      const response = await fetch("/api/admin/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: confirming.id, reason: "revoked from dashboard session management" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "تعذر إبطال الجلسة.");
      setConfirming(null);
      setNotice({ tone: "success", text: "تم إبطال الجلسة وسلسلة التحديث المرتبطة بها." });
      reload();
    } catch (error) {
      setRevokeError(error instanceof Error ? error.message : "تعذر إبطال الجلسة.");
    } finally {
      setIsRevoking(false);
    }
  }

  const isOrganization = scope === "organization";

  return (
    <div className="space-y-5">
      {notice && <InlineMessage tone={notice.tone}>{notice.text}</InlineMessage>}

      <section className="space-y-4 rounded-q-card border border-q-border bg-q-surface p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {canMonitorOrganization ? (
            <SegmentedControl<Scope>
              label="نطاق الجلسات"
              options={[{ value: "mine", label: "جلساتي" }, { value: "organization", label: "جلسات المؤسسة" }]}
              value={scope}
              onChange={(value) => { markLoading(); setScope(value); setNotice(null); }}
            />
          ) : <h2 className="text-q-h3 font-black text-q-text">جلساتي</h2>}
          <Button variant="secondary" onClick={reload} disabled={isLoading}>
            <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /> تحديث القائمة
          </Button>
        </div>
        <p className="text-q-caption text-q-text-3">
          {isOrganization
            ? "جلسات مستخدمي مؤسستك على لوحة التحكم وتطبيق الجوال. الجلسة نشطة ما دام دخولها قائمًا؛ وتنتهي بالخروج أو انتهاء صلاحيتها."
            : "جلسات حسابك على الأجهزة. إبطال جلسة يُخرج ذلك الجهاز ويلغي سلسلة رموز التحديث المرتبطة بها."}
        </p>
        {isOrganization && (
          <div className="flex flex-wrap items-center gap-3">
            <SegmentedControl<StatusFilter> label="حالة الجلسة" options={statusOptions} value={statusFilter} onChange={(value) => { markLoading(); setStatusFilter(value); }} />
            <form className="flex min-w-0 flex-1 gap-2" onSubmit={(event) => { event.preventDefault(); if (query.trim() !== appliedQuery) { markLoading(); setAppliedQuery(query.trim()); } }}>
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">ابحث بالاسم أو البريد أو الجهاز</span>
                <Search size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-q-text-3" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="ابحث بالاسم أو البريد أو الجهاز"
                  className="min-h-11 w-full rounded-q-control border border-q-border bg-q-surface pr-9 pl-3 text-q-ui text-q-text outline-none focus:border-q-focus"
                />
              </label>
              <Button type="submit" variant="secondary">بحث</Button>
            </form>
          </div>
        )}
      </section>

      <section className="rounded-q-card border border-q-border bg-q-surface p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-q-ui font-black text-q-text">{isOrganization ? "جلسات المستخدمين" : "الأجهزة المرتبطة"}</h3>
          {!isLoading && !loadError && <span className="text-q-caption text-q-text-3">العدد: {total}</span>}
        </div>

        {isLoading ? (
          <p className="text-q-caption text-q-text-3">يجري تحميل الجلسات…</p>
        ) : loadError ? (
          <div className="flex flex-wrap items-center gap-3">
            <InlineMessage tone="error">{loadError}</InlineMessage>
            <Button variant="ghost" onClick={reload}>إعادة المحاولة</Button>
          </div>
        ) : sessions.length === 0 ? (
          <p className="rounded-q-control border border-dashed border-q-border p-4 text-q-caption text-q-text-3">
            {isOrganization ? "لا توجد جلسات بهذه الحالة." : "لا توجد جلسات مسجلة لهذا الحساب بعد. تظهر جلسة المتصفح هنا بعد الدخول التالي."}
          </p>
        ) : (
          <ul className="space-y-3">
            {sessions.map((session) => {
              const status = sessionStatus(session);
              const badge = statusBadge[status];
              const details = platformLabel(session);
              return (
                <li key={session.id} className="flex flex-col gap-3 rounded-q-control border border-q-border bg-q-bg p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-q-control bg-q-surface-2 text-q-link">
                      <Laptop size={20} />
                    </span>
                    <div className="min-w-0">
                      {isOrganization && (
                        <strong className="block truncate text-q-ui text-q-text">
                          {session.user_name_ar || "مستخدم بلا اسم"}
                          {session.user_email && <span className="mr-2 font-normal text-q-caption text-q-text-3" dir="ltr">{session.user_email}</span>}
                        </strong>
                      )}
                      <span className="flex flex-wrap items-center gap-2 text-q-caption font-bold text-q-text-2">
                        {session.device_name || "جهاز غير مسمى"}
                        <Badge tone={badge.tone}>{badge.label}</Badge>
                        {session.is_current && <Badge tone="info">هذا الجهاز</Badge>}
                      </span>
                      <span className="mt-1 block text-q-caption text-q-text-3">
                        {[details, activityLabel(session.last_activity_at ?? session.last_seen_at)].filter(Boolean).join(" · ")}
                      </span>
                      {status === "revoked" && session.revocation_reason && (
                        <span className="mt-1 block text-q-caption text-q-danger">سبب الإبطال: {session.revocation_reason}</span>
                      )}
                    </div>
                  </div>
                  {status === "active" && (
                    <Button variant="danger" onClick={() => { setConfirming(session); setRevokeError(null); setNotice(null); }}>
                      إبطال الجلسة
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {confirming && (
        <Dialog
          title="إبطال الجلسة"
          description={confirming.is_current
            ? "هذه جلسة هذا الجهاز؛ إبطالها يُخرجك فورًا وستحتاج إلى الدخول من جديد."
            : `سيخرج ${confirming.user_name_ar ? `«${confirming.user_name_ar}» من ` : ""}${confirming.device_name || "هذا الجهاز"} فورًا، ويلزمه الدخول من جديد.`}
          onClose={() => setConfirming(null)}
          closeDisabled={isRevoking}
          footer={(
            <>
              {revokeError && <InlineMessage tone="error">{revokeError}</InlineMessage>}
              <Button variant="ghost" onClick={() => setConfirming(null)} disabled={isRevoking}>تراجع</Button>
              <Button variant="danger" onClick={() => void revoke()} pending={isRevoking} pendingLabel="جارٍ الإبطال">إبطال</Button>
            </>
          )}
        >
          <p className="text-q-caption text-q-text-2">{activityLabel(confirming.last_activity_at ?? confirming.last_seen_at)}</p>
        </Dialog>
      )}
    </div>
  );
}
