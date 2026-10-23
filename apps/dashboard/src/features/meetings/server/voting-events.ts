// Invalidation only; never put a vote value, note, JWT or user record in this hub.
type Listener = { keys: Set<string>; wake: () => void };
const runtime = globalThis as typeof globalThis & { qararVotingListeners?: Set<Listener> };
const listeners = runtime.qararVotingListeners ??= new Set();
export function watchVoting(keys: () => string[], wake: () => void) {
  const listener = { get keys() { return new Set(keys()); }, wake };
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyVotingMutation(contract: string, params: Record<string, unknown>, result: unknown) {
  if (!["cast_vote", "open_voting_round", "close_voting_round", "cancel_voting_round"].includes(contract)) return;
  const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const meeting = data.meeting_id ?? params.p_meeting_id;
  const round = data.voting_round_id ?? params.p_voting_round_id;
  const keys = [typeof meeting === "string" ? `meeting:${meeting}` : "", typeof round === "string" ? `round:${round}` : ""];
  for (const listener of listeners) if (keys.some(key => listener.keys.has(key))) listener.wake();
}
