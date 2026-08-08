/**
 * List-mode row (roadmap section 10.4).
 *
 * Denser than the grid and shows more metadata, for users scanning by name and
 * date rather than by appearance.
 */
import { type ReactElement, memo } from 'react';
import type { AssetRecord } from '../../models/asset';
import { StarIcon } from '../icons';
import { formatFileSize, formatModifiedDate } from '../../utils/file-types';

interface AssetRowProps {
  readonly asset: AssetRecord;
  readonly selected: boolean;
  readonly onSelect: (assetId: string) => void;
  readonly onInsert: (assetId: string) => void;
  readonly onToggleFavorite: (assetId: string) => void;
}

function AssetRowImpl({
  asset,
  selected,
  onSelect,
  onInsert,
  onToggleFavorite,
}: AssetRowProps): ReactElement {
  return (
    <div
      className="asset-row"
      data-selected={selected ? 'true' : 'false'}
      onClick={() => onSelect(asset.id)}
      onDoubleClick={() => onInsert(asset.id)}
      title={asset.relativePath}
    >
      <button
        className="asset-row__favorite"
        data-active={asset.isFavorite ? 'true' : 'false'}
        title={asset.isFavorite ? 'Remove from favourites' : 'Add to favourites'}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite(asset.id);
        }}
      >
        <StarIcon size={12} filled={asset.isFavorite} />
      </button>

      <span className="asset-row__name truncate">{asset.name}</span>
      <span className="asset-row__badge">{asset.extension.toUpperCase()}</span>
      <span className="asset-row__size">{formatFileSize(asset.sizeBytes)}</span>
      <span className="asset-row__date">{formatModifiedDate(asset.modifiedAt)}</span>
    </div>
  );
}

export const AssetRow = memo(AssetRowImpl);
