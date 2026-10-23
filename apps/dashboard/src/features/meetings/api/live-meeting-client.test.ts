import { afterEach, expect, it, vi } from "vitest";
import { liveMeetingRpc } from "./live-meeting-client";
afterEach(() => vi.unstubAllGlobals());
it("keeps short meeting requests alive across page navigation", async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { ok: true } }), {
    status: 200, headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);
  await expect(liveMeetingRpc("get_meeting_detail", { p_meeting_id: "meeting-1" })).resolves.toEqual({ ok: true });
  expect(fetchMock).toHaveBeenCalledWith("/api/admin/meetings", expect.objectContaining({ method: "POST", keepalive: true }));
});
it("cancels a stalled vote request without retrying an uncertain write", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn((_url, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))));
  vi.stubGlobal("fetch", fetcher);
  const result = liveMeetingRpc("cast_vote", { p_voting_round_id: "r1" }, { signal: controller.signal });
  controller.abort();
  await expect(result).rejects.toHaveProperty("name", "AbortError");
  expect(fetcher).toHaveBeenCalledOnce();
});
