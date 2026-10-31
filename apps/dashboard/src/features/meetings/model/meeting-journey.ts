export type MeetingJourneyKey = "setup" | "invitation" | "session" | "minutes" | "follow_up";
export type MeetingJourneyState = "done" | "current" | "locked";

const steps: Array<{ key: MeetingJourneyKey; label: string; description: string }> = [
  { key: "setup", label: "الإعداد", description: "بيانات الاجتماع وجدول الأعمال والجاهزية" },
  { key: "invitation", label: "الدعوة", description: "معاينة الدعوة وتجهيزها للمدعوين" },
  { key: "session", label: "الجلسة", description: "الحضور والمناقشة والتصويت والقرارات" },
  { key: "minutes", label: "المحضر", description: "المسودة والمصادقات والتواقيع" },
  { key: "follow_up", label: "المتابعة", description: "القرارات والتكليفات بعد الاعتماد" },
];

const stageByStatus: Record<string, MeetingJourneyKey> = {
  draft: "setup",
  scheduled: "invitation",
  ready_to_start: "session",
  in_progress: "session",
  waiting_for_minutes: "minutes",
  waiting_for_approval: "minutes",
  closed: "follow_up",
  archived: "follow_up",
  cancelled: "setup",
};

export function meetingJourney(status: string) {
  const currentKey = stageByStatus[status] ?? "setup";
  const currentIndex = steps.findIndex((step) => step.key === currentKey);
  return steps.map((step, index) => ({
    ...step,
    state: (index < currentIndex ? "done" : index === currentIndex ? "current" : "locked") as MeetingJourneyState,
  }));
}

export function currentMeetingStage(status: string) {
  return meetingJourney(status).find((step) => step.state === "current")!;
}
