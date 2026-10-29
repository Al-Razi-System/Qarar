// Invalidation only; never put a vote value, note, JWT or user record in this hub.
type Listener = { keys: Set<string>; wake: () => void };
type RoomListener = { meetingId: string; notify: (change: RoomChange) => void };
type RoomWindow = { scope: RoomScope | null; timer: ReturnType<typeof setTimeout> };
const runtime = globalThis as typeof globalThis & {
  qararVotingListeners?: Set<Listener>;
  qararRoomListeners?: Set<RoomListener>;
  qararRoomRevisions?: Map<string, number>;
  qararRoomWindows?: Map<string, RoomWindow>;
};
const listeners = runtime.qararVotingListeners ??= new Set();
const roomListeners = runtime.qararRoomListeners ??= new Set();
const roomRevisions = runtime.qararRoomRevisions ??= new Map();
const roomWindows = runtime.qararRoomWindows ??= new Map();

export function watchVoting(keys: () => string[], wake: () => void) {
  const listener = { get keys() { return new Set(keys()); }, wake };
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export function notifyVotingMutation(contract: string, params: Record<string, unknown>, result: unknown, roomMeetingId?: string | null) {
  if (!["cast_vote", "open_voting_round", "close_voting_round", "cancel_voting_round"].includes(contract)) return;
  const data = result && typeof result === "object" ? result as Record<string, unknown> : {};
  const meeting = data.meeting_id ?? params.p_meeting_id ?? roomMeetingId;
  const round = data.voting_round_id ?? params.p_voting_round_id;
  const keys = [typeof meeting === "string" ? `meeting:${meeting}` : "", typeof round === "string" ? `round:${round}` : ""];
  for (const listener of listeners) if (keys.some(key => listener.keys.has(key))) listener.wake();
}

/**
 * What a screen of the live room must read again. The signal carries no
 * meeting data: each screen reads with its own authority. `sync` is the
 * revision a stream starts from, so a screen that reconnects can tell whether
 * it missed a change.
 */
export type RoomScope = "room" | "broadcast";
export type RoomChange = { revision: number; scope: RoomScope | "sync" };

/** Changes closer together than this reach the screens as one. */
export const ROOM_COALESCE_MS = 250;

const BROADCAST_CONTRACTS = new Set(["set_meeting_broadcast_v2", "hand_over_meeting_broadcast_v2", "set_meeting_broadcast_document_v2"]);
// Voting rounds are not here: the voting stream carries them, and a screen
// reloads the room itself when it sees a round open or close. Signalling them
// too would make every screen reload the room while it should be showing the
// ballot, which delays the ballot itself.
const ROOM_CONTRACTS = new Set([
  "transition_meeting", "lock_attendance_roster", "complete_meeting_session",
  "create_checkin_session", "revoke_checkin_session", "self_check_in",
  "override_attendance", "verify_attendance", "recalculate_meeting_quorum", "apply_quorum_failure",
  "update_agenda_discussion", "save_agenda_topic_instructions",
  "set_agenda_item_downloads_v2", "set_agenda_item_planned_minutes_v2", "refer_agenda_item_v2",
  "create_decision_from_voting_round", "update_meeting_decision_text",
  "propose_meeting_assignment_v2", "confirm_meeting_assignment_v2", "withdraw_meeting_assignment_v2",
  "propose_meeting_assignment_batch_v2", "confirm_meeting_assignment_batch_v2", "withdraw_meeting_assignment_batch_v2",
]);

export function roomScopeOf(contract: string): RoomScope | null {
  if (BROADCAST_CONTRACTS.has(contract)) return "broadcast";
  return ROOM_CONTRACTS.has(contract) ? "room" : null;
}

export function roomRevision(meetingId: string) {
  return roomRevisions.get(meetingId) ?? 0;
}

export function watchRoom(meetingId: string, notify: (change: RoomChange) => void) {
  const listener = { meetingId, notify };
  roomListeners.add(listener);
  return () => { roomListeners.delete(listener); };
}

function emit(meetingId: string, scope: RoomScope) {
  const revision = roomRevision(meetingId) + 1;
  roomRevisions.set(meetingId, revision);
  for (const listener of roomListeners) if (listener.meetingId === meetingId) listener.notify({ revision, scope });
}

function openWindow(meetingId: string) {
  const window: RoomWindow = { scope: null, timer: setTimeout(() => {
    const pending = window.scope;
    roomWindows.delete(meetingId);
    if (pending) { emit(meetingId, pending); openWindow(meetingId); }
  }, ROOM_COALESCE_MS) };
  roomWindows.set(meetingId, window);
}

/**
 * The first change reaches the screens at once; further changes in the next
 * moment are held and sent together, so a burst of writes cannot make every
 * screen reload the room for each one. A held room change outranks a held
 * broadcast change, since reloading the room also reloads what it shows.
 */
export function notifyRoomChange(meetingId: string, scope: RoomScope) {
  const window = roomWindows.get(meetingId);
  if (window) {
    window.scope = window.scope === "room" || scope === "room" ? "room" : "broadcast";
    return;
  }
  emit(meetingId, scope);
  openWindow(meetingId);
}
