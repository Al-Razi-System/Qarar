export class MeetingApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "MeetingApiError";
  }
}

type MeetingRpcOptions = { signal?: AbortSignal; timeoutMs?: number };

export async function meetingRpc<T>(contract: string, params: Record<string, unknown> = {}, options: MeetingRpcOptions = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const cancelFromCaller = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) cancelFromCaller();
  else options.signal?.addEventListener("abort", cancelFromCaller, { once: true });
  const timeout = options.timeoutMs
    ? window.setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException("Request timed out", "TimeoutError"));
      }, options.timeoutMs)
    : null;

  try {
    const response = await fetch("/api/admin/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contract, params }),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as {
      data?: T;
      error?: { message?: string; code?: string; requestId?: string };
    } | null;
    if (!response.ok) {
      throw new MeetingApiError(
        payload?.error?.message ?? "تعذر تنفيذ عملية الاجتماع.",
        response.status,
        payload?.error?.code,
        payload?.error?.requestId ?? response.headers.get("x-request-id") ?? undefined,
      );
    }
    return payload?.data as T;
  } catch (error) {
    if (error instanceof MeetingApiError) throw error;
    if (options.signal?.aborted) throw error;
    if (timedOut) throw new MeetingApiError("انتهت مهلة الاتصال قبل اكتمال تحميل الاجتماعات. أعد المحاولة.", 0, "CLIENT_TIMEOUT");
    if (error instanceof TypeError) {
      const offline = typeof navigator !== "undefined" && navigator.onLine === false;
      throw new MeetingApiError(
        offline ? "لا يوجد اتصال بالإنترنت. تحقق من الشبكة ثم أعد المحاولة." : "تعذر الوصول إلى خادم قرار. تحقق من الاتصال ثم أعد المحاولة.",
        0,
        offline ? "NETWORK_OFFLINE" : "NETWORK_UNREACHABLE",
      );
    }
    throw error;
  } finally {
    if (timeout !== null) window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", cancelFromCaller);
  }
}
