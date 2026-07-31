import { NextResponse } from "next/server";
import { qararEdge } from "@/shared/api/qarar-server";

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
  try {
    const { userId } = await params;
    const body = await request.json();
    if (!allowedActions.has(body.action)) {
      return NextResponse.json({ message: "الإجراء غير مدعوم." }, { status: 400 });
    }
    const result = await qararEdge("iam-admin", { ...body, user_id: userId });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تنفيذ العملية.";
    return NextResponse.json({ message }, { status: message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
