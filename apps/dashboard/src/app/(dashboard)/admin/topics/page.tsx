import type { Metadata } from "next";
import { TopicsWorkspace } from "@/features/topics/ui/topics-workspace";
import { qararRpc } from "@/shared/api/qarar-server";
import { Card } from "@/shared/ui/card";

export const metadata: Metadata = { title: "المعاملات والموضوعات" };

export default async function TopicsPage({
  searchParams,
}: {
  searchParams: Promise<{ query?: string | string[] }>;
}) {
  const params = await searchParams;
  const initialQuery = typeof params.query === "string" ? params.query : "";
  const access = await qararRpc<{ is_system_admin?: boolean; permissions?: string[] }>("get_current_user_access_context", {});
  const initialTab = access.permissions?.includes("topics.review") ? "review" : "mine";
  return <div className="mx-auto max-w-[1480px]">
    <Card className="mb-5"><h1 className="text-q-h1 font-bold">المعاملات والموضوعات</h1><p className="mt-2 text-q-body text-q-text-2">اختر المجلس ثم تصنيف الموضوع؛ يستمد النظام المسار والمتطلبات والتعليمات من التصنيف.</p></Card>
    <TopicsWorkspace key={`${initialTab}:${initialQuery}`} initialQuery={initialQuery} initialTab={initialTab} canCreate={Boolean(access.is_system_admin || access.permissions?.includes("topics.create"))} />
  </div>;
}
