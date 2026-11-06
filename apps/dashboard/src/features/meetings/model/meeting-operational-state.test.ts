import { describe, expect, it } from "vitest";
import { meetingOperationalGroup } from "./meeting-operational-state";

describe("meetingOperationalGroup", () => {
  it("يفصل الموعد الفائت غير المفتوح عن الاجتماعات القادمة والحية", () => {
    expect(meetingOperationalGroup({ status: "scheduled", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("missed");
    expect(meetingOperationalGroup({ status: "ready_to_start", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("missed");
    expect(meetingOperationalGroup({ status: "scheduled", scheduled_date: "2026-10-02" }, "2026-10-02")).toBe("upcoming");
    expect(meetingOperationalGroup({ status: "scheduled", scheduled_date: "2026-10-03" }, "2026-10-02")).toBe("upcoming");
  });

  it("يبقي مسودة الدورة المنتهية في تحتاج إجراء حتى تصنيفها لم ينفذ", () => {
    expect(meetingOperationalGroup({ status: "draft", planned_window_end: "2026-10-14" }, "2026-10-15")).toBe("missed");
    expect(meetingOperationalGroup({ status: "draft", planned_window_end: "2026-10-14" }, "2026-10-14")).toBe("drafts");
    expect(meetingOperationalGroup({ status: "not_held", planned_window_end: "2026-10-14" }, "2026-11-08")).toBe("not_held");
  });

  it("يضع دورة الخطة المستقبلية في تبويبها المستقل قبل بداية نافذتها، لا في قائمة العمل", () => {
    expect(meetingOperationalGroup({ status: "draft", planned_window_start: "2027-06-08", planned_window_end: "2027-06-14" }, "2026-11-04")).toBe("future");
    expect(meetingOperationalGroup({ status: "scheduled", scheduled_date: "2027-06-10", planned_window_start: "2027-06-08", planned_window_end: "2027-06-14" }, "2026-11-04")).toBe("future");
    expect(meetingOperationalGroup({ status: "draft", planned_window_start: "2026-11-04", planned_window_end: "2026-11-10" }, "2026-11-04")).toBe("drafts");
  });

  it("لا يعيد تصنيف اجتماع بدأ أو اكتمل بسبب تاريخه", () => {
    expect(meetingOperationalGroup({ status: "in_progress", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("live");
    expect(meetingOperationalGroup({ status: "closed", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("completed");
    expect(meetingOperationalGroup({ status: "cancelled", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("cancelled");
  });
});

describe("archived meetings", () => {
  it("are kept apart from meetings whose minutes just closed", () => {
    expect(meetingOperationalGroup({ status: "closed" }, "2026-11-02")).toBe("completed");
    expect(meetingOperationalGroup({ status: "archived" }, "2026-11-02")).toBe("archived");
  });
});
