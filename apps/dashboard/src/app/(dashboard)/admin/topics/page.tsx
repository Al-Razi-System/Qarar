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
  const access = await qararRpc<{ permissions?: string[] }>("get_current_user_access_context", {});
  const initialTab = access.permissions?.includes("topics.review") ? "review" : "mine";
  return <div className="mx-auto max-w-[1480px]">
    <PageHeader eyebrow="الحوكمة والمعاملات" title="المعاملات والموضوعات" description="إدارة الطلبات من الإنشاء وتحديد المرجع النظامي، إلى المراجعة والإحالة والاعتماد." meta={<span className="inline-flex rounded-full bg-[#edf6ff] px-3 py-1.5 text-[10px] font-bold text-[#0066cc]">إنشاء ← مراجعة ← إحالة ← اعتماد</span>} />
    <TopicsWorkspace key={`${initialTab}:${initialQuery}`} initialQuery={initialQuery} initialTab={initialTab} />
  </div>;
}
