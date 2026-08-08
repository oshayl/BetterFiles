import { describe, expect, it } from 'vitest';
import {
  boundsHeight,
  boundsWidth,
  computePlacementTransform,
  fitWithin,
  getCenter,
  getScaleFactor,
  isUsableBounds,
  toBounds,
} from '../../src/utils/geometry';

const ARTBOARD = { left: 0, top: 0, right: 1000, bottom: 1000 };

describe('bounds helpers', () => {
  it('measures width, height and centre', () => {
    const bounds = { left: 100, top: 50, right: 300, bottom: 250 };
    expect(boundsWidth(bounds)).toBe(200);
    expect(boundsHeight(bounds)).toBe(200);
    expect(getCenter(bounds)).toEqual({ x: 200, y: 150 });
  });

  it('handles artboards at negative coordinates', () => {
    // Artboards routinely sit at negative offsets in a multi-artboard document.
    const bounds = { left: -500, top: -500, right: -100, bottom: -100 };
    expect(boundsWidth(bounds)).toBe(400);
    expect(getCenter(bounds)).toEqual({ x: -300, y: -300 });
  });
});

describe('isUsableBounds', () => {
  it('accepts a normal rectangle', () => {
    expect(isUsableBounds(ARTBOARD)).toBe(true);
  });

  it('rejects the all-zero rectangle Photoshop sometimes returns', () => {
    expect(isUsableBounds({ left: 0, top: 0, right: 0, bottom: 0 })).toBe(false);
  });

  it('rejects inverted rectangles', () => {
    expect(isUsableBounds({ left: 100, top: 100, right: 50, bottom: 50 })).toBe(false);
  });

  it('rejects non-finite values', () => {
    expect(isUsableBounds({ left: 0, top: 0, right: Number.NaN, bottom: 100 })).toBe(false);
    expect(isUsableBounds({ left: 0, top: 0, right: Infinity, bottom: 100 })).toBe(false);
  });

  it('rejects null and undefined', () => {
    expect(isUsableBounds(null)).toBe(false);
    expect(isUsableBounds(undefined)).toBe(false);
  });
});

describe('getScaleFactor', () => {
  it('never upscales an asset that already fits', () => {
    expect(getScaleFactor(100, 100, 1000, 1000, 0.7)).toBe(1);
  });

  it('scales an oversized asset down to the coverage limit', () => {
    // 2000px wide into a 1000px artboard at 70% -> 700/2000.
    expect(getScaleFactor(2000, 2000, 1000, 1000, 0.7)).toBeCloseTo(0.35);
  });

  it('constrains by the tighter axis', () => {
    // Wide asset: width is the binding constraint.
    expect(getScaleFactor(4000, 500, 1000, 1000, 0.7)).toBeCloseTo(0.175);
  });

  it('respects a custom coverage', () => {
    expect(getScaleFactor(2000, 2000, 1000, 1000, 1)).toBeCloseTo(0.5);
  });

  it('returns 1 for degenerate inputs rather than dividing by zero', () => {
    expect(getScaleFactor(0, 0, 1000, 1000)).toBe(1);
    expect(getScaleFactor(100, 100, 0, 0)).toBe(1);
  });
});

describe('computePlacementTransform', () => {
  const options = { scaleToFit: true, maxCanvasCoverage: 0.7 };

  it('centres a layer placed at the canvas centre onto an offset artboard', () => {
    // Placed centred on a 2000x2000 canvas; artboard sits in the top-left.
    const placed = { left: 900, top: 900, right: 1100, bottom: 1100 };
    const artboard = { left: 0, top: 0, right: 500, bottom: 500 };

    const result = computePlacementTransform(placed, artboard, options);

    expect(result.offsetX).toBe(-750);
    expect(result.offsetY).toBe(-750);
    expect(result.needsMove).toBe(true);
  });

  it('reports no move when the layer is already centred', () => {
    const placed = { left: 400, top: 400, right: 600, bottom: 600 };
    const result = computePlacementTransform(placed, ARTBOARD, options);

    expect(result.needsMove).toBe(false);
    expect(result.offsetX).toBe(0);
  });

  it('reports no scale when the asset already fits', () => {
    const placed = { left: 400, top: 400, right: 600, bottom: 600 };
    const result = computePlacementTransform(placed, ARTBOARD, options);

    expect(result.needsScale).toBe(false);
    expect(result.scalePercent).toBe(100);
  });

  it('scales an oversized asset and reports it as a percentage', () => {
    const placed = { left: 0, top: 0, right: 2000, bottom: 2000 };
    const result = computePlacementTransform(placed, ARTBOARD, options);

    expect(result.needsScale).toBe(true);
    expect(result.scalePercent).toBeCloseTo(35);
  });

  it('skips scaling entirely when scaleToFit is off', () => {
    const placed = { left: 0, top: 0, right: 5000, bottom: 5000 };
    const result = computePlacementTransform(placed, ARTBOARD, {
      scaleToFit: false,
      maxCanvasCoverage: 0.7,
    });

    expect(result.needsScale).toBe(false);
    expect(result.scalePercent).toBe(100);
  });

  it('ignores sub-pixel offsets that would cost a history step for nothing', () => {
    const placed = { left: 400.2, top: 400.2, right: 600.2, bottom: 600.2 };
    const result = computePlacementTransform(placed, ARTBOARD, options);

    expect(result.needsMove).toBe(false);
  });

  it('handles an artboard at negative coordinates', () => {
    const placed = { left: 900, top: 900, right: 1100, bottom: 1100 };
    const artboard = { left: -1000, top: -1000, right: -500, bottom: -500 };

    const result = computePlacementTransform(placed, artboard, options);
    expect(result.offsetX).toBe(-1750);
    expect(result.offsetY).toBe(-1750);
  });
});

describe('fitWithin', () => {
  it('scales down to fit the box', () => {
    expect(fitWithin({ width: 2000, height: 1000 }, { width: 500, height: 500 })).toEqual({
      width: 500,
      height: 250,
    });
  });

  it('never upscales', () => {
    expect(fitWithin({ width: 100, height: 100 }, { width: 500, height: 500 })).toEqual({
      width: 100,
      height: 100,
    });
  });

  it('returns zero for a degenerate source', () => {
    expect(fitWithin({ width: 0, height: 0 }, { width: 500, height: 500 })).toEqual({
      width: 0,
      height: 0,
    });
  });
});

describe('toBounds', () => {
  it('defaults missing sides to zero', () => {
    expect(toBounds({ left: 10, top: 20 })).toEqual({ left: 10, top: 20, right: 0, bottom: 0 });
  });
});
