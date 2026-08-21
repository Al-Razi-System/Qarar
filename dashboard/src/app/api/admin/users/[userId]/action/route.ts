import { NextResponse } from "next/server";
import { qararEdge, qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const allowedActions = new Set([
  "lock_user",
  "unlock_user",
  "update_user_status",
  "resend_invitation",
  "send_password_reset",
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  const parsedBody = await readJsonObject(request);
  if (!parsedBody.ok) return parsedBody.response;

  try {
    const { userId } = await params;
    const body = parsedBody.value;
    if (typeof body.action !== "string" || !allowedActions.has(body.action)) {
      return NextResponse.json({ message: "الإجراء غير مدعوم." }, { status: 400 });
    }
    const result = body.action === "update_user_status" && body.status === "inactive"
      ? await qararRpc("admin_request_user_offboarding", {
          p_target_user_id: userId,
          p_successor_user_id: typeof body.successor_user_id === "string" && body.successor_user_id ? body.successor_user_id : null,
          p_justification: typeof body.reason === "string" ? body.reason : "Offboarding requested from user administration",
        })
      : await qararEdge("iam-admin", { ...body, user_id: userId });
    return NextResponse.json(result);
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تنفيذ العملية.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}
