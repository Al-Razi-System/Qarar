import { expect, it } from "vitest";
import sharp from "sharp";
import { meetingInvitationPng } from "./meeting-invitation-image";

it("renders the official WhatsApp invitation as a bounded PNG", async () => {
  const bytes = await meetingInvitationPng({ meeting_no: "MTG-2026-1", title_ar: "اجتماع مجلس الجامعة", governance_unit_name_ar: "مجلس الجامعة", scheduled_date: "2026-10-30", start_time: "09:00", end_time: "11:00", location_details: "قاعة الاجتماعات", agenda_titles: ["اعتماد الخطة السنوية"], meeting_url: "https://devqarar.example/admin/meetings/m1" });
  const metadata = await sharp(bytes).metadata();
  expect(metadata.format).toBe("png");
  expect(metadata.width).toBe(1080);
  expect(metadata.height).toBe(1350);
});
