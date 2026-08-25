import { describe, expect, it } from "vitest";

import {
  contentTypeForStoredAttachment,
  detectAllowedUploadMime,
  inspectMultipartRequestSize,
  MAX_MULTIPART_REQUEST_BYTES,
} from "./upload-security";

function uploadFile(bytes: number[], type = "application/octet-stream") {
  return new File([new Uint8Array(bytes)], "untrusted-upload.bin", { type });
}

function writeUInt16LE(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUInt32LE(target: number[], value: number) {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

function docxPackageFile() {
  const encoder = new TextEncoder();
  const entries = ["[Content_Types].xml", "word/document.xml"];
  const bytes: number[] = [];
  const localOffsets: number[] = [];

  for (const entry of entries) {
    const name = [...encoder.encode(entry)];
    localOffsets.push(bytes.length);
    writeUInt32LE(bytes, 0x04034b50);
    writeUInt16LE(bytes, 20);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt32LE(bytes, 0);
    writeUInt32LE(bytes, 0);
    writeUInt32LE(bytes, 0);
    writeUInt16LE(bytes, name.length);
    writeUInt16LE(bytes, 0);
    bytes.push(...name);
  }

  const centralDirectoryOffset = bytes.length;
  for (let index = 0; index < entries.length; index += 1) {
    const name = [...encoder.encode(entries[index])];
    writeUInt32LE(bytes, 0x02014b50);
    writeUInt16LE(bytes, 20);
    writeUInt16LE(bytes, 20);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt32LE(bytes, 0);
    writeUInt32LE(bytes, 0);
    writeUInt32LE(bytes, 0);
    writeUInt16LE(bytes, name.length);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt16LE(bytes, 0);
    writeUInt32LE(bytes, 0);
    writeUInt32LE(bytes, localOffsets[index]);
    bytes.push(...name);
  }
  const centralDirectorySize = bytes.length - centralDirectoryOffset;
  writeUInt32LE(bytes, 0x06054b50);
  writeUInt16LE(bytes, 0);
  writeUInt16LE(bytes, 0);
  writeUInt16LE(bytes, entries.length);
  writeUInt16LE(bytes, entries.length);
  writeUInt32LE(bytes, centralDirectorySize);
  writeUInt32LE(bytes, centralDirectoryOffset);
  writeUInt16LE(bytes, 0);
  return uploadFile(bytes);
}

describe("upload security", () => {
  it("يستنتج نوع الملف من البصمة بدل نوع يرسله المتصفح", async () => {
    await expect(detectAllowedUploadMime(uploadFile([0x25, 0x50, 0x44, 0x46, 0x2d], "text/html"))).resolves.toBe("application/pdf");
    await expect(detectAllowedUploadMime(uploadFile([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).resolves.toBe("image/png");
    await expect(detectAllowedUploadMime(uploadFile([0xff, 0xd8, 0xff, 0xe0]))).resolves.toBe("image/jpeg");
    await expect(detectAllowedUploadMime(docxPackageFile())).resolves.toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    await expect(detectAllowedUploadMime(uploadFile([0x50, 0x4b, 0x03, 0x04]))).resolves.toBeNull();
    await expect(detectAllowedUploadMime(uploadFile([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).resolves.toBeNull();
  });

  it("يرفض Content-Length الكبير قبل محاولة قراءة formData", async () => {
    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-length": String(MAX_MULTIPART_REQUEST_BYTES + 1) },
      body: "small body",
    });

    await expect(inspectMultipartRequestSize(request)).resolves.toBe("too_large");
  });

  it("لا يثق في Content-Length المصغّر ويعد جسم الطلب الفعلي", async () => {
    const oversizedChunk = new Uint8Array(MAX_MULTIPART_REQUEST_BYTES + 1);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversizedChunk);
        controller.close();
      },
    });
    const request = new Request("http://localhost/upload", {
      method: "POST",
      headers: { "content-length": "1" },
      body: stream,
      // Node's Fetch implementation requires this for streaming request data.
      duplex: "half",
    } as RequestInit);

    await expect(inspectMultipartRequestSize(request)).resolves.toBe("too_large");
  });

  it("يعيد نوع تنزيل محافظًا من الامتداد المولّد في الخادم", () => {
    expect(contentTypeForStoredAttachment("topic/uuid.pdf")).toBe("application/pdf");
    expect(contentTypeForStoredAttachment("topic/uuid.docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(contentTypeForStoredAttachment("topic/untrusted.html")).toBe("application/octet-stream");
  });
});
