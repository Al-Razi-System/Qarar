import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotificationAdminWorkspace, type NotificationWorkspaceData } from "@/features/notifications/ui/notification-admin-workspace";
import { getOpenWaProviderStatus } from "@/features/notifications/server/openwa-admin";
import { qararRpc } from "@/shared/api/qarar-server";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "إشعارات واتساب" };

export default async function NotificationSettingsPage() {
  const access = await qararRpc<{ is_system_admin?: boolean }>("get_current_user_access_context", {});
  if (!access.is_system_admin) redirect("/admin");
  let data: NotificationWorkspaceData | null = null;
  let loadError: string | null = null;
  const provider = await getOpenWaProviderStatus();
  try {
    data = await qararRpc<NotificationWorkspaceData>("admin_get_notification_workspace", { p_limit: 50 });
  } catch {
    loadError = "تعذر تحميل إعدادات الإشعارات وسجل الإرسال. أعد المحاولة بعد التحقق من اتصال قاعدة البيانات.";
  }
  return <div className="mx-auto max-w-[1480px] space-y-6">
    <PageHeader title="إشعارات واتساب" description="إدارة رقم الإرسال، حالة الاتصال، قوالب الرسائل، مواعيد التذكير وسجل التسليم." meta={<p className="text-q-caption text-q-text-3">خاص بمسؤول النظام</p>} />
    <NotificationAdminWorkspace initialData={data} initialProvider={provider} loadError={loadError} />
  </div>;
}
