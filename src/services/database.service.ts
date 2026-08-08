/**
 * Versioned JSON persistence (roadmap sections 19.1, 24 and 39).
 *
 * CRASH SAFETY
 * UXP's filesystem API has no `rename`, so the usual write-temp-then-rename
 * trick is unavailable. Instead:
 *
 *   1. serialise to `<name>.tmp`
 *   2. read `<name>.tmp` back and parse it, proving the bytes landed intact
 *   3. overwrite `<name>`
 *   4. delete `<name>.tmp`
 *
 * A crash during step 3 can truncate `<name>`, but `<name>.tmp` still holds a
 * verified copy, so `load()` falls back to it. A crash anywhere else leaves
 * `<name>` untouched. The worst case is losing the most recent write, never the
 * whole database.
 *
 * MIGRATIONS
 * Every document carries a `version`. Loading a newer version than this build
 * understands is refused rather than guessed at, because silently discarding
 * fields a future release wrote would lose user data on a downgrade.
 */
import type { PluginStorage } from '../adapters/filesystem/plugin-storage';
import { logger } from '../utils/logger';

interface VersionedDocument {
  version: number;
  data: unknown;
}

export interface JsonDocumentOptions<T> {
  /** Bumped whenever the on-disk shape changes. */
  readonly version: number;
  /** Used for a missing, corrupt or unreadably-new document. */
  readonly createDefault: () => T;
  /**
   * Upgrades an older document. Receives the raw stored payload; must return a
   * value valid for the current version, or throw to fall back to the default.
   */
  readonly migrate?: (data: unknown, fromVersion: number) => T;
  /** Normalises/validates a current-version payload. */
  readonly normalize?: (data: unknown) => T;
}

export class JsonDocumentStore<T> {
  #pendingSave: Promise<void> | undefined;
  #queuedValue: T | undefined;

  constructor(
    private readonly storage: PluginStorage,
    private readonly path: string,
    private readonly options: JsonDocumentOptions<T>,
  ) {}

  private get tempPath(): string {
    return `${this.path}.tmp`;
  }

  async load(): Promise<T> {
    const primary = await this.#tryLoadFrom(this.path);
    if (primary.ok) return primary.value;

    // The primary file is missing or damaged. A verified temp file means a
    // crash interrupted the last write, so recover from it.
    const recovered = await this.#tryLoadFrom(this.tempPath);
    if (recovered.ok) {
      logger.warn('database', `Recovered ${this.path} from interrupted write`);
      await this.#writeVerified(recovered.value);
      await this.storage.deleteFile(this.tempPath);
      return recovered.value;
    }

    if (primary.reason === 'corrupt') {
      logger.error('database', `${this.path} is corrupt; starting from defaults`);
    }
    return this.options.createDefault();
  }

  async #tryLoadFrom(
    path: string,
  ): Promise<{ ok: true; value: T } | { ok: false; reason: 'missing' | 'corrupt' }> {
    let raw: string | null;
    try {
      raw = await this.storage.readText(path);
    } catch (error) {
      logger.warn('database', `Could not read ${path}`, error);
      return { ok: false, reason: 'corrupt' };
    }

    if (raw === null || raw.trim() === '') return { ok: false, reason: 'missing' };

    let parsed: VersionedDocument;
    try {
      parsed = JSON.parse(raw) as VersionedDocument;
    } catch (error) {
      logger.warn('database', `Could not parse ${path}`, error);
      return { ok: false, reason: 'corrupt' };
    }

    if (typeof parsed !== 'object' || parsed === null || typeof parsed.version !== 'number') {
      return { ok: false, reason: 'corrupt' };
    }

    if (parsed.version > this.options.version) {
      // Written by a newer build. Refuse rather than mangle it.
      logger.error(
        'database',
        `${path} was written by a newer version (${parsed.version} > ${this.options.version})`,
      );
      return { ok: false, reason: 'corrupt' };
    }

    try {
      if (parsed.version < this.options.version) {
        const migrated = this.options.migrate
          ? this.options.migrate(parsed.data, parsed.version)
          : this.options.createDefault();
        logger.info('database', `Migrated ${path} from v${parsed.version} to v${this.options.version}`);
        return { ok: true, value: migrated };
      }

      const value = this.options.normalize
        ? this.options.normalize(parsed.data)
        : (parsed.data as T);
      return { ok: true, value };
    } catch (error) {
      logger.error('database', `Migration or validation failed for ${path}`, error);
      return { ok: false, reason: 'corrupt' };
    }
  }

  async #writeVerified(value: T): Promise<void> {
    const document: VersionedDocument = { version: this.options.version, data: value };
    const serialized = JSON.stringify(document);

    // Step 1-2: write and verify the temp copy before touching the real file.
    await this.storage.writeText(this.tempPath, serialized);
    const readBack = await this.storage.readText(this.tempPath);
    if (readBack !== serialized) {
      throw new Error(`Verification failed writing ${this.path}`);
    }

    // Step 3-4: replace, then drop the temp copy.
    await this.storage.writeText(this.path, serialized);
    await this.storage.deleteFile(this.tempPath);
  }

  async save(value: T): Promise<void> {
    await this.#writeVerified(value);
  }

  /**
   * Coalesces bursts of writes.
   *
   * Indexing updates records continuously; persisting each one would spend more
   * time writing JSON than reading the folder. Callers get the guarantee that
   * the most recent value is eventually written, without ordering hazards.
   */
  saveDeferred(value: T): Promise<void> {
    this.#queuedValue = value;

    if (this.#pendingSave) return this.#pendingSave;

    this.#pendingSave = (async () => {
      // Yield once so synchronous bursts collapse into a single write.
      await Promise.resolve();

      while (this.#queuedValue !== undefined) {
        const next = this.#queuedValue;
        this.#queuedValue = undefined;
        try {
          await this.#writeVerified(next);
        } catch (error) {
          logger.error('database', `Deferred save of ${this.path} failed`, error);
        }
      }

      this.#pendingSave = undefined;
    })();

    return this.#pendingSave;
  }

  /** Waits for any deferred write to finish. */
  async flush(): Promise<void> {
    if (this.#pendingSave) await this.#pendingSave;
  }

  /** Removes both the document and any stale temp file. */
  async reset(): Promise<void> {
    await this.storage.deleteFile(this.path);
    await this.storage.deleteFile(this.tempPath);
  }
}
