/**
 * Low-level Photoshop placement operations (roadmap section 20).
 *
 * Each function is a thin wrapper over one Action Manager descriptor. They are
 * kept separate and individually exercised by the self-test harness, because
 * descriptor shapes are the part of this plugin most likely to differ between
 * Photoshop versions.
 */
import type { storage as UxpStorage } from 'uxp';
import { AssetBrowserError } from '../../models/errors';
import { logger } from '../../utils/logger';
import { photoshop, uxp } from '../host';



/**
 * Session token for a file entry.
 *
 * `batchPlay` cannot take a raw path - it needs a token minted for this
 * session, which is also what carries the sandbox permission.
 */
export function createSessionToken(entry: UxpStorage.Entry): string {
  return uxp().storage.localFileSystem.createSessionToken(entry);
}

/** Resolves a native path to a UXP file entry. */
export async function getFileEntry(nativePath: string): Promise<UxpStorage.File> {
  const entry = await uxp().storage.localFileSystem.getEntryWithUrl(`file:${nativePath}`);
  if (!entry || !entry.isFile) {
    throw new AssetBrowserError('FILE_MISSING', { detail: nativePath });
  }
  return entry as UxpStorage.File;
}

export interface PlaceOptions {
  /** True places a linked Smart Object instead of embedding the data. */
  readonly linked: boolean;
  /** 1-based page for multi-page PDFs. */
  readonly pdfPage?: number;
}

/**
 * Places a file as a Smart Object into the active document.
 *
 * Must be called inside a modal scope. Returns the new layer's id so the caller
 * can measure and transform it.
 */
export async function placeFile(token: string, options: PlaceOptions): Promise<number | null> {
  const descriptor: Record<string, unknown> = {
    _obj: 'placeEvent',
    null: { _path: token, _kind: 'local' },
    linked: options.linked,
    _options: { dialogOptions: 'dontDisplay' },
  };

  // Page selection for multi-page PDFs travels as a separate key; harmless for
  // other formats, which ignore it.
  if (options.pdfPage != null && options.pdfPage > 1) {
    descriptor['pageNumber'] = options.pdfPage;
    descriptor['crop'] = { _enum: 'cropTo', _value: 'boundingBox' };
  }

  await photoshop().action.batchPlay([descriptor], {
    synchronousExecution: false,
    modalBehavior: 'execute',
  });

  return getActiveLayerId();
}

/** Id of the currently selected layer, or null when nothing is selected. */
export function getActiveLayerId(): number | null {
  const doc = photoshop().app.activeDocument;
  const layer = doc?.activeLayers?.[0];
  return layer ? layer.id : null;
}

export interface TransformArgs {
  readonly offsetX: number;
  readonly offsetY: number;
  readonly scalePercent: number;
  readonly applyScale: boolean;
  readonly applyOffset: boolean;
}

/**
 * Moves and uniformly scales the selected layer.
 *
 * Scaling is anchored at the layer's own centre (`QCSAverage`), so the move and
 * the scale are independent and can be issued in one descriptor.
 */
export async function transformSelectedLayer(args: TransformArgs): Promise<void> {
  if (!args.applyScale && !args.applyOffset) return;

  const descriptor: Record<string, unknown> = {
    _obj: 'transform',
    _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
    freeTransformCenterState: { _enum: 'quadCenterState', _value: 'QCSAverage' },
    interpolation: { _enum: 'interpolationType', _value: 'bicubic' },
    _options: { dialogOptions: 'dontDisplay' },
  };

  if (args.applyOffset) {
    descriptor['offset'] = {
      _obj: 'offset',
      horizontal: { _unit: 'pixelsUnit', _value: args.offsetX },
      vertical: { _unit: 'pixelsUnit', _value: args.offsetY },
    };
  }

  if (args.applyScale) {
    descriptor['width'] = { _unit: 'percentUnit', _value: args.scalePercent };
    descriptor['height'] = { _unit: 'percentUnit', _value: args.scalePercent };
  }

  await photoshop().action.batchPlay([descriptor], {
    synchronousExecution: false,
    modalBehavior: 'execute',
  });
}

/** Renames the selected layer, so inserted assets are identifiable in the stack. */
export async function renameSelectedLayer(name: string): Promise<void> {
  await photoshop().action.batchPlay(
    [
      {
        _obj: 'set',
        _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
        to: { _obj: 'layer', name },
        _options: { dialogOptions: 'dontDisplay' },
      },
    ],
    { synchronousExecution: false, modalBehavior: 'execute' },
  );
}

/** Rasterizes the selected Smart Object. */
export async function rasterizeSelectedLayer(): Promise<void> {
  await photoshop().action.batchPlay(
    [
      {
        _obj: 'rasterizeLayer',
        _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
        _options: { dialogOptions: 'dontDisplay' },
      },
    ],
    { synchronousExecution: false, modalBehavior: 'execute' },
  );
}

/**
 * Starts Free Transform on the selected layer.
 *
 * Deliberately NOT run inside `executeAsModal`: Free Transform is an
 * interactive tool that hands control back to the user, and starting it inside
 * a modal scope would either fail or trap the user in the plugin's transaction.
 * A failure here is non-fatal - the asset is already placed - so it is logged
 * rather than thrown.
 */
export async function startFreeTransform(): Promise<boolean> {
  try {
    await photoshop().action.batchPlay(
      [
        {
          _obj: 'select',
          _target: [{ _ref: 'menuItemClass', _enum: 'menuItemType', _value: 'freeTransform' }],
        },
      ],
      { synchronousExecution: false, modalBehavior: 'execute' },
    );
    return true;
  } catch (error) {
    logger.warn('place', 'Could not start Free Transform', error);
    return false;
  }
}

/** Opens a file as its own document rather than placing it. */
export async function openAsDocument(entry: UxpStorage.File): Promise<void> {
  await photoshop().app.open(entry);
}
