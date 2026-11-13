import { PageHeader } from "@/shared/ui/page-header";
import type { Metadata } from "next";
import { SsoWorkspace } from "@/features/sso/ui/sso-workspace";
import { notFound } from "next/navigation";

export const metadata: Metadata = { title: "إعدادات الدخول الموحد SSO" };

export default function SsoPage() {
  if (process.env.QARAR_SSO_ENABLED !== "true") notFound();
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        title="إعدادات الدخول الموحد (SSO)"
        description="تهيئة موفري الهوية الفيدرالية (Entra ID / SAML)، النطاقات المؤسسية، ومزامنة المجموعات الخارجية."
        meta={<p className="text-q-caption text-q-text-2">إدارة الهوية والوصول</p>}
      />
      <SsoWorkspace />
    </div>
  );
}
