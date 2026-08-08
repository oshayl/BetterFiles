#!/usr/bin/env node
/**
 * Generates the plugin icons.
 *
 * UXP has no HTML5 Canvas and this repo has no image toolchain, so the PNGs are
 * encoded here by hand (zlib + CRC32). Keeping it as a script rather than a
 * committed binary means the mark stays reproducible and reviewable.
 *
 * The mark: a 2x2 arrangement of squares - an asset grid - in white on
 * transparent, matching the monochrome thin-line iconography of section 8.6.
 */
import { deflateSync } from 'node:zlib';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const iconDir = join(root, 'assets/icons');

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** Encodes RGBA pixel data as a PNG. */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // Each scanline is prefixed with a filter byte (0 = none).
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * Draws the asset-grid mark at an arbitrary size. Proportions are expressed as
 * fractions so the 1x and 2x renders are identical apart from resolution.
 */
function drawIcon(size) {
  const rgba = Buffer.alloc(size * size * 4, 0);

  const inset = Math.round(size * 0.125);
  const gap = Math.max(1, Math.round(size * 0.083));
  const cell = Math.floor((size - inset * 2 - gap) / 2);
  const stroke = Math.max(1, Math.round(size / 16));

  const setPixel = (x, y) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    rgba[offset] = 255;
    rgba[offset + 1] = 255;
    rgba[offset + 2] = 255;
    rgba[offset + 3] = 255;
  };

  // Square outlines, square line caps, no interior detail (section 8.6).
  const drawSquareOutline = (originX, originY) => {
    for (let y = 0; y < cell; y += 1) {
      for (let x = 0; x < cell; x += 1) {
        const onEdge = x < stroke || y < stroke || x >= cell - stroke || y >= cell - stroke;
        if (onEdge) setPixel(originX + x, originY + y);
      }
    }
  };

  for (const [column, row] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    drawSquareOutline(inset + column * (cell + gap), inset + row * (cell + gap));
  }

  return encodePng(size, size, rgba);
}

async function main() {
  await mkdir(iconDir, { recursive: true });

  /*
   * For `"scale": [1, 2]` UXP does NOT use the literal path from the manifest -
   * it derives a per-scale filename by appending @1x / @2x to the basename.
   * Photoshop logs "Scaled Icon : ...@1x.png not found" when only the bare name
   * exists, so both variants must be written. The bare name is kept as well,
   * for any context that resolves the manifest path directly.
   */
  await writeFile(join(iconDir, 'plugin-icon-24.png'), drawIcon(24));
  await writeFile(join(iconDir, 'plugin-icon-24@1x.png'), drawIcon(24));
  await writeFile(join(iconDir, 'plugin-icon-24@2x.png'), drawIcon(48));

  console.log('[icons] wrote plugin-icon-24.png, @1x and @2x');
}

main().catch((error) => {
  console.error(`[icons] failed: ${error.message}`);
  process.exit(1);
});
