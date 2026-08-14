/**
 * Thumbnail and preview resolution (roadmap section 19).
 *
 * KEY SIMPLIFICATION versus the original plan: UXP renders local files directly
 * with `<img src="file:/...">`, so raster and SVG assets need no generation at
 * all. Generation is reserved for PSD, PDF, AI and EPS, which Photoshop must
 * interpret first. That removes the majority of assets from the queue entirely.
 *
 * Everything that does need Photoshop is serialised through the modal queue,
 * one at a time, so preview work never competes with an insert.
 */
import type { AssetRecord, AssetType } from '../models/asset';
import { needsGeneratedPreview } from '../models/asset';
import type { CacheService } from './cache.service';
import { ModalPriority, modalQueue } from '../adapters/photoshop/modal-queue';
import { createSessionToken, getFileEntry } from '../adapters/photoshop/place-file';
import { generatePreview } from '../adapters/photoshop/temporary-document';
import { toAssetBrowserError } from '../models/errors';
import { toFileUrl } from '../utils/path-utils';
import { logger } from '../utils/logger';

/** What the UI should render for an asset's thumbnail. */
export type PreviewSource =
  /** Point an `<img>` straight at the original file. */
  | { readonly kind: 'direct'; readonly url: string }
  /** Point an `<img>` at a generated preview on disk. */
  | { readonly kind: 'cached'; readonly url: string }
  /** Generation is queued or running. */
  | { readonly kind: 'pending' }
  /** No preview is possible; show the format placeholder. */
  | { readonly kind: 'placeholder'; readonly type: AssetType; readonly reason?: string };

export interface ThumbnailRequest {
  readonly asset: AssetRecord;
  readonly size: number;
  /** Visible assets jump ahead of background work. */
  readonly visible: boolean;
  /**
   * Whether this request may open a Photoshop document.
   *
   * FALSE FOR THE GRID, TRUE FOR THE SELECTED ASSET.
   * Generating a preview opens the file as a real document - `dontDisplay`
   * suppresses dialogs, not the document window - so the user watches it open
   * and close. One of those on demand is a reasonable cost; a dozen fired off
   * by scrolling past a shelf of thumbnails is Photoshop flapping through
   * files the user never asked to see.
   *
   * Cached previews are served to the grid either way, so browsing populates
   * thumbnails naturally: select an asset once and its tile keeps the preview.
   */
  readonly allowGeneration?: boolean;
}

type Listener = (assetId: string, source: PreviewSource) => void;

export class ThumbnailService {
  /** Resolved cache paths, so repeated renders do not re-hit the filesystem. */
  readonly #resolved = new Map<string, PreviewSource>();
  /** Assets currently queued or generating, keyed by `${assetId}:${size}`. */
  readonly #inFlight = new Set<string>();
  /** Assets whose generation failed; not retried until explicitly regenerated. */
  readonly #failed = new Map<string, string>();
  /**
   * Generation is held until the panel says startup is over.
   *
   * Photoshop launching is the worst possible moment to open temporary
   * documents: the plugin would compete with the host's own startup work for
   * the same modal scope. Requests that arrive first are parked here and
   * replayed once generation is released.
   */
  #generationEnabled = false;
  readonly #deferred = new Map<string, ThumbnailRequest>();
  readonly #listeners = new Set<Listener>();

  constructor(
    private readonly cache: CacheService,
    private readonly options: { maxPreviewSourceMb: number; maxDirectRenderMb: number },
  ) {}

  /** Size above which a raster is cached rather than handed to `<img>`. */
  get #maxDirectBytes(): number {
    return this.options.maxDirectRenderMb * 1024 * 1024;
  }

  /**
   * Releases generation after startup. Idempotent, and replays anything the
   * grid asked for while it was held.
   */
  enableGeneration(): void {
    if (this.#generationEnabled) return;
    this.#generationEnabled = true;

    const parked = [...this.#deferred.values()];
    this.#deferred.clear();
    if (parked.length > 0) {
      logger.info('thumbnail', `Startup over; releasing ${parked.length} deferred previews`);
    }
    for (const request of parked) void this.request(request);
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  #emit(assetId: string, source: PreviewSource): void {
    this.#resolved.set(assetId, source);
    for (const listener of this.#listeners) listener(assetId, source);
  }

  /**
   * Best currently-known preview for an asset, without triggering work.
   *
   * Synchronous so the grid can render during scrolling; call `request` to kick
   * off generation for anything that returns a placeholder.
   */
  peek(asset: AssetRecord): PreviewSource {
    if (!needsGeneratedPreview(asset.type, asset.sizeBytes, this.#maxDirectBytes)) {
      return { kind: 'direct', url: toFileUrl(asset.nativePath) };
    }

    const cached = this.#resolved.get(asset.id);
    if (cached) return cached;

    const failure = this.#failed.get(asset.id);
    if (failure) return { kind: 'placeholder', type: asset.type, reason: failure };

    return { kind: 'placeholder', type: asset.type };
  }

  /**
   * Ensures a preview exists, generating it if necessary.
   *
   * Safe to call repeatedly - duplicate requests for the same asset and size
   * collapse into the in-flight one.
   */
  async request({
    asset,
    size,
    visible,
    allowGeneration = false,
  }: ThumbnailRequest): Promise<PreviewSource> {
    if (!needsGeneratedPreview(asset.type, asset.sizeBytes, this.#maxDirectBytes)) {
      return { kind: 'direct', url: toFileUrl(asset.nativePath) };
    }

    const key = `${asset.id}:${size}`;

    const alreadyResolved = this.#resolved.get(asset.id);
    if (alreadyResolved?.kind === 'cached') return alreadyResolved;

    if (this.#failed.has(asset.id)) {
      return { kind: 'placeholder', type: asset.type, reason: this.#failed.get(asset.id) };
    }

    if (this.#inFlight.has(key)) return { kind: 'pending' };

    // Already on disk from a previous session.
    const cachedPath = await this.cache.nativePathFor(asset.id, size);
    if (cachedPath) {
      const source: PreviewSource = { kind: 'cached', url: toFileUrl(cachedPath) };
      this.#emit(asset.id, source);
      return source;
    }

    // Very large sources are skipped rather than risking a long Photoshop stall
    // on every scroll (roadmap section 26).
    const maxBytes = this.options.maxPreviewSourceMb * 1024 * 1024;
    if (asset.sizeBytes != null && asset.sizeBytes > maxBytes) {
      const reason = `File is larger than the ${this.options.maxPreviewSourceMb} MB preview limit.`;
      this.#failed.set(asset.id, reason);
      const source: PreviewSource = { kind: 'placeholder', type: asset.type, reason };
      this.#emit(asset.id, source);
      return source;
    }

    /*
     * Reaching here means opening a document. The grid never gets to do that;
     * it shows the format placeholder until the asset has been selected once.
     */
    if (!allowGeneration) {
      return { kind: 'placeholder', type: asset.type };
    }

    /*
     * Anything already on disk resolved above, so reaching here means real
     * Photoshop work. Hold it until startup is over - a cached library still
     * renders instantly, only genuinely new previews wait.
     */
    if (!this.#generationEnabled) {
      this.#deferred.set(key, { asset, size, visible, allowGeneration });
      return { kind: 'pending' };
    }

    this.#inFlight.add(key);
    this.#emit(asset.id, { kind: 'pending' });

    void this.#generate(asset, size, visible, key);
    return { kind: 'pending' };
  }

  async #generate(asset: AssetRecord, size: number, visible: boolean, key: string): Promise<void> {
    try {
      const entry = await getFileEntry(asset.nativePath);
      const token = createSessionToken(entry);

      const bytes = await modalQueue.run(
        {
          commandName: `Preview ${asset.name}`,
          priority: visible ? ModalPriority.VisiblePreview : ModalPriority.Background,
        },
        () => generatePreview(token, asset.nativePath, { targetSize: size }),
      );

      const cachedPath = await this.cache.write(asset.id, size, bytes);
      if (!cachedPath) {
        // Cache write failed but the preview exists; treat as a soft failure so
        // it is retried next session rather than marked permanently broken.
        this.#emit(asset.id, { kind: 'placeholder', type: asset.type });
        return;
      }

      this.#emit(asset.id, { kind: 'cached', url: toFileUrl(cachedPath) });
    } catch (error) {
      const normalized = toAssetBrowserError(
        error,
        asset.type === 'illustrator' ? 'AI_PREVIEW_UNAVAILABLE' : 'PREVIEW_FAILED',
      );
      logger.warn('thumbnail', `Preview failed for ${asset.name}`, error);

      this.#failed.set(asset.id, normalized.message);
      this.#emit(asset.id, {
        kind: 'placeholder',
        type: asset.type,
        reason: normalized.message,
      });
    } finally {
      this.#inFlight.delete(key);
    }
  }

  /**
   * Clears the failure record so the user's retry actually retries.
   *
   * `allowGeneration` is the point of the whole call: without it the replayed
   * request took the same path as a grid thumbnail, short-circuited to a
   * placeholder and emitted nothing, so Regenerate produced no visible change
   * however many times it was clicked.
   */
  async regenerate(asset: AssetRecord, size: number): Promise<PreviewSource> {
    this.#failed.delete(asset.id);
    this.#resolved.delete(asset.id);
    await this.cache.delete(asset.id, size);
    return this.request({ asset, size, visible: true, allowGeneration: true });
  }

  /** Drops memoised state, e.g. after clearing the cache. */
  reset(): void {
    this.#resolved.clear();
    this.#failed.clear();
  }

  get pendingCount(): number {
    return this.#inFlight.size;
  }
}
