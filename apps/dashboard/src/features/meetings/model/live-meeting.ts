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
  topic?: { id: string; title_ar: string };
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
export type Decision = { id: string; decision_no: string; agenda_item_id: string; decision_status: string; decision_text: string };

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
