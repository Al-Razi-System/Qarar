// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { notifyRoomChange, notifyVotingMutation, ROOM_COALESCE_MS, roomRevision, roomScopeOf, watchRoom, watchVoting } from "./voting-events";
import { votingSnapshot, votingStream, type VotingSnapshot } from "./voting-stream";
const initial: VotingSnapshot = { rounds: [], votes: [] };
const decode = (value?: Uint8Array) => new TextDecoder().decode(value);
afterEach(() => vi.useRealTimers());
describe("voting stream privacy and lifecycle", () => {
  it("whitelists participation, not open choices, chair choice or private notes", () => {
    const result = votingSnapshot([{ id: "r", agenda_item_id: "a", status: "open", approve_count: 3, chair_vote: "approve", result: "approved", participation: [{ user_id: "u", full_name_ar: "عضو", has_voted: true, vote_note: "private" } as never] }], [{ voting_round_id: "r", title_ar: "بند", has_voted: true, vote_value: "reject" } as never]);
    expect(JSON.stringify(result)).not.toMatch(/approve|reject|private|chair_vote|vote_value/);
    expect(result.rounds[0].participation?.[0].has_voted).toBe(true);
    expect(votingSnapshot([{ id: "r", agenda_item_id: "a", status: "closed", approve_count: 3 }], []).rounds[0].approve_count).toBe(3);
  });
  it("wakes two readers of the same round immediately, not a foreign meeting", async () => {
    let count = 0;
    const controllers = [new AbortController(), new AbortController(), new AbortController()];
    const reads = [vi.fn(async () => ({ rounds: [{ id: "r", agenda_item_id: "a", status: "open", votes_cast_count: count }], votes: [] })), vi.fn(async () => ({ rounds: [{ id: "r", agenda_item_id: "a", status: "open", votes_cast_count: count }], votes: [] })), vi.fn(async () => initial)];
    const readers = controllers.map((controller, index) => votingStream({ initial, read: reads[index], subscribe: wake => watchVoting(() => [`round:${index === 2 ? "foreign" : "r"}`], wake), signal: controller.signal, onError: () => ({ message: "خطأ", terminal: true }) }).getReader());
    await Promise.all(readers.map(reader => reader.read()));
    count = 1;
    notifyVotingMutation("cast_vote", { p_voting_round_id: "r" }, { accepted: true });
    const updates = await Promise.all(readers.slice(0, 2).map(reader => reader.read()));
    for (const update of updates) expect(decode(update.value)).toContain('"votes_cast_count":1');
    expect(reads[2]).not.toHaveBeenCalled();
    controllers.forEach(controller => controller.abort());
    await Promise.all(readers.map(reader => reader.cancel()));
  });
  it("serializes overlapping notifications and stops on revoked authority", async () => {
    let wake!: () => void; let finish!: (data: VotingSnapshot) => void;
    const read = vi.fn(() => new Promise<VotingSnapshot>(resolve => { finish = resolve; }));
    const abort = new AbortController(); const unsubscribe = vi.fn();
    const reader = votingStream({ initial, read, subscribe: fn => { wake = fn; return unsubscribe; }, signal: abort.signal, onError: () => ({ message: "لا صلاحية", terminal: true }) }).getReader();
    await reader.read(); wake(); wake(); wake();
    expect(read).toHaveBeenCalledTimes(1);
    read.mockImplementationOnce(async () => { throw new Error("42501"); });
    finish(initial);
    await reader.read();
    expect(decode((await reader.read()).value)).toContain('"terminal":true');
    expect((await reader.read()).done).toBe(true);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("aborts in-flight IO when the browser cancels", async () => {
    let wake!: () => void; let io: AbortSignal | undefined;
    const reader = votingStream({ initial, read: signal => { io = signal; return new Promise(() => {}); }, subscribe: fn => { wake = fn; return vi.fn(); }, signal: new AbortController().signal, onError: () => ({ message: "خطأ", terminal: false }) }).getReader();
    await reader.read(); wake(); await reader.cancel(); expect(io?.aborted).toBe(true);
  });
});
describe("room change signals", () => {
  it("tells the readers of one meeting at once, coalesces a burst and never tells another meeting", async () => {
    vi.useFakeTimers();
    const mine = vi.fn(); const foreign = vi.fn();
    const stopMine = watchRoom("m-signal", mine); const stopForeign = watchRoom("m-other", foreign);
    try {
      notifyRoomChange("m-signal", "room");
      expect(mine).toHaveBeenCalledWith({ revision: 1, scope: "room" });
      notifyRoomChange("m-signal", "broadcast"); notifyRoomChange("m-signal", "broadcast");
      expect(mine).toHaveBeenCalledOnce();
      vi.advanceTimersByTime(ROOM_COALESCE_MS);
      expect(mine).toHaveBeenLastCalledWith({ revision: 2, scope: "broadcast" });
      expect(mine).toHaveBeenCalledTimes(2);
      expect(roomRevision("m-signal")).toBe(2);
      expect(foreign).not.toHaveBeenCalled();
    } finally { stopMine(); stopForeign(); }
  });
  it("names the contracts that change the room or its broadcast, and no read", () => {
    expect(roomScopeOf("update_agenda_discussion")).toBe("room");
    expect(roomScopeOf("create_decision_from_voting_round")).toBe("room");
    expect(roomScopeOf("open_voting_round")).toBeNull();
    expect(roomScopeOf("set_meeting_broadcast_v2")).toBe("broadcast");
    expect(roomScopeOf("get_meeting_session_detail")).toBeNull();
    expect(roomScopeOf("cast_vote")).toBeNull();
  });
  it("streams the room revision on connect and each change, carrying no meeting data", async () => {
    let notify!: (change: { revision: number; scope: "room" | "broadcast" }) => void;
    const abort = new AbortController();
    const reader = votingStream({ initial, read: async () => initial, subscribe: () => () => {}, signal: abort.signal, onError: () => ({ message: "خطأ", terminal: true }),
      room: { revision: () => 7, watch: fn => { notify = fn; return () => {}; } } }).getReader();
    const opening = decode((await reader.read()).value) + decode((await reader.read()).value);
    expect(opening).toContain('event: room\ndata: {"revision":7,"scope":"sync"}');
    notify({ revision: 8, scope: "broadcast" });
    expect(decode((await reader.read()).value)).toBe('event: room\ndata: {"revision":8,"scope":"broadcast"}\n\n');
    abort.abort(); await reader.cancel();
  });
});
