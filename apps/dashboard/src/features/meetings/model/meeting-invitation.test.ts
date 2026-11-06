import { describe, expect, it } from "vitest";
import { renderMeetingInvitationSvg } from "./meeting-invitation";

const RLE = "‫"; const PDF = "‬";

describe("official invitation image", () => {
  it("embeds every right-to-left text that may mix Latin words, so the words keep their reading order", () => {
    const svg = renderMeetingInvitationSvg({
      meeting_no: "MTG-2026-000033", title_ar: "اجتماع Playwright الشامل", governance_unit_name_ar: "مجلس كلية IT",
      scheduled_date: "2026-11-09", start_time: "12:45", end_time: "14:45", location_details: "قاعة A-201",
      agenda_titles: ["اعتماد خطة AI للعام"], recipient_name_ar: "د. خليل",
    }, "data:image/jpeg;base64,", null);
    for (const text of ["اجتماع Playwright الشامل", "مجلس كلية IT", "قاعة A-201", "اعتماد خطة AI للعام", "المرجع: MTG-2026-000033"]) {
      expect(svg).toContain(`${RLE}${text}${PDF}`);
    }
  });
  it("still escapes markup inside the embedded text", () => {
    const svg = renderMeetingInvitationSvg({ title_ar: "اجتماع <script> & أخرى", scheduled_date: "2026-11-09" }, "data:image/jpeg;base64,", null);
    expect(svg).toContain(`${RLE}اجتماع &lt;script&gt; &amp; أخرى${PDF}`);
    expect(svg).not.toContain("<script>");
  });
});
