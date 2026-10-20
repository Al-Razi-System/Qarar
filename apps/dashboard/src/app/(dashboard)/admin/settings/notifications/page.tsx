import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NotificationAdminWorkspace, type NotificationWorkspaceData } from "@/features/notifications/ui/notification-admin-workspace";
import { qararRpc } from "@/shared/api/qarar-server";
import { Card } from "@/shared/ui/card";

export const metadata: Metadata = { title: "إشعارات واتساب" };

export default async function NotificationSettingsPage() {
  const access = await qararRpc<{ is_system_admin?: boolean }>("get_current_user_access_context", {});
  if (!access.is_system_admin) redirect("/admin");
  let data: NotificationWorkspaceData | null = null;
  let loadError: string | null = null;
  try {
    data = await qararRpc<NotificationWorkspaceData>("admin_get_notification_workspace", { p_limit: 50 });
  } catch {
    loadError = "تعذر تحميل إعدادات الإشعارات وسجل الإرسال. أعد المحاولة بعد التحقق من اتصال قاعدة البيانات.";
  }
  return <div className="mx-auto max-w-[1480px] space-y-6">
    <Card className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div><p className="text-q-caption font-bold text-q-link">إعدادات النظام</p><h1 className="mt-2 text-q-h1 font-bold">إشعارات واتساب</h1><p className="mt-2 max-w-3xl text-q-ui text-q-text-2">راجع اتصال القناة والقوالب المعتمدة ونتائج التسليم. لا تؤثر مشكلة واتساب في حالة الاجتماع أو التكليف داخل قرار.</p></div>
      <p className="text-q-caption text-q-text-3">خاص بمسؤول النظام</p>
    </Card>
    <NotificationAdminWorkspace initialData={data} loadError={loadError} />
  </div>;
}
