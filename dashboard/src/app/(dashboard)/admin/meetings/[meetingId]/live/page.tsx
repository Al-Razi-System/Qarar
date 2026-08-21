import type { Metadata } from "next";
import { LiveMeetingRoom } from "@/features/meetings/ui/live-meeting-room";

export const metadata: Metadata = { title: "غرفة الاجتماع الحي" };

export default async function LiveMeetingPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  return (
    <div className="mx-auto max-w-[1480px]">
      <div className="mb-7">
        <p className="mb-1.5 text-[11px] font-bold text-[#ff7a00]">
          غرفة الاجتماع
        </p>
        <h1 className="text-2xl font-black text-[#0a1330]">
          إدارة الجلسة والتصويت الحي
        </h1>
        <p className="mt-2 text-xs leading-6 text-[#718196]">
          إدارة الحضور والنصاب والتصويت الإلكتروني أثناء انعقاد الاجتماع.
        </p>
      </div>
      <LiveMeetingRoom meetingId={meetingId} />
    </div>
  );
}
