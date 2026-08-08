/**
 * Asset insertion (roadmap sections 20 and 21).
 *
 * The whole placement - place, measure, scale, centre, rename - runs inside a
 * single modal scope so Photoshop records it as one undoable step. Free
 * Transform is started afterwards, outside the scope, because it is an
 * interactive tool that must hand control back to the user.
 */
import type { AssetRecord } from '../models/asset';
import type { ImportOptions } from '../models/import-options';
import { AssetBrowserError, toAssetBrowserError } from '../models/errors';
import { ModalPriority, modalQueue } from '../adapters/photoshop/modal-queue';
import { getLayerBounds, resolveInsertionTarget } from '../adapters/photoshop/active-artboard';
import {
  createSessionToken,
  getFileEntry,
  openAsDocument,
  placeFile,
  rasterizeSelectedLayer,
  renameSelectedLayer,
  startFreeTransform,
  transformSelectedLayer,
} from '../adapters/photoshop/place-file';
import { computePlacementTransform } from '../utils/geometry';
import { stemname } from '../utils/path-utils';
import { logger } from '../utils/logger';

export interface InsertionResult {
  readonly assetId: string;
  /** Null when the mode was `openDocument`. */
  readonly layerId: number | null;
  readonly strategy: string;
  readonly scaled: boolean;
  readonly centred: boolean;
  readonly freeTransformStarted: boolean;
}

/**
 * Inserts an asset into the active document.
 *
 * Throws `AssetBrowserError` with a code the UI can render directly; the
 * technical cause goes to the diagnostics log.
 */
export async function insertAsset(
  asset: AssetRecord,
  options: ImportOptions,
): Promise<InsertionResult> {
  const entry = await getFileEntry(asset.nativePath);

  if (options.mode === 'openDocument') {
    await openAsDocument(entry);
    return {
      assetId: asset.id,
      layerId: null,
      strategy: 'openDocument',
      scaled: false,
      centred: false,
      freeTransformStarted: false,
    };
  }

  // Minted outside the modal scope: token creation is synchronous and does not
  // need one, and doing it first means a bad path fails before we take the lock.
  const token = createSessionToken(entry);

  const result = await modalQueue.run(
    { commandName: `Insert ${asset.name}`, priority: ModalPriority.Interactive },
    async (): Promise<Omit<InsertionResult, 'freeTransformStarted'>> => {
      const target = await resolveInsertionTarget();

      const layerId = await placeFile(token, {
        linked: options.mode === 'linkedSmartObject',
        ...(options.pdfPage != null ? { pdfPage: options.pdfPage } : {}),
      });

      if (layerId == null) {
        throw new AssetBrowserError('IMPORT_FAILED', {
          message: 'The asset was not placed. Photoshop did not report a new layer.',
        });
      }

      // Photoshop centres a placed Smart Object on the canvas. Measure what
      // actually landed rather than trusting the asset's stored dimensions,
      // which may be absent or wrong for vector and PDF sources.
      const placedBounds = await getLayerBounds(layerId);

      let scaled = false;
      let centred = false;

      if (placedBounds) {
        const transform = computePlacementTransform(placedBounds, target.bounds, {
          scaleToFit: options.scaleToFit,
          maxCanvasCoverage: options.maxCanvasCoverage,
        });

        if (transform.needsScale || transform.needsMove) {
          await transformSelectedLayer({
            offsetX: transform.offsetX,
            offsetY: transform.offsetY,
            scalePercent: transform.scalePercent,
            applyScale: transform.needsScale,
            applyOffset: transform.needsMove,
          });
        }

        scaled = transform.needsScale;
        centred = transform.needsMove;
      } else {
        logger.warn('insert', `Could not measure placed layer for ${asset.name}`);
      }

      // Name the layer after the file so the layer stack stays readable.
      try {
        await renameSelectedLayer(stemname(asset.name));
      } catch (error) {
        // Cosmetic only - never fail an insert over a layer name.
        logger.debug('insert', 'Could not rename placed layer', error);
      }

      if (options.mode === 'rasterized') {
        await rasterizeSelectedLayer();
      }

      return { assetId: asset.id, layerId, strategy: target.strategy, scaled, centred };
    },
  );

  // Outside the modal scope: hands control to the user (section 11.1 step 8).
  const freeTransformStarted = options.enterFreeTransform ? await startFreeTransform() : false;

  logger.info(
    'insert',
    `Placed ${asset.name} via ${result.strategy}${result.scaled ? ' (scaled)' : ''}`,
  );

  return { ...result, freeTransformStarted };
}

/** Wraps insertion so callers always receive a normalised error. */
export async function insertAssetSafely(
  asset: AssetRecord,
  options: ImportOptions,
): Promise<{ ok: true; result: InsertionResult } | { ok: false; error: AssetBrowserError }> {
  try {
    return { ok: true, result: await insertAsset(asset, options) };
  } catch (error) {
    return { ok: false, error: toAssetBrowserError(error, 'IMPORT_FAILED') };
  }
}
