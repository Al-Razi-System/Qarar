import type { Metadata } from "next";
import { OversightWorkspace } from "@/features/oversight/ui/oversight-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "متابعة المجالس" };

export default function OversightPage() {
  return (
    <div className="mx-auto max-w-[1480px]">
      <PageHeader
        title="صلاحيات متابعة المجالس"
        description="حدّد من يتابع أداء أي مجالس عبر الشجرة: بالمنصب فتنتقل مع من يشغله، أو بقاعدة لكل مجالس نوع، أو لشخص بعينه. المتابعة اطلاع فقط."
      />
      <OversightWorkspace />
    </div>
  );
}
