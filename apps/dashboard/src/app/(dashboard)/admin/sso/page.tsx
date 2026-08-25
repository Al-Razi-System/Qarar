import type { Metadata } from "next";
import { SsoWorkspace } from "@/features/sso/ui/sso-workspace";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "إعدادات الدخول الموحد SSO" };

export default function SsoPage() {
  if (process.env.QARAR_SSO_ENABLED !== "true") notFound();
  return (
    <div className="mx-auto max-w-[1480px]">
      <div className="mb-7">
        <p className="mb-1.5 text-[11px] font-bold text-[#ff7a00]">
          إدارة الهوية والوصول
        </p>
        <h1 className="text-2xl font-black text-[#0a1330]">
          إعدادات الدخول الموحد (SSO)
        </h1>
        <p className="mt-2 text-xs leading-6 text-[#718196]">
          تهيئة موفري الهوية الفيدرالية (Entra ID / SAML)، النطاقات المؤسسية، ومزامنة المجموعات الخارجية.
        </p>
      </div>
      <SsoWorkspace />
    </div>
  );
}
