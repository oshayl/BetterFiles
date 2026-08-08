/**
 * Grid toolbar - a single 24px row.
 *
 * The type filter used to be a row of chips. On a 320pt docked panel that cost
 * a whole row, and its horizontal scrollbar clipped the chips in half. It is
 * now a dropdown sharing one row with sort and the view controls, which is the
 * difference between 62pt and 24pt of chrome.
 */
import type { ReactElement } from 'react';
import type { SortMode, ThumbnailBackground, TypeFilter, ViewMode } from '../../models/settings';
import { GridIcon, ListIcon, RefreshIcon } from '../icons';

const FILTERS: ReadonlyArray<{ value: TypeFilter; label: string }> = [
  { value: 'all', label: 'All types' },
  { value: 'raster', label: 'Images' },
  { value: 'vector', label: 'Vectors' },
  { value: 'photoshop', label: 'PSD' },
  { value: 'pdf', label: 'PDF' },
  { value: 'favorites', label: 'Starred' },
];

const SORTS: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: 'name', label: 'A-Z' },
  { value: 'nameDesc', label: 'Z-A' },
  { value: 'modified', label: 'Modified' },
  { value: 'size', label: 'Size' },
  { value: 'recent', label: 'Used' },
  { value: 'added', label: 'Added' },
];

/** Cycled by the BG button; order defines the cycle. */
const BACKGROUNDS: ReadonlyArray<{ value: ThumbnailBackground; title: string }> = [
  { value: 'checker', title: 'Backdrop: checkerboard' },
  { value: 'light', title: 'Backdrop: light - for dark artwork' },
  { value: 'dark', title: 'Backdrop: dark - for light artwork' },
];

interface ToolbarProps {
  readonly typeFilter: TypeFilter;
  readonly sortMode: SortMode;
  readonly viewMode: ViewMode;
  readonly thumbnailBackground: ThumbnailBackground;
  readonly groupByType: boolean;
  /** True below ~300pt: sheds the least important controls. */
  readonly compact: boolean;
  readonly canRefresh: boolean;
  readonly onTypeFilter: (filter: TypeFilter) => void;
  readonly onSortMode: (mode: SortMode) => void;
  readonly onViewMode: (mode: ViewMode) => void;
  readonly onThumbnailBackground: (background: ThumbnailBackground) => void;
  readonly onToggleGrouping: () => void;
  readonly onRefresh: () => void;
}

export function Toolbar(props: ToolbarProps): ReactElement {
  const isList = props.viewMode === 'list';

  const current =
    BACKGROUNDS.find((entry) => entry.value === props.thumbnailBackground) ?? BACKGROUNDS[0]!;
  const next = BACKGROUNDS[(BACKGROUNDS.indexOf(current) + 1) % BACKGROUNDS.length]!;

  return (
    <div className="toolbar no-shrink row" data-measure="toolbar">
      <select
        className="select select--filter"
        value={props.typeFilter}
        title="Filter by asset type"
        onChange={(event) => props.onTypeFilter(event.currentTarget.value as TypeFilter)}
      >
        {FILTERS.map((filter) => (
          <option key={filter.value} value={filter.value}>
            {filter.label}
          </option>
        ))}
      </select>

      <select
        className="select select--sort"
        value={props.sortMode}
        title="Sort order"
        onChange={(event) => props.onSortMode(event.currentTarget.value as SortMode)}
      >
        {SORTS.map((sort) => (
          <option key={sort.value} value={sort.value}>
            {sort.label}
          </option>
        ))}
      </select>

      <span className="spacer" />

      <button
        className="button button--ghost button--icon"
        title="Group by asset type"
        data-active={props.groupByType ? 'true' : 'false'}
        onClick={props.onToggleGrouping}
      >
        <span className="toolbar__glyph">G</span>
      </button>

      {!isList && (
        <button
          className="button button--ghost button--icon"
          title={`${current.title} (click for ${next.value})`}
          data-active={props.thumbnailBackground !== 'checker' ? 'true' : 'false'}
          onClick={() => props.onThumbnailBackground(next.value)}
        >
          <span className="toolbar__glyph">BG</span>
        </button>
      )}

      <button
        className="button button--ghost button--icon"
        title={isList ? 'Switch to grid view' : 'Switch to list view'}
        onClick={() => props.onViewMode(isList ? 'compactGrid' : 'list')}
      >
        {isList ? <GridIcon size={12} /> : <ListIcon size={12} />}
      </button>

      {!props.compact && (
        <button
          className="button button--ghost button--icon"
          title="Refresh this library"
          disabled={!props.canRefresh}
          onClick={props.onRefresh}
        >
          <RefreshIcon size={12} />
        </button>
      )}
    </div>
  );
}
