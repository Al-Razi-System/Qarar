import { NextResponse } from "next/server";
import { qararEdge, qararRpc, requireQararSession } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

const pageSize = 25;

export async function GET(request: Request) {
  try {
    await requireQararSession();
    const url = new URL(request.url);
    const requestedOffset = Number(url.searchParams.get("offset") ?? "0");
    const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;
    const query = url.searchParams.get("query")?.trim() || null;
    const result = await qararRpc("admin_search_users", {
      p_query: query,
      p_status: null,
      p_role_id: null,
      p_governance_unit_id: null,
      p_limit: pageSize,
      p_offset: offset,
    });
    return NextResponse.json(result);
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تحميل المستخدمين حالياً.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}

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
