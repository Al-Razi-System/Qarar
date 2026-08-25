export class TopicsApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "TopicsApiError";
  }
}

export async function topicsRpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/topics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = await response.json().catch(() => null) as {
    data?: T;
    error?: { code?: string; message?: string };
  } | null;
  if (!response.ok) {
    throw new TopicsApiError(payload?.error?.message ?? "تعذر تنفيذ العملية.", payload?.error?.code);
  }
  return payload?.data as T;
}

