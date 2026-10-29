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
    this.resolvedSessionId = null;
    this.apiKey = apiKey;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  async send(request) {
    assertProviderRequest(request);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const resolvedSessionId = await this.resolveSessionId(controller.signal);
      const chatId = `${request.destinationDigits}@c.us`;
      if (request.media) {
        const mediaResponse = await this.postMessage(resolvedSessionId, "send-image", {
          chatId,
          base64: request.media.base64,
          mimetype: request.media.mimetype,
          filename: request.media.filename,
          caption: request.text.slice(0, 1024)
        }, request.deliveryId, controller.signal);
        if (mediaResponse.ok) return await this.acceptedResult(mediaResponse, this.code);
        if (![400, 404, 409, 413, 415, 422].includes(mediaResponse.status)) this.throwHttpError(mediaResponse.status);
        const textResponse = await this.postMessage(resolvedSessionId, "send-text", { chatId, text: request.text }, request.deliveryId, controller.signal);
        if (!textResponse.ok) this.throwHttpError(textResponse.status);
        return await this.acceptedResult(textResponse, `openwa-text-fallback-${mediaResponse.status}`);
      }
      const response = await this.postMessage(resolvedSessionId, "send-text", { chatId, text: request.text }, request.deliveryId, controller.signal);
      if (!response.ok) this.throwHttpError(response.status);
      return await this.acceptedResult(response, request.mediaFallbackReason ? `openwa-text-fallback-${request.mediaFallbackReason}` : this.code);
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (error?.name === "AbortError") {
        throw new ProviderError("OPENWA_TIMEOUT", "انتهت مهلة اتصال مزود واتساب.", { retryable: true, ambiguous: true });
      }
      throw new ProviderError("OPENWA_NETWORK", "تعذر الاتصال بمزود واتساب.", { retryable: true });
    } finally {
      clearTimeout(timeout);
    }
  }

  async postMessage(sessionId, operation, body, deliveryId, signal) {
    return this.fetchImpl(`${this.baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/messages/${operation}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "x-qarar-delivery-id": deliveryId },
      body: JSON.stringify(body),
      signal
    });
  }

  throwHttpError(status) {
      throw new ProviderError(
        `OPENWA_HTTP_${status}`,
        status === 401 || status === 403 ? "رفض مزود واتساب بيانات الاعتماد." : "رفض مزود واتساب طلب الإرسال.",
        { retryable: RETRYABLE_STATUS.has(status), httpStatus: status }
      );
  }

  async acceptedResult(response, providerCode) {
    let body;
    try { body = await response.json(); } catch {
      throw new ProviderError("OPENWA_INVALID_RESPONSE", "أعاد مزود واتساب استجابة غير صالحة.", { retryable: true, httpStatus: response.status, ambiguous: true });
    }
    if (typeof body.messageId !== "string" || body.messageId.length === 0) {
      throw new ProviderError("OPENWA_MISSING_MESSAGE_ID", "لم يعد مزود واتساب معرف الرسالة.", { retryable: true, httpStatus: response.status, ambiguous: true });
    }
    return { providerCode, providerMessageId: body.messageId, acceptedAt: new Date() };
  }

  async resolveSessionId(signal) {
    if (this.resolvedSessionId) return this.resolvedSessionId;

    let response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/api/sessions`, {
        headers: { "x-api-key": this.apiKey },
        signal
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        throw new ProviderError("OPENWA_TIMEOUT", "انتهت مهلة اتصال مزود واتساب.", { retryable: true });
      }
      throw new ProviderError("OPENWA_NETWORK", "تعذر الاتصال بمزود واتساب.", { retryable: true });
    }

    if (!response.ok) {
      throw new ProviderError(
        `OPENWA_HTTP_${response.status}`,
        response.status === 401 || response.status === 403
          ? "رفض مزود واتساب بيانات الاعتماد."
          : "تعذر قراءة جلسات مزود واتساب.",
        { retryable: RETRYABLE_STATUS.has(response.status), httpStatus: response.status }
      );
    }

    let sessions;
    try {
      const body = await response.json();
      sessions = Array.isArray(body) ? body : body?.data;
    } catch {
      sessions = null;
    }
    if (!Array.isArray(sessions)) {
      throw new ProviderError("OPENWA_INVALID_RESPONSE", "أعاد مزود واتساب قائمة جلسات غير صالحة.", {
        retryable: true,
        httpStatus: response.status
      });
    }

    const session = sessions.find(item => item?.id === this.sessionId || item?.name === this.sessionId);
    if (!session || typeof session.id !== "string" || session.id.length === 0) {
      throw new ProviderError("OPENWA_SESSION_NOT_FOUND", "لم يعثر مزود واتساب على جلسة الإرسال المحددة.", {
        retryable: false,
        httpStatus: response.status
      });
    }
    this.resolvedSessionId = session.id;
    return session.id;
  }

  async health() {
    try {
      const resolvedSessionId = await this.resolveSessionId(AbortSignal.timeout(this.timeoutMs));
      const response = await this.fetchImpl(`${this.baseUrl}/api/sessions/${encodeURIComponent(resolvedSessionId)}`, {
        headers: { "x-api-key": this.apiKey },
        signal: AbortSignal.timeout(this.timeoutMs)
      });
      return { healthy: response.ok, status: response.status };
    } catch { return { healthy: false, status: null }; }
  }
}
