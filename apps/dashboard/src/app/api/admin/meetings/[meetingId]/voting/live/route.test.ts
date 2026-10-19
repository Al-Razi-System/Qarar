// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: rpc }));
vi.mock("@/shared/observability/logger", () => ({ logEvent: vi.fn() }));
import { GET } from "./route";
const meetingId = "00000000-0000-0000-0000-000000000001";
const context = { params: Promise.resolve({ meetingId }) };
afterEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });
describe("authenticated contextual voting channel", () => {
  it("rejects invalid IDs before accessing records", async () => {
    const response = await GET(new Request("http://localhost/"), { params: Promise.resolve({ meetingId: "invalid" }) });
    expect(response.status).toBe(400); expect(rpc).not.toHaveBeenCalled();
  });
  it.each([["UNAUTHENTICATED", 401, undefined], ["مجلس آخر", 403, "42501"]])("denies %s before reading any votes", async (message, status, code) => {
    rpc.mockRejectedValue(Object.assign(new Error(String(message)), { status, code }));
    const response = await GET(new Request("http://localhost/"), context);
    expect(response.status).toBe(status); expect(rpc).toHaveBeenCalledOnce();
    expect(rpc.mock.calls[0][0]).toBe("get_meeting_session_detail");
  });
  it("rechecks contextual authority and terminates when revoked, without leaking private fields", async () => {
    vi.useFakeTimers(); let allowed = true;
    rpc.mockImplementation(async (name: string) => {
      if (!allowed) throw Object.assign(new Error("لا صلاحية"), { status: 403, code: "42501" });
      if (name === "get_meeting_session_detail") return {};
      if (name === "list_meeting_voting_rounds") return [{ id: "r1", status: "open", chair_vote: "reject", approve_count: 5, participation: [] }];
      return [{ voting_round_id: "r1", title_ar: "بند", has_voted: false, note: "PRIVATE" }];
    });
    const response = await GET(new Request("http://localhost/"), context);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-accel-buffering")).toBe("no");
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).not.toMatch(/chair_vote|reject|approve_count|PRIVATE/);
    allowed = false; await vi.advanceTimersByTimeAsync(1000);
    expect(new TextDecoder().decode((await reader.read()).value)).toContain('"terminal":true');
    expect((await reader.read()).done).toBe(true);
    expect(rpc.mock.calls[3][0]).toBe("get_meeting_session_detail");
    expect((rpc.mock.calls[3][2] as { signal: AbortSignal }).signal).toBeInstanceOf(AbortSignal);
  });
});
