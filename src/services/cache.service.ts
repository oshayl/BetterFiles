/**
 * Preview cache (roadmap sections 19.1 and 26).
 *
 * Generated thumbnails are written as real image files under the plugin data
 * folder so the grid can load them with `<img src="file:...">`. Keeping them on
 * disk rather than as base64 in memory is what makes a 25,000-asset library
 * scrollable.
 */
import type { PluginStorage, StoredFileInfo } from '../adapters/filesystem/plugin-storage';
import { createThumbnailKey, shardForKey } from '../utils/hashing';
import { logger } from '../utils/logger';

const THUMBNAIL_ROOT = 'thumbnails';

/** Cached previews are JPEG; alpha is flattened before encoding. */
const THUMBNAIL_EXTENSION = 'jpg';

export class CacheService {
  constructor(private readonly storage: PluginStorage) {}

  /** Storage-relative path for a cached preview. */
  pathFor(assetId: string, size: number): string {
    const key = createThumbnailKey(assetId, size);
    return `${THUMBNAIL_ROOT}/${shardForKey(key)}/${key}.${THUMBNAIL_EXTENSION}`;
  }

  async has(assetId: string, size: number): Promise<boolean> {
    return this.storage.exists(this.pathFor(assetId, size));
  }

  /** Absolute path for `<img src="file:...">`, or null when not cached. */
  async nativePathFor(assetId: string, size: number): Promise<string | null> {
    return this.storage.nativePathFor(this.pathFor(assetId, size));
  }

  async write(assetId: string, size: number, data: ArrayBuffer): Promise<string | null> {
    const path = this.pathFor(assetId, size);
    try {
      await this.storage.writeBinary(path, data);
      return this.storage.nativePathFor(path);
    } catch (error) {
      // A cache failure must not break browsing; the asset falls back to a
      // placeholder and will be retried later.
      logger.warn('cache', `Could not write preview for ${assetId}`, error);
      return null;
    }
  }

  async delete(assetId: string, size: number): Promise<void> {
    await this.storage.deleteFile(this.pathFor(assetId, size));
  }

  /** Total bytes currently held by the cache. */
  async totalBytes(): Promise<number> {
    const files = await this.storage.listFiles(THUMBNAIL_ROOT);
    return files.reduce((sum, file) => sum + file.sizeBytes, 0);
  }

  async clear(): Promise<number> {
    const files = await this.storage.listFiles(THUMBNAIL_ROOT);
    for (const file of files) {
      await this.storage.deleteFile(file.path);
    }
    logger.info('cache', `Cleared ${files.length} cached previews`);
    return files.length;
  }

  /**
   * Evicts oldest-first until the cache fits within its budget.
   *
   * Least-recently-modified is a good proxy for least-recently-used here:
   * regenerating a preview rewrites the file, so actively browsed assets keep
   * fresh timestamps.
   */
  async collectGarbage(maxBytes: number): Promise<{ removed: number; freedBytes: number }> {
    const files = await this.storage.listFiles(THUMBNAIL_ROOT);
    const total = files.reduce((sum, file) => sum + file.sizeBytes, 0);

    if (total <= maxBytes) return { removed: 0, freedBytes: 0 };

    const byAge = [...files].sort((a, b) => a.modifiedAt - b.modifiedAt);

    let freed = 0;
    let removed = 0;
    for (const file of byAge) {
      if (total - freed <= maxBytes) break;
      await this.storage.deleteFile(file.path);
      freed += file.sizeBytes;
      removed += 1;
    }

    logger.info('cache', `Garbage collection removed ${removed} previews (${freed} bytes)`);
    return { removed, freedBytes: freed };
  }

  /**
   * Deletes previews whose asset no longer exists in the index.
   *
   * Runs after indexing, so deleting files from a library eventually reclaims
   * their cache space even if the cache is well under budget.
   */
  async pruneOrphans(liveAssetIds: ReadonlySet<string>): Promise<number> {
    const files = await this.storage.listFiles(THUMBNAIL_ROOT);
    let removed = 0;

    for (const file of files) {
      const assetId = parseAssetIdFromPath(file.path);
      if (assetId && !liveAssetIds.has(assetId)) {
        await this.storage.deleteFile(file.path);
        removed += 1;
      }
    }

    if (removed > 0) logger.info('cache', `Pruned ${removed} orphaned previews`);
    return removed;
  }

  /** Raw listing, for the diagnostics report. */
  async list(): Promise<StoredFileInfo[]> {
    return this.storage.listFiles(THUMBNAIL_ROOT);
  }
}

/**
 * Recovers the asset id from a cache filename.
 *
 * Filenames are `<assetId>-<size>.jpg` and asset ids are fixed-length hex, so
 * splitting on the final hyphen is unambiguous.
 */
export function parseAssetIdFromPath(path: string): string | null {
  const filename = path.split('/').pop();
  if (!filename) return null;

  const withoutExtension = filename.replace(/\.[^.]+$/, '');
  const separator = withoutExtension.lastIndexOf('-');
  if (separator <= 0) return null;

  return withoutExtension.slice(0, separator);
}
