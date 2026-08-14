/**
 * Grid tile for one asset (roadmap section 10.5).
 *
 * Selection is shown with a border and an outline rather than a coloured
 * highlight, both because the design is monochrome and because UXP has no
 * `box-shadow` to render the spec's inset ring.
 */
import { type ReactElement, memo } from 'react';
import type { AssetRecord } from '../../models/asset';
import type { ThumbnailBackground } from '../../models/settings';
import { AssetThumbnail } from './AssetThumbnail';
import { StarIcon } from '../icons';
import { Pressable } from '../controls/Pressable';
import { formatFileSize } from '../../utils/file-types';

/**
 * Below this tile width the caption drops to the filename only - at 72px the
 * size line is unreadable clutter costing pixels better spent on artwork.
 *
 * Defined here rather than in AssetGrid so the dependency runs one way:
 * AssetGrid already imports this module.
 */
export const COMPACT_TILE_WIDTH = 84;

interface AssetCardProps {
  readonly asset: AssetRecord;
  readonly size: number;
  readonly background: ThumbnailBackground;
  readonly selected: boolean;
  readonly visible: boolean;
  readonly onSelect: (assetId: string) => void;
  readonly onInsert: (assetId: string) => void;
  readonly onToggleFavorite: (assetId: string) => void;
}

function AssetCardImpl({
  asset,
  size,
  background,
  selected,
  visible,
  onSelect,
  onInsert,
  onToggleFavorite,
}: AssetCardProps): ReactElement {
  return (
    <div
      className="asset-card"
      data-selected={selected ? 'true' : 'false'}
      style={{ width: `${size}px` }}
      onClick={() => onSelect(asset.id)}
      onDoubleClick={() => onInsert(asset.id)}
      title={asset.relativePath}
    >
      <AssetThumbnail asset={asset} size={size} visible={visible} background={background} />

      <span className="asset-card__badge">{asset.extension.toUpperCase()}</span>

      {/*
        `stopPropagation` covers double-click as well as click. Stopping only
        click left the second click of a quick double-toggle bubbling to the
        tile's `onDoubleClick`, which inserts the asset into the open document.
      */}
      <Pressable
        className="asset-card__favorite"
        active={asset.isFavorite}
        title={asset.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
        stopPropagation
        onClick={() => onToggleFavorite(asset.id)}
      >
        <StarIcon size={12} filled={asset.isFavorite} />
      </Pressable>

      <div className="asset-card__meta">
        <div className="asset-card__name truncate">{asset.name}</div>
        {/* Dropped on small tiles - see COMPACT_TILE_WIDTH in AssetGrid. */}
        {size >= COMPACT_TILE_WIDTH && (
          <div className="asset-card__details truncate">{formatFileSize(asset.sizeBytes)}</div>
        )}
      </div>
    </div>
  );
}

/**
 * Memoised: a 25,000-asset library re-renders its visible window on every
 * scroll tick, and the tile subtree is the expensive part.
 */
export const AssetCard = memo(AssetCardImpl);
