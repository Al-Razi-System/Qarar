import { NextResponse } from "next/server";

export const MAX_ADMIN_JSON_BYTES = 1024 * 1024;

export type JsonObject = Record<string, unknown>;

export type JsonObjectReadResult =
  | { ok: true; value: JsonObject }
  | { ok: false; response: NextResponse };

type JsonBodyOptions = {
  maxBytes?: number;
};

class JsonBodyReadError extends Error {
  constructor(readonly code: "INVALID_JSON_BODY" | "PAYLOAD_TOO_LARGE") {
    super(code);
  }
}

function inputError(
  status: 400 | 413,
  code: "INVALID_JSON_BODY" | "PAYLOAD_TOO_LARGE",
  message: string,
) {
  return NextResponse.json(
    {
      message,
      error: { code, message },
    },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

function declaredLengthExceedsLimit(request: Request, maxBytes: number) {
  const header = request.headers.get("content-length")?.trim();
  if (!header || !/^\d+$/.test(header)) return false;

  const declaredLength = Number(header);
  return !Number.isFinite(declaredLength) || declaredLength > maxBytes;
}

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readBodyWithinLimit(request: Request, maxBytes: number) {
  if (declaredLengthExceedsLimit(request, maxBytes)) {
    throw new JsonBodyReadError("PAYLOAD_TOO_LARGE");
  }

  if (!request.body) {
    throw new JsonBodyReadError("INVALID_JSON_BODY");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new JsonBodyReadError("PAYLOAD_TOO_LARGE");
      }

      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof JsonBodyReadError) throw error;

    await reader.cancel().catch(() => undefined);
    throw new JsonBodyReadError("INVALID_JSON_BODY");
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new JsonBodyReadError("INVALID_JSON_BODY");
  }
}

/**
 * Reads a JSON request body without trusting Content-Length alone. The stream
 * is counted while it is consumed, so chunked requests receive the same hard
 * limit as requests with a declared length.
 */
export async function readJsonObject(
  request: Request,
  { maxBytes = MAX_ADMIN_JSON_BYTES }: JsonBodyOptions = {},
): Promise<JsonObjectReadResult> {
  const safeMaxBytes = Number.isSafeInteger(maxBytes) && maxBytes > 0
    ? maxBytes
    : MAX_ADMIN_JSON_BYTES;

  try {
    const raw = await readBodyWithinLimit(request, safeMaxBytes);
    const value: unknown = JSON.parse(raw);

    if (!isJsonObject(value)) {
      throw new JsonBodyReadError("INVALID_JSON_BODY");
    }

    return { ok: true, value: value as JsonObject };
  } catch (error) {
    if (error instanceof JsonBodyReadError && error.code === "PAYLOAD_TOO_LARGE") {
      return {
        ok: false,
        response: inputError(
          413,
          "PAYLOAD_TOO_LARGE",
          "حجم بيانات الطلب يتجاوز الحد المسموح به.",
        ),
      };
    }

    return {
      ok: false,
      response: inputError(
        400,
        "INVALID_JSON_BODY",
        "يجب أن يحتوي الطلب على كائن JSON صالح.",
      ),
    };
  }
}
