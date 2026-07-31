import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";

export async function GET(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    return NextResponse.json(await qararRpc("admin_get_user_detail", { p_user_id: userId }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تحميل بيانات المستخدم.";
    return NextResponse.json({ message }, { status: message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    const { userId } = await params;
    const body = await request.json();
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
    const message = error instanceof Error ? error.message : "تعذر حفظ بيانات المستخدم.";
    return NextResponse.json({ message }, { status: message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
