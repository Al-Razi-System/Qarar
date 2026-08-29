"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Factor = { id: string; status: "verified" | "unverified"; friendly_name?: string };
type Enrollment = { id?: string; totp?: { qr_code?: string; secret?: string } };
export function MfaForm() {
  const router = useRouter(); const [factors, setFactors] = useState<Factor[]>([]); const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    async function loadFactors() {
      try {
        const response = await fetch("/api/auth/mfa", { cache: "no-store", signal: controller.signal });
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) throw new Error("MFA_CONTEXT_UNAVAILABLE");
        const value = await response.json() as { factors?: Factor[] };
        if (!active) return;
        setFactors(value.factors ?? []);
        setError("");
      } catch (caught) {
        if (!active || (caught instanceof DOMException && caught.name === "AbortError")) return;
        setError("تعذر تحميل إعدادات التحقق. حاول مجددًا.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void loadFactors();
    return () => {
      active = false;
      controller.abort();
    };
  }, [router]);

  async function enroll() {
    setError("");
    const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "enroll" }) });
    const value = await response.json();
    if (response.status === 401) return router.replace("/login");
    if (!response.ok) setError(value.message ?? "تعذر إعداد تطبيق المصادقة."); else setEnrollment(value);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const factor_id = enrollment?.id ?? factors.find((factor) => factor.status === "verified")?.id;
    if (!factor_id) return;
    const response = await fetch("/api/auth/mfa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verify", factor_id, code }) });
    const value = await response.json();
    if (response.status === 401 && value.message === "انتهت جلسة التحقق.") return router.replace("/login");
    if (!response.ok) setError(value.message ?? "تعذر إكمال التحقق."); else { router.push("/admin/users"); router.refresh(); }
  }
  if (loading) return <p>جارٍ تحميل سياسة التحقق...</p>;
  const verifiedFactors = factors.filter((factor) => factor.status === "verified");
  const hasIncompleteFactor = factors.some((factor) => factor.status === "unverified");
  return <div className="mt-8 space-y-5">
    {!verifiedFactors.length && !enrollment && <><p className="text-sm text-slate-600">{hasIncompleteFactor ? "يوجد إعداد تحقق غير مكتمل. أنشئ رمزًا جديدًا لإكمال الربط." : "هذا حساب حساس. اربطه بتطبيق مصادقة قبل المتابعة."}</p><button onClick={enroll} className="h-12 w-full rounded-xl bg-[#0066cc] font-bold text-white">{hasIncompleteFactor ? "إعادة إنشاء رمز الإعداد" : "إعداد تطبيق المصادقة"}</button></>}
    {enrollment?.totp && <div className="rounded-xl border bg-white p-4 text-center">{enrollment.totp.qr_code && <Image unoptimized alt="رمز إعداد المصادقة" src={enrollment.totp.qr_code} width={192} height={192} className="mx-auto" />}<p className="mt-2 break-all font-mono text-xs" dir="ltr">{enrollment.totp.secret}</p></div>}
    {(verifiedFactors.length > 0 || enrollment?.id) && <form onSubmit={verify} className="space-y-4"><label className="block text-sm font-bold">رمز التحقق المكون من 6 أرقام<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} className="mt-2 h-12 w-full rounded-xl border px-4 text-center text-xl tracking-[.5em]" /></label><button className="h-12 w-full rounded-xl bg-[#0066cc] font-bold text-white">تحقق ومتابعة</button></form>}
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
  </div>;
}
