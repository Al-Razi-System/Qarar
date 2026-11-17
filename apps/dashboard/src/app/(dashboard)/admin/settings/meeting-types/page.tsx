import { Badge as QBadge } from "@/shared/ui/badge";
import type { Metadata } from "next";
import { MeetingTypesWorkspace } from "@/features/meetings/ui/meeting-types-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "إدارة أنواع الاجتماعات" };

export default function MeetingTypesPage() {
  return <div className="mx-auto max-w-[1480px]">
    <PageHeader
      title="إدارة أنواع الاجتماعات"
      description="عرّف الأنواع المستخدمة عند إنشاء الاجتماعات. يظهر النوع النشط فقط في نموذج الإنشاء، بينما تبقى الأنواع المعطلة محفوظة في السجل التاريخي."
      meta={<QBadge className="inline-flex rounded-full bg-q-surface-2 px-3 py-1.5 text-q-caption font-bold text-q-text-2">اسم واضح · رمز داخلي تلقائي · حالة قابلة للإدارة</QBadge>}
    />
    <MeetingTypesWorkspace />
  </div>;
}
