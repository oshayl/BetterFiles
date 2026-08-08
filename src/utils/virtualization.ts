/**
 * Virtual window calculation (roadmap sections 18.4 and 33).
 *
 * UXP has no CSS grid, so the asset grid is laid out as flex rows of fixed-size
 * tiles. Only the rows intersecting the viewport are rendered; the space above
 * and below is held open by two spacer elements, keeping a 25,000-asset library
 * at a constant DOM size.
 *
 * Rows are modelled as a flat list that may mix tile rows with section headers,
 * so grouping by asset type uses the same machinery as an ungrouped grid. Row
 * heights therefore vary, and offsets come from a prefix-sum table.
 *
 * Pure and unit tested - virtualisation bugs appear as blank regions during
 * fast scrolling, which is painful to debug inside Photoshop.
 */
import type { AssetRecord, AssetType } from '../models/asset';

export interface GridMetrics {
  /** Content width available for tiles, excluding container padding. */
  readonly containerWidth: number;
  readonly containerHeight: number;
  readonly tileWidth: number;
  readonly tileHeight: number;
  readonly gap: number;
  readonly itemCount: number;
}

/** A rendered row: either a group heading or a run of tiles. */
export type GridRow =
  | { readonly kind: 'header'; readonly label: string; readonly count: number }
  | { readonly kind: 'items'; readonly items: readonly AssetRecord[] };

export interface RowWindow {
  readonly rows: readonly GridRow[];
  /** Index of the first row to render, including overscan. */
  readonly startRow: number;
  /** Exclusive. */
  readonly endRow: number;
  readonly paddingTop: number;
  readonly paddingBottom: number;
  readonly totalHeight: number;
  readonly columns: number;
}

/** Rows rendered beyond the viewport, so fast scrolling does not flash empty. */
const DEFAULT_OVERSCAN = 2;

/** Height of a group heading row. Must match `.asset-group__header` in CSS. */
export const GROUP_HEADER_HEIGHT = 22;

/** Columns that fit, always at least one so a narrow panel still renders. */
export function computeColumns(containerWidth: number, tileWidth: number, gap: number): number {
  if (containerWidth <= 0 || tileWidth <= 0) return 1;

  // n tiles occupy n*tileWidth + (n-1)*gap.
  const columns = Math.floor((containerWidth + gap) / (tileWidth + gap));
  return Math.max(1, columns);
}

/** Display order and labels for grouped mode. */
const GROUP_ORDER: ReadonlyArray<{ type: AssetType; label: string }> = [
  { type: 'raster', label: 'Images and Textures' },
  { type: 'svg', label: 'SVG Vectors' },
  { type: 'illustrator', label: 'Illustrator' },
  { type: 'eps', label: 'EPS' },
  { type: 'pdf', label: 'PDF Documents' },
  { type: 'photoshop', label: 'Photoshop Documents' },
  { type: 'unknown', label: 'Other' },
];

/**
 * Builds the row list.
 *
 * Ungrouped, this is a simple chunk-by-columns. Grouped, each non-empty type
 * contributes a header followed by its own tile rows, so a partially filled
 * final row never bleeds into the next group.
 */
export function buildRows(
  assets: readonly AssetRecord[],
  columns: number,
  groupByType: boolean,
): GridRow[] {
  const chunk = (items: readonly AssetRecord[]): GridRow[] => {
    const rows: GridRow[] = [];
    for (let i = 0; i < items.length; i += columns) {
      rows.push({ kind: 'items', items: items.slice(i, i + columns) });
    }
    return rows;
  };

  if (!groupByType) return chunk(assets);

  const rows: GridRow[] = [];
  for (const group of GROUP_ORDER) {
    const members = assets.filter((asset) => asset.type === group.type);
    if (members.length === 0) continue;

    rows.push({ kind: 'header', label: group.label, count: members.length });
    rows.push(...chunk(members));
  }
  return rows;
}

export function rowHeight(row: GridRow, tileHeight: number, gap: number): number {
  return row.kind === 'header' ? GROUP_HEADER_HEIGHT + gap : tileHeight + gap;
}

/**
 * Cumulative row offsets. `offsets[i]` is the top of row `i`; the final entry is
 * the total height.
 */
export function buildOffsets(
  rows: readonly GridRow[],
  tileHeight: number,
  gap: number,
): number[] {
  const offsets = new Array<number>(rows.length + 1);
  offsets[0] = 0;

  for (let i = 0; i < rows.length; i += 1) {
    offsets[i + 1] = (offsets[i] ?? 0) + rowHeight(rows[i] as GridRow, tileHeight, gap);
  }
  return offsets;
}

/** Index of the last offset <= `position`. Binary search over a sorted table. */
export function findRowAtOffset(offsets: readonly number[], position: number): number {
  if (offsets.length <= 1) return 0;

  let low = 0;
  let high = offsets.length - 2;
  let result = 0;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if ((offsets[mid] ?? 0) <= position) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return result;
}

/**
 * Computes which rows to render for a scroll position.
 *
 * `containerHeight` of 0 means the element has not been measured yet. Rather
 * than render nothing - which looks like a broken panel - fall back to a
 * nominal viewport so content appears and corrects itself once measured.
 */
export function computeRowWindow(
  rows: readonly GridRow[],
  metrics: Omit<GridMetrics, 'itemCount'>,
  scrollTop: number,
  overscan: number = DEFAULT_OVERSCAN,
): RowWindow {
  const columns = computeColumns(metrics.containerWidth, metrics.tileWidth, metrics.gap);
  const offsets = buildOffsets(rows, metrics.tileHeight, metrics.gap);
  const totalHeight = offsets[rows.length] ?? 0;

  if (rows.length === 0) {
    return {
      rows,
      startRow: 0,
      endRow: 0,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
      columns,
    };
  }

  const viewportHeight = metrics.containerHeight > 0 ? metrics.containerHeight : 600;

  // Clamp: an over-scrolled container (rubber-banding, or a list that shrank)
  // must not compute an out-of-range window.
  const maxScroll = Math.max(0, totalHeight - viewportHeight);
  const clamped = Math.min(Math.max(0, scrollTop), maxScroll);

  const firstVisible = findRowAtOffset(offsets, clamped);
  const lastVisible = findRowAtOffset(offsets, clamped + viewportHeight);

  const startRow = Math.max(0, firstVisible - overscan);
  const endRow = Math.min(rows.length, lastVisible + 1 + overscan);

  return {
    rows,
    startRow,
    endRow,
    paddingTop: offsets[startRow] ?? 0,
    paddingBottom: Math.max(0, totalHeight - (offsets[endRow] ?? totalHeight)),
    totalHeight,
    columns,
  };
}

/** Flat index of an asset within the row model, for keyboard navigation. */
export function findAssetPosition(
  rows: readonly GridRow[],
  assetId: string,
): { row: number; column: number } | null {
  for (let r = 0; r < rows.length; r += 1) {
    const row = rows[r];
    if (!row || row.kind !== 'items') continue;

    const column = row.items.findIndex((asset) => asset.id === assetId);
    if (column >= 0) return { row: r, column };
  }
  return null;
}

/**
 * Scroll offset that brings a row into view, or null when already visible, so
 * keyboard navigation does not jitter the viewport on every arrow press.
 */
export function scrollOffsetForRow(
  rowIndex: number,
  offsets: readonly number[],
  scrollTop: number,
  containerHeight: number,
): number | null {
  const top = offsets[rowIndex];
  const bottom = offsets[rowIndex + 1];
  if (top == null || bottom == null) return null;

  if (top < scrollTop) return top;
  if (bottom > scrollTop + containerHeight) return bottom - containerHeight;
  return null;
}

/**
 * Moves the selection through the flattened asset order.
 *
 * Operates on the visible asset sequence rather than on rows, so arrow keys
 * skip group headers naturally. Clamps at the ends rather than wrapping, which
 * would be disorienting in a long library.
 */
export function moveSelection(
  currentIndex: number,
  itemCount: number,
  columns: number,
  direction: 'left' | 'right' | 'up' | 'down' | 'home' | 'end',
): number {
  if (itemCount === 0) return -1;
  if (currentIndex < 0) return 0;

  const clamp = (value: number) => Math.min(itemCount - 1, Math.max(0, value));

  switch (direction) {
    case 'left':
      return clamp(currentIndex - 1);
    case 'right':
      return clamp(currentIndex + 1);
    case 'up':
      return clamp(currentIndex - columns);
    case 'down':
      return clamp(currentIndex + columns);
    case 'home':
      return 0;
    case 'end':
      return itemCount - 1;
    default:
      return currentIndex;
  }
}
