"use client";
import { InlineMessage } from "@/shared/ui/inline-message";
import { Button } from "@/shared/ui/button";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { FormField } from "@/shared/ui/form-field";

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function LoginForm() {
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverReady);
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!ready || isSubmitting) return;
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

      if (result.password_change_required === true) {
        router.push("/change-password");
        router.refresh();
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
    <form className="mt-8" method="post" onSubmit={handleSubmit}>
      <fieldset disabled={!ready || isSubmitting} className="min-w-0 space-y-5">
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
      <div className="relative [&_input]:pl-11">
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
        <Button
          suppressHydrationWarning
          variant="ghost"
          type="button"
          onClick={() => setShowPassword((value) => !value)}
          className="absolute bottom-0.5 left-1 h-11 w-11 px-0 text-q-text-3 hover:text-q-primary"
          aria-label={showPassword ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
        >
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 text-q-caption">
        <label className="flex min-h-11 cursor-pointer items-center gap-2 text-q-text-2">
          <input
            suppressHydrationWarning
            type="checkbox"
            className="h-4 w-4 rounded-q-control border-q-border accent-q-primary"
          />
          تذكرني على هذا الجهاز
        </label>
        <Link href="/forgot-password" className="inline-flex min-h-11 items-center font-bold text-q-link hover:underline">
          نسيت كلمة المرور؟
        </Link>
      </div>
      {error && (
        <InlineMessage tone="error">{error}</InlineMessage>
      )}
      <Button
        suppressHydrationWarning
        type="submit"
        disabled={!ready || isSubmitting}
        className="h-12 w-full rounded-q-control bg-q-primary text-q-ui font-bold text-q-on-primary transition  disabled:cursor-wait disabled:opacity-70"
      >
        {!ready ? "جارٍ تجهيز تسجيل الدخول…" : isSubmitting ? "جارٍ التحقق..." : "تسجيل الدخول"}
      </Button>
      </fieldset>
      <noscript><InlineMessage tone="error" className="mt-3">فعّل JavaScript في المتصفح لتسجيل الدخول بأمان.</InlineMessage></noscript>
    </form>
  );
}
