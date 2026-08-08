/**
 * Plugin-private storage abstraction.
 *
 * Everything the plugin persists - the database, the thumbnail cache and the
 * diagnostics log - lives under the UXP data folder (roadmap section 19.1).
 * This interface exists so that persistence logic can be unit tested without a
 * host: `InMemoryPluginStorage` is a complete stand-in.
 *
 * Paths are always relative to the data folder root and use forward slashes,
 * e.g. `database/folders.json` or `thumbnails/ab/abc123-256.jpg`.
 */

export interface StoredFileInfo {
  /** Path relative to the storage root. */
  readonly path: string;
  readonly sizeBytes: number;
  readonly modifiedAt: number;
}

export interface PluginStorage {
  /** Returns null when the file does not exist, rather than throwing. */
  readText(path: string): Promise<string | null>;
  writeText(path: string, contents: string): Promise<void>;
  writeBinary(path: string, contents: ArrayBuffer): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  /** Recursive listing of a directory. Returns [] when it does not exist. */
  listFiles(directory: string): Promise<StoredFileInfo[]>;
  /**
   * Absolute platform path for a stored file, for building `file:` URLs.
   * Returns null when the file does not exist.
   */
  nativePathFor(path: string): Promise<string | null>;
}

/** In-memory implementation used by the unit tests. */
export class InMemoryPluginStorage implements PluginStorage {
  readonly #files = new Map<string, { data: string | ArrayBuffer; modifiedAt: number }>();
  #clock = 0;

  /** Simulates a native mount point so `nativePathFor` returns a plausible path. */
  constructor(private readonly rootNativePath = '/plugin-data') {}

  async readText(path: string): Promise<string | null> {
    const entry = this.#files.get(path);
    if (!entry) return null;
    if (typeof entry.data !== 'string') {
      throw new Error(`${path} holds binary data`);
    }
    return entry.data;
  }

  async writeText(path: string, contents: string): Promise<void> {
    this.#clock += 1;
    this.#files.set(path, { data: contents, modifiedAt: this.#clock });
  }

  async writeBinary(path: string, contents: ArrayBuffer): Promise<void> {
    this.#clock += 1;
    this.#files.set(path, { data: contents, modifiedAt: this.#clock });
  }

  async deleteFile(path: string): Promise<void> {
    this.#files.delete(path);
  }

  async exists(path: string): Promise<boolean> {
    return this.#files.has(path);
  }

  async listFiles(directory: string): Promise<StoredFileInfo[]> {
    const prefix = directory === '' ? '' : `${directory.replace(/\/$/, '')}/`;
    const out: StoredFileInfo[] = [];

    for (const [path, entry] of this.#files) {
      if (prefix !== '' && !path.startsWith(prefix)) continue;
      out.push({
        path,
        sizeBytes:
          typeof entry.data === 'string' ? entry.data.length : entry.data.byteLength,
        modifiedAt: entry.modifiedAt,
      });
    }

    return out;
  }

  async nativePathFor(path: string): Promise<string | null> {
    return this.#files.has(path) ? `${this.rootNativePath}/${path}` : null;
  }

  /** Test helper: corrupts a file to exercise recovery paths. */
  async corrupt(path: string, contents = '{ not json'): Promise<void> {
    this.#clock += 1;
    this.#files.set(path, { data: contents, modifiedAt: this.#clock });
  }

  /** Test helper: raw file count. */
  get size(): number {
    return this.#files.size;
  }
}
