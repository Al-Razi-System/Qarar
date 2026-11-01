/** A meeting decision as the minutes read returns it. */
export type MinutesDecision = { id: string; decision_no: string; agenda_item_id?: string | null; decision_text: string };

/**
 * The decisions whose current text the minutes do not carry, in the order given.
 * Mirrors the server check in submit_meeting_minutes: the trimmed minutes text
 * must contain each decision text exactly, or the minutes cannot be submitted.
 */
export function decisionsMissingFromMinutes(text: string, decisions: MinutesDecision[] | null | undefined) {
  const content = text.trim();
  return (decisions ?? []).filter((decision) => !content.includes(decision.decision_text));
}
