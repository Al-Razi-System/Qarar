import { RegulationsWorkspace } from "@/features/regulations/ui/regulations-workspace";
import type { Policy } from "@/features/regulations/model/types";
import { qararRpc } from "@/shared/api/qarar-server";
import { redirect } from "next/navigation";

export default async function RegulationsPage() {
  let result: { items: Policy[] };

  try {
    result = await qararRpc<{ items: Policy[] }>("admin_search_policies", {
      p_query: null, p_status: null, p_limit: 100, p_offset: 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") {
      redirect("/login?next=/admin/regulations");
    }
    throw error;
  }

  return <div className="w-full"><RegulationsWorkspace initialPolicies={result.items}/></div>;
}
