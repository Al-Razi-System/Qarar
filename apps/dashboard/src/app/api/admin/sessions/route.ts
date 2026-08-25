import { NextResponse } from "next/server";
import { QararApiError, qararEdge, qararRpc } from "@/shared/api/qarar-server";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function apiError(error: unknown, fallback: string) {
  if (error instanceof QararApiError) {
    return NextResponse.json(
      { message: error.status === 401 ? "انتهت الجلسة. سجّل الدخول مرة أخرى." : fallback },
      { status: error.status === 401 ? 401 : 400 },
    );
  }

  return NextResponse.json({ message: fallback }, { status: 500 });
}

/** Lists only the caller's sessions through the versioned IAM contract. */
export async function GET() {
  try {
    const sessions = await qararRpc<unknown>("list_my_sessions", {});
    return NextResponse.json({ sessions: Array.isArray(sessions) ? sessions : [] });
  } catch (error) {
    return apiError(error, "تعذر تحميل الجلسات الحالية.");
  }
}

/**
 * Uses the IAM Edge orchestration rather than the application-only revocation
 * RPC, so the corresponding GoTrue refresh-token chain is invalidated too.
 */
export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  const parsedBody = await readJsonObject(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const body = parsedBody.value;
    const sessionId = typeof body.session_id === "string" ? body.session_id : "";
    const reason = typeof body.reason === "string" ? body.reason.slice(0, 500) : undefined;

    if (!UUID_PATTERN.test(sessionId)) {
      return NextResponse.json({ message: "معرّف الجلسة غير صالح." }, { status: 400 });
    }

    const result = await qararEdge("iam-admin", {
      action: "revoke_session",
      session_id: sessionId,
      ...(reason ? { reason } : {}),
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, "تعذر إبطال الجلسة. تحقق من الصلاحية ثم أعد المحاولة.");
  }
}
