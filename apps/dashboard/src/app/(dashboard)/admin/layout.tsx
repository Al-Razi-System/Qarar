import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { qararRpc, requireQararSession } from "@/shared/api/qarar-server";
import { AppShell, type AppAccessContext } from "@/widgets/app-shell/ui/app-shell";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  let access: AppAccessContext;
  try {
    await requireQararSession();
    access = await qararRpc<AppAccessContext>("get_current_user_access_context", {});
  } catch (error) {
    if (error instanceof Error && error.message === "MFA_REQUIRED") redirect("/mfa");
    redirect("/login");
  }
  return <AppShell access={access}>{children}</AppShell>;
}
