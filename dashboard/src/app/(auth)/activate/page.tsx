import type { Metadata } from "next";
import Image from "next/image";
import { Check, KeyRound, ShieldCheck, Sparkles } from "lucide-react";
import { FormField } from "@/shared/ui/form-field";
import { FullLogo } from "@/shared/ui/logo";

export const metadata: Metadata = { title: "تفعيل الحساب" };

export default function ActivateAccountPage() {
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
        <div className="absolute inset-0 bg-gradient-to-t from-[#071b46]/90 via-[#005fc8]/15 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-16 text-white">
          <Sparkles size={26} className="text-[#ff9a32]" />
          <h1 className="mt-5 text-4xl font-black leading-[1.5]">
            أهلًا بك في قرار
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-7 text-white/75">
            بقيت خطوة واحدة لتفعيل حسابك والوصول إلى المجالس واللجان المسندة
            إليك.
          </p>
        </div>
      </section>
      <section className="soft-grid flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-[440px]">
          <FullLogo />
          <div className="mt-9">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#e9f8f1] px-3 py-1.5 text-[10px] font-bold text-[#16835f]">
              <Check size={13} />
              تمت مطابقة الدعوة
            </span>
            <h2 className="mt-4 text-3xl font-black text-[#0a1330]">
              تفعيل حسابك
            </h2>
            <p className="mt-3 text-sm leading-6 text-[#6c7d91]">
              مرحبًا أحمد، أنشئ كلمة مرور آمنة لإكمال التفعيل.
            </p>
          </div>
          <form className="mt-7 space-y-5">
            <div className="rounded-xl border border-[#dfe7ef] bg-white px-4 py-3.5">
              <p className="text-[10px] text-[#8a99ac]">البريد المؤسسي</p>
              <p className="mt-1 text-xs font-bold text-[#22324b]">
                a.alqahtani@university.edu.sa
              </p>
            </div>
            <FormField
              label="كلمة المرور الجديدة"
              type="password"
              placeholder="••••••••••••"
              icon={<KeyRound size={17} />}
            />
            <FormField
              label="تأكيد كلمة المرور"
              type="password"
              placeholder="••••••••••••"
              icon={<KeyRound size={17} />}
            />
            <div className="grid grid-cols-2 gap-2 text-[10px] text-[#64758a]">
              {[
                "12 محرفًا على الأقل",
                "حرف كبير وصغير",
                "رقم واحد على الأقل",
                "رمز خاص واحد",
              ].map((item) => (
                <span key={item} className="flex items-center gap-1.5">
                  <Check size={12} className="text-[#16835f]" />
                  {item}
                </span>
              ))}
            </div>
            <button className="h-12 w-full rounded-xl bg-gradient-to-l from-[#0066cc] to-[#1e88e5] text-sm font-bold text-white shadow-[0_10px_25px_rgba(0,102,204,.2)]">
              تفعيل الحساب والمتابعة
            </button>
          </form>
          <div className="mt-6 flex items-start gap-2 rounded-xl bg-[#f0f6fc] p-3 text-[10px] leading-5 text-[#5d7087]">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-[#0066cc]" />
            ستُطبّق صلاحياتك تلقائيًا حسب الدور والمجلس المحددين في الدعوة.
          </div>
        </div>
      </section>
    </>
  );
}
