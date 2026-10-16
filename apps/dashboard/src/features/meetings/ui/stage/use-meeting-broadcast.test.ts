import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MeetingBroadcast } from "../../model/live-meeting";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("../../api/live-meeting-client", () => ({ liveMeetingRpc: rpc }));
import { useMeetingBroadcast } from "./use-meeting-broadcast";

const server = (overrides: Partial<MeetingBroadcast> = {}): MeetingBroadcast => ({
  meeting_id: "m1", active: true, controller_role: "chair", agenda_item_id: null, panel: "instructions", revision: 0,
  viewer_controls: true, can_hand_over: true, can_take_back: false, can_return: false, ...overrides,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

beforeEach(() => { rpc.mockReset(); });

describe("useMeetingBroadcast", () => {
  it("reads nothing while the session is not running", () => {
    const { result } = renderHook(() => useMeetingBroadcast("m1", false));
    expect(result.current.broadcast).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("shows a choice at once and sends quick choices in order, each against the confirmed revision", async () => {
    const first = deferred<MeetingBroadcast>();
    rpc.mockImplementation((contract: string) => {
      if (contract === "get_meeting_broadcast_v2") return Promise.resolve(server({ revision: 4 }));
      if (contract === "set_meeting_broadcast_v2") return rpc.mock.calls.filter(([name]) => name === contract).length === 1
        ? first.promise
        : Promise.resolve(server({ revision: 6, agenda_item_id: "a3", panel: "attachments" }));
      throw new Error(contract);
    });
    const { result } = renderHook(() => useMeetingBroadcast("m1", true));
    await waitFor(() => expect(result.current.broadcast?.revision).toBe(4));

    act(() => result.current.choose("a2", "instructions"));
    expect(result.current.broadcast).toMatchObject({ agenda_item_id: "a2" });
    act(() => result.current.choose("a3", "attachments"));
    expect(result.current.broadcast).toMatchObject({ agenda_item_id: "a3", panel: "attachments" });

    await act(async () => { first.resolve(server({ revision: 5, agenda_item_id: "a2" })); });
    await waitFor(() => expect(result.current.broadcast?.revision).toBe(6));
    const writes = rpc.mock.calls.filter(([name]) => name === "set_meeting_broadcast_v2").map(([, params]) => params);
    expect(writes).toEqual([
      { p_meeting_id: "m1", p_agenda_item_id: "a2", p_panel: "instructions", p_expected_revision: 4 },
      { p_meeting_id: "m1", p_agenda_item_id: "a3", p_panel: "attachments", p_expected_revision: 5 },
    ]);
    expect(result.current.broadcast).toMatchObject({ agenda_item_id: "a3", panel: "attachments" });
  });

  it("restores the server's broadcast and says why when a change is refused", async () => {
    let reads = 0;
    rpc.mockImplementation((contract: string) => {
      if (contract === "get_meeting_broadcast_v2") {
        reads += 1;
        return Promise.resolve(server({ revision: reads === 1 ? 2 : 3, agenda_item_id: reads === 1 ? null : "a9" }));
      }
      return Promise.reject(new Error("تغيّر البث من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة."));
    });
    const { result } = renderHook(() => useMeetingBroadcast("m1", true));
    await waitFor(() => expect(result.current.broadcast?.revision).toBe(2));
    await act(async () => { result.current.choose("a2", "history"); });
    await waitFor(() => expect(result.current.broadcast).toMatchObject({ revision: 3, agenda_item_id: "a9" }));
    expect(result.current.error).toBe("تغيّر البث من شاشة أخرى، فحُدّثت الشاشة. أعد المحاولة.");
  });

  it("ignores a choice from a viewer who does not control the broadcast", async () => {
    rpc.mockResolvedValue(server({ viewer_controls: false }));
    const { result } = renderHook(() => useMeetingBroadcast("m1", true));
    await waitFor(() => expect(result.current.broadcast).not.toBeNull());
    act(() => result.current.choose("a2", "instructions"));
    expect(rpc.mock.calls.some(([name]) => name === "set_meeting_broadcast_v2")).toBe(false);
  });

  it("hands control over against the confirmed revision and shows pending meanwhile", async () => {
    const handover = deferred<MeetingBroadcast>();
    rpc.mockImplementation((contract: string) => contract === "get_meeting_broadcast_v2"
      ? Promise.resolve(server({ revision: 7 }))
      : handover.promise);
    const { result } = renderHook(() => useMeetingBroadcast("m1", true));
    await waitFor(() => expect(result.current.broadcast?.revision).toBe(7));
    act(() => { void result.current.handOver("rapporteur"); });
    expect(result.current.pending).toBe(true);
    await act(async () => { handover.resolve(server({ revision: 8, controller_role: "rapporteur", viewer_controls: false, can_hand_over: false, can_take_back: true })); });
    expect(result.current.pending).toBe(false);
    expect(result.current.broadcast).toMatchObject({ controller_role: "rapporteur", can_take_back: true });
    expect(rpc).toHaveBeenCalledWith("hand_over_meeting_broadcast_v2", { p_meeting_id: "m1", p_to_role: "rapporteur", p_expected_revision: 7 });
  });
});
