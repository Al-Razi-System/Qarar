import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DiscussionSummary } from "./discussion-summary";
import { ControlDock } from "./control-dock";
import { deriveMeetingStage } from "../../model/meeting-stage";
import type { AgendaDiscussionItem, LiveMeetingSession, VotingRound } from "../../model/live-meeting";

const item: AgendaDiscussionItem = { id: "a1", agenda_order: 1, agenda_status: "discussed", requires_voting: true, discussion_notes: "ملخص أولي للمناقشة", updated_at: "2026-10-19T10:00:00Z" };
const round: VotingRound = { id: "r1", agenda_item_id: "a1", status: "closed", result: "rejected", closed_at: "2026-10-19T10:01:00Z" };
describe("visible next step after voting", () => {
  it("does not declare the meeting finished before the final summary", () => {
    const session = { meeting: { attendance_locked: true }, viewer: {}, attendance: [], open_voting_rounds: [] } as unknown as LiveMeetingSession;
    expect(deriveMeetingStage(session, [item], [round], []).phase.kind).not.toBe("finished");
  });
  it("lets the rapporteur confirm unchanged preliminary text after the vote", async () => {
    const update = vi.fn().mockResolvedValue(true);
    render(<DiscussionSummary item={item} votingFinished finalNeedsConfirmation role="rapporteur" busy={false} onDraftChange={vi.fn()} onUpdate={update} />);
    fireEvent.click(screen.getByRole("button", { name: "حفظ الملخص النهائي" }));
    expect(update).toHaveBeenCalledWith(item, "discussed", item.discussion_notes);
  });
  it("shows the remaining requirement without opening a separate dialog", () => {
    render(<ControlDock item={item} actions={[]} note={null} busy={false} blockers={["البند 1: حفظ ملخص النتائج والتوصيات."]} onAction={vi.fn()} onComplete={vi.fn()} />);
    expect(screen.getByText(/الخطوة المتبقية: البند 1: حفظ ملخص النتائج والتوصيات/)).toBeInTheDocument();
  });
});
