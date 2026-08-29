import type { Metadata } from "next";
import { PermissionMatrix, type PermissionRecord, type RoleRecord } from "@/features/permissions/ui/permission-matrix";
import { qararRpc } from "@/shared/api/qarar-server";
import { PageHeader } from "@/shared/ui/page-header";

export const metadata: Metadata = { title: "الأدوار والصلاحيات" };

export default async function PermissionsPage() {
  const [roles, permissions] = await Promise.all([
    qararRpc<RoleRecord[]>("admin_list_roles", { p_query: null, p_scope: null, p_active_only: true }),
    qararRpc<PermissionRecord[]>("admin_list_permissions", { p_module: null, p_active_only: true }),
  ]);
  return <div className="mx-auto max-w-[1480px]"><PageHeader eyebrow="إدارة الهوية والوصول" title="الأدوار والصلاحيات" description="إدارة مصفوفة الوصول حسب الدور والنطاق مع دورة اعتماد مستقلة." meta={<span className="inline-flex rounded-full bg-[#f1f7fd] px-3 py-1.5 text-[10px] font-bold text-[#2770b9]">{roles.length} أدوار · {permissions.length} صلاحية</span>} /><PermissionMatrix roles={roles} permissions={permissions} /></div>;
}
