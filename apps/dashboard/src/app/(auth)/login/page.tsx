import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { BadgeCheck, Headphones, ShieldCheck } from "lucide-react";
import { LoginForm } from "@/features/authentication/ui/login-form";
import { FullLogo } from "@/shared/ui/logo";
import { requireQararSession } from "@/shared/api/qarar-server";

export const metadata: Metadata = { title: "تسجيل الدخول" };

export default async function LoginPage() {
  let destination: string | null = null;
  try {
    await requireQararSession();
    destination = "/admin";
  } catch (error) {
    if (error instanceof Error && error.message === "MFA_REQUIRED") destination = "/mfa";
  }
  if (destination) redirect(destination);

  return (
    <>
      <section className="relative hidden overflow-hidden bg-q-primary lg:block">
        <Image
          src="/brand/qarar-auth-cover.png"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-q-header/88 via-q-primary/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-14 text-q-on-primary xl:p-20">

          <h1 className="max-w-xl text-q-h1 font-bold leading-[1.45] xl:text-q-h1">
            حوكمة أكثر وضوحًا،
            <br />
            وقرارات أكثر أثرًا.
          </h1>
          <div className="mt-6 flex w-fit items-center gap-2 rounded-full border border-q-on-primary/20 bg-q-surface/10 px-4 py-2 text-q-caption backdrop-blur-md">
            <ShieldCheck size={16} className="text-q-on-primary" />
            بيئة رقمية موثوقة وآمنة
          </div>
          <p className="mt-5 max-w-lg text-q-ui leading-7 text-q-on-primary/75">
            مساحة موحدة لإدارة أعمال المجالس واللجان، من جدول الأعمال وحتى
            متابعة تنفيذ القرارات.
          </p>
          <div className="mt-9 flex gap-8 text-q-caption text-q-on-primary/80">
            <span className="flex items-center gap-2">
              <BadgeCheck size={17} className="text-q-on-primary" />
              سجل تدقيق متكامل
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-q-on-primary" />
              صلاحيات محكومة
            </span>
          </div>
        </div>
      </section>

      <section className="soft-grid flex min-h-screen items-center justify-center px-6 py-10">
        <div className="min-w-0 w-full max-w-[430px]">
          <FullLogo />
          <div className="mt-10">

            <h2 className="text-q-h1 font-bold tracking-tight text-q-text">
              تسجيل الدخول إلى قرار
            </h2>
            <p className="mb-2 text-q-caption font-bold text-q-link">مرحبًا بعودتك</p>
            <p className="mt-3 text-q-ui leading-6 text-q-text-2">
              استخدم بيانات حسابك المؤسسي للوصول إلى مساحة العمل.
            </p>
          </div>
          <LoginForm />
          <div className="mt-8 flex items-center justify-center gap-2 text-q-caption text-q-text-2">
            <Headphones size={15} />
            تحتاج مساعدة؟{" "}
            <a href="#" className="inline-flex min-h-11 items-center font-bold text-q-link">
              تواصل مع الدعم
            </a>
          </div>
          <p className="mt-8 text-center text-q-caption leading-5 text-q-text-2">
            بالدخول إلى المنصة، أنت توافق على سياسة الاستخدام والخصوصية.
            <br />© 2026 قرار. جميع الحقوق محفوظة.
          </p>
        </div>
      </section>
    </>
  );
}
