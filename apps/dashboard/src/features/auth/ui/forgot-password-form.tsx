"use client";
import { InlineMessage } from "@/shared/ui/inline-message";
import { Button } from "@/shared/ui/button";

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
    {message && <InlineMessage tone="info" className="">{message}</InlineMessage>}
    <Button type="submit" disabled={busy} className="h-12 w-full rounded-q-control bg-q-primary font-bold text-q-on-primary disabled:opacity-60">{busy ? "جارٍ الإرسال..." : "إرسال رابط الاستعادة"}</Button>
    <Link href="/login" className="flex min-h-11 items-center justify-center text-center text-q-ui font-bold text-q-primary">العودة لتسجيل الدخول</Link>
  </form>;
}
