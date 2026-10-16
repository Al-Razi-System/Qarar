"use client";

import { useState } from "react";
import { MemberCard, type MemberCardDetails } from "@/shared/ui/member-card";
import type { AgendaDiscussionItem, Decision, LiveMeetingSession, MemberProfile, MemberProfiles, VotingRound } from "../../model/live-meeting";
import { deriveMeetingStage, memberPhotoUrl, type StageSeat } from "../../model/meeting-stage";
import { CouncilTable } from "./council-table";
import { StageCenter } from "./stage-center";

type Props = {
  session: LiveMeetingSession;
  agenda: AgendaDiscussionItem[];
  rounds: VotingRound[];
  decisions: Decision[];
  /** The member cards; null while loading or after a failure. */
  profiles?: MemberProfiles | null;
  /** Why the member cards could not be loaded, for the viewer. */
  profilesError?: string | null;
  /** The small table beside a member's topic, instead of the room's centre piece. */
  compact?: boolean;
};

const ATTENDANCE_LABEL: Record<string, string> = {
  present: "حاضر", late: "حاضر متأخراً", excused: "معتذر", absent: "غائب", pending: "لم يثبت حضوره بعد",
};

const dateFormat = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });

function memberSince(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : dateFormat.format(date);
}

function attendanceLabel(profile: MemberProfile) {
  const status = profile.attendance_status ?? "pending";
  const attended = status === "present" || status === "late";
  if (attended && profile.verification_status && profile.verification_status !== "verified") return "بانتظار تثبيت الحضور";
  return ATTENDANCE_LABEL[status] ?? null;
}

function cardDetails(meetingId: string, profile: MemberProfile): MemberCardDetails {
  return {
    name: profile.full_name_ar,
    photoUrl: memberPhotoUrl(meetingId, profile),
    roleLabel: profile.council_role_name_ar,
    membershipTitle: profile.membership_title,
    jobTitle: profile.job_title,
    employer: profile.home_unit_name_ar,
    email: profile.email,
    mobile: profile.mobile,
    attendanceLabel: attendanceLabel(profile),
    memberSince: memberSince(profile.membership_start_date),
  };
}

/**
 * The shared scene of the live meeting: who is at the table and what the
 * council is doing right now. It is derived on every refresh from the data the
 * room already loads; a seat opens that member's card.
 */
export function RoomStage({ session, agenda, rounds, decisions, profiles = null, profilesError = null, compact = false }: Props) {
  const [openSeat, setOpenSeat] = useState<StageSeat | null>(null);
  const { seats, phase } = deriveMeetingStage(session, agenda, rounds, decisions, profiles?.members);
  const profile = openSeat ? profiles?.members.find((member) => member.user_id === openSeat.userId) : undefined;
  return (
    <section aria-label="مشهد الاجتماع" className="font-sans text-q-text">
      <CouncilTable seats={seats} compact={compact} onOpenSeat={setOpenSeat}>
        <div key={phase.kind} className="q-enter"><StageCenter phase={phase} compact={compact} /></div>
      </CouncilTable>
      {openSeat && (
        <MemberCard
          member={profile ? cardDetails(session.meeting.id, profile) : null}
          fallbackName={openSeat.name}
          unavailable={profile ? null : profilesError ?? (profiles ? "لا تتوفر بطاقة لهذا العضو." : null)}
          loading={!profiles && !profilesError}
          mobileVisible={profiles?.mobile_visible ?? false}
          onClose={() => setOpenSeat(null)}
        />
      )}
    </section>
  );
}
