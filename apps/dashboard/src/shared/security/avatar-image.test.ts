import { expect, it } from "vitest";
import sharp from "sharp";
import { normalizeAvatar } from "./avatar-image";

it("decodes and resizes genuine PNG without retaining original metadata", async () => {
  const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "red" } }).png().toBuffer();
  const result = await normalizeAvatar(new File([new Uint8Array(png)], "photo.png"));
  const meta = await sharp(result).metadata();
  expect(meta).toMatchObject({ format: "jpeg", width: 512, height: 512 });
  expect(meta.exif).toBeUndefined();
});
it("rejects SVG, forged signatures, empty files and oversized input", async () => {
  for (const file of [new File(["<svg/>"], "photo.png"), new File([new Uint8Array([255,216,255,0])], "fake.jpg"), new File([], "empty.jpg"), new File([new Uint8Array(2*1024*1024+1)], "large.jpg")]) {
    await expect(normalizeAvatar(file)).rejects.toThrow();
  }
});
