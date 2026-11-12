#!/usr/bin/env node
/**
 * npm run assets:logo
 *
 * Generates every logo size from the untouched originals in assets/:
 *   assets/logo-original.png      round "Salsa" badge (light artwork, transparent background)
 *   assets/wordmark-original.png  "SALSA ★★★★★ Barber" wordmark (white + yellow, transparent background)
 *
 * The originals are never modified. Outputs go to public/brand/ and src/app/ (Next.js icon conventions).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const BADGE = path.join(root, "assets/logo-original.png");
const WORDMARK = path.join(root, "assets/wordmark-original.png");
const OUT = path.join(root, "public/brand");
const APP = path.join(root, "src/app");

const INK = { r: 0x14, g: 0x12, b: 0x10 }; // dark theme background
const INK_HEX = "#141210";
const LIGHT_INK = { r: 0x1c, g: 0x19, b: 0x17 }; // light theme text colour

await mkdir(OUT, { recursive: true });

/** Badge trimmed to its circle. */
const badge = await sharp(BADGE).trim({ threshold: 10 }).png().toBuffer();
const badgeMeta = await sharp(badge).metadata();

/** Badge sitting on an ink disc, readable on light and dark pages. */
async function badgeOnDisc(size) {
  const inner = Math.round(size * 0.92);
  const disc = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${INK_HEX}"/></svg>`,
  );
  const art = await sharp(badge).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp(disc).composite([{ input: art, gravity: "center" }]).png().toBuffer();
}

/** Badge centred on a full-bleed ink square (app icons; safe zone for maskable). */
async function badgeOnSquare(size, artRatio) {
  const inner = Math.round(size * artRatio);
  const art = await sharp(badge).resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { ...INK, alpha: 1 } } })
    .composite([{ input: art, gravity: "center" }])
    .png()
    .toBuffer();
}

/** Wordmark recoloured for light backgrounds: near-white pixels become ink, yellow stays. */
async function wordmarkForLight(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    const isWhitish = r > 200 && g > 200 && b > 200;
    if (isWhitish) {
      data[i] = LIGHT_INK.r;
      data[i + 1] = LIGHT_INK.g;
      data[i + 2] = LIGHT_INK.b;
    }
  }
  return sharp(data, { raw: info }).png().toBuffer();
}

const written = [];
async function save(file, buffer) {
  await writeFile(file, buffer);
  written.push(`${path.relative(root, file)}  ${(buffer.length / 1024).toFixed(1)} KB`);
}

// Badge (transparent) and badge on disc
for (const w of [160, 320, 640]) {
  await save(path.join(OUT, `badge-${w}.webp`), await sharp(badge).resize(w, w, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88 }).toBuffer());
  await save(path.join(OUT, `badge-disc-${w}.webp`), await sharp(await badgeOnDisc(w)).webp({ quality: 88 }).toBuffer());
}
await save(path.join(OUT, "badge-disc-512.png"), await badgeOnDisc(512));

// Wordmark: trimmed, two colourways
const wordmark = await sharp(WORDMARK).trim({ threshold: 10 }).png().toBuffer();
const wordmarkLight = await wordmarkForLight(wordmark);
for (const w of [480, 960]) {
  await save(path.join(OUT, `wordmark-on-dark-${w}.webp`), await sharp(wordmark).resize({ width: w }).webp({ quality: 90 }).toBuffer());
  await save(path.join(OUT, `wordmark-on-light-${w}.webp`), await sharp(wordmarkLight).resize({ width: w }).webp({ quality: 90 }).toBuffer());
}
const wmMeta = await sharp(wordmark).metadata();

// App icons (dashboard manifest) and Next.js file-convention icons
await save(path.join(OUT, "icon-192.png"), await badgeOnSquare(192, 0.86));
await save(path.join(OUT, "icon-512.png"), await badgeOnSquare(512, 0.86));
await save(path.join(OUT, "icon-maskable-512.png"), await badgeOnSquare(512, 0.7));
await save(path.join(APP, "icon.png"), await sharp(await badgeOnDisc(96)).png({ compressionLevel: 9 }).toBuffer());
await save(path.join(APP, "apple-icon.png"), await badgeOnSquare(180, 0.84));

// favicon.ico: a single 48px PNG wrapped in an ICO container (valid since Windows Vista, all modern browsers)
{
  const png = await sharp(await badgeOnDisc(48)).png({ compressionLevel: 9 }).toBuffer();
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  const entry = Buffer.alloc(16);
  entry.writeUInt8(48, 0);
  entry.writeUInt8(48, 1);
  entry.writeUInt8(0, 2);
  entry.writeUInt8(0, 3);
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(6 + 16, 12);
  await save(path.join(APP, "favicon.ico"), Buffer.concat([header, entry, png]));
}

// Open Graph image 1200x630: ink background, badge left, wordmark right, stripe along the bottom
{
  const W = 1200;
  const H = 630;
  const badgeArt = await sharp(badge).resize(380, 380, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).toBuffer();
  const wmWidth = 600;
  const wmArt = await sharp(wordmark).resize({ width: wmWidth }).toBuffer();
  const wmHeight = Math.round((wmMeta.height / wmMeta.width) * wmWidth);
  const stripe = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="18"><defs><pattern id="p" width="56" height="18" patternUnits="userSpaceOnUse" patternTransform="skewX(-45)"><rect width="14" height="18" fill="#d7263d"/><rect x="14" width="14" height="18" fill="#f6efe4"/><rect x="28" width="14" height="18" fill="#0b7bd6"/><rect x="42" width="14" height="18" fill="#f6efe4"/></pattern></defs><rect width="${W}" height="18" fill="url(#p)"/></svg>`,
  );
  const og = await sharp({ create: { width: W, height: H, channels: 4, background: { ...INK, alpha: 1 } } })
    .composite([
      { input: badgeArt, left: 90, top: Math.round((H - 18 - 380) / 2) },
      { input: wmArt, left: 520, top: Math.round((H - 18 - wmHeight) / 2) },
      { input: stripe, left: 0, top: H - 18 },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer();
  await save(path.join(APP, "opengraph-image.png"), og);
  await writeFile(path.join(APP, "opengraph-image.alt.txt"), "Salsa Barber logo");
}

console.log(`Badge source ${badgeMeta.width}x${badgeMeta.height}, wordmark ${wmMeta.width}x${wmMeta.height}`);
console.log(written.join("\n"));
