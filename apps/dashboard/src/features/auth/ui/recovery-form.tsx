"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FormField } from "@/shared/ui/form-field";

type Tokens = { access_token: string; refresh_token: string };
function takeTokens(): Tokens | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const access_token = params.get("access_token"); const refresh_token = params.get("refresh_token");
  history.replaceState(null, "", location.pathname + location.search);
  return params.get("type") === "recovery" && access_token && refresh_token ? { access_token, refresh_token } : null;
}

export function RecoveryForm() {
  const [tokens, setTokens] = useState<Tokens | null | undefined>(undefined); const [done, setDone] = useState(false);
  const [password, setPassword] = useState(""); const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { queueMicrotask(() => setTokens(takeTokens())); }, []);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    if (password !== confirmation) return setError("كلمتا المرور غير متطابقتين.");
    if (!tokens) return setError("رابط الاستعادة غير صالح أو انتهت صلاحيته.");
    setBusy(true);
    try {
      const response = await fetch("/api/auth/recovery/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...tokens, password }), cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) setError(payload.message ?? "تعذر إكمال الاستعادة."); else { setTokens(null); setDone(true); }
    } catch { setError("تعذر الاتصال بالخدمة مؤقتًا."); } finally { setBusy(false); }
  }
  if (tokens === undefined) return <p>جارٍ التحقق من الرابط...</p>;
  if (done) return <div className="mt-8 text-center"><h1 className="text-2xl font-black">تم تغيير كلمة المرور</h1><p className="mt-3 text-sm text-slate-600">أُبطلت جلسات الاستعادة والجلسات القديمة. سجل الدخول مجددًا.</p><Link className="mt-6 inline-block font-bold text-[#0066cc]" href="/login">تسجيل الدخول</Link></div>;
  if (!tokens) return <div className="mt-8 text-center"><h1 className="text-2xl font-black">رابط غير صالح</h1><Link className="mt-6 inline-block font-bold text-[#0066cc]" href="/forgot-password">طلب رابط جديد</Link></div>;
  return <form onSubmit={submit} className="mt-8 space-y-5">
    <FormField label="كلمة المرور الجديدة" name="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
    <FormField label="تأكيد كلمة المرور" name="confirmation" type="password" autoComplete="new-password" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} required />
    <p className="text-xs text-slate-500">12 حرفًا على الأقل، وتتضمن حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.</p>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <button disabled={busy} className="h-12 w-full rounded-xl bg-[#0066cc] font-bold text-white disabled:opacity-60">{busy ? "جارٍ الحفظ..." : "تعيين كلمة المرور"}</button>
  </form>;
}
