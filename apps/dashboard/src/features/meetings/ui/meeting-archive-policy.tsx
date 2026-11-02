"use client";

import { useEffect, useRef, useState } from "react";
import { meetingRpc } from "../api/meetings-client";
import { Button } from "@/shared/ui/button";
import { Dialog } from "@/shared/ui/dialog";
import { InlineMessage } from "@/shared/ui/inline-message";

type Settings = { academic_year_start_month: number; archive_after_days: number; updated_at: string | null; can_manage: boolean };

const months = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const field = "mt-1.5 h-11 w-full rounded-q-control border border-q-border bg-q-surface px-3 font-sans text-q-ui font-normal text-q-text outline-none focus:border-q-primary focus:ring-2 focus:ring-q-primary/20";
const label = "block text-q-caption font-bold text-q-text-2";

/**
 * How the archive fills and how sessions are numbered: closed meetings move to
 * the archive a set number of days after their minutes are approved, and each
 * council's sessions restart at one when the academic year begins.
 */
export function MeetingArchivePolicy() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [month, setMonth] = useState(9);
  const [days, setDays] = useState("30");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  const sending = useRef(false);

  useEffect(() => {
    let live = true;
    meetingRpc<Settings>("get_meeting_settings_v2", {})
      .then((value) => { if (live) setSettings(value); })
      .catch((error: unknown) => { if (live) setLoadError(error instanceof Error && error.message ? error.message : "تعذر تحميل إعدادات الأرشفة."); });
    return () => { live = false; };
  }, []);

  function open() {
    if (!settings) return;
    setMonth(settings.academic_year_start_month); setDays(String(settings.archive_after_days));
    setProblem(null); setSaved(false); setEditing(true);
  }

  async function save() {
    if (sending.current || !settings) return;
    const delay = Number(days);
    if (!Number.isInteger(delay) || delay < 1 || delay > 365) { setProblem("مدة الأرشفة يجب أن تكون من 1 إلى 365 يومًا."); return; }
    sending.current = true; setPending(true); setProblem(null);
    try {
      const next = await meetingRpc<Settings>("save_meeting_settings_v2", {
        p_academic_year_start_month: month, p_archive_after_days: delay, p_expected_updated_at: settings.updated_at,
      });
      setSettings(next); setEditing(false); setSaved(true);
    } catch (error) {
      setProblem(error instanceof Error && error.message ? error.message : "تعذر حفظ الإعدادات. أعد المحاولة.");
    } finally { sending.current = false; setPending(false); }
  }

  if (loadError) return <InlineMessage tone="error">{loadError}</InlineMessage>;
  if (!settings) return <p role="status" className="m-0 rounded-q-control bg-q-surface-2 px-3 py-2 text-q-caption text-q-text-2">جارٍ تحميل إعدادات الأرشفة…</p>;

  return <>
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-q-control bg-q-surface-2 px-4 py-3">
      <p className="m-0 text-q-caption text-q-text-2">
        يُؤرشف الاجتماع تلقائيًا بعد {settings.archive_after_days} يومًا من اعتماد محضره. يبدأ ترقيم جلسات كل مجلس من 1 في {months[settings.academic_year_start_month - 1]} مع بداية العام الجامعي.
      </p>
      {settings.can_manage && <Button variant="secondary" onClick={open}>تعديل الأرشفة والترقيم</Button>}
    </div>
    {saved && <InlineMessage tone="success">حُفظت إعدادات الأرشفة والترقيم.</InlineMessage>}
    {editing && <Dialog title="الأرشفة وترقيم الجلسات" description="تنطبق على كل مجالس الجهة. الجلسات التي انعقدت تحتفظ بأرقامها." onClose={() => setEditing(false)} closeDisabled={pending}
      footer={<>
        {problem && <InlineMessage tone="error" className="w-full">{problem}</InlineMessage>}
        <Button variant="secondary" disabled={pending} onClick={() => setEditing(false)}>إلغاء</Button>
        <Button pending={pending} pendingLabel="جارٍ الحفظ…" onClick={() => void save()}>حفظ الإعدادات</Button>
      </>}>
      <div className="grid gap-4 font-sans sm:grid-cols-2">
        <label className={label}>بداية العام الجامعي<select value={month} onChange={(event) => setMonth(Number(event.target.value))} className={field}>
          {months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
        </select></label>
        <label className={label}>الأرشفة بعد اعتماد المحضر (بالأيام)<input type="number" min={1} max={365} value={days} onChange={(event) => { setDays(event.target.value); setProblem(null); }} className={field}/></label>
      </div>
    </Dialog>}
  </>;
}
