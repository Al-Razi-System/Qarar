export async function liveMeetingRpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/meetings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
    // Read refreshes and mutations are intentionally small. Let the browser
    // finish sending them when the user navigates instead of resetting the
    // Route Handler connection mid-request.
    keepalive: true,
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error?.message ?? "تعذر تنفيذ العملية.");
  return payload.data as T;
}
