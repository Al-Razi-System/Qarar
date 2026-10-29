export class ProviderError extends Error {
  constructor(code, message, { retryable = false, httpStatus = null, ambiguous = false } = {}) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
    this.retryable = retryable;
    this.httpStatus = httpStatus;
    this.ambiguous = ambiguous;
  }
}

export function assertProviderRequest(request) {
  if (!request || typeof request !== "object") throw new TypeError("provider request is required");
  if (!/^[0-9]{8,15}$/.test(request.destinationDigits ?? "")) throw new TypeError("destination must contain 8 to 15 digits");
  if (typeof request.text !== "string" || request.text.length < 1 || request.text.length > 4096) throw new TypeError("message text must contain 1 to 4096 characters");
  if (!/^[0-9a-f-]{36}$/i.test(request.deliveryId ?? "")) throw new TypeError("delivery id must be a UUID");
  if (request.media !== undefined) {
    if (!request.media || typeof request.media !== "object") throw new TypeError("media must be an object");
    if (typeof request.media.base64 !== "string" || request.media.base64.length < 1) throw new TypeError("media base64 is required");
    if (request.media.mimetype !== "image/png") throw new TypeError("only PNG invitation media is supported");
    if (typeof request.media.filename !== "string" || !request.media.filename.endsWith(".png")) throw new TypeError("media filename must be a PNG file");
  }
}
