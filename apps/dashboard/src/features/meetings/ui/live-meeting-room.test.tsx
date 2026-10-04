import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LiveMeetingRoom } from "./live-meeting-room";

const { liveMeetingRpc } = vi.hoisted(() => ({ liveMeetingRpc: vi.fn() }));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("../api/live-meeting-client", () => ({ liveMeetingRpc }));
vi.mock("@/features/topics/api/topics-client", () => ({ topicsRpc: vi.fn() }));

describe("LiveMeetingRoom polling", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
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
});
