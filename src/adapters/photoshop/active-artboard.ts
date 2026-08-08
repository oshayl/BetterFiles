/**
 * Resolves where an asset should land (roadmap section 21).
 *
 * Targeting order: selected artboard, then the artboard containing the active
 * layer, then the document canvas.
 *
 * Artboard bounds are read through `batchPlay`, which is documented to
 * occasionally return zeroed or inverted rectangles. Every candidate is
 * therefore validated before use, and the strategy that succeeded is reported
 * so the self-test harness can show which path actually works on a given build.
 */
import type { Layer } from 'photoshop';
import { type Bounds, isUsableBounds, toBounds } from '../../utils/geometry';
import { AssetBrowserError } from '../../models/errors';
import { logger } from '../../utils/logger';
import { photoshop } from '../host';


export type TargetStrategy =
  | 'selectedArtboard'
  | 'ancestorArtboard'
  | 'documentCanvas'
  | 'documentFallback';

export interface InsertionTarget {
  readonly bounds: Bounds;
  readonly strategy: TargetStrategy;
  readonly documentId: number;
  readonly artboardName?: string;
}

/** Maximum ancestors to walk when looking for a containing artboard. */
const MAX_ANCESTOR_DEPTH = 12;

/**
 * Reads a layer descriptor by id.
 *
 * The DOM `Layer` object does not expose `artboardEnabled`, so this drops to
 * the Action Manager for the artboard flag and rectangle.
 */
async function getLayerDescriptor(layerId: number): Promise<Record<string, unknown> | null> {
  try {
    const [descriptor] = await photoshop().action.batchPlay(
      [{ _obj: 'get', _target: [{ _ref: 'layer', _id: layerId }] }],
      { synchronousExecution: false },
    );
    return (descriptor as Record<string, unknown>) ?? null;
  } catch (error) {
    logger.debug('artboard', `Could not read layer ${layerId}`, error);
    return null;
  }
}

/** Extracts artboard bounds from a layer descriptor, if it is an artboard. */
function readArtboardBounds(descriptor: Record<string, unknown> | null): Bounds | null {
  if (!descriptor) return null;
  if (descriptor['artboardEnabled'] !== true) return null;

  const artboard = descriptor['artboard'] as { artboardRect?: Record<string, number> } | undefined;
  const rect = artboard?.artboardRect;
  if (!rect) return null;

  const bounds = toBounds(rect);
  return isUsableBounds(bounds) ? bounds : null;
}

/**
 * Walks up from the active layer looking for an artboard.
 *
 * `Layer.parent` returns null at the top level, which terminates the walk. The
 * depth cap is belt-and-braces against a pathological hierarchy.
 */
async function findAncestorArtboard(
  startLayer: Layer,
): Promise<{ bounds: Bounds; name: string } | null> {
  let current: Layer | null = startLayer;
  let depth = 0;

  while (current && depth < MAX_ANCESTOR_DEPTH) {
    const descriptor = await getLayerDescriptor(current.id);
    const bounds = readArtboardBounds(descriptor);
    if (bounds) return { bounds, name: current.name };

    // `parent` is not in our minimal type surface; read it defensively.
    current = (current as unknown as { parent?: Layer | null }).parent ?? null;
    depth += 1;
  }

  return null;
}

/**
 * Determines the insertion target for the active document.
 *
 * Throws `NO_ACTIVE_DOCUMENT` when nothing is open - the one case where
 * insertion genuinely cannot proceed.
 */
export async function resolveInsertionTarget(): Promise<InsertionTarget> {
  const doc = photoshop().app.activeDocument;
  if (!doc) throw new AssetBrowserError('NO_ACTIVE_DOCUMENT');

  const documentBounds: Bounds = {
    left: 0,
    top: 0,
    right: doc.width,
    bottom: doc.height,
  };

  const activeLayers = doc.activeLayers ?? [];
  const activeLayer = activeLayers[0];

  if (activeLayer) {
    // 1. The selected layer is itself an artboard.
    const selfDescriptor = await getLayerDescriptor(activeLayer.id);
    const selfBounds = readArtboardBounds(selfDescriptor);
    if (selfBounds) {
      return {
        bounds: selfBounds,
        strategy: 'selectedArtboard',
        documentId: doc.id,
        artboardName: activeLayer.name,
      };
    }

    // 2. An ancestor of the selected layer is an artboard.
    const ancestor = await findAncestorArtboard(activeLayer);
    if (ancestor) {
      return {
        bounds: ancestor.bounds,
        strategy: 'ancestorArtboard',
        documentId: doc.id,
        artboardName: ancestor.name,
      };
    }
  }

  // 3. No artboard in play - centre on the canvas.
  if (isUsableBounds(documentBounds)) {
    return { bounds: documentBounds, strategy: 'documentCanvas', documentId: doc.id };
  }

  // 4. Document dimensions were unreadable. Use a nominal box so placement
  //    still happens rather than failing outright.
  logger.warn('artboard', 'Document reported unusable dimensions; using fallback bounds');
  return {
    bounds: { left: 0, top: 0, right: 1000, bottom: 1000 },
    strategy: 'documentFallback',
    documentId: doc.id,
  };
}

/** Bounds of a layer by id, used to measure a freshly placed Smart Object. */
export async function getLayerBounds(layerId: number): Promise<Bounds | null> {
  const descriptor = await getLayerDescriptor(layerId);
  if (!descriptor) return null;

  // `bounds` is the effects-inclusive rectangle; Smart Objects have no effects
  // at placement time, so it matches the artwork.
  const rect = descriptor['bounds'] as Record<string, { _value?: number } | number> | undefined;
  if (!rect) return null;

  const readSide = (side: string): number => {
    const value = rect[side];
    if (typeof value === 'number') return value;
    // Action Manager returns unit values as { _unit, _value }.
    if (value && typeof value === 'object' && typeof value._value === 'number') return value._value;
    return 0;
  };

  const bounds: Bounds = {
    left: readSide('left'),
    top: readSide('top'),
    right: readSide('right'),
    bottom: readSide('bottom'),
  };

  return isUsableBounds(bounds) ? bounds : null;
}
