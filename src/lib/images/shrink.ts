/**
 * Browser-side photo shrinking before upload (spec §12). Big phone photos are scaled down and re-encoded so the
 * upload stays well under the server's limit; transparency is kept (WebP). iPhone HEIC photos are converted with
 * heic-to, loaded only when the browser can't read HEIC itself. The server still re-encodes everything (sharp).
 */

/** Longest side after shrinking. The server makes the final size (gallery 1600 px, team 800 px). */
export const SHRINK_MAX_SIZE = 2000;
/** Files this small (and already JPEG/PNG/WebP) are sent as they are. */
const SMALL_ENOUGH = 1.5 * 1024 * 1024;
/** What the upload may be at most (the server action limit is 5 MB; Vercel's request limit is 4.5 MB). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

export class UnreadablePhotoError extends Error {
  constructor() {
    super("That file isn't a photo we can read. Please choose a JPEG, PNG, WebP or iPhone (HEIC) photo.");
  }
}

export function isHeicFile(file: { name: string; type: string }): boolean {
  return /^image\/hei[cf]/i.test(file.type) || /\.hei[cf]$/i.test(file.name);
}

/** "6.2 MB", "640 KB" */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Scale (w, h) so the longest side is at most `max`, never enlarging. */
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file: Blob): Promise<ImageBitmap> {
  // "from-image" applies the EXIF rotation so portrait phone photos stay upright.
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

async function toBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await decode(file);
  } catch {
    if (!isHeicFile(file)) throw new UnreadablePhotoError();
  }
  // Safari reads HEIC natively; other browsers get the converter, loaded only now.
  try {
    const { heicTo } = await import("heic-to");
    return await heicTo({ blob: file, type: "bitmap" });
  } catch {
    throw new UnreadablePhotoError();
  }
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

/** WebP (keeps transparency); browsers that can't write WebP (older Safari hands back PNG) get JPEG instead. */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp?.type === "image/webp") return webp;
  return toBlob(canvas, "image/jpeg", quality);
}

export type ShrinkResult = { file: File; before: number; after: number; changed: boolean };

/**
 * A smaller copy of the photo, ready to upload. Small JPEG/PNG/WebP files are returned untouched.
 * Throws UnreadablePhotoError for files that aren't photos.
 */
export async function shrinkPhoto(file: File, maxSize = SHRINK_MAX_SIZE): Promise<ShrinkResult> {
  const before = file.size;
  if (!isHeicFile(file) && /^image\/(jpeg|png|webp)$/.test(file.type) && before <= SMALL_ENOUGH) {
    return { file, before, after: before, changed: false };
  }
  const bitmap = await toBitmap(file);
  try {
    let size = fitWithin(bitmap.width, bitmap.height, maxSize);
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new UnreadablePhotoError();
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      const blob = await encode(canvas, Math.max(0.6, 0.85 - attempt * 0.1));
      if (!blob) throw new UnreadablePhotoError();
      if (blob.size <= MAX_UPLOAD_BYTES) {
        const name = file.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".jpg");
        return { file: new File([blob], name, { type: blob.type }), before, after: blob.size, changed: true };
      }
      size = fitWithin(size.width, size.height, Math.round(Math.max(size.width, size.height) * 0.8));
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Couldn't make the photo small enough. Please try a smaller photo.");
}
