/**
 * Base64 decoding.
 *
 * `imaging.encodeImageData({ base64: true })` returns a base64 string, but
 * thumbnails are written to disk as real binary files so the grid can load them
 * with `<img src="file:...">` instead of holding data URIs in memory. UXP does
 * not guarantee `atob`, so the decoder is implemented here.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Reverse lookup table; -1 marks characters that are not base64 digits. */
const DECODE_TABLE = (() => {
  const table = new Int16Array(256).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i += 1) {
    table[BASE64_ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

/**
 * Decodes base64 into an ArrayBuffer.
 *
 * Tolerates whitespace and missing padding, and accepts the URL-safe alphabet,
 * because the input may have been round-tripped through JSON or a data URI.
 */
export function decodeBase64(input: string): ArrayBuffer {
  // Strip a data-URI prefix if one was passed in by mistake.
  const commaIndex = input.startsWith('data:') ? input.indexOf(',') : -1;
  const payload = commaIndex === -1 ? input : input.slice(commaIndex + 1);

  // Collect digit values, ignoring whitespace, padding and URL-safe variants.
  const values: number[] = [];
  for (let i = 0; i < payload.length; i += 1) {
    const code = payload.charCodeAt(i);
    if (code === 61) break; // '=' padding ends the payload
    const normalized = code === 45 ? 43 : code === 95 ? 47 : code; // '-'->'+', '_'->'/'
    const value = DECODE_TABLE[normalized];
    if (value === undefined || value < 0) continue; // whitespace and newlines
    values.push(value);
  }

  // Every 4 base64 digits produce 3 bytes; a trailing group of 2 or 3 digits
  // produces 1 or 2 bytes respectively.
  const byteLength = Math.floor((values.length * 3) / 4);
  const bytes = new Uint8Array(byteLength);

  let byteIndex = 0;
  for (let i = 0; i + 1 < values.length; i += 4) {
    const v0 = values[i] ?? 0;
    const v1 = values[i + 1] ?? 0;
    const v2 = values[i + 2];
    const v3 = values[i + 3];

    bytes[byteIndex++] = ((v0 << 2) | (v1 >> 4)) & 0xff;
    if (v2 !== undefined && byteIndex < byteLength) {
      bytes[byteIndex++] = ((v1 << 4) | (v2 >> 2)) & 0xff;
    }
    if (v2 !== undefined && v3 !== undefined && byteIndex < byteLength) {
      bytes[byteIndex++] = ((v2 << 6) | v3) & 0xff;
    }
  }

  return bytes.buffer;
}

/** Encodes bytes as base64. Used for diagnostics and tests. */
export function encodeBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i] ?? 0;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }

  return out;
}
