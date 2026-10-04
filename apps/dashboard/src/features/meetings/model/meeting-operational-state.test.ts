import { describe, expect, it } from "vitest";
import { meetingOperationalGroup } from "./meeting-operational-state";

describe("meetingOperationalGroup", () => {
  it("يفصل الموعد الفائت غير المفتوح عن الاجتماعات القادمة والحية", () => {
    expect(meetingOperationalGroup({ status: "scheduled", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("missed");
    expect(meetingOperationalGroup({ status: "ready_to_start", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("missed");
    expect(meetingOperationalGroup({ status: "scheduled", scheduled_date: "2026-10-02" }, "2026-10-02")).toBe("upcoming");
    expect(meetingOperationalGroup({ status: "scheduled", scheduled_date: "2026-10-03" }, "2026-10-02")).toBe("upcoming");
  });

  it("لا يعيد تصنيف اجتماع بدأ أو اكتمل بسبب تاريخه", () => {
    expect(meetingOperationalGroup({ status: "in_progress", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("live");
    expect(meetingOperationalGroup({ status: "closed", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("completed");
    expect(meetingOperationalGroup({ status: "cancelled", scheduled_date: "2026-10-01" }, "2026-10-02")).toBe("cancelled");
  });
});
