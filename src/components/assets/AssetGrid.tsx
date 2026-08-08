/**
 * Virtualised asset grid and list (roadmap sections 10.4 and 18.4).
 *
 * Layout is flex rows of fixed-width tiles, because UXP has no CSS grid. Only
 * rows intersecting the viewport are mounted; two spacers hold open the space
 * above and below so the scrollbar stays truthful.
 *
 * Scroll position is tracked with a NATIVE listener rather than React's
 * synthetic `onScroll`. UXP implements a DOM subset and synthetic events on
 * scrollable containers are not dependable there - if the handler never fires,
 * the window never advances and the grid appears frozen after the first screen.
 */
import { type ReactElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AssetRecord } from '../../models/asset';
import type { ThumbnailBackground, ViewMode } from '../../models/settings';
import { AssetCard, COMPACT_TILE_WIDTH } from './AssetCard';
import { AssetRow } from './AssetRow';
import { useElementSize } from '../hooks';
import {
  buildOffsets,
  buildRows,
  computeColumns,
  computeRowWindow,
  findAssetPosition,
  scrollOffsetForRow,
} from '../../utils/virtualization';

/** Space between tiles, and the grid's own padding. */
const GAP = 6;
/** Height of the caption under each thumbnail. See COMPACT_TILE_WIDTH. */
const CARD_META_FULL = 30;
const CARD_META_COMPACT = 18;

const LIST_ROW_HEIGHT = 22;

function captionHeight(tileSize: number): number {
  return tileSize < COMPACT_TILE_WIDTH ? CARD_META_COMPACT : CARD_META_FULL;
}

interface AssetGridProps {
  readonly assets: readonly AssetRecord[];
  readonly viewMode: ViewMode;
  readonly thumbnailSize: number;
  readonly thumbnailBackground: ThumbnailBackground;
  readonly groupByType: boolean;
  /**
   * Explicit pixel height. Required, not optional: UXP's flexbox does not
   * bound a scroll container, so without this the grid grows to fit its
   * content and cannot scroll at all.
   */
  readonly height: number;
  readonly selectedAssetId: string | null;
  readonly onSelect: (assetId: string) => void;
  readonly onInsert: (assetId: string) => void;
  readonly onToggleFavorite: (assetId: string) => void;
  /** Reports the column count so keyboard navigation can move by row. */
  readonly onColumnsChange?: (columns: number) => void;
}

export function AssetGrid({
  assets,
  viewMode,
  thumbnailSize,
  thumbnailBackground,
  groupByType,
  height,
  selectedAssetId,
  onSelect,
  onInsert,
  onToggleFavorite,
  onColumnsChange,
}: AssetGridProps): ReactElement {
  const [containerRef, size] = useElementSize<HTMLDivElement>();
  const [scrollTop, setScrollTop] = useState(0);

  const isList = viewMode === 'list';
  const contentWidth = Math.max(0, size.width - GAP * 2);
  const tileWidth = isList ? Math.max(1, contentWidth) : thumbnailSize;
  const tileHeight = isList ? LIST_ROW_HEIGHT : thumbnailSize + captionHeight(thumbnailSize);

  const metrics = {
    containerWidth: contentWidth,
    // The explicit height is authoritative - the measured one can lag or come
    // back wrong when flex fails to resolve.
    containerHeight: height,
    tileWidth,
    tileHeight,
    gap: isList ? 0 : GAP,
  };

  // List mode is always one item per row; grouping still applies.
  const columns = isList ? 1 : computeColumns(contentWidth, tileWidth, GAP);

  const rows = useMemo(
    () => buildRows(assets, columns, groupByType),
    [assets, columns, groupByType],
  );

  const window = computeRowWindow(rows, metrics, scrollTop);
  const offsets = useMemo(
    () => buildOffsets(rows, metrics.tileHeight, metrics.gap),
    [rows, metrics.tileHeight, metrics.gap],
  );

  useEffect(() => {
    onColumnsChange?.(columns);
  }, [columns, onColumnsChange]);

  /*
   * Native scroll listener, bound through a callback ref so it attaches as soon
   * as the node exists and re-binds if React swaps the element.
   */
  const scrollNode = useRef<HTMLDivElement | null>(null);
  const onScroll = useRef((): void => {
    const node = scrollNode.current;
    if (node) setScrollTop(node.scrollTop);
  });

  const attach = useCallback(
    (node: HTMLDivElement | null) => {
      const previous = scrollNode.current;
      if (previous && previous !== node) {
        previous.removeEventListener('scroll', onScroll.current);
      }

      scrollNode.current = node;
      containerRef.current = node;

      if (node && node !== previous) {
        node.addEventListener('scroll', onScroll.current);
      }
    },
    [containerRef],
  );

  // Detach on unmount.
  useEffect(() => {
    const handler = onScroll.current;
    return () => {
      scrollNode.current?.removeEventListener('scroll', handler);
    };
  }, []);

  // Keep the keyboard selection inside the viewport.
  useEffect(() => {
    if (!selectedAssetId) return;

    const position = findAssetPosition(rows, selectedAssetId);
    if (!position) return;

    const offset = scrollOffsetForRow(position.row, offsets, scrollTop, height);
    if (offset != null && scrollNode.current) {
      scrollNode.current.scrollTop = offset;
      setScrollTop(offset);
    }
    // Keyed on the selection only: re-running on every scroll would fight the
    // user's own scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAssetId]);

  const rendered: ReactElement[] = [];
  for (let index = window.startRow; index < window.endRow; index += 1) {
    const row = rows[index];
    if (!row) continue;

    if (row.kind === 'header') {
      rendered.push(
        <div className="asset-group__header" key={`h-${index}`}>
          <span className="asset-group__label">{row.label}</span>
          <span className="asset-group__count">{row.count}</span>
        </div>,
      );
      continue;
    }

    rendered.push(
      <div className={isList ? 'asset-list__row-wrap' : 'asset-grid__row'} key={`r-${index}`}>
        {row.items.map((asset) =>
          isList ? (
            <AssetRow
              key={asset.id}
              asset={asset}
              selected={asset.id === selectedAssetId}
              onSelect={onSelect}
              onInsert={onInsert}
              onToggleFavorite={onToggleFavorite}
            />
          ) : (
            <AssetCard
              key={asset.id}
              asset={asset}
              size={thumbnailSize}
              background={thumbnailBackground}
              selected={asset.id === selectedAssetId}
              visible
              onSelect={onSelect}
              onInsert={onInsert}
              onToggleFavorite={onToggleFavorite}
            />
          ),
        )}
      </div>,
    );
  }

  return (
    <div
      className="asset-grid scroll-y"
      ref={attach}
      // Explicit height, not flex: see utils/layout.ts.
      style={{ height: `${height}px` }}
    >
      {/* Spacers stand in for un-rendered rows so the scrollbar is honest. */}
      <div style={{ height: `${window.paddingTop}px` }} />
      {rendered}
      <div style={{ height: `${window.paddingBottom}px` }} />
    </div>
  );
}
