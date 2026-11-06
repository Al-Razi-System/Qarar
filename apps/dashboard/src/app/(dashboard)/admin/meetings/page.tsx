import type { Metadata } from "next";
import { MeetingsWorkspace } from "@/features/meetings/ui/meetings-workspace";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "الاجتماعات والقرارات" };

export default async function MeetingsPage({ searchParams }: { searchParams: Promise<{ manage?: string | string[] }> }) {
  const requested = (await searchParams).manage;
  const initialMeetingId = (Array.isArray(requested) ? requested[0] : requested)?.trim() || undefined;
  return <div className="mx-auto max-w-[1480px]"><PageHeader eyebrow="الحوكمة والاجتماعات" title="الاجتماعات والقرارات" description="إنشاء الاجتماعات وإعداد جدول الأعمال ومتابعة حالة الانعقاد والقرارات." meta={<span className="inline-flex rounded-full bg-q-surface-2 px-3 py-1.5 text-q-caption font-bold text-q-link">جدول الأعمال · الحضور · التصويت · القرارات</span>} /><MeetingsWorkspace initialMeetingId={initialMeetingId}/></div>;
}
