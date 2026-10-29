// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ image: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ getQararEnv: async () => ({ SERVICE_ROLE_KEY: "service-secret" }) }));
vi.mock("@/features/meetings/server/meeting-invitation-image", () => ({ meetingInvitationPng: mocks.image }));
import { POST } from "./route";

const snapshot = { title_ar: "اجتماع مجلس الجامعة", scheduled_date: "2026-10-30" };
const request = (secret?: string, body: unknown = snapshot) => new Request("http://localhost/api/internal/notifications/meeting-invitation/image", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(secret ? { "x-qarar-service-key": secret } : {}) },
  body: JSON.stringify(body),
});

beforeEach(() => { mocks.image.mockReset(); });

it("rejects callers without the service secret before rendering", async () => {
  expect((await POST(request())).status).toBe(401);
  expect(mocks.image).not.toHaveBeenCalled();
});

it("validates the snapshot before rendering", async () => {
  expect((await POST(request("service-secret", { title_ar: "", scheduled_date: "bad" }))).status).toBe(400);
  expect(mocks.image).not.toHaveBeenCalled();
});

it("returns a private PNG to the authorized worker", async () => {
  mocks.image.mockResolvedValue(Buffer.from("png-bytes"));
  const response = await POST(request("service-secret"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/png");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(mocks.image).toHaveBeenCalledWith(snapshot);
});
