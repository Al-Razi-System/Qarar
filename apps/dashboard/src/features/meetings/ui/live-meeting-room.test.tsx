import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveMeetingRoom } from "./live-meeting-room";

const { liveMeetingRpc } = vi.hoisted(() => ({ liveMeetingRpc: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../api/live-meeting-client", () => ({ liveMeetingRpc }));
vi.mock("@/features/topics/api/topics-client", () => ({ topicsRpc: vi.fn(async (contract: string) => contract === "get_topic_meeting_history" ? [] : null) }));

describe("LiveMeetingRoom polling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not start another refresh batch while the current batch is pending", async () => {
    vi.useFakeTimers();
    liveMeetingRpc.mockImplementation(() => new Promise(() => undefined));

    const view = render(<LiveMeetingRoom meetingId="00000000-0000-0000-0000-000000000001" />);
    await act(async () => Promise.resolve());
    expect(liveMeetingRpc).toHaveBeenCalledTimes(6);

    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(liveMeetingRpc).toHaveBeenCalledTimes(6);

    view.unmount();
  });

  it("updates participation even while a full room refresh is blocked", async () => {
    vi.useFakeTimers();
    class Source extends EventTarget {
      static current: Source;
      close = vi.fn(); onerror = null;
      constructor() { super(); Source.current = this; }
    }
    vi.stubGlobal("EventSource", Source);
    let timerReads = 0; let release!: () => void;
    const session = { viewer: { user_id: "chair", full_name_ar: "الرئيس", mode: "chair", can_manage_session: true, can_manage_voting: true }, meeting: { id: "m", title_ar: "اجتماع التزامن", status: "in_progress", attendance_locked: true }, attendance: [], my_attendance: null, quorum: { quorum_status: "met" }, open_voting_rounds: [] };
    liveMeetingRpc.mockImplementation(async (contract: string) => {
      if (contract === "get_meeting_session_detail") return session;
      if (contract === "get_meeting_detail") return { agenda_items: [{ id: "a", agenda_order: 1, agenda_status: "discussed", requires_voting: true, topic: { id: "t", title_ar: "الخطة" } }] };
      if (contract === "list_meeting_item_timers_v2") {
        if (++timerReads === 2) await new Promise<void>(resolve => { release = resolve; });
        return { server_now: new Date().toISOString(), timers: [] };
      }
      if (contract === "list_meeting_referrals_v2") return { referrals: [], destinations: [] };
      if (contract === "list_meeting_assignments_v2") return { assignments: [], viewer: {}, options: null };
      if (contract === "list_meeting_member_profiles_v2") return { members: [], mobile_visible: false };
      return [];
    });
    const view = render(<LiveMeetingRoom meetingId="m" />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(timerReads).toBe(2);
    await act(async () => { Source.current.dispatchEvent(new MessageEvent("voting", { data: JSON.stringify({ rounds: [{ id: "r", agenda_item_id: "a", status: "open", eligible_voter_count: 3, votes_cast_count: 2 }], votes: [] }) })); });
    expect(screen.getByRole("button", { name: "إغلاق التصويت واحتساب النتيجة" })).toBeDisabled();
    expect(screen.getByText("بانتظار تصويت 1 من الأعضاء المؤهلين قبل الإغلاق.")).toBeInTheDocument();
    await act(async () => { Source.current.dispatchEvent(new MessageEvent("voting", { data: JSON.stringify({ rounds: [{ id: "r", agenda_item_id: "a", status: "open", eligible_voter_count: 3, votes_cast_count: 3 }], votes: [] }) })); });
    expect(screen.getByRole("button", { name: "إغلاق التصويت واحتساب النتيجة" })).toBeEnabled();
    expect(timerReads).toBe(2);
    await act(async () => { release(); }); view.unmount();
  });

  it("waits for an older poll and then refreshes again after a successful discussion mutation", async () => {
    vi.useFakeTimers();
    let detailReads = 0;
    let timerReads = 0;
    let releasePoll!: () => void;
    let discussed = false;
    const session = {
      viewer: { user_id: "chair", full_name_ar: "الرئيس", mode: "chair", can_manage_session: true, can_manage_voting: true, can_complete_session: true },
      meeting: { id: "m", title_ar: "اجتماع التزامن", status: "in_progress", attendance_locked: true },
      attendance: [], my_attendance: null, quorum: { eligible_members: 3, present_members: 3, quorum_status: "met" }, open_voting_rounds: [],
    };
    liveMeetingRpc.mockImplementation(async (contract: string) => {
      if (contract === "get_meeting_session_detail") return session;
      if (contract === "get_meeting_detail") {
        detailReads++;
        return { agenda_items: [{ id: "a", agenda_order: 1, agenda_status: discussed ? "discussed" : "under_discussion", requires_voting: true, voting_available_now: true, topic: { id: "t", title_ar: "الخطة" } }] };
      }
      if (contract === "list_meeting_item_timers_v2") {
        if (++timerReads === 2) await new Promise<void>(resolve => { releasePoll = resolve; });
        return { server_now: new Date().toISOString(), timers: [] };
      }
      if (contract === "list_meeting_referrals_v2") return { referrals: [], destinations: [] };
      if (contract === "list_meeting_assignments_v2") return { assignments: [], viewer: {}, options: null };
      if (contract === "list_meeting_member_profiles_v2") return { members: [], mobile_visible: false };
      if (contract === "update_agenda_discussion") { discussed = true; return {}; }
      return [];
    });
    const view = render(<LiveMeetingRoom meetingId="m" />);
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(detailReads).toBe(2);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "إنهاء المناقشة والانتقال للتصويت" })); });
    expect(discussed).toBe(true);
    expect(detailReads).toBe(2);
    await act(async () => { releasePoll(); });
    expect(detailReads).toBe(3);
    expect(screen.getByRole("button", { name: "فتح التصويت للأعضاء" })).toBeInTheDocument();
    view.unmount();
  });

  it("does not show a stale voting connection warning after every round has closed", async () => {
    class Source extends EventTarget {
      static current: Source;
      close = vi.fn(); onerror: (() => void) | null = null;
      constructor() { super(); Source.current = this; }
    }
    vi.stubGlobal("EventSource", Source);
    const session = { viewer: { user_id: "chair", full_name_ar: "الرئيس", mode: "chair", can_manage_session: true, can_manage_voting: true }, meeting: { id: "m", title_ar: "اجتماع", status: "in_progress", attendance_locked: true }, attendance: [], my_attendance: null, quorum: { quorum_status: "met" }, open_voting_rounds: [] };
    liveMeetingRpc.mockImplementation(async (contract: string) => {
      if (contract === "get_meeting_session_detail") return session;
      if (contract === "get_meeting_detail") return { agenda_items: [{ id: "a", agenda_order: 1, agenda_status: "discussed", topic: { id: "t", title_ar: "الخطة" } }] };
      if (contract === "list_meeting_item_timers_v2") return { server_now: new Date().toISOString(), timers: [] };
      if (contract === "list_meeting_referrals_v2") return { referrals: [], destinations: [] };
      if (contract === "list_meeting_assignments_v2") return { assignments: [], viewer: {}, options: null };
      if (contract === "list_meeting_member_profiles_v2") return { members: [], mobile_visible: false };
      return [];
    });
    const view = render(<LiveMeetingRoom meetingId="m" />);
    await act(async () => Promise.resolve());
    await act(async () => Source.current.onerror?.());
    expect(screen.queryByText(/انقطع تحديث التصويت/)).not.toBeInTheDocument();
    view.unmount();
  });
});
