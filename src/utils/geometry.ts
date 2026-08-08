/**
 * Placement geometry (roadmap section 21).
 *
 * Pure maths, kept separate from the Photoshop adapters so the centring and
 * scale-to-fit rules are unit tested rather than validated by eye in the host.
 */

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Size {
  readonly width: number;
  readonly height: number;
}

export function boundsWidth(bounds: Bounds): number {
  return bounds.right - bounds.left;
}

export function boundsHeight(bounds: Bounds): number {
  return bounds.bottom - bounds.top;
}

export function getCenter(bounds: Bounds): Point {
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2,
  };
}

/**
 * Rejects bounds that cannot be used for placement.
 *
 * Photoshop's `artboardRect` is documented to sometimes come back as all zeros
 * or with inverted coordinates, and silently centring on a degenerate rectangle
 * would drop the asset at the canvas origin. Treat anything suspect as unusable
 * and let the caller fall back to the document.
 */
export function isUsableBounds(bounds: Bounds | null | undefined): bounds is Bounds {
  if (!bounds) return false;

  const values = [bounds.left, bounds.top, bounds.right, bounds.bottom];
  if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return false;

  return boundsWidth(bounds) > 0 && boundsHeight(bounds) > 0;
}

/**
 * Scale factor that fits an asset inside a target.
 *
 * Never exceeds 1: upscaling a small asset to fill the artboard would degrade
 * it, and the user can always scale up during Free Transform (section 21.1).
 */
export function getScaleFactor(
  assetWidth: number,
  assetHeight: number,
  targetWidth: number,
  targetHeight: number,
  coverage = 0.7,
): number {
  if (assetWidth <= 0 || assetHeight <= 0) return 1;
  if (targetWidth <= 0 || targetHeight <= 0) return 1;

  const maxWidth = targetWidth * coverage;
  const maxHeight = targetHeight * coverage;

  return Math.min(1, maxWidth / assetWidth, maxHeight / assetHeight);
}

export interface PlacementTransform {
  /** Horizontal move in pixels, applied after scaling. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** Uniform scale as a percentage, as `transform` expects. */
  readonly scalePercent: number;
  /** False when the asset already fits and no scaling is needed. */
  readonly needsScale: boolean;
  readonly needsMove: boolean;
}

/**
 * Computes how to move and scale a just-placed layer so it sits centred in the
 * target, scaled down if oversized.
 *
 * Photoshop places a Smart Object centred on the *canvas*, so the offset is
 * measured from the canvas centre to the target centre. Scaling happens about
 * the layer's own centre, which is why the offset is unaffected by scale.
 */
export function computePlacementTransform(
  placedBounds: Bounds,
  targetBounds: Bounds,
  options: { scaleToFit: boolean; maxCanvasCoverage: number },
): PlacementTransform {
  const placedWidth = boundsWidth(placedBounds);
  const placedHeight = boundsHeight(placedBounds);

  const scale = options.scaleToFit
    ? getScaleFactor(
        placedWidth,
        placedHeight,
        boundsWidth(targetBounds),
        boundsHeight(targetBounds),
        options.maxCanvasCoverage,
      )
    : 1;

  const placedCenter = getCenter(placedBounds);
  const targetCenter = getCenter(targetBounds);

  const offsetX = targetCenter.x - placedCenter.x;
  const offsetY = targetCenter.y - placedCenter.y;

  // Sub-pixel differences are not worth an extra history step.
  const EPSILON = 0.5;

  return {
    offsetX,
    offsetY,
    scalePercent: scale * 100,
    needsScale: Math.abs(scale - 1) > 0.001,
    needsMove: Math.abs(offsetX) > EPSILON || Math.abs(offsetY) > EPSILON,
  };
}

/** Fits a size inside a box, preserving aspect ratio. Used for preview layout. */
export function fitWithin(source: Size, box: Size): Size {
  if (source.width <= 0 || source.height <= 0) return { width: 0, height: 0 };

  const scale = Math.min(box.width / source.width, box.height / source.height, 1);
  return {
    width: Math.round(source.width * scale),
    height: Math.round(source.height * scale),
  };
}

/** Converts a Photoshop rectangle descriptor into `Bounds`. */
export function toBounds(rect: {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
}): Bounds {
  return {
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: rect.right ?? 0,
    bottom: rect.bottom ?? 0,
  };
}
