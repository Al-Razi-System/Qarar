async function payloadOf<T>(response: Response, fallback: string) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message ?? fallback);
  return payload.data as T;
}

export async function tasksRpc<T>(contract: string, params: Record<string, unknown> = {}) {
  const response = await fetch("/api/admin/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contract, params }),
  });
  return payloadOf<T>(response, "تعذر تنفيذ العملية.");
}

export async function uploadTaskEvidence(taskId: string, file: File, description: string) {
  const form = new FormData();
  form.set("taskId", taskId);
  form.set("file", file);
  if (description.trim()) form.set("description", description.trim());
  const response = await fetch("/api/admin/tasks/evidence", { method: "POST", body: form });
  return payloadOf<{ id: string }>(response, "تعذر رفع الدليل.");
}

export async function removeTaskEvidence(evidenceId: string) {
  const response = await fetch(`/api/admin/tasks/evidence?evidenceId=${encodeURIComponent(evidenceId)}`, { method: "DELETE" });
  return payloadOf<{ id: string }>(response, "تعذر حذف الدليل.");
}

export function taskEvidenceUrl(taskId: string, evidenceId: string, disposition: "inline" | "attachment" = "attachment") {
  const params = new URLSearchParams({ taskId, evidenceId, disposition });
  return `/api/admin/tasks/evidence?${params.toString()}`;
}
