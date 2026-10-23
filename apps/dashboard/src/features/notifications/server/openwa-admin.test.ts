import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenWaAdminClient } from "./openwa-admin";

afterEach(() => vi.restoreAllMocks());

describe("OpenWaAdminClient", () => {
  it("returns session and credential metadata without exposing the secret", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: "s1", name: "qarar-test", status: "ready", phone: "967773989264" }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ name: "Qarar", keyPrefix: "owa_k1_abcd", role: "admin", isActive: true }]), { status: 200 }));
    const client = new OpenWaAdminClient({ baseUrl: "http://openwa:2785", apiKey: "super-secret", sessionName: "qarar-test", fetchImpl });
    const status = await client.status();
    expect(status.session?.phone).toBe("967773989264");
    expect(status.credential?.keyPrefix).toBe("owa_k1_abcd");
    expect(JSON.stringify(status)).not.toContain("super-secret");
  });

  it("normalizes the destination and sends the approved test template", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "provider-1" }), { status: 201 }));
    const client = new OpenWaAdminClient({ baseUrl: "http://openwa:2785", apiKey: "secret", sessionName: "qarar-test", sessionId: "s1", fetchImpl });
    await expect(client.sendTest("+967 778 781 778", "delivery-1")).resolves.toMatchObject({ providerMessageId: "provider-1" });
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining("/sessions/s1/messages/send-text"), expect.objectContaining({ body: expect.stringContaining("نظام قرار - جامعة الرازي") }));
  });

  it("classifies provider timeouts as ambiguous to prevent unsafe duplicate sends", async () => {
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    const fetchImpl = vi.fn().mockRejectedValue(timeout);
    const client = new OpenWaAdminClient({ baseUrl: "http://openwa:2785", apiKey: "secret", sessionName: "qarar-test", sessionId: "s1", fetchImpl });

    await expect(client.sendTest("+967778781778", "delivery-1")).rejects.toMatchObject({
      code: "OPENWA_TIMEOUT_AMBIGUOUS",
    });
  });
});
