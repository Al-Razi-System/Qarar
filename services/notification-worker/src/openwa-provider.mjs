import { ProviderError, assertProviderRequest } from "./provider.mjs";

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export class OpenWAProvider {
  code = "openwa";
  channel = "whatsapp";

  constructor({ baseUrl, sessionId, apiKey, timeoutMs = 45_000, fetchImpl = fetch }) {
    const parsed = new URL(baseUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new TypeError("OpenWA URL must use HTTP or HTTPS");
    if (!sessionId || !apiKey) throw new TypeError("OpenWA session and API key are required");
    this.baseUrl = parsed.toString().replace(/\/$/, "");
    this.sessionId = sessionId;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async send(request) {
    assertProviderRequest(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetchImpl(
        `${this.baseUrl}/api/sessions/${encodeURIComponent(this.sessionId)}/messages/send-text`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": this.apiKey,
            "x-qarar-delivery-id": request.deliveryId
          },
          body: JSON.stringify({ chatId: `${request.destinationDigits}@c.us`, text: request.text }),
          signal: controller.signal
        }
      );
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new ProviderError("OPENWA_TIMEOUT", "انتهت مهلة اتصال مزود واتساب.", { retryable: true, ambiguous: true });
      }
      throw new ProviderError("OPENWA_NETWORK", "تعذر الاتصال بمزود واتساب.", { retryable: true });
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      throw new ProviderError(
        `OPENWA_HTTP_${response.status}`,
        response.status === 401 || response.status === 403 ? "رفض مزود واتساب بيانات الاعتماد." : "رفض مزود واتساب طلب الإرسال.",
        { retryable: RETRYABLE_STATUS.has(response.status), httpStatus: response.status }
      );
    }
    let body;
    try { body = await response.json(); } catch {
      throw new ProviderError("OPENWA_INVALID_RESPONSE", "أعاد مزود واتساب استجابة غير صالحة.", { retryable: true, httpStatus: response.status, ambiguous: true });
    }
    if (typeof body.messageId !== "string" || body.messageId.length === 0) {
      throw new ProviderError("OPENWA_MISSING_MESSAGE_ID", "لم يعد مزود واتساب معرف الرسالة.", { retryable: true, httpStatus: response.status, ambiguous: true });
    }
    return { providerCode: this.code, providerMessageId: body.messageId, acceptedAt: new Date() };
  }

  async health() {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/api/sessions/${encodeURIComponent(this.sessionId)}`, {
        headers: { "x-api-key": this.apiKey },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      return { healthy: response.ok, status: response.status };
    } catch { return { healthy: false, status: null }; }
  }
}
