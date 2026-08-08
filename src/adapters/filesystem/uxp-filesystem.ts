/**
 * Asset-library filesystem access (roadmap sections 17 and 18).
 *
 * Wraps the parts of `storage.localFileSystem` that deal with user-chosen
 * folders, as opposed to `UxpPluginStorage` which owns plugin-private storage.
 */
import type { storage as UxpStorage } from 'uxp';
import { type CancellationToken, NEVER_CANCELLED } from '../../utils/cancellation';
import { isSupportedExtension } from '../../utils/file-types';
import { extname, joinPath, normalizePath } from '../../utils/path-utils';
import { logger } from '../../utils/logger';
import { uxp } from '../host';

type Folder = UxpStorage.Folder;
type Entry = UxpStorage.Entry;

export interface PickedFolder {
  readonly name: string;
  readonly nativePath: string;
  readonly entry: Folder;
  /** Absent when the platform could not mint one; the library then needs re-picking. */
  readonly persistentToken?: string;
}

/** Raw file discovered during traversal, before it becomes an `AssetRecord`. */
export interface DiscoveredFile {
  readonly nativePath: string;
  readonly relativePath: string;
  readonly name: string;
  readonly extension: string;
  readonly sizeBytes: number;
  readonly modifiedAt: number;
}

/** Opens the OS folder picker. Returns null when the user cancels. */
export async function selectAssetFolder(): Promise<PickedFolder | null> {
  const folder = await uxp().storage.localFileSystem.getFolder();
  if (!folder) return null;

  let persistentToken: string | undefined;
  try {
    persistentToken = await uxp().storage.localFileSystem.createPersistentToken(folder);
  } catch (error) {
    // Without a token the library still works this session but cannot be
    // restored after a restart. Surfaced to the user as a reconnect prompt.
    logger.warn('filesystem', `No persistent token for ${folder.nativePath}`, error);
  }

  return {
    name: folder.name,
    nativePath: normalizePath(folder.nativePath),
    entry: folder,
    ...(persistentToken ? { persistentToken } : {}),
  };
}

/**
 * Re-acquires a folder saved in a previous session.
 *
 * Prefers the persistent token, because on macOS that is what carries the
 * security-scoped permission. Falls back to the raw path, which works when the
 * plugin has full filesystem access and the folder has not moved.
 */
export async function resolveSavedFolder(
  persistentToken: string | undefined,
  nativePath: string,
): Promise<Folder | null> {
  const fs = uxp().storage.localFileSystem;

  if (persistentToken) {
    try {
      const entry = await fs.getEntryForPersistentToken(persistentToken);
      if (entry?.isFolder) return entry as Folder;
    } catch (error) {
      logger.warn('filesystem', `Persistent token failed for ${nativePath}`, error);
    }
  }

  try {
    const entry = await fs.getEntryWithUrl(`file:${nativePath}`);
    if (entry?.isFolder) return entry as Folder;
  } catch (error) {
    logger.debug('filesystem', `Path lookup failed for ${nativePath}`, error);
  }

  return null;
}

export interface TraverseOptions {
  readonly includeSubfolders: boolean;
  /**
   * Files reported per batch. Batching keeps the UI updating during indexing
   * instead of freezing until the whole tree is walked (section 18.1).
   */
  readonly batchSize?: number;
  /** Guards against symlink loops and pathological hierarchies. */
  readonly maxDepth?: number;
  readonly token?: CancellationToken;
}

const DEFAULT_BATCH_SIZE = 200;
const DEFAULT_MAX_DEPTH = 24;

/**
 * Walks a library folder, reporting supported files in batches.
 *
 * Iterative rather than recursive so that a deep tree cannot blow the stack,
 * and every per-entry failure is swallowed: one unreadable file must never stop
 * indexing (section 25).
 */
export async function traverseFolder(
  root: Folder,
  rootNativePath: string,
  options: TraverseOptions,
  onBatch: (files: DiscoveredFile[]) => void | Promise<void>,
): Promise<{ scanned: number; skipped: number }> {
  const token = options.token ?? NEVER_CANCELLED;
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;

  const normalizedRoot = normalizePath(rootNativePath);
  const queue: Array<{ folder: Folder; relative: string; depth: number }> = [
    { folder: root, relative: '', depth: 0 },
  ];

  // Guards against a symlink cycle re-entering a folder already walked.
  const visited = new Set<string>([normalizedRoot.toLowerCase()]);

  let batch: DiscoveredFile[] = [];
  let scanned = 0;
  let skipped = 0;

  const flush = async () => {
    if (batch.length === 0) return;
    const toEmit = batch;
    batch = [];
    await onBatch(toEmit);
  };

  while (queue.length > 0) {
    token.throwIfCancelled();

    const current = queue.shift();
    if (!current) break;

    let entries: Entry[];
    try {
      entries = await current.folder.getEntries();
    } catch (error) {
      logger.warn('filesystem', `Could not read folder ${current.relative || '/'}`, error);
      skipped += 1;
      continue;
    }

    for (const entry of entries) {
      token.throwIfCancelled();

      const relative =
        current.relative === '' ? entry.name : joinPath(current.relative, entry.name);

      if (entry.isFolder) {
        if (!options.includeSubfolders || current.depth + 1 > maxDepth) continue;

        const key = normalizePath(entry.nativePath).toLowerCase();
        if (visited.has(key)) {
          logger.debug('filesystem', `Skipping already-visited folder ${relative}`);
          continue;
        }
        visited.add(key);

        queue.push({ folder: entry as Folder, relative, depth: current.depth + 1 });
        continue;
      }

      const extension = extname(entry.name);
      if (!isSupportedExtension(extension)) continue;

      let sizeBytes = 0;
      let modifiedAt = 0;
      try {
        const metadata = await entry.getMetadata();
        sizeBytes = metadata.size ?? 0;
        modifiedAt = metadata.dateModified?.getTime() ?? 0;
      } catch (error) {
        // Keep the file: it is still browsable and insertable, it just sorts
        // and fingerprints on less information.
        logger.debug('filesystem', `No metadata for ${relative}`, error);
        skipped += 1;
      }

      batch.push({
        nativePath: normalizePath(entry.nativePath),
        relativePath: relative,
        name: entry.name,
        extension,
        sizeBytes,
        modifiedAt,
      });
      scanned += 1;

      if (batch.length >= batchSize) await flush();
    }
  }

  await flush();
  return { scanned, skipped };
}

/** One folder found under a picked root that is worth offering as a library. */
export interface LibraryCandidate {
  readonly name: string;
  readonly nativePath: string;
  /** Name of the containing folder, which usually carries the subject. */
  readonly parentName: string;
  /** Path relative to the picked root, for display. */
  readonly relativePath: string;
  /** Supported files found directly in this folder. Never zero. */
  readonly assetCount: number;
  readonly entry: Folder;
}

export interface DiscoverOptions {
  /** How far below the picked root to look. Two levels covers `<Pack>/<Format>`. */
  readonly maxDepth?: number;
  /** Stops runaway scans of a huge tree. */
  readonly maxCandidates?: number;
  readonly token?: CancellationToken;
}

const DEFAULT_DISCOVER_DEPTH = 2;
const DEFAULT_MAX_CANDIDATES = 200;

/**
 * Finds every folder under `root` that directly contains supported assets.
 *
 * WHY FOLDERS THAT *DIRECTLY* CONTAIN ASSETS
 * Asset packs nest as `<Pack Name>/SVG`, so the folder worth importing is the
 * leaf, not the pack. Offering the pack instead would work, but it would index
 * every format the pack ships and lose the one-library-per-format split the
 * sidebar is built on.
 *
 * The root itself is included when it holds assets directly, so picking a
 * single library folder still behaves sensibly.
 */
export async function discoverLibraryCandidates(
  root: Folder,
  options: DiscoverOptions = {},
): Promise<LibraryCandidate[]> {
  const token = options.token ?? NEVER_CANCELLED;
  const maxDepth = options.maxDepth ?? DEFAULT_DISCOVER_DEPTH;
  const maxCandidates = options.maxCandidates ?? DEFAULT_MAX_CANDIDATES;

  const rootPath = normalizePath(root.nativePath);
  const candidates: LibraryCandidate[] = [];
  const visited = new Set<string>([rootPath.toLowerCase()]);

  const queue: Array<{ folder: Folder; parentName: string; relative: string; depth: number }> = [
    { folder: root, parentName: '', relative: '', depth: 0 },
  ];

  while (queue.length > 0 && candidates.length < maxCandidates) {
    token.throwIfCancelled();

    const current = queue.shift();
    if (!current) break;

    let entries: Entry[];
    try {
      entries = await current.folder.getEntries();
    } catch (error) {
      logger.warn('filesystem', `Could not read folder ${current.relative || '/'}`, error);
      continue;
    }

    let assetCount = 0;
    for (const entry of entries) {
      token.throwIfCancelled();

      if (entry.isFolder) {
        if (current.depth + 1 > maxDepth) continue;

        const key = normalizePath(entry.nativePath).toLowerCase();
        if (visited.has(key)) continue;
        visited.add(key);

        queue.push({
          folder: entry as Folder,
          parentName: current.folder.name,
          relative: current.relative === '' ? entry.name : joinPath(current.relative, entry.name),
          depth: current.depth + 1,
        });
        continue;
      }

      if (isSupportedExtension(extname(entry.name))) assetCount += 1;
    }

    if (assetCount > 0) {
      candidates.push({
        name: current.folder.name,
        nativePath: normalizePath(current.folder.nativePath),
        parentName: current.parentName,
        relativePath: current.relative,
        assetCount,
        entry: current.folder,
      });
    }
  }

  // Shallowest first, then alphabetical: the order they appear in Finder.
  return candidates.sort((a, b) => {
    const depthA = a.relativePath === '' ? 0 : a.relativePath.split('/').length;
    const depthB = b.relativePath === '' ? 0 : b.relativePath.split('/').length;
    if (depthA !== depthB) return depthA - depthB;
    return a.relativePath.localeCompare(b.relativePath);
  });
}

/**
 * Mints a persistent token for a folder found by discovery.
 *
 * Best-effort: a candidate without a token still imports, it just cannot be
 * restored automatically after a restart.
 */
export async function tokenForFolder(folder: Folder): Promise<string | undefined> {
  try {
    return await uxp().storage.localFileSystem.createPersistentToken(folder);
  } catch (error) {
    logger.warn('filesystem', `No persistent token for ${folder.nativePath}`, error);
    return undefined;
  }
}

/** Checks a saved library is still reachable, for the offline/reconnect state. */
export async function isFolderAvailable(folder: Folder): Promise<boolean> {
  try {
    await folder.getEntries();
    return true;
  } catch {
    return false;
  }
}

/** Reveals a path in Finder or Explorer. Requires the `launchProcess` permission. */
export async function revealInFileManager(nativePath: string): Promise<void> {
  await uxp().shell.openPath(nativePath);
}
