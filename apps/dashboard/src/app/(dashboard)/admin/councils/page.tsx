import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { qararRpc, qararRpcV2 } from "@/shared/api/qarar-server";
import { CouncilsWorkspace } from "@/features/councils/ui/councils-workspace";
import type { CouncilFormOptions, CouncilHierarchyData, RoleOption, UserOption } from "@/features/councils/model/types";

export const metadata: Metadata = { title: "إدارة المجالس" };

export default async function CouncilsPage() {
  let data: [CouncilHierarchyData, CouncilFormOptions, RoleOption[], { items: UserOption[] }];
  try {
    data = await Promise.all([
      qararRpcV2<CouncilHierarchyData>("admin_get_council_organizational_tree_v2", {}),
      qararRpc<CouncilFormOptions>("get_council_form_options", {}),
      qararRpc<RoleOption[]>("admin_list_roles", { p_query: null, p_scope: "governance_unit", p_active_only: true }),
      qararRpc<{ items: UserOption[] }>("admin_search_users", { p_query: null, p_status: "active", p_role_id: null, p_governance_unit_id: null, p_limit: 100, p_offset: 0 }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/councils");
    if (error instanceof Error && error.message === "MFA_REQUIRED") redirect("/mfa?next=/admin/councils");
    throw error;
  }
  return <CouncilsWorkspace initialHierarchy={data[0]} options={data[1]} roles={data[2]} users={data[3].items} />;
}
