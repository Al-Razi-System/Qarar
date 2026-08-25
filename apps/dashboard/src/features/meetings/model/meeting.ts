export type MeetingCapabilities = {
  can_manage?: boolean;
  can_manage_agenda?: boolean;
  can_schedule?: boolean;
  can_send_invitations?: boolean;
  can_prepare_session?: boolean;
  can_start_session?: boolean;
  can_cancel?: boolean;
  can_archive?: boolean;
};

export type Meeting = {
  id: string;
  meeting_no?: string | null;
  title_ar: string;
  status: string;
  scheduled_date?: string;
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
  is_exception?: boolean;
  exception_reason?: string | null;
  topic?: {
    id: string;
    title_ar: string;
    topic_no?: string;
    status?: string;
    priority?: string;
    category_name_ar?: string;
    submitted_by_name_ar?: string;
  };
};

export type MeetingDetail = Meeting & {
  title_en?: string | null;
  meeting_type_id?: string;
  governance_unit_id?: string;
  capabilities?: MeetingCapabilities;
  agenda_items?: AgendaItem[];
};

export type SignatureStrokes = Array<Array<[number, number]>>;
export type MinuteApproval = {
  id: string; name_ar?: string; approval_status: string; notes?: string | null; updated_at: string; user_id?: string;
  signed_at?: string | null; has_signature?: boolean; can_respond?: boolean; signature_strokes?: SignatureStrokes | null;
};
export type MeetingMinutes = {
  id?: string; content_draft?: string | null; content_final?: string | null; status: string;
  updated_at?: string; approved_at?: string | null; approvals?: MinuteApproval[]; viewer_can_edit?: boolean; final_content_hash?: string | null;
};
export type MeetingReadiness = { ready: boolean; checks: Array<{ code: string; label: string; complete: boolean; count?: number }> };
export type AgendaCandidate = { id: string; title_ar: string; topic_no?: string; priority?: string; current_step?: string | null; responsibility?: string | null };
export type MeetingReference = { id: string; name_ar: string; code?: string };
export type MeetingFormOptions = { meeting_units?: MeetingReference[]; meeting_types?: MeetingReference[]; location_types?: string[] };

export const meetingStatusLabels: Record<string, string> = {
  draft: "مسودة", scheduled: "مجدولة", ready_to_start: "جاهزة للبدء",
  in_progress: "منعقدة", waiting_for_minutes: "بانتظار المحضر",
  waiting_for_approval: "بانتظار الاعتماد", closed: "مغلقة",
  cancelled: "ملغاة", archived: "مؤرشفة",
};

export const meetingStatusTone: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700", scheduled: "bg-blue-50 text-blue-700",
  ready_to_start: "bg-orange-50 text-orange-700", in_progress: "bg-emerald-50 text-emerald-700",
  waiting_for_minutes: "bg-amber-50 text-amber-800", waiting_for_approval: "bg-orange-50 text-orange-800",
  closed: "bg-slate-100 text-slate-600", cancelled: "bg-red-50 text-red-700",
  archived: "bg-slate-100 text-slate-500",
};

export function isAgendaEditable(status?: string) {
  return status === "draft" || status === "scheduled";
}
