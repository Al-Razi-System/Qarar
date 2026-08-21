import { NextResponse } from "next/server";
import { qararEdge, requireQararSession } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

export async function POST(request: Request) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  try {
    await requireQararSession();
    const parsedBody = await readJsonObject(request);
    if (!parsedBody.ok) return parsedBody.response;

    const result = await qararEdge("iam-admin", {
      action: "create_user",
      ...parsedBody.value,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر إنشاء الحساب.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}
