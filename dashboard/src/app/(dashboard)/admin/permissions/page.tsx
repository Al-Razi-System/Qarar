import type { Metadata } from "next";
import {
  PermissionMatrix,
  type PermissionRecord,
  type RoleRecord,
} from "@/features/permissions/ui/permission-matrix";
import { qararRpc } from "@/shared/api/qarar-server";

export const metadata: Metadata = { title: "الأدوار والصلاحيات" };

export default async function PermissionsPage() {
  const [roles, permissions] = await Promise.all([
    qararRpc<RoleRecord[]>("admin_list_roles", {
      p_query: null,
      p_scope: null,
      p_active_only: true,
    }),
    qararRpc<PermissionRecord[]>("admin_list_permissions", {
      p_module: null,
      p_active_only: true,
    }),
  ]);

  return (
    <div className="mx-auto max-w-[1480px]">
      <div className="mb-7">
        <p className="mb-1.5 text-[11px] font-bold text-[#ff7a00]">
          إدارة الهوية والوصول
        </p>
        <h1 className="text-2xl font-black text-[#0a1330]">
          الأدوار والصلاحيات
        </h1>
        <p className="mt-2 text-xs leading-6 text-[#718196]">
          إدارة مصفوفة الوصول حسب الدور والنطاق مع دورة اعتماد مستقلة.
        </p>
      </div>
      <PermissionMatrix roles={roles} permissions={permissions} />
    </div>
  );
}
