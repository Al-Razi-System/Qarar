import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { qararRpc } from "@/shared/api/qarar-server";
import { CouncilsWorkspace } from "@/features/councils/ui/councils-workspace";
import type { CouncilFormOptions, CouncilSearchResult, CouncilTreeNode, RoleOption, UserOption } from "@/features/councils/model/types";

export const metadata: Metadata = { title: "إدارة المجالس" };

export default async function CouncilsPage() {
  let data: [CouncilSearchResult, CouncilTreeNode[], CouncilFormOptions, RoleOption[], { items: UserOption[] }];
  try {
    data = await Promise.all([
      qararRpc<CouncilSearchResult>("admin_search_councils", { p_query: null, p_status: null, p_unit_type_id: null, p_governance_class_id: null, p_parent_unit_id: null, p_limit: 100, p_offset: 0 }),
      qararRpc<CouncilTreeNode[]>("admin_get_councils_tree", {}),
      qararRpc<CouncilFormOptions>("get_council_form_options", {}),
      qararRpc<RoleOption[]>("admin_list_roles", { p_query: null, p_scope: "governance_unit", p_active_only: true }),
      qararRpc<{ items: UserOption[] }>("admin_search_users", { p_query: null, p_status: "active", p_role_id: null, p_governance_unit_id: null, p_limit: 100, p_offset: 0 }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/councils");
    if (error instanceof Error && error.message === "MFA_REQUIRED") redirect("/mfa?next=/admin/councils");
    throw error;
  }
  return <CouncilsWorkspace initialSearch={data[0]} initialTree={data[1]} options={data[2]} roles={data[3]} users={data[4].items} />;
}
