import { describe, expect, it } from "vitest";
import { daysUntil, dueText, taskJourney, urgencyOf } from "./journey";

const today = new Date(2026, 9, 16);

describe("dueText", () => {
  it("speaks of due dates as people do", () => {
    expect(dueText({ due_date: "2026-10-12", status: "in_progress" }, today)).toEqual({ text: "متأخرة منذ 4 أيام", tone: "danger" });
    expect(dueText({ due_date: "2026-10-15", status: "new" }, today).text).toBe("متأخرة منذ يوم");
    expect(dueText({ due_date: "2026-10-16", status: "new" }, today)).toEqual({ text: "موعدها اليوم", tone: "warning" });
    expect(dueText({ due_date: "2026-10-17", status: "new" }, today).text).toBe("موعدها غداً");
    expect(dueText({ due_date: "2026-10-18", status: "new" }, today).text).toBe("بعد يومين");
    expect(dueText({ due_date: "2026-11-15", status: "new" }, today).text).toBe("حتى 15 نوفمبر");
    expect(dueText({ due_date: null, status: "new" }, today).text).toBe("بلا موعد");
    expect(dueText({ due_date: "2026-10-12", status: "submitted" }, today).text).toBe("سُلّمت للتحقق");
    expect(dueText({ due_date: "2026-10-12", status: "completed" }, today).text).toBe("أُنجزت");
  });
});

describe("urgencyOf", () => {
  it("groups overdue, this week and later", () => {
    expect(urgencyOf({ due_date: "2026-10-12", is_overdue: true }, today)).toBe("overdue");
    expect(urgencyOf({ due_date: "2026-10-20", is_overdue: false }, today)).toBe("this_week");
    expect(urgencyOf({ due_date: null, is_overdue: false }, today)).toBe("later");
    expect(daysUntil("2026-10-23", today)).toBe(7);
  });
});

describe("taskJourney", () => {
  it("lights the station the task is at", () => {
    expect(taskJourney({ status: "in_progress", is_overdue: false, progress_percent: 40 }).map((step) => step.state)).toEqual(["done", "current", "upcoming", "upcoming"]);
    expect(taskJourney({ status: "in_progress", is_overdue: true, progress_percent: 40 })[1]).toMatchObject({ state: "blocked", detail: "40%" });
    expect(taskJourney({ status: "submitted", is_overdue: false, progress_percent: 90 }).map((step) => step.state)).toEqual(["done", "done", "done", "current"]);
    expect(taskJourney({ status: "completed", is_overdue: false, progress_percent: 100 }).every((step) => step.state === "done")).toBe(true);
    expect(taskJourney({ status: "cancelled", is_overdue: false, progress_percent: 10 })[1].detail).toBe("أُلغيت المهمة");
  });

  it("names who submitted and verified, and when", () => {
    const events = [{ id: "e1", event_type: "submit" as const, progress_percent: 90, note: null, actor_name_ar: "د. خالد", created_at: "2026-10-16T09:00:00Z" }];
    expect(taskJourney({ status: "submitted", is_overdue: false, progress_percent: 90 }, events)[2].detail).toBe("د. خالد، 16 أكتوبر");
    expect(taskJourney({ status: "completed", is_overdue: false, progress_percent: 100 }, events)[2].detail).toBe("د. خالد، 16 أكتوبر");
  });
});
