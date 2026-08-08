/**
 * Folder indexing (roadmap section 18).
 *
 * The diffing half is pure and unit tested; the orchestration half drives
 * traversal, reports progress in chunks and persists in batches.
 */
import type { AssetRecord } from '../models/asset';
import type { AssetFolder } from '../models/folder';
import type { DiscoveredFile } from '../adapters/filesystem/uxp-filesystem';
import { traverseFolder } from '../adapters/filesystem/uxp-filesystem';
import type { storage as UxpStorage } from 'uxp';
import { createAssetKey } from '../utils/hashing';
import { getAssetType } from '../utils/file-types';
import { type CancellationToken, NEVER_CANCELLED } from '../utils/cancellation';
import { logger } from '../utils/logger';

/** Turns a discovered file into an index record. Pure. */
export function buildAssetRecord(
  file: DiscoveredFile,
  folderId: string,
  now: number,
  previous?: AssetRecord,
): AssetRecord {
  return {
    id: createAssetKey(file.nativePath, file.sizeBytes, file.modifiedAt),
    folderId,
    name: file.name,
    extension: file.extension,
    nativePath: file.nativePath,
    relativePath: file.relativePath,
    type: getAssetType(file.extension),

    sizeBytes: file.sizeBytes,
    modifiedAt: file.modifiedAt,

    previewStatus: 'not_requested',

    // User-owned state survives re-indexing; a file being rescanned must not
    // silently lose its favourite flag or import history.
    isFavorite: previous?.isFavorite ?? false,
    ...(previous?.lastImportedAt != null ? { lastImportedAt: previous.lastImportedAt } : {}),
    addedAt: previous?.addedAt ?? now,
  };
}

export interface IndexDiff {
  readonly added: AssetRecord[];
  readonly changed: AssetRecord[];
  readonly removedIds: string[];
  readonly unchangedCount: number;
}

/**
 * Compares a freshly-scanned set against the stored index for one library.
 *
 * Identity is by path, not by key: the key includes size and mtime, so an
 * edited file would otherwise look like a delete plus an add and would lose its
 * favourite flag.
 */
export function diffAssets(
  existing: readonly AssetRecord[],
  discovered: readonly DiscoveredFile[],
  folderId: string,
  now: number,
): IndexDiff {
  const existingByPath = new Map<string, AssetRecord>();
  for (const asset of existing) {
    if (asset.folderId === folderId) {
      existingByPath.set(asset.nativePath.toLowerCase(), asset);
    }
  }

  const added: AssetRecord[] = [];
  const changed: AssetRecord[] = [];
  const seen = new Set<string>();
  let unchangedCount = 0;

  for (const file of discovered) {
    const key = file.nativePath.toLowerCase();
    seen.add(key);

    const previous = existingByPath.get(key);
    if (!previous) {
      added.push(buildAssetRecord(file, folderId, now));
      continue;
    }

    const record = buildAssetRecord(file, folderId, now, previous);
    if (record.id === previous.id) {
      unchangedCount += 1;
      continue;
    }

    // Content changed: keep the record but let the new key invalidate the
    // cached preview by resetting its status.
    changed.push(record);
  }

  const removedIds: string[] = [];
  for (const [path, asset] of existingByPath) {
    if (!seen.has(path)) removedIds.push(asset.id);
  }

  return { added, changed, removedIds, unchangedCount };
}

/** Applies a diff to an asset list, returning a new array. Pure. */
export function applyDiff(existing: readonly AssetRecord[], diff: IndexDiff): AssetRecord[] {
  const removed = new Set(diff.removedIds);
  const changedByPath = new Map(
    diff.changed.map((asset) => [asset.nativePath.toLowerCase(), asset] as const),
  );

  const out: AssetRecord[] = [];
  for (const asset of existing) {
    if (removed.has(asset.id)) continue;

    const replacement = changedByPath.get(asset.nativePath.toLowerCase());
    if (replacement && replacement.folderId === asset.folderId) {
      out.push(replacement);
      changedByPath.delete(asset.nativePath.toLowerCase());
      continue;
    }
    out.push(asset);
  }

  out.push(...changedByPath.values(), ...diff.added);
  return out;
}

export interface IndexProgress {
  readonly folderId: string;
  readonly scanned: number;
  /** 0-1 where known; indexing has no total until the walk finishes. */
  readonly indeterminate: boolean;
}

export interface IndexResult {
  readonly folderId: string;
  readonly assets: AssetRecord[];
  readonly scanned: number;
  readonly skipped: number;
  readonly diff: IndexDiff;
}

export interface IndexFolderParams {
  readonly folder: AssetFolder;
  readonly entry: UxpStorage.Folder;
  readonly existing: readonly AssetRecord[];
  readonly token?: CancellationToken;
  readonly onProgress?: (progress: IndexProgress) => void;
  /** Incremental results so the grid fills in while the walk continues. */
  readonly onPartial?: (assets: AssetRecord[]) => void;
  readonly now?: () => number;
}

/**
 * Indexes one library.
 *
 * Discovery is collected in full before diffing, because a correct diff needs
 * to know which paths are absent - but partial records are emitted as they are
 * found so the UI is never blocked (section 18.4).
 */
export async function indexFolder(params: IndexFolderParams): Promise<IndexResult> {
  const token = params.token ?? NEVER_CANCELLED;
  const now = params.now ?? Date.now;
  const timestamp = now();

  const discovered: DiscoveredFile[] = [];
  const existingByPath = new Map(
    params.existing
      .filter((asset) => asset.folderId === params.folder.id)
      .map((asset) => [asset.nativePath.toLowerCase(), asset] as const),
  );

  const { scanned, skipped } = await traverseFolder(
    params.entry,
    params.folder.nativePath,
    {
      includeSubfolders: params.folder.includeSubfolders,
      token,
    },
    (batch) => {
      discovered.push(...batch);

      params.onProgress?.({
        folderId: params.folder.id,
        scanned: discovered.length,
        indeterminate: true,
      });

      if (params.onPartial) {
        params.onPartial(
          batch.map((file) =>
            buildAssetRecord(
              file,
              params.folder.id,
              timestamp,
              existingByPath.get(file.nativePath.toLowerCase()),
            ),
          ),
        );
      }
    },
  );

  const diff = diffAssets(params.existing, discovered, params.folder.id, timestamp);
  const assets = applyDiff(params.existing, diff);

  logger.info(
    'index',
    `Indexed ${params.folder.displayName}: ${scanned} files (+${diff.added.length} ~${diff.changed.length} -${diff.removedIds.length})`,
  );

  return { folderId: params.folder.id, assets, scanned, skipped, diff };
}
