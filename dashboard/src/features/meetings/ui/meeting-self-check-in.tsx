"use client";

import { FormEvent, useEffect, useState } from "react";
import { CheckCircle2, Fingerprint, LoaderCircle } from "lucide-react";

async function selfCheckIn(meetingId: string, token: string) {
  const response = await fetch("/api/admin/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contract: "self_check_in",
      params: { p_meeting_id: meetingId, p_token: token, p_context: "dashboard-self-check-in" },
    }),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تسجيل الحضور.");
}

export function MeetingSelfCheckIn() {
  const [meetingId, setMeetingId] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    setMeetingId(query.get("meeting") ?? "");
    setToken(query.get("token") ?? "");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      await selfCheckIn(meetingId.trim(), token.trim());
      setMessage({ ok: true, text: "سُجل طلب حضورك. ينتظر الآن تحقق أمين الجلسة." });
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : "تعذر تسجيل الحضور." });
    } finally { setBusy(false); }
  }

  return <form onSubmit={submit} className="mx-auto max-w-lg rounded-3xl border border-[#dfe8f1] bg-white p-6 shadow-sm">
    <div className="mb-5 flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-[#0066cc]"><Fingerprint size={22} /></span><div><h2 className="text-base font-black text-[#0a1330]">تسجيل الحضور الذاتي</h2><p className="text-[11px] text-[#718196]">يجب تسجيل الدخول بالحساب المدعو إلى الاجتماع.</p></div></div>
    <div className="space-y-4">
      <label className="block"><span className="mb-1 block text-xs font-bold">معرف الاجتماع</span><input required value={meetingId} onChange={(event) => setMeetingId(event.target.value)} className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs" /></label>
      <label className="block"><span className="mb-1 block text-xs font-bold">رمز الحضور</span><input required value={token} onChange={(event) => setToken(event.target.value)} autoComplete="one-time-code" className="h-11 w-full rounded-xl border border-[#dbe5ef] px-3 text-xs tracking-widest" /></label>
      {message && <div className={`rounded-xl border p-3 text-xs font-bold ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800"}`}>{message.text}</div>}
      <button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#0066cc] text-xs font-black text-white disabled:opacity-50">{busy ? <LoaderCircle className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} تسجيل الحضور</button>
    </div>
  </form>;
}
