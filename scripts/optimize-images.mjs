#!/usr/bin/env node
/**
 * Re-encode the bundled photo assets to WebP.
 *
 * PNG/JPG photos dominated the landing page weight (background.png alone was
 * ~2.1 MB, and the hero loads five of them). Run whenever an asset changes:
 *
 *   node scripts/optimize-images.mjs
 *
 * Writes `<name>.webp` next to each source and prints before/after sizes.
 * Import the .webp files in code; the sources can then be deleted.
 */
import { rm, stat, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const DIR = fileURLToPath(new URL("../src/assets/", import.meta.url));
const SOURCES = [
  "background.png",
  "background2.jpg",
  "2.jpg",
  "3.jpg",
  "4.jpg",
  "5.jpg",
  "Hotellogo.png",
  "logocctc.png",
];

// Hero/background photos never need more than a laptop-width image.
const MAX_WIDTH = 1600;
const KB = (n) => `${(n / 1024).toFixed(0)} KB`;

for (const name of SOURCES) {
  const input = join(DIR, name);
  const output = join(DIR, basename(name).replace(/\.(png|jpe?g)$/i, ".webp"));

  const before = (await stat(input)).size;
  const buffer = await sharp(input)
    .resize({ width: MAX_WIDTH, withoutEnlargement: true })
    // Keep logos (with alpha) a touch sharper than photos.
    .webp({ quality: name.endsWith(".png") ? 90 : 76 })
    .toBuffer();

  // Never ship a "optimised" file that is bigger than the source.
  if (buffer.length >= before) {
    await rm(output, { force: true });
    console.log(`${name.padEnd(18)} ${KB(before).padStart(8)} → kept original (webp was larger)`);
    continue;
  }

  await writeFile(output, buffer);
  console.log(`${name.padEnd(18)} ${KB(before).padStart(8)} → ${KB(buffer.length).padStart(8)}`);
}
