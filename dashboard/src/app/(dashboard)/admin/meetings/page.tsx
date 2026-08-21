import type { Metadata } from "next";
import { MeetingsWorkspace } from "@/features/meetings/ui/meetings-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "الاجتماعات والقرارات" };

export default function MeetingsPage() {
  return <div className="mx-auto max-w-[1480px]"><PageHeader eyebrow="الحوكمة والاجتماعات" title="الاجتماعات والقرارات" description="إنشاء الاجتماعات وإعداد جدول الأعمال ومتابعة حالة الانعقاد والقرارات." meta={<span className="inline-flex rounded-full bg-[#f1f7fd] px-3 py-1.5 text-[10px] font-bold text-[#2770b9]">جدول الأعمال · الحضور · التصويت · القرارات</span>} /><MeetingsWorkspace /></div>;
}
