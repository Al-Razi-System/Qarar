"use client";
import { Card } from "@/shared/ui/card";
import { InlineMessage } from "@/shared/ui/inline-message";
import { Button } from "@/shared/ui/button";
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
  return <Card className="p-6 sm:p-9" dir="rtl">
    <span className="mb-5 grid h-14 w-14 place-items-center rounded-q-card bg-q-surface-2 text-q-primary"><LockKeyhole size={26}/></span>
    <h1 className="text-q-h2 font-bold text-q-text">كلمة مرور خاصة بك</h1>
    <p className="mt-3 text-q-ui leading-7 text-q-text-2">استبدل كلمة المرور المؤقتة قبل استخدام قرار. بعد الحفظ، ستُلغى الجلسات المؤقتة وتدخل بالكلمة الجديدة.</p>
    {success ? <div className="mt-6"><InlineMessage tone="success" className="">{success}</InlineMessage><Link href="/login" className="mt-5 block rounded-q-control bg-q-primary px-5 py-3 text-center font-bold text-q-on-primary">تسجيل الدخول بالكلمة الجديدة</Link></div> : <form method="post" onSubmit={submit} className="mt-6 space-y-5">
      <fieldset disabled={pending || uncertain} className="min-w-0 space-y-5">
        <FormField label="كلمة المرور الحالية" type="password" autoComplete="current-password" value={currentPassword} onChange={e => setCurrent(e.target.value)} required />
        <div><FormField label="كلمة المرور الجديدة" type="password" autoComplete="new-password" aria-describedby="new-password-policy" value={password} onChange={e => setPassword(e.target.value)} minLength={12} maxLength={128} required /><p id="new-password-policy" className="mt-2 text-q-caption leading-6 text-q-text-2">12 حرفًا على الأقل، تشمل حرفًا كبيرًا وصغيرًا ورقمًا ورمزًا.</p></div>
        <FormField label="تأكيد كلمة المرور الجديدة" type="password" autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} required />
        <Button type="submit" disabled={pending || uncertain} className="w-full rounded-q-control bg-q-primary px-5 py-3 font-bold text-q-on-primary disabled:opacity-50">{pending ? "جارٍ استبدال كلمة المرور…" : "حفظ كلمة المرور الجديدة"}</Button>
      </fieldset>
      {error && <InlineMessage tone="error" className="">{error}</InlineMessage>}
      <Link href="/login" className="flex min-h-11 items-center justify-center text-center text-q-ui font-bold text-q-primary">العودة لتسجيل الدخول</Link>
    </form>}
  </Card>;
}
