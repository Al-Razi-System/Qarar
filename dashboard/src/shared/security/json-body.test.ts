import { describe, expect, it } from "vitest";

import { MAX_ADMIN_JSON_BYTES, readJsonObject } from "./json-body";

function jsonRequest(body: string, headers?: HeadersInit) {
  return new Request("http://localhost/api/admin/test", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
}

describe("readJsonObject", () => {
  it("يقبل كائن JSON صالحًا", async () => {
    const result = await readJsonObject(jsonRequest('{"action":"create"}'));

    expect(result).toEqual({ ok: true, value: { action: "create" } });
  });

  it.each(["[]", "null", '"string"', "{"]) (
    "يرفض جسماً ليس كائن JSON صالحًا: %s",
    async (body) => {
      const result = await readJsonObject(jsonRequest(body));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.response.status).toBe(400);
        await expect(result.response.json()).resolves.toMatchObject({
          error: { code: "INVALID_JSON_BODY" },
        });
      }
    },
  );

  it("يرفض Content-Length المعلن الكبير قبل التحليل", async () => {
    const result = await readJsonObject(
      jsonRequest("{}", { "Content-Length": String(MAX_ADMIN_JSON_BYTES + 1) }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
      await expect(result.response.json()).resolves.toMatchObject({
        error: { code: "PAYLOAD_TOO_LARGE" },
      });
    }
  });

  it("يحسب حجم البث الفعلي حتى لو كان Content-Length أقل من الحقيقة", async () => {
    const oversizedBody = JSON.stringify({ payload: "x".repeat(MAX_ADMIN_JSON_BYTES) });
    const result = await readJsonObject(
      jsonRequest(oversizedBody, { "Content-Length": "2" }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(413);
    }
  });
});
