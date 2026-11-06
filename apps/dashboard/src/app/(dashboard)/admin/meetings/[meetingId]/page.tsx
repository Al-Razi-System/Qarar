import type { Metadata } from "next";
import { MeetingDetailsJourney } from "@/features/meetings/ui/meeting-details-journey";

export const metadata: Metadata = { title: "تفاصيل الاجتماع" };

export default async function MeetingDetailsPage({ params }: { params: Promise<{ meetingId: string }> }) {
  const { meetingId } = await params;
  return <div className="mx-auto max-w-[1480px]"><MeetingDetailsJourney meetingId={meetingId}/></div>;
}
