import { NextResponse } from "next/server";
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function failure(error: unknown, fallback: string) {
  const unauthenticated = error instanceof Error && error.message === "UNAUTHENTICATED";
  return NextResponse.json({ error: { message: unauthenticated ? "انتهت الجلسة. سجّل الدخول مرة أخرى." : fallback } }, { status: unauthenticated ? 401 : 500 });
}

/** The caller's bell: latest notifications and how many are unread. */
export async function GET() {
  try {
    return NextResponse.json({ data: await qararRpcV2<unknown>("get_my_notifications_v2", { p_limit: 20, p_before: null }) });
  } catch (error) {
    return failure(error, "تعذر تحميل الإشعارات.");
  }
}

/** Marks the given notifications (or all of them) read; returns what remains unread. */
export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const ids = parsed.value.ids;
  if (ids !== null && ids !== undefined && (!Array.isArray(ids) || ids.length > 100 || !ids.every((id) => typeof id === "string" && UUID.test(id)))) {
    return NextResponse.json({ error: { message: "إشعارات غير صالحة." } }, { status: 400 });
  }
  try {
    const unread = await qararRpcV2<number>("mark_my_notifications_read_v2", { p_ids: ids ?? null });
    return NextResponse.json({ data: { unread_count: unread } });
  } catch (error) {
    return failure(error, "تعذر تحديث الإشعارات.");
  }
}
