/**
 * Stable hashing for asset identity and cache keys (roadmap section 18.3).
 *
 * FNV-1a: no crypto dependency (UXP has no WebCrypto guarantee), deterministic
 * across sessions and platforms, and fast enough to run over 25,000+ paths
 * during indexing. Collision risk is irrelevant here - a collision would only
 * cause a stale thumbnail, and the fingerprint includes size and mtime.
 */
import { normalizePath } from './path-utils';

const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/**
 * Alternative basis for the second pass of `hash64`. It must differ from the
 * standard basis, otherwise both passes compute the same value and the
 * "64-bit" key is really a 32-bit one repeated twice.
 */
const FNV_ALT_BASIS = 0x9dc5811c;

/** 32-bit FNV-1a with an optional seed, as 8 lower-case hex characters. */
export function hash(input: string, seed: number = FNV_OFFSET_BASIS): string {
  let value = seed >>> 0;

  for (let i = 0; i < input.length; i += 1) {
    value ^= input.charCodeAt(i);
    // Multiply by the FNV prime with 32-bit overflow semantics.
    value = Math.imul(value, FNV_PRIME) >>> 0;
  }

  return value.toString(16).padStart(8, '0');
}

/**
 * Widens the hash to 64 bits by combining two differently-seeded passes, making
 * accidental collisions across a large library effectively impossible.
 */
export function hash64(input: string): string {
  const high = hash(input, FNV_ALT_BASIS);
  const low = hash(input, FNV_OFFSET_BASIS);
  return `${high}${low}`;
}

/**
 * Identity for an asset.
 *
 * Path plus size plus mtime, so that editing a file in place produces a new key
 * and therefore invalidates its cached thumbnail, while merely re-indexing an
 * unchanged file produces the same key.
 */
export function createAssetKey(nativePath: string, size: number, modifiedAt: number): string {
  return hash64(`${normalizePath(nativePath).toLowerCase()}:${size}:${modifiedAt}`);
}

/** Identity for a library folder. Path only - contents change, identity does not. */
export function createFolderId(nativePath: string): string {
  return hash64(normalizePath(nativePath).toLowerCase());
}

/**
 * Cache filename for a generated preview. The size is part of the key so that
 * changing the thumbnail size does not serve an upscaled stale image.
 */
export function createThumbnailKey(assetId: string, targetSize: number): string {
  return `${assetId}-${targetSize}`;
}

/**
 * Shards cache files across two-character subdirectories.
 *
 * A single directory holding 25,000 files is slow to enumerate on every
 * platform and pathological on network shares (roadmap section 19.1).
 */
export function shardForKey(key: string): string {
  return key.slice(0, 2);
}
