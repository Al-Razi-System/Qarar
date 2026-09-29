import { describe, expect, it } from "vitest";
import { readUploadResponse } from "./upload-response";

describe("readUploadResponse", () => {
  it("returns upload data from a valid JSON response", async () => {
    const response = Response.json({ data: { id: "attachment-1" } });
    await expect(readUploadResponse<{ id: string }>(response)).resolves.toEqual({ id: "attachment-1" });
  });

  it("maps an HTML 413 response to a clear Arabic error", async () => {
    const response = new Response("<html><h1>413 Request Entity Too Large</h1></html>", {
      status: 413,
      headers: { "content-type": "text/html" },
    });
    await expect(readUploadResponse(response)).rejects.toThrow("حجم الملف يتجاوز الحد المسموح وهو 25 ميجابايت.");
  });

  it("preserves an API JSON error message", async () => {
    const response = Response.json({ error: { message: "رُفض الملف لأسباب أمنية." } }, { status: 422 });
    await expect(readUploadResponse(response)).rejects.toThrow("رُفض الملف لأسباب أمنية.");
  });
});
