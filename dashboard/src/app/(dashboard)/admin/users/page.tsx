import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { UsersWorkspace } from "@/features/manage-users/ui/users-workspace";
import { type ManagedUser } from "@/features/manage-users/ui/users-table";
import { type RoleOption, type UnitOption } from "@/features/manage-users/ui/create-user-form";
import { qararRpc } from "@/shared/api/qarar-server";

export const metadata: Metadata = { title: "إدارة المستخدمين" };

type SearchUsersResponse = {
  items: ManagedUser[];
  total: number;
};

async function loadUsersPageData() {
  try {
    return await Promise.all([
      qararRpc<SearchUsersResponse>("admin_search_users", {
        p_query: null,
        p_status: null,
        p_role_id: null,
        p_governance_unit_id: null,
        p_limit: 25,
        p_offset: 0,
      }),
      qararRpc<RoleOption[]>("admin_list_roles", {
        p_query: null,
        p_scope: null,
        p_active_only: true,
      }),
      qararRpc<{ governance_units: UnitOption[] }>("get_topic_form_options", {}),
    ]);

  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      redirect("/login");
    }
    throw error;
  }
}

export default async function UsersPage() {
  const [result, roles, formOptions] = await loadUsersPageData();

  return (
    <div className="mx-auto max-w-[1480px]">
      <UsersWorkspace
        users={result.items}
        total={result.total}
        roles={roles}
        units={formOptions.governance_units}
      />
    </div>
  );
}
