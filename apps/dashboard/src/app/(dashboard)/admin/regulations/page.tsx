import { RegulationLibrary } from "@/features/regulations/ui/regulation-library";
import type { LibraryList } from "@/features/regulations/model/regulation-library";
import { qararRpcV2 } from "@/shared/api/qarar-server";
import { redirect } from "next/navigation";

export default async function RegulationsPage() {
  let result: LibraryList;
  try {
    result = await qararRpcV2("admin_search_regulation_library_v2", { p_query: null, p_limit: 30, p_offset: 0 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect("/login?next=/admin/regulations");
    throw error;
  }
  return <RegulationLibrary initialPolicies={result.items} initialTotal={result.total} initialCanManage={result.capabilities.can_manage} />;
}
