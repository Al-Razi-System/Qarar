import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { AgendaDiscussionItem, Attendance, LiveMeetingSession, VotingRound } from "../../model/live-meeting";
import { RoomStage as ControlledRoomStage } from "./room-stage";
import { useRoomTheme } from "./use-room-theme";

type StageProps = Omit<Parameters<typeof ControlledRoomStage>[0], "dark" | "onToggleTheme">;
function RoomStage(props: StageProps) {
  const theme = useRoomTheme();
  return <div data-theme={theme.dark ? "dark" : undefined}><ControlledRoomStage {...props} dark={theme.dark} onToggleTheme={theme.toggle} /></div>;
}

/** The council-table scene of the live meeting room, in each stage of an agenda item. */
const meta: Meta<typeof RoomStage> = { title: "الاجتماعات/مشهد طاولة المجلس", component: RoomStage };
export default meta;
type Story = StoryObj<typeof RoomStage>;

const names = ["د. منصور", "د. هدى", "د. خالد", "د. ريم", "د. فهد", "د. نورة", "د. ماجد", "د. أمل", "د. سامي", "د. سعاد", "د. طارق"];
const attendance: Attendance[] = names.map((name, index) => ({
  id: `att-${index}`, user_id: `u${index}`, full_name_ar: name,
  status: index === 9 ? "excused" : index === 10 ? "absent" : "present",
  verification_status: index >= 9 ? "unclaimed" : "verified", updated_at: "2026-10-10T08:00:00Z",
}));

function session(mode: "chair" | "member", locked = true): LiveMeetingSession {
  return {
    viewer: {
      user_id: mode === "chair" ? "u0" : "u6", full_name_ar: mode === "chair" ? "د. منصور" : "د. ماجد", mode, is_roster_member: true,
      can_manage_session: mode === "chair", can_operate_attendance: mode === "chair", can_create_checkin: mode === "chair",
      can_verify_attendance: mode === "chair", can_lock_attendance: mode === "chair", can_record_proceedings: false,
      can_manage_voting: mode === "chair", can_complete_session: mode === "chair", can_self_check_in: true, can_vote: true,
    },
    meeting: { id: "m1", title_ar: "مجلس الكلية · الاجتماع الدوري الثالث", status: "in_progress", updated_at: "2026-10-10T08:00:00Z", attendance_locked: locked },
    attendance,
    my_attendance: null,
    quorum: { eligible_members: 11, present_members: 9, actual_percentage: 82, required_percentage: 60, quorum_status: "met" },
    open_voting_rounds: [],
  };
}

const agenda: AgendaDiscussionItem[] = [
  { id: "a1", agenda_order: 1, agenda_status: "discussed", topic: { id: "t1", title_ar: "محضر الاجتماع السابق" } },
  { id: "a2", agenda_order: 2, agenda_status: "under_discussion", requires_voting: true, workflow_step_name_ar: "توصية مجلس الكلية", topic: { id: "t2", title_ar: "اعتماد الخطة الدراسية لبرنامج الذكاء الاصطناعي" } },
  { id: "a3", agenda_order: 3, agenda_status: "pending", topic: { id: "t3", title_ar: "تشكيل لجنة المناقشة" } },
];

const openRound: VotingRound = {
  id: "r1", agenda_item_id: "a2", status: "open", eligible_voter_count: 9, votes_cast_count: 6,
  participation: attendance.slice(0, 9).map((record, index) => ({ user_id: record.user_id, full_name_ar: record.full_name_ar, has_voted: index < 6 })),
};
const closedRound: VotingRound = { id: "r1", agenda_item_id: "a2", status: "closed", result: "approved", approve_count: 7, reject_count: 1, abstain_count: 1 };

export const Discussion: Story = { name: "قيد المناقشة", args: { session: session("chair"), agenda, rounds: [], decisions: [] } };
export const VotingAsChair: Story = { name: "التصويت كما يراه الرئيس", args: { session: session("chair"), agenda, rounds: [openRound], decisions: [] } };
export const VotingAsMember: Story = { name: "التصويت كما يراه العضو", args: { session: session("member"), agenda, rounds: [{ ...openRound, votes_cast_count: undefined, participation: [] }], decisions: [] } };
export const Result: Story = { name: "نتيجة التصويت", args: { session: session("member"), agenda, rounds: [closedRound], decisions: [] } };
export const Attendance_: Story = { name: "تثبيت الحضور", args: { session: session("chair", false), agenda, rounds: [], decisions: [] } };
