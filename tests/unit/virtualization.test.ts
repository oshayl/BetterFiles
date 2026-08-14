import { describe, expect, it } from 'vitest';
import {
  GROUP_HEADER_HEIGHT,
  GROUP_HEADER_MARGIN,
  buildOffsets,
  buildRows,
  computeColumns,
  computeRowWindow,
  findAssetPosition,
  findRowAtOffset,
  moveSelection,
  rowHeight,
  scrollOffsetForRow,
} from '../../src/utils/virtualization';
import { makeAsset } from '../helpers/fixtures';

const METRICS = {
  containerWidth: 400,
  containerHeight: 300,
  tileWidth: 96,
  tileHeight: 130,
  gap: 8,
};

/** n assets alternating between two types, for grouping tests. */
function assets(count: number, type: 'raster' | 'svg' = 'raster') {
  return Array.from({ length: count }, (_, i) =>
    makeAsset({ name: `a${i}.${type === 'svg' ? 'svg' : 'png'}` }),
  );
}

describe('computeColumns', () => {
  it('fits as many tiles as the width allows, accounting for gaps', () => {
    // 4 tiles: 4*96 + 3*8 = 408 > 400, so 3 fit (3*96 + 2*8 = 304).
    expect(computeColumns(400, 96, 8)).toBe(3);
  });

  it('never returns zero, so a very narrow panel still renders', () => {
    expect(computeColumns(20, 96, 8)).toBe(1);
    expect(computeColumns(0, 96, 8)).toBe(1);
  });

  it('handles an exact fit', () => {
    expect(computeColumns(304, 96, 8)).toBe(3);
  });
});

describe('buildRows', () => {
  it('chunks assets by column count when ungrouped', () => {
    const rows = buildRows(assets(7), 3, false);
    expect(rows).toHaveLength(3);
    expect(rows.every((row) => row.kind === 'items')).toBe(true);
    expect(rows[2]).toMatchObject({ kind: 'items' });
    // Last row holds the remainder.
    expect(rows[2]!.kind === 'items' && rows[2]!.items).toHaveLength(1);
  });

  it('emits a header per non-empty type when grouped', () => {
    const mixed = [
      makeAsset({ name: 'a.png' }),
      makeAsset({ name: 'b.svg' }),
      makeAsset({ name: 'c.png' }),
    ];
    const rows = buildRows(mixed, 3, true);

    const headers = rows.filter((row) => row.kind === 'header');
    expect(headers).toHaveLength(2);
    expect(headers.map((h) => h.kind === 'header' && h.label)).toEqual([
      'Images and Textures',
      'SVG Vectors',
    ]);
  });

  it('never lets one group bleed into another row', () => {
    // 2 rasters + 2 svgs with 3 columns: without per-group chunking these would
    // share a row.
    const mixed = [
      makeAsset({ name: 'a.png' }),
      makeAsset({ name: 'b.png' }),
      makeAsset({ name: 'c.svg' }),
      makeAsset({ name: 'd.svg' }),
    ];
    const rows = buildRows(mixed, 3, true);

    for (const row of rows) {
      if (row.kind !== 'items') continue;
      const types = new Set(row.items.map((asset) => asset.type));
      expect(types.size).toBe(1);
    }
  });

  it('omits groups with no members', () => {
    const rows = buildRows(assets(2), 3, true);
    expect(rows.filter((row) => row.kind === 'header')).toHaveLength(1);
  });

  it('returns nothing for an empty library', () => {
    expect(buildRows([], 3, false)).toEqual([]);
    expect(buildRows([], 3, true)).toEqual([]);
  });
});

describe('buildOffsets and findRowAtOffset', () => {
  it('accumulates mixed header and tile row heights', () => {
    const rows = buildRows([makeAsset({ name: 'a.png' }), makeAsset({ name: 'b.svg' })], 3, true);
    const offsets = buildOffsets(rows, METRICS.tileHeight, METRICS.gap);

    expect(offsets[0]).toBe(0);
    // Each entry advances by that row's own height.
    for (let i = 0; i < rows.length; i += 1) {
      const expected = (offsets[i] ?? 0) + rowHeight(rows[i]!, METRICS.tileHeight, METRICS.gap);
      expect(offsets[i + 1]).toBe(expected);
    }
  });

  /*
   * Asserted against the LITERAL heights in components.css, not against the
   * constants themselves. `GROUP_HEADER_HEIGHT + GROUP_HEADER_MARGIN` on the
   * right-hand side is a tautology: it passed just as happily when the header
   * was 23 against a stylesheet that says 22, which is the drift these tests
   * exist to catch.
   *
   * If components.css changes `.asset-group__header`, these numbers change with
   * it - by hand, deliberately, and visibly in the diff.
   *
   *   .asset-group__header { height: 22px; margin-bottom: 8px }
   *   + `* { box-sizing: border-box }` in global.css, so the 1px border-bottom
   *     is INSIDE the 22 and must not be added again.
   */
  it('gives headers and tile rows different heights', () => {
    const header = { kind: 'header' as const, label: 'x', count: 1 };
    const items = { kind: 'items' as const, items: [] };

    expect(rowHeight(header, 130, 8)).toBe(30);
    expect(rowHeight(items, 130, 8)).toBe(138);
  });

  it('matches the heights declared in components.css', () => {
    expect(GROUP_HEADER_HEIGHT).toBe(22);
    expect(GROUP_HEADER_MARGIN).toBe(8);
  });

  /*
   * A heading keeps its own margin whatever the tile gap is. It used to borrow
   * the gap, so in list mode - where the gap is 0 - every group was measured
   * short and the window drifted from the rendered rows.
   */
  it('does not shrink a header when the tile gap is zero', () => {
    const header = { kind: 'header' as const, label: 'x', count: 1 };

    expect(rowHeight(header, 25, 0)).toBe(30);
  });

  it('finds the row containing an offset', () => {
    const offsets = [0, 100, 200, 300];
    expect(findRowAtOffset(offsets, 0)).toBe(0);
    expect(findRowAtOffset(offsets, 99)).toBe(0);
    expect(findRowAtOffset(offsets, 100)).toBe(1);
    expect(findRowAtOffset(offsets, 250)).toBe(2);
  });

  it('clamps past the end rather than running off the table', () => {
    expect(findRowAtOffset([0, 100, 200], 99999)).toBe(1);
  });
});

describe('computeRowWindow', () => {
  it('renders only a small window of a large library', () => {
    const rows = buildRows(assets(1000), 3, false);
    const window = computeRowWindow(rows, METRICS, 0);

    // Viewport holds ~3 rows; with overscan the window stays far below 334.
    expect(window.endRow - window.startRow).toBeLessThan(12);
  });

  it('keeps padding consistent with the rendered rows at every offset', () => {
    const rows = buildRows(assets(1000), 3, false);
    const offsets = buildOffsets(rows, METRICS.tileHeight, METRICS.gap);

    for (const scrollTop of [0, 100, 1000, 5000, 20_000, 60_000]) {
      const window = computeRowWindow(rows, METRICS, scrollTop);
      const rendered = (offsets[window.endRow] ?? 0) - (offsets[window.startRow] ?? 0);

      // The three bands must exactly reconstruct the total height, otherwise
      // the grid visibly jumps while scrolling.
      expect(window.paddingTop + rendered + window.paddingBottom).toBe(window.totalHeight);
    }
  });

  it('holds the invariant with grouped rows of mixed heights', () => {
    const mixed = [...assets(40), ...assets(40).map((a) => ({ ...a, type: 'svg' as const }))];
    const rows = buildRows(mixed, 3, true);
    const offsets = buildOffsets(rows, METRICS.tileHeight, METRICS.gap);

    for (const scrollTop of [0, 250, 900, 3000]) {
      const window = computeRowWindow(rows, METRICS, scrollTop);
      const rendered = (offsets[window.endRow] ?? 0) - (offsets[window.startRow] ?? 0);
      expect(window.paddingTop + rendered + window.paddingBottom).toBe(window.totalHeight);
    }
  });

  it('advances the window as the user scrolls', () => {
    const rows = buildRows(assets(1000), 3, false);
    expect(computeRowWindow(rows, METRICS, 1380).startRow).toBeGreaterThan(
      computeRowWindow(rows, METRICS, 0).startRow,
    );
  });

  it('clamps an over-scrolled position rather than producing an invalid window', () => {
    const rows = buildRows(assets(100), 3, false);
    const window = computeRowWindow(rows, METRICS, 999_999);

    expect(window.startRow).toBeGreaterThanOrEqual(0);
    expect(window.endRow).toBeLessThanOrEqual(rows.length);
    expect(window.paddingBottom).toBeGreaterThanOrEqual(0);
  });

  it('clamps a negative scroll position', () => {
    const rows = buildRows(assets(100), 3, false);
    const window = computeRowWindow(rows, METRICS, -500);

    expect(window.startRow).toBe(0);
    expect(window.paddingTop).toBe(0);
  });

  it('still renders content when the container has not been measured yet', () => {
    // A 0-height container previously virtualised down to nothing, which looks
    // exactly like a broken panel.
    const rows = buildRows(assets(100), 3, false);
    const window = computeRowWindow(rows, { ...METRICS, containerHeight: 0 }, 0);

    expect(window.endRow).toBeGreaterThan(0);
  });

  it('returns an empty window for an empty library', () => {
    const window = computeRowWindow([], METRICS, 0);
    expect(window.endRow).toBe(0);
    expect(window.totalHeight).toBe(0);
  });
});

describe('findAssetPosition', () => {
  it('locates an asset by row and column, skipping headers', () => {
    const mixed = [makeAsset({ name: 'a.png' }), makeAsset({ name: 'b.svg', id: 'target' })];
    const rows = buildRows(mixed, 3, true);
    const position = findAssetPosition(rows, 'target');

    expect(position).not.toBeNull();
    expect(rows[position!.row]!.kind).toBe('items');
  });

  it('returns null for an unknown asset', () => {
    expect(findAssetPosition(buildRows(assets(3), 3, false), 'nope')).toBeNull();
  });
});

describe('scrollOffsetForRow', () => {
  const offsets = [0, 138, 276, 414, 552];

  it('returns null when the row is already visible', () => {
    expect(scrollOffsetForRow(0, offsets, 0, 300)).toBeNull();
  });

  it('scrolls up to reveal a row above the viewport', () => {
    expect(scrollOffsetForRow(0, offsets, 400, 300)).toBe(0);
  });

  it('scrolls down to reveal a row below the viewport', () => {
    // Row 3 spans 414-552; a 300px viewport at 0 must scroll to 252.
    expect(scrollOffsetForRow(3, offsets, 0, 300)).toBe(252);
  });

  it('returns null for an out-of-range row', () => {
    expect(scrollOffsetForRow(99, offsets, 0, 300)).toBeNull();
  });
});

describe('moveSelection', () => {
  it('moves by one within a row', () => {
    expect(moveSelection(0, 100, 4, 'right')).toBe(1);
    expect(moveSelection(5, 100, 4, 'left')).toBe(4);
  });

  it('moves by a full row vertically', () => {
    expect(moveSelection(0, 100, 4, 'down')).toBe(4);
    expect(moveSelection(8, 100, 4, 'up')).toBe(4);
  });

  it('clamps at the boundaries instead of wrapping', () => {
    expect(moveSelection(0, 100, 4, 'left')).toBe(0);
    expect(moveSelection(99, 100, 4, 'down')).toBe(99);
  });

  it('jumps to the ends', () => {
    expect(moveSelection(50, 100, 4, 'home')).toBe(0);
    expect(moveSelection(50, 100, 4, 'end')).toBe(99);
  });

  it('selects the first item when nothing is selected', () => {
    expect(moveSelection(-1, 100, 4, 'down')).toBe(0);
  });

  it('returns -1 for an empty list', () => {
    expect(moveSelection(0, 0, 4, 'down')).toBe(-1);
  });
});
