import { afterEach, describe, expect, it, vi } from "vitest";

import { MeetingApiError, meetingRpc } from "./meetings-client";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("meetingRpc read failures", () => {
  it("preserves the classified server reason and follow-up reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        code: "QUERY_TIMEOUT",
        message: "استغرق تحميل الاجتماعات وقتًا أطول من المتوقع. أعد المحاولة بعد لحظات.",
        requestId: "request-123",
      },
    }), { status: 503, headers: { "Content-Type": "application/json" } })));

    await expect(meetingRpc("search_meetings")).rejects.toMatchObject({
      name: "MeetingApiError",
      status: 503,
      code: "QUERY_TIMEOUT",
      requestId: "request-123",
    });
  });

  it("identifies a browser connection failure instead of using a generic operation error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    vi.spyOn(window.navigator, "onLine", "get").mockReturnValue(false);

    const error = await meetingRpc("search_meetings").catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(MeetingApiError);
    expect(error).toMatchObject({
      status: 0,
      code: "NETWORK_OFFLINE",
      message: "لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة.",
    });
  });

  it("keeps caller cancellation silent so an obsolete request cannot replace fresh data", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    })));

    const pending = meetingRpc("search_meetings", {}, { signal: controller.signal });
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
