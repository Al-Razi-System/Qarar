import type { Metadata } from "next";
import { ActivationForm } from "@/features/auth/ui/activation-form";

export const metadata: Metadata = { title: "تفعيل الحساب", robots: { index: false, follow: false } };

export default function ActivateAccountPage() {
  return <ActivationForm />;
}
