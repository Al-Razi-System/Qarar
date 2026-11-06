import type { Metadata } from "next";
import {
  PermissionMatrix,
  type PermissionRecord,
  type RoleRecord,
} from "@/features/permissions/ui/permission-matrix";
import { qararRpc } from "@/shared/api/qarar-server";

export const metadata: Metadata = { title: "الأدوار والصلاحيات" };

export default async function PermissionsPage() {
  const [roles, permissions, access] = await Promise.all([
    qararRpc<RoleRecord[]>("admin_list_roles", {
      p_query: null,
      p_scope: null,
      p_active_only: false,
    }),
    qararRpc<PermissionRecord[]>("admin_list_permissions", {
      p_module: null,
      p_active_only: true,
    }),
    qararRpc<{ is_system_admin?: boolean; permissions?: string[] }>(
      "get_current_user_access_context",
      {},
    ),
  ]);
  return (
    <div className="mx-auto max-w-7xl">
      <PermissionMatrix
        roles={roles}
        permissions={permissions}
        canManageRoles={Boolean(
          access.is_system_admin ||
          access.permissions?.includes("iam.roles.manage"),
        )}
        canManagePermissions={Boolean(
          access.is_system_admin,
        )}
      />
    </div>
  );
}
