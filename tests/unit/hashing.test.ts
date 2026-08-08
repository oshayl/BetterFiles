import { describe, expect, it } from 'vitest';
import {
  createAssetKey,
  createFolderId,
  createThumbnailKey,
  hash,
  hash64,
  shardForKey,
} from '../../src/utils/hashing';

describe('hash', () => {
  it('is deterministic', () => {
    expect(hash('logo.svg')).toBe(hash('logo.svg'));
  });

  it('produces 8 hex characters', () => {
    expect(hash('anything')).toMatch(/^[0-9a-f]{8}$/);
  });

  it('distinguishes different inputs', () => {
    expect(hash('a')).not.toBe(hash('b'));
  });

  it('varies with the seed', () => {
    expect(hash('same', 1)).not.toBe(hash('same', 2));
  });

  it('handles empty and unicode input without throwing', () => {
    expect(hash('')).toMatch(/^[0-9a-f]{8}$/);
    expect(hash('логотип-☃')).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe('hash64', () => {
  it('produces 16 hex characters', () => {
    expect(hash64('logo.svg')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('does not simply repeat the 32-bit hash twice', () => {
    // Regression guard: both passes must use different seeds, otherwise the
    // "64-bit" key carries only 32 bits of entropy.
    const value = hash64('logo.svg');
    expect(value.slice(0, 8)).not.toBe(value.slice(8));
  });

  it('avoids collisions across a large set of realistic paths', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 30_000; i += 1) {
      seen.add(hash64(`/library/brand/subfolder-${i % 97}/asset-${i}.png`));
    }
    expect(seen.size).toBe(30_000);
  });
});

describe('createAssetKey', () => {
  it('is stable for an unchanged file', () => {
    expect(createAssetKey('/a/logo.png', 1024, 1700000000000)).toBe(
      createAssetKey('/a/logo.png', 1024, 1700000000000),
    );
  });

  it('changes when the file is edited in place', () => {
    // Same path, new size/mtime: the cached thumbnail must be invalidated.
    const before = createAssetKey('/a/logo.png', 1024, 1700000000000);
    const afterResize = createAssetKey('/a/logo.png', 2048, 1700000000000);
    const afterTouch = createAssetKey('/a/logo.png', 1024, 1700000009999);

    expect(afterResize).not.toBe(before);
    expect(afterTouch).not.toBe(before);
  });

  it('ignores separator style and case, so a case-only rename is not a new asset', () => {
    expect(createAssetKey('C:\\A\\Logo.png', 10, 20)).toBe(createAssetKey('c:/a/logo.png', 10, 20));
  });
});

describe('createFolderId', () => {
  it('depends only on the path, so contents can change freely', () => {
    expect(createFolderId('/library')).toBe(createFolderId('/library/'));
  });

  it('separates different libraries', () => {
    expect(createFolderId('/library-a')).not.toBe(createFolderId('/library-b'));
  });
});

describe('createThumbnailKey and shardForKey', () => {
  it('includes the target size so resizing does not serve a stale image', () => {
    expect(createThumbnailKey('abc123', 256)).toBe('abc123-256');
    expect(createThumbnailKey('abc123', 256)).not.toBe(createThumbnailKey('abc123', 512));
  });

  it('shards on the first two characters', () => {
    expect(shardForKey('abc123-256')).toBe('ab');
  });

  it('spreads keys across many shards', () => {
    const shards = new Set<string>();
    for (let i = 0; i < 2000; i += 1) {
      shards.add(shardForKey(hash64(`asset-${i}`)));
    }
    // 16^2 possible shards; anything above ~100 means no pathological clumping.
    expect(shards.size).toBeGreaterThan(100);
  });
});
