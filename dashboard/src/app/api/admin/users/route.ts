import { NextResponse } from "next/server";
import { qararEdge } from "@/shared/api/qarar-server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const result = await qararEdge("iam-admin", {
      action: "create_user",
      ...body,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "تعذر إنشاء الحساب.";
    const status = message === "UNAUTHENTICATED" ? 401 : 400;
    return NextResponse.json({ message }, { status });
  }
}
