import type { Metadata } from "next";
import { MeetingSelfCheckIn } from "@/features/meetings/ui/meeting-self-check-in";

export const metadata: Metadata = { title: "تسجيل حضور الاجتماع" };

export default function MeetingCheckInPage() {
  return <div className="mx-auto max-w-3xl py-8">
    <MeetingSelfCheckIn />
  </div>;
}
