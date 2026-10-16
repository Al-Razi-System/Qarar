import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import type { AgendaDiscussionItem, Attendance, Decision, LiveMeetingSession, MeetingBroadcast, MeetingItemTimers, MemberProfiles, VotingRound } from "../../model/live-meeting";
import type { MeetingTopicAttachment } from "../../model/meeting";
import { AgendaWorkspace } from "./agenda-workspace";
import { MemberVoteCard } from "./member-vote-card";
import { RoomStage } from "./room-stage";
import { RoomTopBar } from "./room-top-bar";
import { useRoomTheme } from "./use-room-theme";

/** The agenda side of the live room as each role sees it, under the council-table scene. */
type RoomProps = { mode: "chair" | "rapporteur" | "member"; agenda: AgendaDiscussionItem[]; rounds: VotingRound[]; decisions?: Decision[]; presenting?: boolean; voting?: boolean };

const names = ["د. منصور", "د. هدى", "د. خالد", "د. ريم", "د. فهد", "د. نورة", "د. ماجد", "د. أمل", "د. سامي"];
const attendance: Attendance[] = names.map((name, index) => ({ id: `att-${index}`, user_id: `u${index}`, full_name_ar: name, status: "present", verification_status: "verified", updated_at: "2026-10-10T08:00:00Z" }));

const titles = ["عميد الكلية", "وكيل الكلية للشؤون الأكاديمية", "رئيس قسم علوم الحاسب", "أستاذ مشارك", "أستاذ", "أستاذ مساعد", "أستاذ مشارك", "أستاذ", "أستاذ مساعد"];
const units = ["كلية الحاسبات", "كلية الحاسبات", "قسم علوم الحاسب", "قسم نظم المعلومات", "قسم هندسة البرمجيات", "قسم علوم الحاسب", "قسم الذكاء الاصطناعي", "قسم نظم المعلومات", "قسم الشبكات"];
/** The member cards as the server returns them: mobile numbers only for the chair and the rapporteur. */
function profiles(mode: RoomProps["mode"]): MemberProfiles {
  const officer = mode !== "member";
  return {
    mobile_visible: officer,
    members: attendance.map((record, index) => ({
      user_id: record.user_id, attendance_record_id: record.id, full_name_ar: record.full_name_ar,
      job_title: titles[index], home_unit_name_ar: units[index], email: `member${index + 1}@university.edu.sa`,
      mobile: officer ? `05501234${String(index).padStart(2, "0")}` : null,
      council_role_code: index === 0 ? "council_chair" : index === 1 ? "council_rapporteur" : "council_member",
      council_role_name_ar: index === 0 ? "رئيس المجلس" : index === 1 ? "مقرر المجلس" : "عضو",
      membership_title: index === 2 ? "ممثل القسم" : null, membership_start_date: index < 2 ? "2024-09-01" : "2026-01-15",
      attendance_status: "present", verification_status: "verified", has_avatar: false, avatar_revision: 0,
    })),
  };
}

/** Item 1 took eight minutes; item 2 has run twelve minutes of a planned ten. */
const TIMERS_AT = Date.parse("2026-10-15T09:12:00Z");
const timers: MeetingItemTimers = {
  server_now: "2026-10-15T09:12:00Z",
  timers: [
    { agenda_item_id: "a1", planned_minutes: 10, discussion_started_at: "2026-10-15T08:52:00Z", discussion_ended_at: "2026-10-15T09:00:00Z", revision: 1 },
    { agenda_item_id: "a2", planned_minutes: 10, discussion_started_at: "2026-10-15T09:00:00Z", discussion_ended_at: null, revision: 1 },
  ],
};

/** The chair drives the screens; the rapporteur and the members follow. */
function broadcastFor(mode: RoomProps["mode"]): MeetingBroadcast {
  const chair = mode === "chair";
  return {
    meeting_id: "m1", active: true, controller_role: "chair", agenda_item_id: null, panel: "instructions", revision: 3,
    viewer_controls: chair, can_hand_over: chair, can_take_back: false, can_return: false,
  };
}

function session(mode: RoomProps["mode"]): LiveMeetingSession {
  const chair = mode === "chair";
  return {
    viewer: { user_id: chair ? "u0" : mode === "rapporteur" ? "u1" : "u6", full_name_ar: chair ? "د. منصور" : mode === "rapporteur" ? "د. هدى" : "د. ماجد", mode, is_roster_member: true,
      can_manage_session: chair, can_operate_attendance: mode !== "member", can_create_checkin: chair, can_verify_attendance: chair, can_lock_attendance: chair,
      can_record_proceedings: mode === "rapporteur", can_manage_voting: chair, can_complete_session: chair, can_self_check_in: true, can_vote: true },
    meeting: { id: "m1", title_ar: "مجلس الكلية · الاجتماع الدوري الثالث", status: "in_progress", updated_at: "2026-10-10T08:00:00Z", attendance_locked: true },
    attendance, my_attendance: null,
    quorum: { eligible_members: 9, present_members: 9, actual_percentage: 100, required_percentage: 60, quorum_status: "met" },
    open_voting_rounds: [],
  };
}

const instructions = "يعرض رئيس القسم مبررات الخطة ومقارنتها بالخطة السابقة، ثم تُناقش الساعات المعتمدة والمتطلبات السابقة قبل التصويت.";
const discussing: AgendaDiscussionItem[] = [
  { id: "a1", agenda_order: 1, agenda_status: "discussed", discussion_notes: "اعتُمد المحضر السابق دون ملاحظات.", topic: { id: "t1", title_ar: "محضر الاجتماع السابق" } },
  { id: "a2", agenda_order: 2, agenda_status: "under_discussion", requires_voting: true, workflow_step_name_ar: "توصية مجلس الكلية", discussion_instructions: instructions, topic: { id: "t2", title_ar: "اعتماد الخطة الدراسية لبرنامج الذكاء الاصطناعي" } },
  { id: "a3", agenda_order: 3, agenda_status: "pending", topic: { id: "t3", title_ar: "تشكيل لجنة المناقشة" } },
];
const voting = discussing.map((item) => item.id === "a2" ? { ...item, agenda_status: "discussed" } : item);
const attachments: MeetingTopicAttachment[] = [
  { id: "f1", topic_id: "t2", file_name: "الخطة الدراسية المقترحة.pdf", file_url: "https://example.test/files/f1", mime_type: "application/pdf", file_size_bytes: 2_400_000 },
  { id: "f2", topic_id: "t2", file_name: "مقارنة الخطتين.pdf", file_url: "https://example.test/files/f2", mime_type: "application/pdf", file_size_bytes: 480_000, description: "جدول المقارنة" },
];
const openRound: VotingRound = {
  id: "r1", agenda_item_id: "a2", status: "open", eligible_voter_count: 9, votes_cast_count: 6,
  participation: attendance.map((record, index) => ({ user_id: record.user_id, full_name_ar: record.full_name_ar, has_voted: index < 6 })),
};
const closedRound: VotingRound = { id: "r1", agenda_item_id: "a2", status: "closed", result: "approved", approve_count: 7, reject_count: 1, abstain_count: 1, closed_at: "2026-10-10T09:00:00Z" };
const decided = voting.map((item) => item.id === "a2" ? { ...item, discussion_notes: "أوصى المجلس باعتماد الخطة مع مراجعة المتطلبات السابقة لمقررين.", updated_at: "2026-10-10T09:05:00Z" } : item);
const savedDecision = (editable: boolean): Decision => ({
  id: "d1", decision_no: "DEC-2026-000014", agenda_item_id: "a2", decision_status: "ready_for_approval",
  decision_text: "اعتماد الخطة الدراسية لبرنامج الذكاء الاصطناعي، على أن تُراجع المتطلبات السابقة لمقرري تعلم الآلة والرؤية الحاسوبية قبل بداية الفصل القادم.",
  updated_at: "2026-10-10T09:10:00Z", can_edit_text: editable,
});

/** A fixed opening time keeps the story pure; the clock still ticks from it. */
const SESSION_STARTED_AT = "2026-10-15T08:00:00Z";
/** Read once when the stories load, so the timers show the same scene on every render. */
const FIXED_NOW = Date.parse(new Date().toISOString());

function Room({ mode, agenda, rounds, decisions = [], presenting = false, voting: hasBallot = false }: RoomProps) {
  const theme = useRoomTheme();
  const live = session(mode);
  const noop = () => undefined;
  return (
    <div data-theme={theme.dark ? "dark" : undefined} className={`flex flex-col gap-3 font-sans text-q-text ${theme.dark ? "rounded-q-card bg-q-bg p-4" : ""} ${mode !== "member" ? "lg:h-[860px]" : ""}`}>
      <RoomTopBar session={live} startedAt={SESSION_STARTED_AT} dark={theme.dark} onToggleTheme={theme.toggle} presentation={mode === "chair" ? { active: presenting, onToggle: noop } : undefined} fullscreen={mode === "chair" ? undefined : { active: false, onToggle: noop }} />
      <div className="min-h-0 flex-1">
        <AgendaWorkspace session={live} agenda={agenda} attachments={attachments} topicHistory={{}} rounds={rounds} decisions={decisions} busy={false} presenting={presenting}
          stage={<RoomStage session={live} agenda={agenda} rounds={rounds} decisions={decisions} profiles={profiles(mode)} />}
          compactStage={<RoomStage session={live} agenda={agenda} rounds={rounds} decisions={decisions} profiles={profiles(mode)} compact />}
          ballot={hasBallot ? <MemberVoteCard vote={{ voting_round_id: "r1", title_ar: "اعتماد الخطة الدراسية لبرنامج الذكاء الاصطناعي", has_voted: false }} busy={false} onCast={noop} /> : undefined}
          broadcast={broadcastFor(mode)} onBroadcast={noop} onHandOver={noop}
          timers={{ data: timers, clockOffsetMs: TIMERS_AT - FIXED_NOW }}
          plannedMinutes={{ pendingItemId: null, errorItemId: null, error: null, onChange: noop }}
          onUpdateDiscussion={async () => true} onRequestPostpone={noop} onOpenRound={noop} onCloseRound={noop} onCreateDecision={noop} onEditDecision={noop} onComplete={noop} />
      </div>
    </div>
  );
}

const meta: Meta<typeof Room> = { title: "الاجتماعات/غرفة الاجتماع: جدول الأعمال", component: Room };
export default meta;
type Story = StoryObj<typeof Room>;

export const ChairDiscussion: Story = { name: "الرئيس: قيد المناقشة", args: { mode: "chair", agenda: discussing, rounds: [] } };
export const ChairVoting: Story = { name: "الرئيس: التصويت مفتوح", args: { mode: "chair", agenda: voting, rounds: [openRound] } };
export const ChairResult: Story = { name: "الرئيس: صياغة القرار", args: { mode: "chair", agenda: voting, rounds: [closedRound] } };
export const ChairDecisionSaved: Story = { name: "الرئيس: القرار محفوظ وقابل للتعديل", args: { mode: "chair", agenda: decided, rounds: [closedRound], decisions: [savedDecision(true)] } };
export const MemberDecisionSaved: Story = { name: "العضو: القرار المحفوظ", args: { mode: "member", agenda: decided, rounds: [closedRound], decisions: [savedDecision(false)] } };
export const RapporteurSummary: Story = { name: "المقرر: الملخص النهائي", args: { mode: "rapporteur", agenda: voting, rounds: [closedRound] } };
export const MemberVoting: Story = { name: "العضو: بطاقة التصويت", args: { mode: "member", agenda: voting, rounds: [openRound], voting: true } };
export const Presentation: Story = { name: "وضع العرض على الشاشة", args: { mode: "chair", agenda: voting, rounds: [openRound], presenting: true } };
