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
import { Pressable } from './Pressable';

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

/** Cycled by the backdrop swatch; order defines the cycle. */
const BACKGROUNDS: ReadonlyArray<{
  value: ThumbnailBackground;
  label: string;
  hint: string;
  /** Reuses the thumbnail backdrop classes, so the swatch cannot drift from it. */
  swatch: string;
}> = [
  {
    value: 'checker',
    label: 'Checkerboard',
    hint: 'shows transparency',
    swatch: 'thumb-bg-checker',
  },
  { value: 'light', label: 'Light', hint: 'for dark artwork', swatch: 'thumb-bg-light' },
  { value: 'dark', label: 'Dark', hint: 'for light artwork', swatch: 'thumb-bg-dark' },
];

interface ToolbarProps {
  readonly typeFilter: TypeFilter;
  readonly sortMode: SortMode;
  readonly viewMode: ViewMode;
  /**
   * Grid mode to return to when leaving list view. Tracked by the caller so
   * toggling to list and back does not overwrite a stored `largeGrid` with the
   * hardcoded `compactGrid` this used to send.
   */
  readonly gridMode: ViewMode;
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

      {/*
        Pressables, not buttons: UXP's native button drops `data-active`, and
        these two toggles have no other way to show they are on.
      */}
      <Pressable
        className="button button--ghost button--text"
        title="Group assets by type"
        label="Group assets by type"
        active={props.groupByType}
        onClick={props.onToggleGrouping}
      >
        Group
      </Pressable>

      {!isList && (
        <Pressable
          className="button button--ghost button--icon"
          title={`Backdrop: ${current.label} (${current.hint}) - click for ${next.label}`}
          label="Change thumbnail backdrop"
          active={props.thumbnailBackground !== 'checker'}
          onClick={() => props.onThumbnailBackground(next.value)}
        >
          {/*
            A swatch of the actual backdrop rather than the old "BG" glyph: the
            control cycles three values, and a two-letter label said neither
            which one is current nor what the next click does.
          */}
          <span className={`toolbar__swatch ${current.swatch}`} />
        </Pressable>
      )}

      <Pressable
        className="button button--ghost button--icon"
        title={isList ? 'Switch to grid view' : 'Switch to list view'}
        onClick={() => props.onViewMode(isList ? props.gridMode : 'list')}
      >
        {isList ? <GridIcon size={12} /> : <ListIcon size={12} />}
      </Pressable>

      {!props.compact && (
        <Pressable
          className="button button--ghost button--icon"
          title="Refresh this library"
          disabled={!props.canRefresh}
          onClick={props.onRefresh}
        >
          <RefreshIcon size={12} />
        </Pressable>
      )}
    </div>
  );
}
