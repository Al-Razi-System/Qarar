// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpcV2: rpc }));
import { GET } from "./route";
const meetingId = "99000000-0000-0000-0000-000000000081";
const userId = "99000000-0000-0000-0000-000000000013";
const context = (ids = { meetingId, userId }) => ({ params: Promise.resolve(ids) });
beforeEach(() => { rpc.mockReset(); });

it("serves a roster member's photo through the meeting-scoped contract", async () => {
  rpc.mockResolvedValue({ revision: 3, has_image: true, content_base64: Buffer.from("image").toString("base64") });
  const response = await GET(new Request("http://localhost/api"), context());
  expect(response.status).toBe(200);
  expect(response.headers.get("Content-Type")).toBe("image/jpeg");
  expect(response.headers.get("Cache-Control")).toContain("private");
  expect(await response.text()).toBe("image");
  expect(rpc).toHaveBeenCalledWith("get_meeting_member_avatar_v2", { p_meeting_id: meetingId, p_user_id: userId });
});

it("answers 204 for a member without a photo", async () => {
  rpc.mockResolvedValue({ revision: 0, has_image: false, content_base64: null });
  expect((await GET(new Request("http://localhost/api"), context())).status).toBe(204);
});

it("rejects identifiers that are not UUIDs before calling the database", async () => {
  const response = await GET(new Request("http://localhost/api"), context({ meetingId, userId: "../users" }));
  expect(response.status).toBe(400);
  expect(rpc).not.toHaveBeenCalled();
});

it("returns safe Arabic copy with a trace id when the member is not on the roster", async () => {
  rpc.mockRejectedValue(Object.assign(new Error("هذا الشخص ليس في سجل حضور الاجتماع."), { code: "P0002", status: 404 }));
  const response = await GET(new Request("http://localhost/api"), context());
  expect(response.status).toBe(404);
  expect(await response.json()).toMatchObject({ traceId: expect.any(String), message: expect.not.stringContaining("SQL") });
});
