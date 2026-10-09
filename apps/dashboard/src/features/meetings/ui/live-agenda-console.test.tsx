import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { LiveMeetingSession } from "../model/live-meeting";
import { LiveAgendaConsole } from "./live-agenda-console";

const session: LiveMeetingSession = {
  viewer: { user_id: "viewer", full_name_ar: "عضو", mode: "member", is_roster_member: true,
    can_manage_session: false, can_operate_attendance: false, can_create_checkin: false,
    can_verify_attendance: false, can_lock_attendance: false, can_record_proceedings: false,
    can_manage_voting: false, can_complete_session: false, can_self_check_in: true, can_vote: true },
  meeting: { id: "meeting", title_ar: "اجتماع الاختبار", status: "in_progress", updated_at: "2026-10-09", attendance_locked: true },
  attendance: [], my_attendance: null, quorum: null, open_voting_rounds: [],
};
it("shows topic guidance when discussion opens, and hides it for a topic without guidance", () => {
  const props = { session, attachments: [], topicHistory: {}, myVotes: [], rounds: [], decisions: [], busy: false,
    onCastVote: vi.fn(), onUpdateDiscussion: vi.fn(async () => true), onOpenRound: vi.fn(), onCloseRound: vi.fn(), onCreateDecision: vi.fn(), onComplete: vi.fn() };
  const item = { id: "item", agenda_order: 1, agenda_status: "under_discussion", topic: { id: "topic", title_ar: "خطة البرنامج" } };
  const view = render(<LiveAgendaConsole {...props} agenda={[{ ...item, discussion_instructions: "ابدأ بعرض مبررات البرنامج" }]}/>);
  expect(screen.getByRole("region", { name: "تعليمات المناقشة" })).toHaveTextContent("ابدأ بعرض مبررات البرنامج");
  view.rerender(<LiveAgendaConsole {...props} agenda={[item]}/>);
  expect(screen.queryByRole("region", { name: "تعليمات المناقشة" })).not.toBeInTheDocument();
});
