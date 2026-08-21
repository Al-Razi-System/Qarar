"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Factor = { id: string; friendly_name?: string };
type Enrollment = { id?: string; totp?: { qr_code?: string; secret?: string } };
export function MfaForm() {
  const router = useRouter(); const [factors, setFactors] = useState<Factor[]>([]); const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => { const controller = new AbortController(); fetch("/api/auth/mfa", { cache: "no-store", signal: controller.signal }).then(async r => { if (!r.ok) throw new Error(); return r.json(); }).then(v => setFactors(v.factors)).catch(() => setError("انتهت جلسة التحقق. سجل الدخول مجددًا.")).finally(() => setLoading(false)); return () => controller.abort(); }, []);
  async function enroll() { setError(""); const r = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enroll" }) }); const v = await r.json(); if (!r.ok) setError(v.message); else setEnrollment(v); }
  async function verify(e: React.FormEvent) { e.preventDefault(); const factor_id = enrollment?.id ?? factors[0]?.id; if (!factor_id) return; const r = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", factor_id, code }) }); const v = await r.json(); if (!r.ok) setError(v.message); else { router.push("/admin/users"); router.refresh(); } }
  if (loading) return <p>جارٍ تحميل سياسة التحقق...</p>;
  return <div className="mt-8 space-y-5">
    {!factors.length && !enrollment && <><p className="text-sm text-slate-600">هذا حساب حساس. اربطه بتطبيق مصادقة قبل المتابعة.</p><button onClick={enroll} className="h-12 w-full rounded-xl bg-[#0066cc] font-bold text-white">إعداد تطبيق المصادقة</button></>}
    {enrollment?.totp && <div className="rounded-xl border bg-white p-4 text-center">{enrollment.totp.qr_code && <img alt="رمز إعداد المصادقة" src={enrollment.totp.qr_code} className="mx-auto h-48 w-48" />}<p className="mt-2 break-all font-mono text-xs">{enrollment.totp.secret}</p></div>}
    {(factors.length > 0 || enrollment?.id) && <form onSubmit={verify} className="space-y-4"><label className="block text-sm font-bold">رمز التحقق المكون من 6 أرقام<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl border px-4 text-center text-xl tracking-[.5em]" /></label><button className="h-12 w-full rounded-xl bg-[#0066cc] font-bold text-white">تحقق ومتابعة</button></form>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </div>;
}
