import { timingSafeEqual } from "node:crypto";
import { getQararEnv } from "@/shared/api/qarar-server";
import { meetingInvitationPng } from "@/features/meetings/server/meeting-invitation-image";
import type { MeetingInvitationSnapshot } from "@/features/meetings/model/meeting-invitation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function validSecret(actual: string | null, expected: string) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function validSnapshot(value: unknown): value is MeetingInvitationSnapshot {
  if (!value || typeof value !== "object") return false;
  const input = value as Partial<MeetingInvitationSnapshot>;
  return typeof input.title_ar === "string" && input.title_ar.trim().length > 0 && typeof input.scheduled_date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(input.scheduled_date) && (!input.agenda_titles || (Array.isArray(input.agenda_titles) && input.agenda_titles.length <= 50));
}

export async function POST(request: Request) {
  const env = await getQararEnv();
  if (!validSecret(request.headers.get("x-qarar-service-key"), env.SERVICE_ROLE_KEY)) return Response.json({ error: { message: "غير مصرح." } }, { status: 401 });
  const snapshot = await request.json().catch(() => null);
  if (!validSnapshot(snapshot)) return Response.json({ error: { message: "بيانات الدعوة غير مكتملة." } }, { status: 400 });
  try {
    const png = await meetingInvitationPng(snapshot);
    return new Response(new Uint8Array(png), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "Content-Disposition": "inline; filename=meeting-invitation.png" } });
  } catch (error) {
    console.error("meeting invitation image generation failed", error);
    return Response.json({ error: { message: "تعذر إنشاء صورة الدعوة." } }, { status: 500 });
  }
}
