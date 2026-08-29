type ApiEnvelope<T> = { data?: T; error?: { message?: string } };

export async function councilRpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/councils", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;
  if (!response.ok || payload.data === undefined) {
    throw new Error(payload.error?.message || "تعذر تنفيذ العملية على المجلس.");
  }
  return payload.data;
}
