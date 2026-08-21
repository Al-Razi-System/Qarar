"use client";

import { useState } from "react";
import Link from "next/link";
import { FormField } from "@/shared/ui/form-field";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try {
      const result = await fetch("/api/auth/recovery/request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }), cache: "no-store",
      });
      const payload = await result.json();
      setMessage(payload.message ?? "إذا كان البريد مسجلًا فستصلك تعليمات الاستعادة.");
    } catch { setMessage("تعذر الاتصال بالخدمة مؤقتًا."); } finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="mt-8 space-y-5">
    <FormField label="البريد الإلكتروني" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
    {message && <p role="status" className="rounded-xl bg-blue-50 p-3 text-sm text-blue-800">{message}</p>}
    <button disabled={busy} className="h-12 w-full rounded-xl bg-[#0066cc] font-bold text-white disabled:opacity-60">{busy ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}</button>
    <Link href="/login" className="block text-center text-sm font-bold text-[#0066cc]">العودة لتسجيل الدخول</Link>
  </form>;
}
