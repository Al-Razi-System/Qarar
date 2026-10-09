import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { qararRpc, qararRpcV2 } from "@/shared/api/qarar-server";
import { OrganizationalUnitsWorkspace, type OrganizationalUnitsData } from "@/features/councils/ui/organizational-units-workspace";

export const metadata: Metadata = { title: "الوحدات التنظيمية" };
export default async function OrganizationalUnitsPage() {
  let result: [OrganizationalUnitsData, { is_system_admin?: boolean; permissions?: string[] }];
  try {
    result = await Promise.all([
      qararRpcV2<OrganizationalUnitsData>("admin_list_organizational_units_v2", { p_query: null, p_limit: 20, p_offset: 0 }),
      qararRpc<{ is_system_admin?: boolean; permissions?: string[] }>("get_current_user_access_context", {}),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/organizational-units");
    if (error instanceof Error && error.message === "MFA_REQUIRED") redirect("/mfa?next=/admin/organizational-units");
    throw error;
  }
  const [data, access] = result;
  return <OrganizationalUnitsWorkspace initialData={data} canManage={Boolean(access.is_system_admin || access.permissions?.includes("governance.units.manage"))} canManageTypes={Boolean(access.is_system_admin || access.permissions?.includes("governance.unit_types.manage"))} />;
}
