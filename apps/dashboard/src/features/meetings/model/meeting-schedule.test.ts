import { describe, expect, it } from "vitest";
import { meetingLocationLabel, meetingScheduleLabel, meetingTimeLabel } from "./meeting-schedule";
describe("meeting schedule label",()=>{
 it("does not display the anchor as a confirmed meeting date",()=>{
  expect(meetingScheduleLabel({id:"1",title_ar:"اجتماع",status:"draft",scheduled_date:"2026-10-08",planned_window_start:"2026-10-08",planned_window_end:"2026-10-14",schedule_date_confirmed:false})).toContain("لم يُحدد يوم الانعقاد");
 });
 it("preserves historical and confirmed dates",()=>{
  expect(meetingScheduleLabel({id:"1",title_ar:"اجتماع",status:"scheduled",scheduled_date:"2026-10-12",schedule_date_confirmed:true})).toBe("2026-10-12");
 });
});

describe("meetingLocationLabel", () => {
  it("shows the details, else the kind in Arabic, and never the stored code", () => {
    expect(meetingLocationLabel({ location_details: "قاعة 102", location_type: "onsite" })).toBe("قاعة 102");
    expect(meetingLocationLabel({ location_type: "onsite" })).toBe("حضوري");
    expect(meetingLocationLabel({ location_type: "online" })).toBe("عن بُعد");
    expect(meetingLocationLabel({ location_type: "unexpected_code" })).toBe("غير محدد");
  });
});

describe("meetingTimeLabel", () => {
  it("shows the range without seconds, the start alone, or that it is not set", () => {
    expect(meetingTimeLabel({ start_time: "12:45:00", end_time: "14:45:00" })).toBe("12:45 – 14:45");
    expect(meetingTimeLabel({ start_time: "09:00" })).toBe("09:00");
    expect(meetingTimeLabel({})).toBe("الوقت غير محدد");
  });
});
