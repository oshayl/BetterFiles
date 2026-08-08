/**
 * UXP-backed implementation of `PluginStorage`.
 *
 * Wraps `storage.localFileSystem.getDataFolder()`. The UXP folder API has no
 * `mkdir -p` and no `rename`, so directory creation walks segment by segment and
 * atomic replacement is emulated in `database.service.ts`.
 */
import type { storage as UxpStorage } from 'uxp';
import type { PluginStorage, StoredFileInfo } from './plugin-storage';
import { logger } from '../../utils/logger';
import { uxp } from '../host';

type Folder = UxpStorage.Folder;
type File = UxpStorage.File;
type Entry = UxpStorage.Entry;


export class UxpPluginStorage implements PluginStorage {
  #dataFolder: Folder | undefined;
  /** Cache of resolved directories, so nested paths do not re-walk each time. */
  readonly #folderCache = new Map<string, Folder>();

  async #root(): Promise<Folder> {
    if (!this.#dataFolder) {
      this.#dataFolder = await uxp().storage.localFileSystem.getDataFolder();
    }
    return this.#dataFolder;
  }

  /**
   * Resolves a directory, creating missing segments.
   *
   * `createFolder` rejects when the folder already exists, and there is no
   * "exists" query, so each segment is probed with `getEntry` first.
   */
  async #resolveFolder(directory: string, create: boolean): Promise<Folder | null> {
    if (directory === '' || directory === '.') return this.#root();

    const cached = this.#folderCache.get(directory);
    if (cached) return cached;

    let current = await this.#root();
    for (const segment of directory.split('/').filter(Boolean)) {
      let next: Entry | null = null;
      try {
        next = await current.getEntry(segment);
      } catch {
        next = null; // missing
      }

      if (next && next.isFolder) {
        current = next as Folder;
        continue;
      }
      if (next && !next.isFolder) {
        throw new Error(`${directory} is blocked by a file named ${segment}`);
      }
      if (!create) return null;

      current = await current.createFolder(segment);
    }

    this.#folderCache.set(directory, current);
    return current;
  }

  async #resolveFile(path: string, create: boolean): Promise<File | null> {
    const lastSlash = path.lastIndexOf('/');
    const directory = lastSlash === -1 ? '' : path.slice(0, lastSlash);
    const name = lastSlash === -1 ? path : path.slice(lastSlash + 1);

    const folder = await this.#resolveFolder(directory, create);
    if (!folder) return null;

    try {
      const entry = await folder.getEntry(name);
      if (entry.isFile) return entry as File;
      return null;
    } catch {
      if (!create) return null;
      return folder.createFile(name, { overwrite: true });
    }
  }

  async readText(path: string): Promise<string | null> {
    const file = await this.#resolveFile(path, false);
    if (!file) return null;

    const contents = await file.read({ format: uxp().storage.formats.utf8 });
    return typeof contents === 'string' ? contents : null;
  }

  async writeText(path: string, contents: string): Promise<void> {
    const file = await this.#resolveFile(path, true);
    if (!file) throw new Error(`Unable to create ${path}`);
    await file.write(contents, { format: uxp().storage.formats.utf8 });
  }

  async writeBinary(path: string, contents: ArrayBuffer): Promise<void> {
    const file = await this.#resolveFile(path, true);
    if (!file) throw new Error(`Unable to create ${path}`);
    await file.write(contents, { format: uxp().storage.formats.binary });
  }

  async deleteFile(path: string): Promise<void> {
    const file = await this.#resolveFile(path, false);
    if (!file) return;
    try {
      await file.delete();
    } catch (error) {
      // A cache file that will not delete is not worth failing the operation
      // for; it will be retried by the next garbage-collection pass.
      logger.warn('storage', `Could not delete ${path}`, error);
    }
  }

  async exists(path: string): Promise<boolean> {
    return (await this.#resolveFile(path, false)) !== null;
  }

  async listFiles(directory: string): Promise<StoredFileInfo[]> {
    const folder = await this.#resolveFolder(directory, false);
    if (!folder) return [];

    const out: StoredFileInfo[] = [];
    const walk = async (current: Folder, prefix: string): Promise<void> => {
      const entries = await current.getEntries();
      for (const entry of entries) {
        const childPath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
        if (entry.isFolder) {
          await walk(entry as Folder, childPath);
          continue;
        }
        try {
          const metadata = await entry.getMetadata();
          out.push({
            path: childPath,
            sizeBytes: metadata.size ?? 0,
            modifiedAt: metadata.dateModified?.getTime() ?? 0,
          });
        } catch (error) {
          // Skip unreadable entries rather than aborting the whole listing.
          logger.debug('storage', `Skipped unreadable cache entry ${childPath}`, error);
        }
      }
    };

    await walk(folder, directory);
    return out;
  }

  async nativePathFor(path: string): Promise<string | null> {
    const file = await this.#resolveFile(path, false);
    return file ? file.nativePath : null;
  }
}
