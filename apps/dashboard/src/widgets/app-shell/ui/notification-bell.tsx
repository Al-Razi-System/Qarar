"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, CalendarDays, ClipboardList, Info, TrendingUp } from "lucide-react";
import { Button } from "@/shared/ui/button";
import { InlineMessage } from "@/shared/ui/inline-message";

type Notification = {
  id: string;
  category: "violation" | "escalation" | "digest" | "meeting" | "task" | "other";
  title_ar: string;
  body_ar: string | null;
  link_path: string | null;
  created_at: string;
  read_at: string | null;
};
type Inbox = { items: Notification[]; unread_count: number };

const icons = {
  violation: AlertTriangle, escalation: TrendingUp, digest: Info, meeting: CalendarDays, task: ClipboardList, other: Info,
} as const;

const POLL_MS = 60_000;

function relativeTime(value: string) {
  const date = new Date(value);
  const minutes = Math.round((Date.now() - date.getTime()) / 60_000);
  if (Number.isNaN(minutes)) return "";
  if (minutes < 1) return "الآن";
  if (minutes < 60) return `قبل ${minutes.toLocaleString("ar-SA-u-nu-latn")} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `قبل ${hours.toLocaleString("ar-SA-u-nu-latn")} ساعة`;
  return date.toLocaleDateString("ar-SA-u-nu-latn", { dateStyle: "medium" });
}

async function readInbox(): Promise<Inbox> {
  const response = await fetch("/api/notifications", { cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تحميل الإشعارات.");
  return payload.data as Inbox;
}

async function markRead(ids: string[] | null): Promise<number> {
  const response = await fetch("/api/notifications", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تحديث الإشعارات.");
  return payload.data.unread_count as number;
}

/** The header bell: a real unread count, the latest notifications, and links to what they concern. */
export function NotificationBell({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marking, setMarking] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void readInbox()
      .then((value) => { if (!cancelled) { setInbox(value); setError(null); } })
      .catch((failure: unknown) => { if (!cancelled) setError(failure instanceof Error ? failure.message : "تعذر تحميل الإشعارات."); });
    return () => { cancelled = true; };
  }, [refreshKey, open]);

  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") setRefreshKey((key) => key + 1); }, POLL_MS);
    return () => clearInterval(timer);
  }, []);

  const markOne = useCallback(async (notification: Notification) => {
    if (notification.read_at) return;
    setInbox((current) => current && ({
      unread_count: Math.max(0, current.unread_count - 1),
      items: current.items.map((item) => (item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item)),
    }));
    try { await markRead([notification.id]); } catch { setRefreshKey((key) => key + 1); }
  }, []);

  async function markAll() {
    if (marking) return;
    setMarking(true);
    setError(null);
    try {
      const unread = await markRead(null);
      setInbox((current) => current && ({ unread_count: unread, items: current.items.map((item) => ({ ...item, read_at: item.read_at ?? new Date().toISOString() })) }));
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "تعذر تحديث الإشعارات.");
    } finally {
      setMarking(false);
    }
  }

  const unread = inbox?.unread_count ?? 0;
  const label = unread > 0 ? `الإشعارات، ${unread.toLocaleString("ar-SA-u-nu-latn")} غير مقروءة` : "الإشعارات";

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        aria-label={label}
        className="relative grid h-11 w-11 place-items-center rounded-q-control border border-q-border text-q-text-2 hover:bg-q-surface-2"
      >
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && (
          <span aria-hidden="true" className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-q-accent px-1 text-q-caption font-bold leading-none text-q-on-accent">
            {unread > 99 ? "+99" : String(unread)}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="الإشعارات" className="absolute left-0 top-13 z-30 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-q-card border border-q-border bg-q-surface text-start shadow-xl">
          <div className="flex items-center justify-between gap-2 border-b border-q-border px-4 py-3">
            <strong className="text-q-ui text-q-text">الإشعارات</strong>
            {unread > 0 && <Button variant="ghost" onClick={() => void markAll()} pending={marking} pendingLabel="جارٍ التحديث…">تعليم الكل مقروءًا</Button>}
          </div>
          {error && <div className="p-3"><InlineMessage tone="error">{error}</InlineMessage></div>}
          {!inbox && !error && <p role="status" className="p-4 text-q-caption text-q-text-3">يجري التحميل…</p>}
          {inbox && inbox.items.length === 0 && (
            <p className="p-4 text-q-caption text-q-text-3">لا إشعارات بعد. ستظهر هنا تنبيهات الاجتماعات والتكليفات والتجاوزات.</p>
          )}
          {inbox && inbox.items.length > 0 && (
            <ul className="max-h-[60vh] divide-y divide-q-border overflow-y-auto">
              {inbox.items.map((item) => {
                const Icon = icons[item.category] ?? Info;
                const content = (
                  <span className="flex gap-3 px-4 py-3">
                    <Icon size={18} aria-hidden="true" className={item.category === "violation" || item.category === "escalation" ? "mt-0.5 shrink-0 text-q-warning" : "mt-0.5 shrink-0 text-q-link"} />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-q-caption ${item.read_at ? "text-q-text-2" : "font-bold text-q-text"}`}>{item.title_ar}</span>
                      {item.body_ar && <span className="mt-0.5 block text-q-caption text-q-text-3">{item.body_ar}</span>}
                      <span className="mt-1 block text-q-caption text-q-text-3">{relativeTime(item.created_at)}</span>
                    </span>
                    {!item.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-q-primary" aria-label="غير مقروء" />}
                  </span>
                );
                return (
                  <li key={item.id} className={item.read_at ? undefined : "bg-q-surface-2"}>
                    {item.link_path ? (
                      <Link href={item.link_path} onClick={() => { void markOne(item); onOpenChange(false); }} className="block hover:bg-q-bg">{content}</Link>
                    ) : (
                      <button type="button" onClick={() => void markOne(item)} className="block w-full text-start hover:bg-q-bg">{content}</button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="border-t border-q-border px-4 py-2">
            <Link href="/admin/violations" onClick={() => onOpenChange(false)} className="text-q-caption font-bold text-q-link hover:underline">عرض التجاوزات في نطاقي</Link>
          </div>
        </div>
      )}
    </div>
  );
}
