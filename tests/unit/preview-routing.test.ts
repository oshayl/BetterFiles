import { describe, expect, it } from 'vitest';
import { needsGeneratedPreview, rendersDirectly } from '../../src/models/asset';

const MB = 1024 * 1024;
/** The shipped default. */
const MAX_DIRECT = 2 * MB;

/*
 * The incident this exists for: a brush pack of 40 full-resolution PNGs,
 * 711 MB on disk, up to 40 MB each. Every one was handed straight to an <img>
 * to draw a 72px tile. `<img>` cannot decode at reduced resolution, so each
 * decoded in full and Photoshop reached 7.3 GB resident.
 */
describe('needsGeneratedPreview', () => {
  it('keeps ordinary web-sized artwork on the direct path', () => {
    expect(needsGeneratedPreview('raster', 200 * 1024, MAX_DIRECT)).toBe(false);
    expect(needsGeneratedPreview('raster', MAX_DIRECT, MAX_DIRECT)).toBe(false);
  });

  it('routes a full-resolution export through the cache', () => {
    // 34.png from the pack that caused this.
    expect(needsGeneratedPreview('raster', 39_719_281, MAX_DIRECT)).toBe(true);
    expect(needsGeneratedPreview('raster', MAX_DIRECT + 1, MAX_DIRECT)).toBe(true);
  });

  it('still always generates for formats an <img> cannot decode', () => {
    for (const type of ['photoshop', 'pdf', 'illustrator', 'eps'] as const) {
      expect(needsGeneratedPreview(type, 1024, MAX_DIRECT), type).toBe(true);
    }
  });

  it('exempts SVG whatever its size', () => {
    // Its cost is rasterisation complexity, not bytes, and the files are tiny.
    expect(needsGeneratedPreview('svg', 50 * MB, MAX_DIRECT)).toBe(false);
  });

  it('treats unreadable metadata as small rather than stalling Photoshop', () => {
    // buildAssetRecord defaults an unreadable size to 0.
    expect(needsGeneratedPreview('raster', 0, MAX_DIRECT)).toBe(false);
    expect(needsGeneratedPreview('raster', undefined, MAX_DIRECT)).toBe(false);
  });

  it('honours a threshold the user has changed', () => {
    const strict = 0.25 * MB;
    expect(needsGeneratedPreview('raster', MB, strict)).toBe(true);

    const relaxed = 64 * MB;
    expect(needsGeneratedPreview('raster', 40 * MB, relaxed)).toBe(false);
  });

  it('agrees with rendersDirectly on which formats an <img> can decode', () => {
    // The size rule narrows the direct path; it must never widen it.
    for (const type of ['raster', 'svg', 'photoshop', 'pdf', 'illustrator', 'eps'] as const) {
      if (!rendersDirectly(type)) {
        expect(needsGeneratedPreview(type, 1, MAX_DIRECT), type).toBe(true);
      }
    }
  });
});

describe('the whole Seso pack', () => {
  // Real sizes, largest first, from the folder that triggered this.
  const SIZES = [
    39_719_281, 38_936_493, 37_681_485, 34_923_233, 32_532_959, 31_050_489, 27_944_481, 25_805_617,
    25_140_609, 21_866_993, 21_535_954,
  ];

  it('sends every one of them to the cache', () => {
    for (const size of SIZES) {
      expect(needsGeneratedPreview('raster', size, MAX_DIRECT), String(size)).toBe(true);
    }
  });
});
