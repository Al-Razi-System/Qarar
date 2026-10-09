import { notFound, redirect } from "next/navigation";
import { RegulationLibrary } from "@/features/regulations/ui/regulation-library";
import type { LibraryDetail, LibraryList } from "@/features/regulations/model/regulation-library";
import { QararApiError, qararRpcV2 } from "@/shared/api/qarar-server";

export default async function PolicyDetailPage({ params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(policyId)) notFound();
  let detail: LibraryDetail;
  let list: LibraryList;
  try {
    [detail, list] = await Promise.all([
      qararRpcV2<LibraryDetail>("admin_get_regulation_library_v2", { p_policy_id: policyId }),
      qararRpcV2<LibraryList>("admin_search_regulation_library_v2", { p_query: null, p_limit: 30, p_offset: 0 }),
    ]);
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect(`/login?next=/admin/regulations/${policyId}`);
    if (error instanceof QararApiError && error.code === "P0002") notFound();
    throw error;
  }
  return <RegulationLibrary key={policyId} initialPolicies={list.items} initialTotal={list.total} initialCanManage={list.capabilities.can_manage} initialDetail={detail} />;
}
