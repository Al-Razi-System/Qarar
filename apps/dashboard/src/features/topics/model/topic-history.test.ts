import { expect, it } from "vitest";
import { executedHistory } from "./topic-history";

it("drops meetings where the topic was only added to the agenda", () => {
  const entries = [
    { id: "scheduled", agenda_status: "pending", voting_rounds: [], decisions: [] },
    { id: "discussed", agenda_status: "discussed", voting_rounds: [], decisions: [] },
    { id: "decided", agenda_status: "under_discussion", voting_rounds: [{ status: "closed" }], decisions: [] },
    { id: "open-vote", agenda_status: "under_discussion", voting_rounds: [{ status: "open" }], decisions: [] },
  ];
  expect(executedHistory(entries).map((entry) => entry.id)).toEqual(["discussed", "decided"]);
});
