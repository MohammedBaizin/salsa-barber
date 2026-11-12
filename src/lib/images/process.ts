/**
 * Server-side photo processing (spec §12): upright (EXIF rotation applied), metadata removed (location etc.),
 * re-encoded as WebP, longest side ≤ maxSize, file ≤ 2 MB (lower quality first, then smaller size).
 * No "server-only" import so scripts can use it; sharp never reaches the browser bundle.
 */
import sharp, { type Metadata } from "sharp";

export const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
export const PHOTO_MAX_SIZE = { gallery: 1600, team: 800 } as const;

export type ProcessedPhoto = { buffer: Buffer; width: number; height: number; bytes: number };

export class NotAnImageError extends Error {
  constructor() {
    super("That file isn't a photo we can read. Please choose a JPEG, PNG, WebP or HEIC photo.");
  }
}

export async function processPhoto(input: Buffer | Uint8Array, maxSize: number = PHOTO_MAX_SIZE.gallery): Promise<ProcessedPhoto> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "error" }).metadata();
  } catch {
    throw new NotAnImageError();
  }
  if (!meta.format || !meta.width || !meta.height || !["jpeg", "png", "webp", "heif", "avif", "gif", "tiff"].includes(meta.format)) {
    throw new NotAnImageError();
  }

  let size = maxSize;
  for (let attempt = 0; attempt < 12; attempt++) {
    const quality = Math.max(50, 82 - attempt * 8);
    const { data, info } = await sharp(input, { failOn: "error" })
      .rotate() // apply EXIF orientation, then metadata is dropped (sharp's default)
      .resize({ width: size, height: size, fit: "inside", withoutEnlargement: true })
      .webp({ quality, effort: 5 })
      .toBuffer({ resolveWithObject: true });
    if (data.length <= MAX_PHOTO_BYTES) return { buffer: data, width: info.width, height: info.height, bytes: data.length };
    if (quality <= 50) size = Math.round(size * 0.85);
  }
  throw new Error("Couldn't make the photo small enough. Please try a smaller photo.");
}
