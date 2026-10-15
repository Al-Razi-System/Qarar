import type { Metadata } from "next";
import { LiveMeetingRoom } from "@/features/meetings/ui/live-meeting-room";

export const metadata: Metadata = { title: "غرفة الاجتماع الحي" };

export default async function LiveMeetingPage({
  params,
}: {
  params: Promise<{ meetingId: string }>;
}) {
  const { meetingId } = await params;
  // The room carries its own title bar; the page adds nothing above it.
  return <LiveMeetingRoom meetingId={meetingId} publicCheckInOrigin={process.env.APP_ORIGIN} />;
}
