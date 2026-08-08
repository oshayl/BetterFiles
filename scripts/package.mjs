#!/usr/bin/env node
/**
 * Packages dist/ as a .ccx for distribution (roadmap section 37).
 *
 * A .ccx is a ZIP archive. Node ships no ZIP writer and this project keeps its
 * dependency surface small, so a minimal writer lives here: local file headers,
 * a central directory and an end-of-central-directory record, with DEFLATE
 * compression via zlib.
 *
 * Runs a production build first, so a .ccx can never accidentally contain a
 * development bundle with logging and inline sourcemaps.
 */
import { deflateRawSync } from 'node:zlib';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const distDir = join(root, 'dist');

// ------------------------------------------------------------- CRC-32 -----

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------------------------------------------------------------- ZIP -----

/**
 * Builds a ZIP archive from `{ name, data }` entries.
 *
 * Timestamps are fixed rather than taken from the clock, so the same input
 * always produces a byte-identical archive.
 */
function buildZip(entries) {
  const DOS_TIME = 0; // 00:00:00
  const DOS_DATE = 0x0021; // 1980-01-01, the ZIP epoch

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });

    // Only use compression when it actually helps.
    const useDeflate = compressed.length < entry.data.length;
    const payload = useDeflate ? compressed : entry.data;
    const method = useDeflate ? 8 : 0;

    const checksum = crc32(entry.data);

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0); // signature
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(method, 8);
    localHeader.writeUInt16LE(DOS_TIME, 10);
    localHeader.writeUInt16LE(DOS_DATE, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(payload.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBytes.length, 26);
    localHeader.writeUInt16LE(0, 28); // extra field length

    localParts.push(localHeader, nameBytes, payload);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0); // signature
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8); // flags
    centralHeader.writeUInt16LE(method, 10);
    centralHeader.writeUInt16LE(DOS_TIME, 12);
    centralHeader.writeUInt16LE(DOS_DATE, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(payload.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBytes.length, 28);
    centralHeader.writeUInt16LE(0, 30); // extra
    centralHeader.writeUInt16LE(0, 32); // comment
    centralHeader.writeUInt16LE(0, 34); // disk number
    centralHeader.writeUInt16LE(0, 36); // internal attributes
    centralHeader.writeUInt32LE(0, 38); // external attributes
    centralHeader.writeUInt32LE(offset, 42); // offset of local header

    centralParts.push(centralHeader, nameBytes);

    offset += localHeader.length + nameBytes.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0); // signature
  endRecord.writeUInt16LE(0, 4); // disk number
  endRecord.writeUInt16LE(0, 6); // central directory start disk
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localParts, centralDirectory, endRecord]);
}

// --------------------------------------------------------------- main -----

async function collectFiles(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectFiles(full)));
    else out.push(full);
  }
  return out;
}

async function main() {
  // Always rebuild: packaging a stale or development dist/ is the single
  // easiest mistake to make here.
  const build = spawnSync(process.execPath, [join(root, 'scripts/build.mjs'), '--production'], {
    stdio: 'inherit',
  });
  if (build.status !== 0) throw new Error('Production build failed');

  if (!existsSync(distDir)) throw new Error('dist/ does not exist after building');

  const manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  const files = await collectFiles(distDir);

  const entries = [];
  for (const file of files) {
    // ZIP entries always use forward slashes, regardless of host platform.
    const name = relative(distDir, file).split(sep).join('/');
    if (name === 'BUILD_INFO.txt') continue;
    entries.push({ name, data: await readFile(file) });
  }

  // manifest.json must be present at the archive root or Photoshop rejects it.
  if (!entries.some((entry) => entry.name === 'manifest.json')) {
    throw new Error('manifest.json is missing from dist/');
  }

  const outputName = `asset-browser-${manifest.version}.ccx`;
  const outputPath = join(root, outputName);
  const archive = buildZip(entries);
  await writeFile(outputPath, archive);

  console.log(`[package] ${entries.length} files -> ${outputName} (${(archive.length / 1024).toFixed(1)} KB)`);
  for (const entry of entries) console.log(`[package]   ${entry.name}`);
}

main().catch((error) => {
  console.error(`[package] failed: ${error.message}`);
  process.exit(1);
});
