import { RegulationsWorkspace } from "@/features/regulations/ui/regulations-workspace";
import type { Policy } from "@/features/regulations/model/types";
import { qararRpc } from "@/shared/api/qarar-server";

export default async function RegulationsPage() {
  const result = await qararRpc<{ items: Policy[] }>("admin_search_policies", {
    p_query: null, p_status: null, p_limit: 100, p_offset: 0,
  });
  return <div className="w-full"><RegulationsWorkspace initialPolicies={result.items}/></div>;
}
