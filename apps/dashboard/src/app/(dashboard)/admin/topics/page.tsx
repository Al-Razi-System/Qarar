import type { Metadata } from "next";
import { TopicsWorkspace } from "@/features/topics/ui/topics-workspace";
import { qararRpc } from "@/shared/api/qarar-server";
import { PageHeader } from "@/shared/ui/page-header";

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
    <PageHeader title="المعاملات والموضوعات" description="اختر المجلس ثم تصنيف الموضوع؛ يستمد النظام المسار والمتطلبات والتعليمات من التصنيف." />
    <TopicsWorkspace key={`${initialTab}:${initialQuery}`} initialQuery={initialQuery} initialTab={initialTab} canCreate={Boolean(access.is_system_admin || access.permissions?.includes("topics.create"))} />
  </div>;
}
