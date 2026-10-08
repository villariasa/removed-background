// Untrusted-file handling: magic-byte validation, size/dimension caps,
// decompression-bomb rejection, safe decode, filename sanitization. Plan §12.3.

export const MAX_BYTES = 15 * 1024 * 1024; // ~15 MB
export const MAX_PIXELS = 40_000_000; // ~40 MP — reject decompression bombs

export class ImageError extends Error {}

const SIGNATURES: { mime: string; test: (b: Uint8Array) => boolean }[] = [
  { mime: "image/png", test: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { mime: "image/jpeg", test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: "image/webp",
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  // GIF (static) — accept but decode first frame only
  { mime: "image/gif", test: (b) => b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 },
  // BMP
  { mime: "image/bmp", test: (b) => b[0] === 0x42 && b[1] === 0x4d },
];

/** Verify the file really is an image by its magic bytes (never trust the ext). */
async function sniffMime(file: Blob): Promise<string | null> {
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  for (const sig of SIGNATURES) if (sig.test(head)) return sig.mime;
  return null;
}

export interface DecodedImage {
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

/** Validate then decode an untrusted file into an ImageBitmap. Throws ImageError. */
export async function validateAndDecode(file: Blob): Promise<DecodedImage> {
  if (file.size === 0) throw new ImageError("The file is empty.");
  if (file.size > MAX_BYTES)
    throw new ImageError(
      `Image is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max is 15 MB.`,
    );

  const mime = await sniffMime(file);
  if (!mime)
    throw new ImageError("Unsupported or corrupt file. Use PNG, JPEG, WebP, GIF, or BMP.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageError("Could not decode this image. It may be corrupt.");
  }

  const pixels = bitmap.width * bitmap.height;
  if (pixels > MAX_PIXELS) {
    bitmap.close();
    throw new ImageError(
      `Image is too large (${bitmap.width}×${bitmap.height}). Max is ${Math.round(
        MAX_PIXELS / 1_000_000,
      )} megapixels.`,
    );
  }
  if (bitmap.width < 1 || bitmap.height < 1) {
    bitmap.close();
    throw new ImageError("Image has invalid dimensions.");
  }

  return { bitmap, width: bitmap.width, height: bitmap.height };
}

/** Strip path separators and control/HTML chars from a download filename. */
export function sanitizeFilename(name: string, fallback = "image"): string {
  const base = (name || fallback)
    .replace(/\.[^.]+$/, "") // drop extension
    .replace(/[\\/]+/g, "-") // path separators
    .replace(/[\x00-\x1f<>:"|?*]+/g, "") // control + reserved + HTML-ish
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return base || fallback;
}

/** Draw a bitmap into fresh ImageData (also re-encodes away any EXIF). */
export function bitmapToImageData(bitmap: ImageBitmap): ImageData {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0);
  return ctx.getImageData(0, 0, bitmap.width, bitmap.height);
}
