import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";
import { safeAdminError } from "@/shared/security/admin-error";
import { readJsonObject } from "@/shared/security/json-body";
import { rejectUntrustedMutation } from "@/shared/security/request-guards";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    return NextResponse.json(await qararRpc("admin_get_user_detail", { p_user_id: userId }));
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر تحميل بيانات المستخدم.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const originError = rejectUntrustedMutation(request);
  if (originError) return originError;

  try {
    const { userId } = await params;
    const parsedBody = await readJsonObject(request);
    if (!parsedBody.ok) return parsedBody.response;

    const body = parsedBody.value;
    await qararRpc("admin_update_user_profile", {
      p_user_id: userId,
      p_full_name_ar: body.full_name_ar,
      p_full_name_en: body.full_name_en,
      p_employee_no: body.employee_no,
      p_mobile: body.mobile,
      p_job_title: body.job_title,
    });
    return NextResponse.json({ updated: true, user_id: userId });
  } catch (error) {
    const safeError = safeAdminError(error, "تعذر حفظ بيانات المستخدم.");
    return NextResponse.json({ message: safeError.message }, { status: safeError.status });
  }
}
