/**
 * Preview (roadmap section 10.6), collapsible.
 *
 * The full preview was 238pt of a 760pt panel - by far the largest single cost
 * in a docked panel. It now collapses to a 20pt strip showing the selected
 * asset's name and size; clicking the strip expands it. That returns ~220pt to
 * the grid while keeping the detail one click away.
 */
import type { ReactElement } from 'react';
import type { AssetRecord } from '../../models/asset';
import type { ThumbnailBackground } from '../../models/settings';
import { backgroundClass } from '../assets/AssetThumbnail';
import { Pressable } from '../controls/Pressable';
import { useThumbnail } from '../hooks';
import { CaretDownIcon, CaretUpIcon, FileIcon, WarningIcon } from '../icons';
import { TYPE_LABELS, formatFileSize, formatModifiedDate } from '../../utils/file-types';

/** Larger than any grid tile, per section 19.2. */
const PREVIEW_SIZE = 768;

interface PreviewPanelProps {
  readonly asset: AssetRecord | null;
  /** Height of the expanded stage; ignored when collapsed. */
  readonly height: number;
  readonly expanded: boolean;
  readonly background: ThumbnailBackground;
  readonly onToggle: () => void;
  readonly onRegenerate: (assetId: string) => void;
}

export function PreviewPanel({
  asset,
  height,
  expanded,
  background,
  onToggle,
  onRegenerate,
}: PreviewPanelProps): ReactElement {
  return (
    <div className="preview no-shrink col">
      {/* The strip is always present, so the toggle never moves. */}
      {/*
        A div, not a button: UXP renders a native button, which flattened this
        row's three children into one centred label and ignored its 20px height.
        See components/controls/Pressable.tsx.
      */}
      <Pressable
        className="preview__strip"
        measure="previewStrip"
        onClick={onToggle}
        title={expanded ? 'Collapse preview' : 'Expand preview'}
      >
        {expanded ? <CaretDownIcon size={12} /> : <CaretUpIcon size={12} />}
        <span className="preview__strip-name truncate">
          {asset ? asset.name : 'No asset selected'}
        </span>
        {asset && <span className="preview__strip-meta">{formatFileSize(asset.sizeBytes)}</span>}
      </Pressable>

      {expanded && asset && (
        <PreviewBody
          asset={asset}
          height={height}
          background={background}
          onRegenerate={onRegenerate}
        />
      )}
    </div>
  );
}

function PreviewBody({
  asset,
  height,
  background,
  onRegenerate,
}: {
  asset: AssetRecord;
  height: number;
  background: ThumbnailBackground;
  onRegenerate: (assetId: string) => void;
}): ReactElement {
  // The one place generation is allowed: the user has selected this asset.
  const source = useThumbnail(asset, PREVIEW_SIZE, true, true);
  const hasImage = source.kind === 'direct' || source.kind === 'cached';

  return (
    <div className="preview__body col" style={{ height: `${height}px` }}>
      <div className={`preview__stage ${backgroundClass(background)}`}>
        {hasImage ? (
          <img className="preview__image" src={source.url} alt={asset.name} />
        ) : source.kind === 'pending' ? (
          <span className="muted">Generating preview...</span>
        ) : (
          <div className="preview__unavailable col center">
            <FileIcon size={24} />
            <span className="preview__ext">{asset.extension.toUpperCase()}</span>
            {source.kind === 'placeholder' && source.reason && (
              <span className="preview__reason">
                <WarningIcon size={12} /> {source.reason}
              </span>
            )}
            <button className="button preview__retry" onClick={() => onRegenerate(asset.id)}>
              Regenerate
            </button>
          </div>
        )}
      </div>

      <div className="preview__meta">
        <div className="preview__line muted truncate">
          {TYPE_LABELS[asset.type]} &middot; {formatModifiedDate(asset.modifiedAt)} &middot;{' '}
          {asset.relativePath}
        </div>
      </div>
    </div>
  );
}
