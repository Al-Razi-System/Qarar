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
      <section className="relative hidden overflow-hidden bg-[#0066cc] lg:block">
        <Image
          src="/brand/qarar-auth-cover.png"
          alt=""
          fill
          priority
          className="object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071b46]/88 via-[#005fc8]/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-14 text-white xl:p-20">
          <div className="mb-6 flex w-fit items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs backdrop-blur-md">
            <ShieldCheck size={16} className="text-[#ff9a32]" />
            بيئة رقمية موثوقة وآمنة
          </div>
          <h1 className="max-w-xl text-4xl font-black leading-[1.45] xl:text-5xl">
            حوكمة أكثر وضوحًا،
            <br />
            وقرارات أكثر أثرًا.
          </h1>
          <p className="mt-5 max-w-lg text-sm leading-7 text-white/75">
            مساحة موحدة لإدارة أعمال المجالس واللجان، من جدول الأعمال وحتى
            متابعة تنفيذ القرارات.
          </p>
          <div className="mt-9 flex gap-8 text-xs text-white/80">
            <span className="flex items-center gap-2">
              <BadgeCheck size={17} className="text-[#ff9a32]" />
              سجل تدقيق متكامل
            </span>
            <span className="flex items-center gap-2">
              <ShieldCheck size={17} className="text-[#ff9a32]" />
              صلاحيات محكومة
            </span>
          </div>
        </div>
      </section>

      <section className="soft-grid flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[430px]">
          <FullLogo />
          <div className="mt-10">
            <p className="mb-2 text-xs font-bold text-[#ff7a00]">مرحبًا بعودتك</p>
            <h2 className="text-3xl font-black tracking-tight text-[#0a1330]">
              تسجيل الدخول إلى قرار
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#6c7d91]">
              استخدم بيانات حسابك المؤسسي للوصول إلى مساحة العمل.
            </p>
          </div>
          <LoginForm />
          <div className="mt-8 flex items-center justify-center gap-2 text-xs text-[#7f8fa3]">
            <Headphones size={15} />
            تحتاج مساعدة؟{" "}
            <a href="#" className="font-bold text-[#0066cc]">
              تواصل مع الدعم
            </a>
          </div>
          <p className="mt-8 text-center text-[10px] leading-5 text-[#9aa8b9]">
            بالدخول إلى المنصة، أنت توافق على سياسة الاستخدام والخصوصية.
            <br />© 2026 قرار. جميع الحقوق محفوظة.
          </p>
        </div>
      </section>
    </>
  );
}
