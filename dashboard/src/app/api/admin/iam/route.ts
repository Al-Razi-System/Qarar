import { NextResponse } from "next/server";
import { qararRpc } from "@/shared/api/qarar-server";

const operations = {
  roleDetail: "admin_get_role_detail",
  upsertRole: "admin_upsert_role",
  deactivateRole: "admin_deactivate_role",
  upsertPermission: "admin_upsert_permission",
  requestRoleChange: "admin_request_role_permissions_change",
} as const;

export async function POST(request: Request) {
  try {
    const { operation, payload } = await request.json();
    const rpcName = operations[operation as keyof typeof operations];
    if (!rpcName || !payload || typeof payload !== "object") {
      return NextResponse.json({ message: "طلب غير صالح." }, { status: 400 });
    }
    const result = await qararRpc(rpcName, payload);
    return NextResponse.json(result ?? { success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "تعذر تنفيذ العملية.";
    return NextResponse.json({ message }, { status: message === "UNAUTHENTICATED" ? 401 : 400 });
  }
}
