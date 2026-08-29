import { readFile } from "node:fs/promises";
import path from "node:path";
import { renderToBuffer } from "@react-pdf/renderer";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import type { MeetingDetail, MeetingMinutes } from "@/features/meetings/model/meeting";
import { MeetingMinutesDocument } from "@/features/meetings/pdf/meeting-minutes-document";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ meetingId: string }> }) {
  try {
    const { meetingId } = await context.params;
    const [meeting, minutes, logoBuffer] = await Promise.all([
      qararRpc<MeetingDetail>("get_meeting_detail", { p_meeting_id: meetingId }),
      qararRpc<MeetingMinutes>("get_meeting_minutes", { p_meeting_id: meetingId }),
      readFile(path.join(process.cwd(), "public/brand/razi-university.jpg")),
    ]);
    if (meeting.status !== "closed" || minutes.status !== "approved" || !minutes.content_final) {
      return Response.json({ error: { message: "لا يمكن تصدير المحضر قبل اكتمال المصادقات وإغلاق الاجتماع." } }, { status: 409 });
    }
    if ((minutes.approvals ?? []).some((approval) => approval.approval_status !== "approved" || !approval.signature_strokes?.length)) {
      return Response.json({ error: { message: "بيانات التواقيع المعتمدة غير مكتملة." } }, { status: 409 });
    }
    const logo = `data:image/jpeg;base64,${logoBuffer.toString("base64")}`;
    const document = MeetingMinutesDocument({ meeting, minutes, logo });
    const pdf = await renderToBuffer(document as Parameters<typeof renderToBuffer>[0]);
    const safeNumber = (meeting.meeting_no ?? meeting.id).replace(/[^A-Za-z0-9_-]/g, "-");
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${safeNumber}-minutes.pdf"; filename*=UTF-8''${encodeURIComponent(`محضر-${meeting.meeting_no ?? meeting.id}.pdf`)}`,
        "Cache-Control": "private, no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر إنشاء ملف المحضر.", 500);
    return Response.json({ error: { code: safeError.code, message: safeError.message } }, { status: safeError.status });
  }
}
