import { notFound, redirect } from "next/navigation";
import type { Policy } from "@/features/regulations/model/types";
import { PolicyDetailView } from "@/features/regulations/ui/policy-detail-view";
import { QararApiError, qararRpc } from "@/shared/api/qarar-server";

const allowedViews = new Set(["content", "management", "legislative", "presets", "journey"]);

export default async function PolicyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ policyId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { policyId } = await params;
  const query = await searchParams;
  let policy: Policy;
  try {
    policy = await qararRpc<Policy>("admin_get_policy_detail", { p_policy_id: policyId });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHENTICATED") redirect(`/login?next=/admin/regulations/${policyId}`);
    if (error instanceof QararApiError && error.code === "P0002") {
      redirect("/admin/regulations?notice=policy-replaced");
    }
    throw error;
  }
  if (!policy?.id) notFound();
  const requestedView = typeof query.view === "string" ? query.view : "content";
  const initialView = allowedViews.has(requestedView)
    ? (requestedView as "content" | "management" | "legislative" | "presets" | "journey")
    : "content";
  const requestedAuthoring = typeof query.authoring === "string" ? query.authoring : "structure";
  const initialAuthoringSection = ["structure", "scopes", "versions", "identity"].includes(requestedAuthoring)
    ? (requestedAuthoring as "structure" | "scopes" | "versions" | "identity")
    : "structure";
  return (
    <PolicyDetailView
      policy={policy}
      initialView={initialView}
      initialVersionId={typeof query.version === "string" ? query.version : undefined}
      initialItemId={typeof query.item === "string" ? query.item : undefined}
      initialAuthoringSection={initialAuthoringSection}
      initialLifecycleStage={typeof query.stage === "string" ? query.stage : undefined}
    />
  );
}
