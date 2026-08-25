"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { FormField } from "@/shared/ui/form-field";

export function LoginForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.message ?? "تعذر تسجيل الدخول.");
        return;
      }

      if (result.mfa_required === true) {
        router.push("/mfa");
        router.refresh();
        return;
      }

      router.push("/admin");
      router.refresh();
    } catch {
      setError("تعذر الاتصال بخدمة تسجيل الدخول.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
      <FormField
        label="البريد الإلكتروني"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="name@university.edu.sa"
        icon={<Mail size={18} />}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      <div className="relative">
        <FormField
          label="كلمة المرور"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete="current-password"
          placeholder="أدخل كلمة المرور"
          icon={<LockKeyhole size={18} />}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
        <button
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          className="absolute bottom-3 left-3 text-[#7a899d] hover:text-[#0066cc]"
          aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      <div className="flex items-center justify-between text-xs">
        <label className="flex cursor-pointer items-center gap-2 text-[#52647a]">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-[#cbd7e5] accent-[#0066cc]"
          />
          تذكرني على هذا الجهاز
        </label>
        <Link href="/forgot-password" className="font-bold text-[#0066cc] hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={isSubmitting}
        className="h-12 w-full rounded-xl bg-gradient-to-l from-[#0066cc] to-[#1e88e5] text-sm font-bold text-white shadow-[0_10px_25px_rgba(0,102,204,.2)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(0,102,204,.28)] disabled:cursor-wait disabled:opacity-70"
      >
        {isSubmitting ? "جارٍ التحقق..." : "تسجيل الدخول"}
      </button>
    </form>
  );
}
