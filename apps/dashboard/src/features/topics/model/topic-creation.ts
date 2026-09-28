export type TopicGovernanceMethod = "regulation" | "prior" | "custom" | "exception";

export type TopicGovernanceMethodAvailability = Record<TopicGovernanceMethod, {
  available: boolean;
  reason: string;
}>;

export function resolveDefaultGovernanceMethod(
  availability: TopicGovernanceMethodAvailability,
): TopicGovernanceMethod {
  if (availability.regulation.available) return "regulation";
  if (availability.custom.available) return "custom";
  return "exception";
}

export function resolveCreationStep({
  hasMatchedGovernance,
  isReadyForReview,
  isCreated,
}: {
  hasMatchedGovernance: boolean;
  isReadyForReview: boolean;
  isCreated: boolean;
}) {
  if (isCreated) return 4;
  if (isReadyForReview) return 3;
  if (hasMatchedGovernance) return 2;
  return 1;
}
