"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { FormField } from "@/shared/ui/form-field";

export function TemporaryPasswordForm() {
  const [currentPassword, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const busy = useRef(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy.current || uncertain || success) return;
    setError("");
    if (password !== confirmation) { setError("تأكيد كلمة المرور غير مطابق."); return; }
    if (password === currentPassword) { setError("اختر كلمة مرور مختلفة عن المؤقتة."); return; }
    busy.current = true; setPending(true);
    try {
      const response = await fetch("/api/auth/temporary-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword, password }) });
      const result = await response.json();
      if (!response.ok) { setUncertain(result.uncertain === true); setError(result.message ?? "تعذر استبدال كلمة المرور."); return; }
      if (result.changed !== true) throw new Error("UNCONFIRMED");
      setCurrent(""); setPassword(""); setConfirmation(""); setSuccess(result.message);
    } catch { setUncertain(true); setError("انقطع الاتصال قبل تأكيد النتيجة. جرّب تسجيل الدخول بالكلمة الجديدة قبل إعادة التغيير."); }
    finally { busy.current = false; setPending(false); }
  }
  return <div className="rounded-3xl border border-[#dce5ef] bg-white p-6 shadow-sm sm:p-9" dir="rtl">
    <span className="mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-[#edf6ff] text-[#0066cc]"><LockKeyhole size={26}/></span>
    <h1 className="text-2xl font-black text-[#0a1330]">كلمة مرور خاصة بك</h1>
    <p className="mt-3 text-sm leading-7 text-[#52647a]">استبدل كلمة المرور المؤقتة قبل استخدام قرار. بعد الحفظ، ستُلغى الجلسات المؤقتة وتدخل بالكلمة الجديدة.</p>
    {success ? <div className="mt-6"><p role="status" className="rounded-xl bg-[#edf6ff] p-4 text-sm leading-7 text-[#315b80]">{success}</p><Link href="/login" className="mt-5 block rounded-xl bg-[#0066cc] px-5 py-3 text-center font-bold text-white">تسجيل الدخول بالكلمة الجديدة</Link></div> : <form method="post" onSubmit={submit} className="mt-6 space-y-5">
      <fieldset disabled={pending || uncertain} className="space-y-5">
        <FormField label="كلمة المرور الحالية" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrent(e.target.value)} required />
        <div><FormField label="كلمة المرور الجديدة" type="password" autoComplete="new-password" aria-describedby="new-password-policy" value={password} onChange={e => setPassword(e.target.value)} minLength={12} maxLength={128} required /><p id="new-password-policy" className="mt-2 text-xs leading-6 text-[#718096]">12 حرفًا على الأقل، تشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.</p></div>
        <FormField label="تأكيد كلمة المرور الجديدة" type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required />
        <button disabled={pending || uncertain} className="w-full rounded-xl bg-[#0066cc] px-5 py-3 font-bold text-white disabled:opacity-50">{pending ? "جارٍ استبدال كلمة المرور…" : "حفظ كلمة المرور الجديدة"}</button>
      </fieldset>
      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm leading-6 text-red-700">{error}</p>}
      <Link href="/login" className="block text-center text-sm font-bold text-[#0066cc]">العودة لتسجيل الدخول</Link>
    </form>}
  </div>;
}
