import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import type { MeetingDetail } from "@/features/meetings/model/meeting";
import { meetingInvitationSnapshot } from "@/features/meetings/model/meeting-invitation";
import { meetingInvitationPng } from "@/features/meetings/server/meeting-invitation-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await context.params;
    const url = new URL(request.url);
    const meeting = await qararRpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId });
    const snapshot = meetingInvitationSnapshot(meeting, { startTime: url.searchParams.get("start") ?? undefined, endTime: url.searchParams.get("end") ?? undefined, meetingUrl: `${url.origin}/admin/meetings/${meetingId}` });
    const png = await meetingInvitationPng(snapshot);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "Content-Disposition": `inline; filename="${meeting.meeting_no ?? "meeting"}-invitation.png"` } });
  } catch (error) {
    const safe = safeAdminError(error, "تعذر إنشاء معاينة الدعوة.", 500);
    return Response.json({ error: { code: safe.code, message: safe.message } }, { status: safe.status });
  }
}
