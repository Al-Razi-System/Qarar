import { notFound } from "next/navigation";
import { TopicTypesWorkspace } from "@/features/governance-v2/ui/topic-types-workspace";

export default function GovernanceModelPage() {
  if (process.env.GOVERNANCE_V2_UI_ENABLED !== "true") notFound();
  return <TopicTypesWorkspace />;
}
