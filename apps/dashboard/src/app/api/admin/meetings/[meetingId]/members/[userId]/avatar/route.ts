import { NextResponse } from "next/server";
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { logEvent } from "@/shared/observability/logger";
export const runtime = "nodejs";
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
type Context = { params: Promise<{ meetingId: string; userId: string }> };
type Avatar = { revision: number; has_image: boolean; content_base64?: string | null };
// The photo's revision is in the URL (?v=), so a new photo is a new address and
// the browser may keep this one privately for a while.
const headers = { "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" };

/** A roster member's photo, for the seats and the member card of the live meeting room. */
export async function GET(_request: Request, context: Context) {
  const { meetingId, userId } = await context.params;
  if (!uuid(meetingId) || !uuid(userId)) return NextResponse.json({ message: "طلب الصورة غير صالح." }, { status: 400 });
  try {
    const result = await qararRpcV2<Avatar>("get_meeting_member_avatar_v2", { p_meeting_id: meetingId, p_user_id: userId });
    if (!result.content_base64) return new NextResponse(null, { status: 204, headers });
    return new NextResponse(new Uint8Array(Buffer.from(result.content_base64, "base64")), {
      headers: { ...headers, "Content-Type": "image/jpeg", "Content-Disposition": "inline" },
    });
  } catch (error) {
    const traceId = crypto.randomUUID();
    const safe = safeAdminError(error, "تعذر تحميل صورة العضو.", 500);
    logEvent(safe.status < 500 ? "warn" : "error", "meeting.member_avatar.failed", { traceId, code: safe.code, cause: error instanceof Error ? error.message : "unknown" });
    return NextResponse.json({ message: safe.message, traceId }, { status: safe.status, headers: { "Cache-Control": "no-store" } });
  }
}
