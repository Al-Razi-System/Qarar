import type { MinutesDecision } from "./minutes-decisions";
export type MeetingCapabilities = {
  can_manage?: boolean;
  can_manage_agenda?: boolean;
  can_schedule?: boolean;
  can_send_invitations?: boolean;
  can_prepare_session?: boolean;
  can_start_session?: boolean;
  can_cancel?: boolean;
  can_archive?: boolean;
  can_edit?: boolean;
  can_edit_topic_instructions?: boolean;
  can_add_direct_topic?: boolean;
};

export type Meeting = {
  quorum_percentage?: number;
  governance_mode?: "governed" | "custom";
  id: string;
  meeting_no?: string | null;
  governance_unit_id?: string;
  title_ar: string;
  status: string;
  scheduled_date?: string;
  planned_window_start?: string | null;
  planned_window_end?: string | null;
  schedule_date_confirmed?: boolean;
  start_time?: string;
  end_time?: string;
  location_type?: string;
  location_details?: string;
  unit_name_ar?: string;
  governance_unit_name_ar?: string;
  meeting_type_name_ar?: string;
  agenda_count?: number;
  agenda_item_count?: number;
  member_count?: number;
  updated_at?: string;
};

export type AgendaItem = {
  id: string;
  agenda_order: number;
  agenda_status?: string;
  discussion_notes?: string | null;
  discussion_instructions?: string | null;
  updated_at?: string;
  is_exception?: boolean;
  exception_reason?: string | null;
  requires_voting?: boolean;
  topic?: {
    id: string;
    title_ar: string;
    topic_no?: string;
    status?: string;
    priority?: string;
    category_name_ar?: string;
    submitted_by_name_ar?: string;
    is_direct?: boolean;
  };
};

export type MeetingDetail = Meeting & {
  title_en?: string | null;
  meeting_type_id?: string;
  governance_unit_id?: string;
  capabilities?: MeetingCapabilities;
  agenda_items?: AgendaItem[];
  scheduled_suggestions?: ScheduledAgendaSuggestion[];
  submitted_suggestions?:{items:AgendaCandidate[];total:number;locked?:boolean}|null;
  invitation_summary?: MeetingInvitationSummary;
};

export type MeetingInvitationSummary = {
  prepared: boolean;
  requested_count: number;
  pending_count: number;
  accepted_count: number;
  delivered_count: number;
  failed_count: number;
  prepared_at?: string | null;
};

export type ScheduledAgendaSuggestion = {
  topic_type_version_id: string;
  title_ar: string;
  available_from: string;
  due_on: string;
  required_attachment_count: number;
};

export type SignatureStrokes = Array<Array<[number, number]>>;
export type MinuteApproval = {
  id: string; name_ar?: string; approval_status: string; notes?: string | null; updated_at: string; user_id?: string;
  signed_at?: string | null; has_signature?: boolean; can_respond?: boolean; signature_strokes?: SignatureStrokes | null;
};
export type MeetingMinutes = {
  id?: string; content_draft?: string | null; content_final?: string | null; status: string;
  updated_at?: string; approved_at?: string | null; approvals?: MinuteApproval[]; viewer_can_edit?: boolean; final_content_hash?: string | null;
  /** The current text of each decision of the meeting; the minutes must carry each one to be submitted. */
  decisions?: MinutesDecision[];
};
export type MeetingReadiness = { ready: boolean; checks: Array<{ code: string; label: string; complete: boolean; count?: number }> };
export type MeetingStartTiming = {
  meeting_id: string;
  meeting_no?: string | null;
  title_ar: string;
  scheduled_date: string;
  start_time?: string | null;
  end_time?: string | null;
  timezone: string;
  server_now: string;
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  timing_status: "within_window" | "early" | "late" | "schedule_unavailable";
  requires_confirmation: boolean;
  difference_minutes: number;
  can_confirm_off_schedule: boolean;
};
export type MeetingTopicAttachment = {
  id: string; topic_id: string; file_name: string; file_url: string; mime_type: string; file_size_bytes?: number; description?: string | null; created_at?: string;
  /** The agenda item the file is discussed under, in this meeting. */
  agenda_item_id?: string;
  /** False when the chair withheld downloads for the item; the file is then shown inside the room only. */
  download_allowed?: boolean;
  /** Effective viewer permission; a contextual chair retains access independently of participant policy. */
  viewer_download_allowed?: boolean;
  /** The revision of that decision, sent back when the chair changes it. */
  download_revision?: number;
};
export type AgendaCandidate = {
  discussion_instructions?: string | null;
  id: string;
  title_ar: string;
  topic_no?: string;
  priority?: string;
  status?: string;
  current_step?: string | null;
  responsibility?: string | null;
  source_meeting_no?: string | null;
  source_meeting_title_ar?: string | null;
  source_unit_name_ar?: string | null;
  source_decision_no?: string | null;
  source_decision_text?: string | null;
  source_decision_status?: string | null;
  source_minutes_status?: string | null;
  source_minutes_approved_at?: string | null;
};
export type MeetingReference = { id: string; name_ar: string; code?: string };
export type MeetingFormOptions = { meeting_units?: MeetingReference[]; meeting_types?: MeetingReference[]; location_types?: string[] };

export const meetingStatusLabels: Record<string, string> = {
  draft: "مسودة", scheduled: "مجدولة", ready_to_start: "جاهزة للبدء",
  in_progress: "منعقدة", waiting_for_minutes: "بانتظار المحضر",
  waiting_for_approval: "بانتظار اعتماد المحضر", closed: "مكتملة",
  cancelled: "ملغاة", archived: "مكتملة · مؤرشفة",
};

/** The `Badge` tone of each status; the label always carries the meaning. */
export const meetingStatusTone: Record<string, "neutral" | "info" | "live" | "warning" | "success" | "danger"> = {
  draft: "neutral", scheduled: "info", ready_to_start: "info", in_progress: "live",
  waiting_for_minutes: "warning", waiting_for_approval: "warning",
  closed: "success", archived: "success", cancelled: "danger",
};

export function isAgendaEditable(status?: string) {
  return status === "draft" || status === "scheduled";
}
