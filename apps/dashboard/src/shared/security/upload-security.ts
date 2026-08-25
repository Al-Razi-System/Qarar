export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
// Multipart boundaries and the small metadata fields are included in the
// request body, so leave a bounded overhead without relaxing the file limit.
export const MAX_MULTIPART_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

export type AllowedUploadMime =
  | "application/pdf"
  | "image/png"
  | "image/jpeg"
  | "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const docxMime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document" as const;

export function extensionForUploadMime(mimeType: AllowedUploadMime): string {
  switch (mimeType) {
    case "application/pdf":
      return ".pdf";
    case "image/png":
      return ".png";
    case "image/jpeg":
      return ".jpg";
    case docxMime:
      return ".docx";
  }
}

export function contentTypeForStoredAttachment(path: string): string {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  switch (extension) {
    case ".pdf":
      return "application/pdf";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".docx":
      return docxMime;
    default:
      return "application/octet-stream";
  }
}

function beginsWith(bytes: Uint8Array, signature: number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

function readUInt16LE(bytes: Uint8Array, offset: number) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUInt32LE(bytes: Uint8Array, offset: number) {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

/**
 * A DOCX is a ZIP package, but a ZIP signature alone is not enough: it would
 * accept any archive renamed as a document. Verify the central directory and
 * the two mandatory OpenXML members before accepting it. ZIP64/multi-disk
 * packages are rejected rather than parsed partially.
 */
async function isDocxPackage(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const minimumEndOfCentralDirectory = 22;
  if (bytes.length < minimumEndOfCentralDirectory) return false;

  let endOfCentralDirectory = -1;
  const start = Math.max(0, bytes.length - minimumEndOfCentralDirectory - 0xffff);
  for (let offset = bytes.length - minimumEndOfCentralDirectory; offset >= start; offset -= 1) {
    if (readUInt32LE(bytes, offset) === 0x06054b50) {
      endOfCentralDirectory = offset;
      break;
    }
  }
  if (endOfCentralDirectory < 0) return false;

  const diskNumber = readUInt16LE(bytes, endOfCentralDirectory + 4);
  const centralDirectoryDisk = readUInt16LE(bytes, endOfCentralDirectory + 6);
  const entries = readUInt16LE(bytes, endOfCentralDirectory + 10);
  const centralDirectorySize = readUInt32LE(bytes, endOfCentralDirectory + 12);
  const centralDirectoryOffset = readUInt32LE(bytes, endOfCentralDirectory + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;
  if (
    diskNumber !== 0
    || centralDirectoryDisk !== 0
    || entries === 0xffff
    || centralDirectoryOffset === 0xffffffff
    || centralDirectorySize === 0xffffffff
    || centralDirectoryOffset > bytes.length
    || centralDirectoryEnd > bytes.length
  ) {
    return false;
  }

  const requiredEntries = new Set(["[Content_Types].xml", "word/document.xml"]);
  const decoder = new TextDecoder("utf-8", { fatal: false });
  let offset = centralDirectoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (offset + 46 > centralDirectoryEnd || readUInt32LE(bytes, offset) !== 0x02014b50) return false;

    const nameLength = readUInt16LE(bytes, offset + 28);
    const extraLength = readUInt16LE(bytes, offset + 30);
    const commentLength = readUInt16LE(bytes, offset + 32);
    const localHeaderOffset = readUInt32LE(bytes, offset + 42);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (nextOffset > centralDirectoryEnd || localHeaderOffset + 4 > bytes.length) return false;
    if (readUInt32LE(bytes, localHeaderOffset) !== 0x04034b50) return false;

    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    requiredEntries.delete(name);
    offset = nextOffset;
  }

  return offset === centralDirectoryEnd && requiredEntries.size === 0;
}

/**
 * Detects the type from content instead of the browser-controlled MIME field.
 * DOCX files are OpenXML ZIP containers, so the ZIP central directory is
 * checked for required OpenXML package members as well as the file signature.
 */
export async function detectAllowedUploadMime(
  file: File,
): Promise<AllowedUploadMime | null> {
  const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  if (beginsWith(header, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (beginsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (beginsWith(header, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (
    beginsWith(header, [0x50, 0x4b, 0x03, 0x04]) ||
    beginsWith(header, [0x50, 0x4b, 0x05, 0x06]) ||
    beginsWith(header, [0x50, 0x4b, 0x07, 0x08])
  ) {
    return (await isDocxPackage(file)) ? docxMime : null;
  }
  return null;
}

export type RequestSizeCheck =
  | "ok"
  | "invalid_content_length"
  | "invalid_body"
  | "too_large";

/**
 * Applies the declared Content-Length check before formData parsing and then
 * counts the cloned request stream as a defense against a missing or forged
 * header. The original request remains available for formData().
 */
export async function inspectMultipartRequestSize(
  request: Request,
): Promise<RequestSizeCheck> {
  const rawContentLength = request.headers.get("content-length");
  if (rawContentLength !== null) {
    if (!/^\d+$/.test(rawContentLength)) return "invalid_content_length";
    const declaredLength = Number(rawContentLength);
    if (!Number.isSafeInteger(declaredLength)) return "invalid_content_length";
    if (declaredLength > MAX_MULTIPART_REQUEST_BYTES) return "too_large";
  }

  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const clonedBody = request.clone().body;
    if (!clonedBody) return "ok";

    reader = clonedBody.getReader();
    let receivedBytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) return "ok";
      receivedBytes += value.byteLength;
      if (receivedBytes > MAX_MULTIPART_REQUEST_BYTES) {
        await reader.cancel();
        return "too_large";
      }
    }
  } catch {
    return "invalid_body";
  } finally {
    reader?.releaseLock();
  }
}
