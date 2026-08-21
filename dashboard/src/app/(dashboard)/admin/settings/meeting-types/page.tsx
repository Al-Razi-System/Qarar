import type { Metadata } from "next";
import { MeetingTypesWorkspace } from "@/features/meetings/ui/meeting-types-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "إدارة أنواع الاجتماعات" };

export default function MeetingTypesPage() {
  return <div className="mx-auto max-w-[1480px]">
    <PageHeader
      eyebrow="إعدادات الاجتماعات"
      title="إدارة أنواع الاجتماعات"
      description="عرّف الأنواع المستخدمة عند إنشاء الاجتماعات. يظهر النوع النشط فقط في نموذج الإنشاء، بينما تبقى الأنواع المعطلة محفوظة في السجل التاريخي."
      meta={<span className="inline-flex rounded-full bg-[#f1f7fd] px-3 py-1.5 text-[10px] font-bold text-[#2770b9]">اسم واضح · رمز داخلي تلقائي · حالة قابلة للإدارة</span>}
    />
    <MeetingTypesWorkspace />
  </div>;
}
