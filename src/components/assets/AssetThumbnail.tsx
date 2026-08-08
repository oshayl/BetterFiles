/**
 * Asset thumbnail.
 *
 * Renders `<img src="file:...">` pointing either at the original file (raster,
 * SVG) or at a generated preview (PSD, PDF, AI). Falls back to a format
 * placeholder, which is also what a broken or unreadable file resolves to -
 * a preview failure must never leave an empty tile (roadmap section 25).
 */
import { type ReactElement, useEffect, useState } from 'react';
import type { AssetRecord } from '../../models/asset';
import type { ThumbnailBackground } from '../../models/settings';
import { useThumbnail } from '../hooks';
import { FileIcon } from '../icons';

interface AssetThumbnailProps {
  readonly asset: AssetRecord;
  /** Edge length of the thumbnail box in pixels. */
  readonly size: number;
  /** False for off-screen tiles, which must not queue preview work. */
  readonly visible: boolean;
  readonly background: ThumbnailBackground;
}

/** Maps the backdrop setting onto its stylesheet class. */
export function backgroundClass(background: ThumbnailBackground): string {
  switch (background) {
    case 'light':
      return 'thumb-bg-light';
    case 'dark':
      return 'thumb-bg-dark';
    default:
      return 'thumb-bg-checker';
  }
}

export function AssetThumbnail({
  asset,
  size,
  visible,
  background,
}: AssetThumbnailProps): ReactElement {
  const source = useThumbnail(asset, size, visible);
  const [loadFailed, setLoadFailed] = useState(false);

  const imageUrl = source.kind === 'direct' || source.kind === 'cached' ? source.url : null;

  // A new source is a fresh chance to succeed.
  useEffect(() => {
    setLoadFailed(false);
  }, [imageUrl]);

  const showImage = imageUrl !== null && !loadFailed;

  return (
    <div
      className={`asset-thumb ${backgroundClass(background)}`}
      // Explicit height: UXP has no `aspect-ratio`.
      style={{ height: `${size}px` }}
    >
      {showImage ? (
        <img
          className="asset-thumb__image"
          src={imageUrl}
          alt={asset.name}
          onError={() => setLoadFailed(true)}
        />
      ) : (
        <Placeholder
          extension={asset.extension}
          pending={source.kind === 'pending'}
          compact={size < 88}
        />
      )}
    </div>
  );
}

/**
 * Format placeholder.
 *
 * Shows the extension rather than a generic icon alone: in a monochrome UI the
 * text is what actually distinguishes an AI from a PDF (section 8.2).
 */
function Placeholder({
  extension,
  pending,
  compact,
}: {
  extension: string;
  pending: boolean;
  compact: boolean;
}): ReactElement {
  return (
    <div className="asset-thumb__placeholder">
      {pending ? (
        <span className="asset-thumb__pending">...</span>
      ) : (
        <>
          <FileIcon size={compact ? 12 : 16} className="asset-thumb__icon" />
          {!compact && <span className="asset-thumb__ext">{extension.toUpperCase()}</span>}
        </>
      )}
    </div>
  );
}
