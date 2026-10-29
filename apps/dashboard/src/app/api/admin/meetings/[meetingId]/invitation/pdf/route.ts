import React from "react";
import { Document, Image, Page, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import type { MeetingDetail } from "@/features/meetings/model/meeting";
import { meetingInvitationSnapshot } from "@/features/meetings/model/meeting-invitation";
import { meetingInvitationPng } from "@/features/meetings/server/meeting-invitation-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const styles = StyleSheet.create({ page: { padding: 0, backgroundColor: "#ffffff" }, image: { width: "100%", height: "100%", objectFit: "contain" } });

export async function GET(request: Request, context: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await context.params;
    const url = new URL(request.url);
    const meeting = await qararRpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId });
    const snapshot = meetingInvitationSnapshot(meeting, { startTime: url.searchParams.get("start") ?? undefined, endTime: url.searchParams.get("end") ?? undefined, meetingUrl: `${url.origin}/admin/meetings/${meetingId}` });
    const artwork = await meetingInvitationPng(snapshot);
    const document = React.createElement(Document, { title: `دعوة ${meeting.title_ar}`, author: "نظام قرار - جامعة الرازي", language: "ar" }, React.createElement(Page, { size: [540, 675], style: styles.page }, React.createElement(Image, { src: `data:image/png;base64,${artwork.toString("base64")}`, style: styles.image })));
    const pdf = await renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
    const reference = (meeting.meeting_no ?? meeting.id).replace(/[^A-Za-z0-9_-]/g, "-");
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${reference}-invitation.pdf"; filename*=UTF-8''${encodeURIComponent(`دعوة-${meeting.meeting_no ?? meeting.id}.pdf`)}`, "Cache-Control": "private, no-store" } });
  } catch (error) {
    const safe = safeAdminError(error, "تعذر إنشاء ملف الدعوة.", 500);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
