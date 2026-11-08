/** A meeting entry in a topic's history only counts once the topic was actually dealt with there. */
export type HistoryEntry = {
  agenda_status?: string;
  discussion_notes?: string | null;
  voting_rounds?: Array<{ status?: string }>;
  decisions?: unknown[];
};

/**
 * Being placed on an agenda is not a previous council: the topic must have been discussed,
 * voted on or decided, otherwise a meeting that has not happened yet would show up as one.
 */
export function wasExecuted(entry: HistoryEntry): boolean {
  return entry.agenda_status === "discussed"
    || (entry.decisions?.length ?? 0) > 0
    || (entry.voting_rounds ?? []).some((round) => round.status === "closed");
}

export function executedHistory<T extends HistoryEntry>(entries: T[]): T[] {
  return entries.filter(wasExecuted);
}
