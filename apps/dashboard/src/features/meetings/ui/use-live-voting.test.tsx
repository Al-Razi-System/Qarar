import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useLiveVoting } from "./use-live-voting";
class Source extends EventTarget {
  static instances: Source[] = [];
  close = vi.fn(); onerror: (() => void) | null = null;
  constructor(readonly url: string) { super(); Source.instances.push(this); }
  send(type: string, data: unknown) { this.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) })); }
}
afterEach(() => { vi.unstubAllGlobals(); Source.instances = []; });
describe("live voting subscriber", () => {
  it("updates counts independently and masks a stale ballot after acknowledged submission", () => {
    vi.stubGlobal("EventSource", Source);
    const { result, unmount } = renderHook(() => useLiveVoting("m1", true));
    const source = Source.instances[0];
    const snapshot = { rounds: [{ id: "r1", status: "open", votes_cast_count: 1 }], votes: [{ voting_round_id: "r1", has_voted: false }] };
    act(() => source.send("voting", snapshot));
    expect(result.current.snapshot?.rounds[0].votes_cast_count).toBe(1);
    act(() => result.current.acknowledge("r1"));
    act(() => source.send("voting", snapshot));
    expect(result.current.snapshot?.votes[0].has_voted).toBe(true);
    unmount(); expect(source.close).toHaveBeenCalled();
  });
  it("does not retain another meeting snapshot and stops a revoked channel", () => {
    vi.stubGlobal("EventSource", Source);
    const { result, rerender } = renderHook(({ id }) => useLiveVoting(id, true), { initialProps: { id: "m1" } });
    act(() => Source.instances[0].send("voting", { rounds: [], votes: [] }));
    rerender({ id: "m2" });
    expect(result.current.snapshot).toBeNull();
    expect(Source.instances[0].close).toHaveBeenCalled();
    act(() => Source.instances[1].send("voting-error", { terminal: true }));
    expect(result.current.connected).toBe(false);
    expect(result.current.snapshot).toBeNull();
    expect(result.current.error).toMatch(/صلاحية/);
    expect(Source.instances[1].close).toHaveBeenCalled();
  });
  it("counts room and broadcast changes, and catches up on a change missed while disconnected", () => {
    vi.stubGlobal("EventSource", Source);
    const { result } = renderHook(() => useLiveVoting("m1", true));
    const source = Source.instances[0];
    act(() => source.send("room", { revision: 3, scope: "sync" }));
    expect(result.current.roomTick).toBe(0);
    expect(result.current.broadcastTick).toBe(0);
    // Reloading the room also reloads its broadcast; a broadcast change alone leaves the room.
    act(() => source.send("room", { revision: 4, scope: "room" }));
    expect(result.current.roomTick).toBe(1);
    expect(result.current.broadcastTick).toBe(1);
    act(() => source.send("room", { revision: 5, scope: "broadcast" }));
    expect(result.current.broadcastTick).toBe(2);
    expect(result.current.roomTick).toBe(1);
    act(() => source.send("room", { revision: 5, scope: "sync" }));
    expect(result.current.roomTick).toBe(1);
    act(() => source.send("room", { revision: 9, scope: "sync" }));
    expect(result.current.roomTick).toBe(2);
    expect(result.current.broadcastTick).toBe(3);
  });
  it("refreshes the room when the authorised fallback snapshot fingerprint changes", () => {
    vi.stubGlobal("EventSource", Source);
    const { result } = renderHook(() => useLiveVoting("m1", true));
    const source = Source.instances[0];
    act(() => source.send("voting", { rounds: [], votes: [], room_revision: "first" }));
    expect(result.current.roomTick).toBe(1);
    act(() => source.send("voting", { rounds: [], votes: [], room_revision: "second" }));
    expect(result.current.roomTick).toBe(2);
    expect(result.current.broadcastTick).toBe(2);
  });
  it("requests one catch-up read whenever the browser reconnects the channel", () => {
    vi.stubGlobal("EventSource", Source);
    const { result } = renderHook(() => useLiveVoting("m1", true));
    act(() => Source.instances[0].dispatchEvent(new Event("open")));
    expect(result.current.roomTick).toBe(1);
    expect(result.current.broadcastTick).toBe(1);
  });
});
