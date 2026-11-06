import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { invitationQrDataUri, renderMeetingInvitationSvg, type MeetingInvitationSnapshot } from "../model/meeting-invitation";

export async function meetingInvitationPng(snapshot: MeetingInvitationSnapshot) {
  const logo = await readFile(path.join(process.cwd(), "public/brand/razi-university.jpg"));
  const fontFiles = [
    path.join(process.cwd(), "src/assets/fonts/IBMPlexSansArabic-Regular.ttf"),
    path.join(process.cwd(), "src/assets/fonts/IBMPlexSansArabic-Bold.ttf"),
  ];
  const svg = renderMeetingInvitationSvg(
    snapshot,
    `data:image/jpeg;base64,${logo.toString("base64")}`,
    invitationQrDataUri(snapshot.meeting_url),
  );
  const renderer = new Resvg(svg, {
    fitTo: { mode: "width", value: 1080 },
    font: {
      fontFiles,
      loadSystemFonts: false,
      defaultFontFamily: "QararArabic",
    },
  });
  return Buffer.from(renderer.render().asPng());
}
