export type CheckInPayload = {
  meetingId: string | null;
  token: string;
};

export function parseCheckInPayload(value: string): CheckInPayload {
  const normalized = value.trim();
  if (!normalized) return { meetingId: null, token: "" };

  try {
    const url = new URL(normalized);
    return {
      meetingId: url.searchParams.get("meeting"),
      token: url.searchParams.get("token")?.trim() ?? "",
    };
  } catch {
    return { meetingId: null, token: normalized };
  }
}

export function tokenForMeeting(value: string, meetingId: string): string {
  const payload = parseCheckInPayload(value);
  if (payload.meetingId && payload.meetingId !== meetingId) {
    throw new Error("رمز الحضور يخص اجتماعاً آخر.");
  }
  if (payload.token.length < 20) {
    throw new Error("رمز الحضور أو رابطه غير صالح.");
  }
  return payload.token;
}
