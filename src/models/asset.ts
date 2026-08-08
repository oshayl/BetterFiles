/** Asset domain model (roadmap section 15). */

export type AssetType = 'raster' | 'svg' | 'illustrator' | 'pdf' | 'photoshop' | 'eps' | 'unknown';

/**
 * Lifecycle of a thumbnail. `failed` is terminal until the user explicitly
 * regenerates - retrying automatically would re-attack the same broken file on
 * every scroll (roadmap section 25).
 */
export type PreviewStatus = 'not_requested' | 'queued' | 'generating' | 'ready' | 'failed';

export interface AssetRecord {
  /** Stable fingerprint of path + size + mtime. See `createAssetKey`. */
  id: string;
  folderId: string;
  name: string;
  /** Lower-case, without the leading dot. */
  extension: string;
  nativePath: string;
  /** Path relative to the owning library root, used for display and search. */
  relativePath: string;
  type: AssetType;

  sizeBytes?: number;
  modifiedAt?: number;

  width?: number;
  height?: number;
  colorMode?: string;
  pageCount?: number;

  /** Cache filename for a generated preview. Absent when rendered directly. */
  thumbnailKey?: string;
  previewStatus: PreviewStatus;
  /** User-facing reason a preview could not be produced. */
  previewError?: string;

  isFavorite: boolean;
  lastImportedAt?: number;
  addedAt: number;
}

/** Formats an `<img src="file:...">` can decode without Photoshop's help. */
export function rendersDirectly(type: AssetType): boolean {
  return type === 'raster' || type === 'svg';
}

/** Formats Photoshop must interpret before any preview is possible. */
export function requiresGeneratedPreview(type: AssetType): boolean {
  return type === 'photoshop' || type === 'pdf' || type === 'illustrator' || type === 'eps';
}

/**
 * Whether an asset needs a generated, downscaled preview.
 *
 * FORMAT IS NOT THE ONLY QUESTION - SIZE IS TOO.
 * `<img>` has no way to decode an image at reduced resolution: pointing one at
 * a file decodes the whole thing into memory, whatever size it is drawn at. A
 * 40 MB PNG costs a few hundred megabytes decoded, and a grid showing a dozen
 * of them at 72px costs several gigabytes. That is what a brush pack of
 * full-resolution PNGs did to Photoshop: 711 MB of files, 7.3 GB resident.
 *
 * So above `maxDirectBytes` a raster is treated like a PSD - generated once at
 * thumbnail size, cached to disk, and served from the cache thereafter. Below
 * it the direct path stands, which is the fast common case and keeps small
 * artwork off the modal queue entirely.
 *
 * SVG is exempt: its cost is rasterisation complexity, not file size, and its
 * files are trivially small. Nothing observed so far justifies queueing them.
 */
export function needsGeneratedPreview(
  type: AssetType,
  sizeBytes: number | undefined,
  maxDirectBytes: number,
): boolean {
  if (requiresGeneratedPreview(type)) return true;
  if (type !== 'raster') return false;
  // Size 0 means metadata was unreadable, not that the file is empty; the
  // direct path is the safer guess because it cannot stall Photoshop.
  return sizeBytes != null && sizeBytes > maxDirectBytes;
}
