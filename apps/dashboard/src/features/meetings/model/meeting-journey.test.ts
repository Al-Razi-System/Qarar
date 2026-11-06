import { describe, expect, it } from "vitest";
import { meetingJourney } from "./meeting-journey";

describe("meeting journey", () => {
  it.each([
    ["draft", "setup"],
    ["scheduled", "invitation"],
    ["ready_to_start", "session"],
    ["in_progress", "session"],
    ["waiting_for_minutes", "minutes"],
    ["waiting_for_approval", "minutes"],
    ["closed", "follow_up"],
    ["archived", "follow_up"],
  ])("maps %s to %s and keeps earlier stages readable", (status, current) => {
    const journey = meetingJourney(status);
    expect(journey.find((step) => step.state === "current")?.key).toBe(current);
    const currentIndex = journey.findIndex((step) => step.key === current);
    expect(journey.slice(0, currentIndex).every((step) => step.state === "done")).toBe(true);
    expect(journey.slice(currentIndex + 1).every((step) => step.state === "locked")).toBe(true);
  });

  it("marks a cancelled meeting without pretending later stages completed", () => {
    const journey = meetingJourney("cancelled");
    expect(journey[0]).toMatchObject({ key: "setup", state: "current", label: "الإعداد" });
    expect(journey.slice(1).every((step) => step.state === "locked")).toBe(true);
  });
});
