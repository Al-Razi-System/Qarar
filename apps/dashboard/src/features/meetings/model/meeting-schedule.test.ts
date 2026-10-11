import { describe, expect, it } from "vitest";
import { meetingScheduleLabel } from "./meeting-schedule";
describe("meeting schedule label",()=>{
 it("does not display the anchor as a confirmed meeting date",()=>{
  expect(meetingScheduleLabel({id:"1",title_ar:"اجتماع",status:"draft",scheduled_date:"2026-10-08",planned_window_start:"2026-10-08",planned_window_end:"2026-10-14",schedule_date_confirmed:false})).toContain("لم يُحدد يوم الانعقاد");
 });
 it("preserves historical and confirmed dates",()=>{
  expect(meetingScheduleLabel({id:"1",title_ar:"اجتماع",status:"scheduled",scheduled_date:"2026-10-12",schedule_date_confirmed:true})).toBe("2026-10-12");
 });
});
