import { afterEach, expect, it, vi } from "vitest";
const { rpc, rpcV2, publishMeetingEvent } = vi.hoisted(() => ({ rpc: vi.fn(), rpcV2: vi.fn(), publishMeetingEvent: vi.fn() }));
vi.mock("@/shared/api/qarar-server", () => ({ qararRpc: rpc, qararRpcV2: rpcV2 }));
vi.mock("@/features/meetings/server/meeting-event-bus", () => ({ publishMeetingEvent }));
import { POST } from "./route";
import { watchRoom, watchVoting } from "@/features/meetings/server/voting-events";
afterEach(() => { vi.resetAllMocks(); publishMeetingEvent.mockResolvedValue(undefined); });
it("saves meeting data and its quorum in one V2 transaction", async () => {
  rpcV2.mockResolvedValue({ id: "meeting-1", quorum_percentage: 30 });
  const params = { p_action: "create", p_values: { p_title_ar: "اجتماع تجريبي" }, p_quorum_percentage: 30 };
  expect((await POST(request("save_meeting_with_quorum_v2", params))).status).toBe(200);
  expect(rpcV2).toHaveBeenCalledWith("save_meeting_with_quorum_v2", params);
  expect(rpc).not.toHaveBeenCalled();
});
it("routes the authorized calendar read through V2", async () => {
  const params = { p_from_date: "2026-10-01", p_to_date: "2026-10-31", p_unit_ids: null };
  rpcV2.mockResolvedValue([]);
  expect((await POST(request("list_meetings_calendar_v2", params))).status).toBe(200);
  expect(rpcV2).toHaveBeenCalledWith("list_meetings_calendar_v2", params);
});
it("routes the meeting start timing contract through its published V1 facade", async () => {
  const params = { p_meeting_id: "meeting-1" };
  rpc.mockResolvedValue({ timing_status: "early", requires_confirmation: true });
  expect((await POST(request("get_meeting_session_start_timing_v2", params))).status).toBe(200);
  expect(rpc).toHaveBeenCalledWith("get_meeting_session_start_timing_v2", params, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(rpcV2).not.toHaveBeenCalled();
});
function request(contract: string, params: unknown = {}, meetingId?: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(meetingId ? { "x-qarar-meeting-id": meetingId } : {}) };
  return new Request("http://localhost/api/admin/meetings", { method: "POST", headers, body: JSON.stringify({ contract, params }) });
}
it("dispatches atomic invitation timing to V2, not the legacy facade", async () => {
  rpcV2.mockResolvedValue({ queued: 2 });
  const params = { p_meeting_id: "meeting-1", p_start_time: "09:00", p_end_time: "11:00", p_expected_updated_at: "2026-10-07T00:00:00Z" };
  const response = await POST(request("send_meeting_invitations_v2", params));
  expect(response.status).toBe(200);
  expect(rpcV2).toHaveBeenCalledWith("send_meeting_invitations_v2", params);
  expect(rpc).not.toHaveBeenCalled();
});
it("dispatches a direct agenda topic and its optional voting policy through V2", async () => {
  rpcV2.mockResolvedValue({ agenda_item_id: "agenda-1", requires_voting: false });
  const params = { p_meeting_id: "meeting-1", p_title_ar: "إحاطة مباشرة", p_requires_voting: false, p_client_request_id: "request-1" };
  expect((await POST(request("create_direct_agenda_topic_v2", params))).status).toBe(200);
  expect(rpcV2).toHaveBeenCalledWith("create_direct_agenda_topic_v2", params);
  expect(rpc).not.toHaveBeenCalled();
});
it("preserves V1 consumers and rejects unsupported calls", async () => {
  rpc.mockResolvedValue({ id: "meeting-1" });
  expect((await POST(request("create_meeting"))).status).toBe(200);
  expect((await POST(request("delete_arbitrary_record"))).status).toBe(400);
  expect(rpcV2).not.toHaveBeenCalled();
});
it("rejects malformed parameters before invoking the database", async () => {
  expect((await POST(request("send_meeting_invitations_v2", []))).status).toBe(400);
  expect(rpcV2).not.toHaveBeenCalled();
});
it("notifies voting readers only after a successful write, never on rejection", async () => {
  const wake = vi.fn(); const stop = watchVoting(() => ["round:r1"], wake);
  try {
    rpc.mockRejectedValueOnce(Object.assign(new Error("لا صلاحية"), { code: "42501", status: 403 }));
    expect((await POST(request("cast_vote", { p_voting_round_id: "r1" }))).status).toBe(403);
    expect(wake).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ accepted: true, voting_round_id: "r1", meeting_id: "6f0c2a8e-3d4b-4c1a-9e2f-5b7d8a9c0e1f" });
    expect((await POST(request("cast_vote", { p_voting_round_id: "r1" }))).status).toBe(200);
    expect(wake).toHaveBeenCalledOnce();
  } finally { stop(); }
});
it("translates a database statement timeout into a safe actionable response", async () => {
  rpc.mockRejectedValueOnce(Object.assign(new Error("canceling statement due to statement timeout"), {
    code: "57014",
    status: 500,
  }));

  const response = await POST(request("search_meetings"));
  const payload = await response.json();

  expect(response.status).toBe(503);
  expect(payload.error).toMatchObject({
    code: "QUERY_TIMEOUT",
    message: "استغرق تحميل الاجتماعات وقتًا أطول من المتوقع. أعد المحاولة بعد لحظات.",
  });
  expect(payload.error.requestId).toEqual(expect.any(String));
  expect(JSON.stringify(payload)).not.toContain("statement timeout");
});
it("tells the room's screens after a successful room change, using the room the request came from", async () => {
  const meetingId = "6f0c2a8e-3d4b-4c1a-9e2f-5b7d8a9c0e1f";
  const notify = vi.fn(); const stop = watchRoom(meetingId, notify);
  try {
    rpc.mockRejectedValueOnce(Object.assign(new Error("تعارض"), { code: "40001", status: 409 }));
    await POST(request("update_agenda_discussion", { p_agenda_item_id: "a1" }, meetingId));
    expect(notify).not.toHaveBeenCalled();
    rpc.mockResolvedValueOnce({ id: "a1" });
    rpc.mockResolvedValueOnce({ agenda_items: [{ id: "a1" }] });
    expect((await POST(request("update_agenda_discussion", { p_agenda_item_id: "a1" }, meetingId))).status).toBe(200);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ scope: "room" }));
    expect(publishMeetingEvent).toHaveBeenCalledWith(meetingId, { kind: "room", scope: "room" });
    rpc.mockResolvedValueOnce({ id: "a1" });
    await POST(request("get_meeting_session_detail", { p_meeting_id: meetingId }, meetingId));
    expect(notify).toHaveBeenCalledOnce();
  } finally { stop(); }
});
it("wakes the meeting's voting readers when a round opens, though the call names only the item", async () => {
  const meetingId = "6f0c2a8e-3d4b-4c1a-9e2f-5b7d8a9c0e1f";
  const wake = vi.fn(); const stop = watchVoting(() => [`meeting:${meetingId}`], wake);
  try {
    rpc.mockResolvedValueOnce({ id: "round-1", status: "open" });
    rpc.mockResolvedValueOnce({ agenda_items: [{ id: "a1" }] });
    await POST(request("open_voting_round", { p_agenda_item_id: "a1" }, meetingId));
    expect(wake).toHaveBeenCalledOnce();
  } finally { stop(); }
});
it("ignores a room header that is not a meeting identifier", async () => {
  const notify = vi.fn(); const stop = watchRoom("not-a-uuid", notify);
  try {
    rpc.mockResolvedValueOnce({ id: "a1" });
    await POST(request("update_agenda_discussion", { p_agenda_item_id: "a1" }, "not-a-uuid"));
    expect(notify).not.toHaveBeenCalled();
  } finally { stop(); }
});
it("does not let an item mutation wake a different meeting named only by the client header", async () => {
  const foreignMeeting = "7f0c2a8e-3d4b-4c1a-9e2f-5b7d8a9c0e2f";
  const notify = vi.fn(); const stop = watchRoom(foreignMeeting, notify);
  try {
    rpc.mockResolvedValueOnce({ id: "agenda-from-another-meeting" });
    rpc.mockResolvedValueOnce({ agenda_items: [{ id: "agenda-in-foreign-meeting" }] });
    expect((await POST(request("update_agenda_discussion", { p_agenda_item_id: "agenda-from-another-meeting" }, foreignMeeting))).status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  } finally { stop(); }
});
it("reschedules a session through its own V2 contract, touching nothing else", async () => {
  rpcV2.mockResolvedValue({ id: "m1" });
  const params = { p_meeting_id: "m1", p_scheduled_date: "2026-11-11", p_start_time: "10:00", p_end_time: "12:00", p_location_type: "onsite", p_location_details: null, p_off_plan_reason: "سفر رئيس المجلس", p_expected_updated_at: "2026-11-01T00:00:00Z" };
  expect((await POST(request("reschedule_meeting_session_v2", params))).status).toBe(200);
  expect(rpcV2).toHaveBeenCalledWith("reschedule_meeting_session_v2", params);
  expect(rpc).not.toHaveBeenCalled();
});
