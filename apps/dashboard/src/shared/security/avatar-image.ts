import sharp from "sharp";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
export async function normalizeAvatar(file: File): Promise<Buffer> {
  if (!file.size || file.size > MAX_AVATAR_BYTES) throw new Error("اختر صورة لا يتجاوز حجمها 2 ميجابايت.");
  const bytes = Buffer.from(await file.arrayBuffer());
  const isPng = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const isJpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (!isPng && !isJpeg) throw new Error("اختر صورة PNG أو JPEG أصلية.");
  try {
    const image = sharp(bytes, { limitInputPixels: 16_000_000, failOn: "warning" });
    const meta = await image.metadata();
    if (!meta.width || !meta.height || (meta.pages ?? 1) > 1 || !["jpeg", "png"].includes(meta.format ?? "")) throw new Error("invalid image");
    const output = await image.rotate().resize(512, 512, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
    if (output.length > 512 * 1024) throw new Error("oversize thumbnail");
    return output;
  } catch { throw new Error("تعذر قراءة الصورة. اختر صورة سليمة بأبعاد لا تتجاوز 16 مليون بكسل."); }
}
