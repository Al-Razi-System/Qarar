export class MeetingApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = "MeetingApiError";
  }
}

export async function meetingRpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json().catch(() => null) as { data?: T; error?: { message?: string; code?: string } } | null;
  if (!response.ok) {
    throw new MeetingApiError(payload?.error?.message ?? "تعذر تنفيذ عملية الاجتماع.", response.status, payload?.error?.code);
  }
  return payload?.data as T;
}
