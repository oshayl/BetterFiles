import { describe, expect, it } from 'vitest';
import { decodeBase64, encodeBase64 } from '../../src/utils/base64';

/** The checkerboard PNG embedded in global.css - a real payload to decode. */
const CHECKER_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGOQkJAQFhZmEBYWlpCQAAAHHAEDo1EljQAAAABJRU5ErkJggg==';

function bytes(buffer: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buffer));
}

describe('decodeBase64', () => {
  it('decodes ASCII correctly', () => {
    expect(new TextDecoder().decode(decodeBase64('SGVsbG8gd29ybGQ='))).toBe('Hello world');
  });

  it('decodes each padding length correctly', () => {
    // 3 bytes -> no padding, 2 -> one '=', 1 -> two '='.
    expect(bytes(decodeBase64('AAAA'))).toEqual([0, 0, 0]);
    expect(bytes(decodeBase64('AAA='))).toEqual([0, 0]);
    expect(bytes(decodeBase64('AA=='))).toEqual([0]);
  });

  it('decodes a real PNG byte-for-byte, matching Node', () => {
    const buffer = decodeBase64(CHECKER_PNG_BASE64);

    // 108 base64 chars -> 81 bytes, less 2 for the '==' padding.
    expect(buffer.byteLength).toBe(79);
    expect(bytes(buffer).slice(0, 8)).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    expect(bytes(buffer)).toEqual(
      Array.from(Buffer.from(CHECKER_PNG_BASE64, 'base64')),
    );
  });

  it('tolerates whitespace and newlines from wrapped payloads', () => {
    expect(new TextDecoder().decode(decodeBase64('SGVs\nbG8g\td29y bGQ='))).toBe('Hello world');
  });

  it('accepts the URL-safe alphabet', () => {
    const standard = decodeBase64('++//');
    const urlSafe = decodeBase64('--__');
    expect(bytes(urlSafe)).toEqual(bytes(standard));
  });

  it('strips a data-URI prefix if one is passed by mistake', () => {
    const withPrefix = decodeBase64(`data:image/png;base64,${CHECKER_PNG_BASE64}`);
    expect(bytes(withPrefix)).toEqual(bytes(decodeBase64(CHECKER_PNG_BASE64)));
  });

  it('tolerates missing padding', () => {
    expect(new TextDecoder().decode(decodeBase64('SGVsbG8gd29ybGQ'))).toBe('Hello world');
  });

  it('returns an empty buffer for empty input', () => {
    expect(decodeBase64('').byteLength).toBe(0);
  });
});

describe('encodeBase64', () => {
  it('round-trips arbitrary bytes', () => {
    const original = new Uint8Array(512);
    for (let i = 0; i < original.length; i += 1) original[i] = (i * 7) % 256;

    expect(bytes(decodeBase64(encodeBase64(original.buffer)))).toEqual(Array.from(original));
  });

  it('matches Node for a known value', () => {
    const buffer = new TextEncoder().encode('Hello world').buffer;
    expect(encodeBase64(buffer)).toBe(Buffer.from('Hello world').toString('base64'));
  });

  it('pads correctly for every input length modulo 3', () => {
    for (const text of ['a', 'ab', 'abc', 'abcd']) {
      const buffer = new TextEncoder().encode(text).buffer;
      expect(encodeBase64(buffer)).toBe(Buffer.from(text).toString('base64'));
    }
  });
});
