export type Notice = { kind: "success" | "error"; text: string };

export type Attendance = {
  id: string;
  user_id: string;
  full_name_ar: string;
  status: string;
  verification_status?: string;
  check_in_method?: string | null;
  self_checked_in_at?: string | null;
  verified_at?: string | null;
  updated_at: string;
};

/** A roster member as the member card shows them (list_meeting_member_profiles_v2). */
export type MemberProfile = {
  user_id: string;
  attendance_record_id: string;
  full_name_ar: string;
  job_title?: string | null;
  email?: string | null;
  /** Returned only to the council's chair and rapporteur; null for everyone else. */
  mobile?: string | null;
  home_unit_name_ar?: string | null;
  council_role_code?: string | null;
  council_role_name_ar?: string | null;
  membership_title?: string | null;
  membership_start_date?: string | null;
  attendance_status?: string | null;
  verification_status?: string | null;
  has_avatar: boolean;
  avatar_revision: number;
};

export type MemberProfiles = { mobile_visible: boolean; members: MemberProfile[] };

/** What the council's screens show, written by whoever controls the broadcast (get_meeting_broadcast_v2). */
export type MeetingBroadcast = {
  meeting_id: string;
  /** Only while the session runs; before and after it nothing is broadcast. */
  active: boolean;
  controller_role: "chair" | "rapporteur";
  /** Null until the controller chooses an item; screens then show the item the council is on. */
  agenda_item_id: string | null;
  panel: "instructions" | "attachments" | "history";
  /** The file open on every screen, with its page; null when none is open. */
  attachment_id?: string | null;
  page?: number | null;
  revision: number;
  updated_at?: string | null;
  viewer_controls: boolean;
  can_hand_over: boolean;
  can_take_back: boolean;
  can_return: boolean;
};

/** An agenda item's discussion time, recorded by the database (list_meeting_item_timers_v2). */
export type ItemTimer = {
  agenda_item_id: string;
  /** The chair's planned duration, or null without one. */
  planned_minutes: number | null;
  discussion_started_at: string | null;
  discussion_ended_at: string | null;
  revision: number;
};

export type MeetingItemTimers = { server_now: string; timers: ItemTimer[] };

/** An agenda item the chair referred to another unit, pending its acceptance. */
export type ItemReferral = {
  agenda_item_id: string;
  referral_id: string;
  to_unit_id: string;
  to_unit_name_ar: string;
  reason: string;
  status: "pending" | "accepted" | "rejected";
  referred_at: string;
};

/** An execution task the chair issued in the session, or the rapporteur proposed. */
export type MeetingAssignment = {
  id: string;
  agenda_item_id: string;
  decision_id: string;
  title_ar: string;
  description: string | null;
  assigned_user_id: string | null;
  assigned_user_name_ar: string | null;
  assigned_unit_id: string | null;
  assigned_unit_name_ar: string | null;
  /** Who follows the task and verifies its completion. */
  follow_up_user_id: string | null;
  follow_up_user_name_ar: string | null;
  requires_evidence: boolean;
  due_date: string | null;
  status: "proposed" | "active" | "withdrawn";
  revision: number;
  proposed_by_me: boolean;
  /** The execution task, once issued. */
  action_no: string | null;
  action_status: string | null;
};

export type MeetingAssignments = {
  viewer: { can_issue: boolean; can_propose: boolean };
  assignments: MeetingAssignment[];
  /** For the chair and the rapporteur only: the roster and the active units. */
  options: { users: Array<{ id: string; name_ar: string }>; units: Array<{ id: string; name_ar: string }> } | null;
};

export type NewAssignment = { title: string; userId: string | null; unitId: string | null; dueDate: string | null; followUpId: string; requiresEvidence: boolean };

/** The meeting's referrals, and for the chair alone the units an item may go to. */
export type MeetingReferrals = { referrals: ItemReferral[]; destinations: Array<{ id: string; name_ar: string }> };

export type AgendaDiscussionItem = {
  id: string;
  agenda_order: number;
  agenda_status?: string;
  discussion_notes?: string | null;
  discussion_instructions?: string | null;
  updated_at?: string;
  workflow_step_type?: string | null;
  workflow_responsibility?: string | null;
  workflow_step_name_ar?: string | null;
  requires_voting?: boolean;
  voting_available_now?: boolean;
  /** Why the vote cannot be opened now, from the server; null when it can. */
  voting_unavailable_reason?: string | null;
  topic?: {
    id: string;
    title_ar: string;
    /** Human reference, e.g. TOP-2026-000123. */
    topic_no?: string | null;
    category_name_ar?: string | null;
    submitted_by_name_ar?: string | null;
  };
};

export type VotingRound = {
  id: string;
  agenda_item_id: string;
  status: string;
  result?: string;
  approve_count?: number;
  reject_count?: number;
  abstain_count?: number;
  eligible_voter_count?: number;
  votes_cast_count?: number;
  tie_break_applied?: boolean;
  chair_vote?: "approve" | "reject" | "abstain" | null;
  closed_at?: string | null;
  participation?: Array<{ user_id: string; full_name_ar: string; has_voted: boolean }>;
};

export type LiveMeetingSession = {
  viewer: {
    user_id: string;
    full_name_ar: string;
    mode: "chair" | "rapporteur" | "member";
    is_roster_member: boolean;
    can_manage_session: boolean;
    can_decide_quorum?: boolean;
    can_operate_attendance: boolean;
    can_create_checkin: boolean;
    can_verify_attendance: boolean;
    can_lock_attendance: boolean;
    can_record_proceedings: boolean;
    can_manage_voting: boolean;
    can_complete_session: boolean;
    can_self_check_in: boolean;
    can_vote: boolean;
  };
  meeting: {
    id: string;
    meeting_no?: string;
    title_ar: string;
    status: string;
    updated_at: string;
    attendance_locked: boolean;
    attendance_locked_at?: string | null;
    quorum_continuation?: QuorumContinuation | null;
  };
  attendance: Attendance[];
  my_attendance: Attendance | null;
  quorum: {
    eligible_members?: number;
    present_members?: number;
    actual_percentage?: number;
    required_percentage?: number;
    quorum_status?: string;
  } | null;
  checkin_session?: { id: string; status: string; starts_at: string; expires_at: string } | null;
  open_voting_rounds: VotingRound[];
};

export type MyVote = { voting_round_id: string; title_ar: string; has_voted: boolean };
export type QuorumContinuation = { authorized_by: string; authorized_at: string; reason: string; quorum: NonNullable<LiveMeetingSession["quorum"]> };
export type Decision = {
  id: string;
  decision_no: string;
  agenda_item_id: string;
  decision_status: string;
  decision_text: string;
  /** Concurrency token for editing the text. */
  updated_at?: string;
  /** Whether this viewer may edit the text now, as decided by the server. */
  can_edit_text?: boolean;
  quorum_continuation?: QuorumContinuation | null;
};

export type TopicMeetingHistory = {
  agenda_item_id: string;
  agenda_status: string;
  discussion_notes?: string | null;
  meeting: { id: string; meeting_no?: string; title: string; status: string; scheduled_date?: string; unit_name?: string };
  voting_rounds: Array<{ id: string; round_number: number; status: string; result?: string | null; eligible_voter_count?: number; approve_count?: number; reject_count?: number; abstain_count?: number }>;
  decisions: Array<{ id: string; decision_no: string; decision_text: string; decision_status: string }>;
};

export type PriorRouteStep = {
  id: string;
  sequence_no: number;
  step_title: string;
  responsible_unit_name_ar?: string | null;
  meeting_date: string;
  meeting_reference?: string | null;
  decision_type: string;
  decision_text: string;
  bypass_reason: string;
  attachments: Array<{ id: string; file_name: string; file_url: string; mime_type: string; file_size_bytes?: number }>;
};

export type PriorRouteRequest = { id: string; topic_id: string; status: string; steps: PriorRouteStep[] };
export type TopicGovernanceHistory = { meetings: TopicMeetingHistory[]; priorRoute: PriorRouteRequest | null };
