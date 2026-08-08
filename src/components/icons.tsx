/**
 * Icons (roadmap section 8.6): thin, monochrome, no interior detail.
 *
 * These are CSS background images, not inline SVG. UXP's SVG renderer is
 * documented as supporting only "simple icons", circle elements are reported
 * broken, and in practice every inline <svg> rendered as a grey blob in
 * Photoshop 2026. PNG backgrounds are the one path proven to work here.
 *
 * The artwork lives in scripts/generate-ui-icons.mjs as 16x16 ASCII grids and
 * is compiled to src/styles/icons.css. Theme-appropriate colour is selected by
 * the `.theme-light` / `.theme-dark` scope, so nothing needs `currentColor`.
 */
import type { ReactElement } from 'react';

export type IconName =
  | 'search'
  | 'settings'
  | 'tools'
  | 'sun'
  | 'moon'
  | 'sidebar'
  | 'close'
  | 'plus'
  | 'refresh'
  | 'grid'
  | 'list'
  | 'star'
  | 'star-filled'
  | 'chevron-right'
  | 'chevron-down'
  | 'folder'
  | 'folder-off'
  | 'file'
  | 'warning'
  | 'caret-up'
  | 'caret-down';

interface IconProps {
  readonly name: IconName;
  /** 12px for dense rows, 16px default, 24px for empty states. */
  readonly size?: 12 | 16 | 24;
  readonly className?: string;
}

export function Icon({ name, size = 16, className }: IconProps): ReactElement {
  const scale = size === 12 ? ' icon--sm' : size === 24 ? ' icon--lg' : '';
  return <span className={`icon icon--${name}${scale}${className ? ` ${className}` : ''}`} />;
}

/*
 * Named wrappers, so call sites read as components rather than string literals
 * and a typo becomes a compile error.
 */
type Sized = { readonly size?: 12 | 16 | 24; readonly className?: string };

export const SearchIcon = (p: Sized) => <Icon name="search" {...p} />;
export const SettingsIcon = (p: Sized) => <Icon name="settings" {...p} />;
export const ToolsIcon = (p: Sized) => <Icon name="tools" {...p} />;
export const SidebarIcon = (p: Sized) => <Icon name="sidebar" {...p} />;
export const CloseIcon = (p: Sized) => <Icon name="close" {...p} />;
export const PlusIcon = (p: Sized) => <Icon name="plus" {...p} />;
export const RefreshIcon = (p: Sized) => <Icon name="refresh" {...p} />;
export const GridIcon = (p: Sized) => <Icon name="grid" {...p} />;
export const ListIcon = (p: Sized) => <Icon name="list" {...p} />;
export const FolderIcon = (p: Sized) => <Icon name="folder" {...p} />;
export const OfflineIcon = (p: Sized) => <Icon name="folder-off" {...p} />;
export const FileIcon = (p: Sized) => <Icon name="file" {...p} />;
export const WarningIcon = (p: Sized) => <Icon name="warning" {...p} />;
export const ChevronRightIcon = (p: Sized) => <Icon name="chevron-right" {...p} />;
export const ChevronDownIcon = (p: Sized) => <Icon name="chevron-down" {...p} />;
export const CaretUpIcon = (p: Sized) => <Icon name="caret-up" {...p} />;
export const CaretDownIcon = (p: Sized) => <Icon name="caret-down" {...p} />;

export const StarIcon = ({ filled = false, ...p }: Sized & { filled?: boolean }) => (
  <Icon name={filled ? 'star-filled' : 'star'} {...p} />
);

/** Sun when the dark theme is available to switch to, moon for the reverse. */
export const ThemeIcon = ({ dark = false, ...p }: Sized & { dark?: boolean }) => (
  <Icon name={dark ? 'moon' : 'sun'} {...p} />
);
