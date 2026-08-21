import { notFound, redirect } from "next/navigation";
import type { Policy } from "@/features/regulations/model/types";
import { PolicyDetailView } from "@/features/regulations/ui/policy-detail-view";
import { qararRpc } from "@/shared/api/qarar-server";

export default async function PolicyDetailPage({ params }: { params: Promise<{ policyId: string }> }) {
  const { policyId } = await params;
  let policy: Policy;
  try {
    policy = await qararRpc<Policy>("admin_get_policy_detail", { p_policy_id: policyId });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect(`/login?next=/admin/regulations/${policyId}`);
    throw error;
  }
  if (!policy?.id) notFound();
  return <PolicyDetailView policy={policy} />;
}
