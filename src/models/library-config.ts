/**
 * Portable library configuration.
 *
 * WHAT THIS IS FOR
 * Libraries live in the plugin's private storage, which is keyed by plugin id
 * AND by Photoshop's major version - the path contains `PHSP/<version>`. So the
 * index survives plugin updates, but a Photoshop major upgrade, a reinstall
 * through Creative Cloud, or a move to another machine all start from nothing.
 *
 * This is the small, portable part: the folder paths, what they are called and
 * how they are filed. A few kilobytes that can be kept anywhere and restored.
 *
 * WHAT IS DELIBERATELY LEFT OUT
 * `persistentToken` is scoped to one machine and one plugin install, so copying
 * it would restore a token that resolves to nothing. Restore re-acquires each
 * folder by path and mints a fresh token. The asset index is left out too - it
 * is large, and re-indexing rebuilds it exactly.
 */
import type { AssetFolder } from './folder';
import { UNCATEGORISED } from './folder';
import { normalizePath } from '../utils/path-utils';

export const LIBRARY_CONFIG_VERSION = 1;
export const LIBRARY_CONFIG_FILENAME = 'asset-browser-libraries.json';

export interface LibraryConfigEntry {
  readonly displayName: string;
  readonly category: string;
  readonly nativePath: string;
  readonly includeSubfolders: boolean;
  readonly isFavorite: boolean;
}

export interface LibraryConfig {
  readonly version: number;
  /** ISO timestamp, for the user's benefit when they find the file later. */
  readonly exportedAt: string;
  readonly libraries: readonly LibraryConfigEntry[];
}

/** Builds the portable form of the current libraries. */
export function toLibraryConfig(
  folders: readonly AssetFolder[],
  exportedAt: string,
): LibraryConfig {
  return {
    version: LIBRARY_CONFIG_VERSION,
    exportedAt,
    libraries: folders.map((folder) => ({
      displayName: folder.displayName,
      category: folder.category || UNCATEGORISED,
      nativePath: folder.nativePath,
      includeSubfolders: folder.includeSubfolders,
      isFavorite: folder.isFavorite,
    })),
  };
}

export class LibraryConfigError extends Error {}

/**
 * Parses a config file.
 *
 * Strict about the envelope and forgiving about individual entries: a file
 * hand-edited into invalid JSON is a real error worth reporting, but one entry
 * missing an optional flag should not cost the user the other twenty.
 */
export function parseLibraryConfig(contents: string): LibraryConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(contents);
  } catch (error) {
    throw new LibraryConfigError(`Not a valid JSON file: ${String(error)}`);
  }

  if (typeof raw !== 'object' || raw === null) {
    throw new LibraryConfigError('The file does not contain a library backup.');
  }

  const record = raw as Record<string, unknown>;

  if (typeof record.version !== 'number') {
    throw new LibraryConfigError('The file does not contain a library backup.');
  }
  if (record.version > LIBRARY_CONFIG_VERSION) {
    throw new LibraryConfigError(
      `This backup was written by a newer version (format ${record.version}).`,
    );
  }
  if (!Array.isArray(record.libraries)) {
    throw new LibraryConfigError('The backup contains no libraries.');
  }

  const libraries: LibraryConfigEntry[] = [];
  for (const item of record.libraries) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;

    // A path is the one field nothing can be reconstructed without.
    if (typeof entry.nativePath !== 'string' || entry.nativePath.trim() === '') continue;
    const nativePath = normalizePath(entry.nativePath);

    libraries.push({
      nativePath,
      displayName:
        typeof entry.displayName === 'string' && entry.displayName.trim() !== ''
          ? entry.displayName
          : (nativePath.split('/').pop() ?? nativePath),
      category:
        typeof entry.category === 'string' && entry.category.trim() !== ''
          ? entry.category
          : UNCATEGORISED,
      includeSubfolders: entry.includeSubfolders !== false,
      isFavorite: entry.isFavorite === true,
    });
  }

  return {
    version: record.version,
    exportedAt: typeof record.exportedAt === 'string' ? record.exportedAt : '',
    libraries,
  };
}

/** Serialises for writing. Indented, because a user may well open this file. */
export function serialiseLibraryConfig(config: LibraryConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}
