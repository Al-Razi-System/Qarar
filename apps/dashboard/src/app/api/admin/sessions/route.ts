import { NextResponse } from "next/server";
import { QararApiError, qararEdge, qararRpc } from "@/shared/api/qarar-server";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const ORGANIZATION_STATUSES = new Set(["active", "ended", "revoked", "all"]);

function apiError(error: unknown, fallback: string, deniedMessage?: string) {
  if (error instanceof QararApiError) {
    if (error.status === 401) return NextResponse.json({ message: "انتهت الجلسة. سجّل الدخول مرة أخرى." }, { status: 401 });
    if (deniedMessage && (error.status === 403 || error.code === "42501")) return NextResponse.json({ message: deniedMessage }, { status: 403 });
    return NextResponse.json({ message: fallback }, { status: 400 });
  }

  return NextResponse.json({ message: fallback }, { status: 500 });
}

/**
 * Without a scope: the caller's own sessions. With scope=organization: every session in the
 * caller's organisation, for whoever may revoke them (enforced by admin_list_sessions).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("scope") === "organization") {
    const status = url.searchParams.get("status") ?? "active";
    if (!ORGANIZATION_STATUSES.has(status)) {
      return NextResponse.json({ message: "حالة الجلسة غير صالحة." }, { status: 400 });
    }
    const query = url.searchParams.get("q")?.trim().slice(0, 200) || null;
    try {
      const result = await qararRpc<{ items?: unknown[]; total?: number }>("admin_list_sessions", {
        p_status: status, p_query: query, p_limit: 100, p_offset: 0,
      });
      return NextResponse.json({ items: Array.isArray(result?.items) ? result.items : [], total: result?.total ?? 0 });
    } catch (error) {
      return apiError(error, "تعذر تحميل جلسات المؤسسة.", "لا تملك صلاحية مراقبة جلسات المؤسسة.");
    }
  }

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
