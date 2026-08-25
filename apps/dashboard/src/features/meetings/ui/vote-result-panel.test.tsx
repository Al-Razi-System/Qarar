import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VoteResultPanel } from "./vote-result-panel";

describe("VoteResultPanel", () => {
  it("shows the final status and chair tie-break rationale", () => {
    render(<VoteResultPanel round={{
      id: "round-1",
      agenda_item_id: "agenda-1",
      status: "closed",
      result: "approved",
      approve_count: 3,
      reject_count: 3,
      abstain_count: 2,
      votes_cast_count: 8,
      eligible_voter_count: 8,
      tie_break_applied: true,
      chair_vote: "approve",
    }} />);

    expect(screen.getByText("الحالة النهائية: موافقة")).toBeInTheDocument();
    expect(screen.getByText(/تعادلت أصوات الموافقة والرفض \(3 مقابل 3\)/)).toBeInTheDocument();
    expect(screen.getByText(/صوت رئيس المجلس «موافق»/)).toBeInTheDocument();
  });
});
