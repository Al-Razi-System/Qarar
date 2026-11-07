import { render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn());
vi.mock("../api/topics-client", () => ({ topicsRpc: rpc }));
import { occurrenceState, TopicScheduleOccurrences } from "./topic-schedule-occurrences";

beforeEach(() => rpc.mockReset());

it("names the six states of a periodic obligation", () => {
  const base = { available_from: "2026-11-01", due_on: "2026-11-07", execution_timing: null };
  expect(occurrenceState({ ...base, status: "due" }, "2026-10-20").label).toBe("مستقبلي");
  expect(occurrenceState({ ...base, status: "due" }, "2026-11-03").label).toBe("مستحق");
  expect(occurrenceState({ ...base, status: "due" }, "2026-11-20").label).toBe("متأخر عن دورته");
  expect(occurrenceState({ ...base, status: "scheduled" }, "2026-11-03").label).toBe("مدرج في جدول الأعمال");
  expect(occurrenceState({ ...base, status: "completed", execution_timing: "within_window" }, "2026-11-20").label).toBe("مكتمل في موعده");
  expect(occurrenceState({ ...base, status: "completed", execution_timing: "late" }, "2026-11-20").label).toBe("مكتمل خارج الموعد");
});

it("shows the meeting, the day of the discussion and the decision of a completed obligation", async () => {
  rpc.mockResolvedValue([{ id: "o1", reference_number: "TSO-2026-000004", available_from: "2026-11-01", due_on: "2026-11-07", status: "completed",
    execution_timing: "within_window", discussed_on: "2026-11-05", meeting: { id: "m1", meeting_no: "MTG-2026-000007", title_ar: "الاجتماع الأول لمجلس الكلية — نوفمبر 2026" },
    decision: { id: "d1", decision_no: "DEC-2026-000045", decision_status: "approved" } }]);
  render(<TopicScheduleOccurrences topicId="t1"/>);
  expect(await screen.findByText("مكتمل في موعده")).toBeVisible();
  expect(screen.getByText("DEC-2026-000045")).toBeVisible();
  expect(screen.getByRole("link", { name: "الاجتماع الأول لمجلس الكلية — نوفمبر 2026" })).toHaveAttribute("href", "/admin/meetings/m1");
  expect(screen.getByText("الخميس، 5 نوفمبر 2026")).toBeVisible();
  expect(rpc).toHaveBeenCalledWith("get_topic_schedule_occurrences_v2", { p_topic_id: "t1" });
});

it("shows nothing for a topic without a periodic obligation", async () => {
  rpc.mockResolvedValue([]);
  const { container } = render(<TopicScheduleOccurrences topicId="t2"/>);
  await vi.waitFor(() => expect(rpc).toHaveBeenCalled());
  expect(container).toBeEmptyDOMElement();
});
