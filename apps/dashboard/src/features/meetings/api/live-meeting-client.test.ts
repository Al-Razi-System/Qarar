import { afterEach, describe, expect, it, vi } from "vitest";
import { liveMeetingRpc } from "./live-meeting-client";

describe("liveMeetingRpc", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps short meeting requests alive across page navigation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(liveMeetingRpc("get_meeting_detail", { p_meeting_id: "meeting-1" }))
      .resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/meetings", expect.objectContaining({
      method: "POST",
      keepalive: true,
    }));
  });
});
