export function createInvitationMediaRenderer({ appBaseUrl, serviceKey, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const origin = new URL(appBaseUrl).origin;
  if (!serviceKey) throw new TypeError("Qarar service key is required for invitation media");
  return async function renderInvitationMedia(variables) {
    const response = await fetchImpl(`${origin}/api/internal/notifications/meeting-invitation/image`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-qarar-service-key": serviceKey },
      body: JSON.stringify(variables),
      signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok || response.headers.get("content-type")?.split(";")[0] !== "image/png") throw new Error(`INVITATION_MEDIA_${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 100 || bytes.length > 5_000_000) throw new Error("INVITATION_MEDIA_INVALID_SIZE");
    return { base64: bytes.toString("base64"), mimetype: "image/png", filename: "meeting-invitation.png" };
  };
}
