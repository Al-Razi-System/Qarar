import type { Metadata } from "next";
import { SessionsWorkspace } from "@/features/sessions/ui/sessions-workspace";
import { qararRpc } from "@/shared/api/qarar-server";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "مراقبة الجلسات" };

type AccessContext = { is_system_admin?: boolean; permissions?: string[] };

/** Same authority admin_list_sessions_v2 and request_session_revocation apply. */
async function canMonitorOrganization() {
  try {
    const access = await qararRpc<AccessContext | null>("get_current_user_access_context", {});
    return Boolean(access?.is_system_admin || access?.permissions?.some((permission) => permission === "iam.sessions.manage" || permission === "iam.users.manage"));
  } catch {
    return false;
  }
}

export default async function SessionsPage() {
  const canMonitor = await canMonitorOrganization();
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        eyebrow="إدارة الهوية والوصول"
        title={canMonitor ? "مراقبة الجلسات" : "جلساتي والأجهزة المرتبطة"}
        description={canMonitor
          ? "راجع جلسات مستخدمي مؤسستك النشطة على لوحة التحكم وتطبيق الجوال، وأبطل أي جهاز مشبوه أو مفقود فورًا."
          : "راجع جلسات حسابك الفعلية وأبطل أي جهاز مشبوه أو مفقود فورًا."}
      />
      <SessionsWorkspace canMonitorOrganization={canMonitor} />
    </div>
  );
}
