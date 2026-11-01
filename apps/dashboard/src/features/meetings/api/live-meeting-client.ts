/**
 * A call from a meeting's live room. `meetingId` names the room so that a
 * successful write tells that room's other screens at once; it grants nothing.
 */
export async function liveMeetingRpc<T>(contract: string, params: Record<string, unknown> = {}, options: { signal?: AbortSignal; meetingId?: string } = {}) {
  const response = await fetch("/api/admin/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(options.meetingId ? { "x-qarar-meeting-id": options.meetingId } : {}) },
    body: JSON.stringify({ contract, params }),
    // Read refreshes and mutations are intentionally small. Let the browser
    // finish sending them when the user navigates instead of resetting the
    // Route Handler connection mid-request.
    keepalive: true,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}
