import type { Metadata } from "next";
import Link from "next/link";
import { HomeDashboard, type HomeData } from "@/features/home/ui/home-dashboard";
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { logEvent } from "@/shared/observability/logger";
import { InlineMessage } from "@/shared/ui/inline-message";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "لوحة التحكم" };
// Every number is the signed-in person's own; never serve another user's cached page.
export const dynamic = "force-dynamic";

async function loadHome(): Promise<HomeData | null> {
  try {
    return await qararRpcV2<HomeData>("get_my_home_v2", {});
  } catch (error) {
    logEvent("error", "home.load_failed", { cause: error instanceof Error ? error.message : "unknown" });
    return null;
  }
}

export default async function AdminDashboardPage() {
  const data = await loadHome();
  const name = data?.user?.name_ar;
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        eyebrow="مركز القيادة"
        title={name ? `مرحبًا ${name}` : "لوحة التحكم"}
        description="ما ينتظر إجراءك، وحال المجالس التي تقودها أو تتابعها."
      />
      {data ? <HomeDashboard data={data} /> : (
        <div className="flex flex-wrap items-center gap-3">
          <InlineMessage tone="error">تعذر تحميل لوحة التحكم الآن.</InlineMessage>
          <Link href="/admin" className="inline-flex min-h-11 items-center text-q-ui font-bold text-q-link hover:underline">إعادة المحاولة</Link>
        </div>
      )}
    </div>
  );
}
