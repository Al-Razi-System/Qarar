import type { Metadata } from "next";
import { MeetingClosureRoom } from "@/features/meetings/ui/meeting-closure-room";

export const metadata: Metadata = { title: "محضر الاجتماع والمصادقات" };

export default async function MeetingMinutesPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  return <div className="mx-auto max-w-[1480px]"><MeetingClosureRoom meetingId={meetingId} /></div>;
}
