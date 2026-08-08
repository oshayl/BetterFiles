/** File type detection and formatting (roadmap sections 4, 18.2 and 23). */
import type { AssetType } from '../models/asset';
import type { TypeFilter } from '../models/settings';
import { extname } from './path-utils';

/** Extensions the indexer accepts. Anything else is ignored entirely. */
export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  'png',
  'jpg',
  'jpeg',
  'webp',
  'gif',
  'tif',
  'tiff',
  'bmp',
  'svg',
  'ai',
  'pdf',
  'eps',
  'psd',
  'psb',
]);

const EXTENSION_TO_TYPE: Readonly<Record<string, AssetType>> = {
  png: 'raster',
  jpg: 'raster',
  jpeg: 'raster',
  webp: 'raster',
  gif: 'raster',
  tif: 'raster',
  tiff: 'raster',
  bmp: 'raster',

  svg: 'svg',
  ai: 'illustrator',
  eps: 'eps',
  pdf: 'pdf',

  psd: 'photoshop',
  psb: 'photoshop',
};

export function isSupportedExtension(extension: string): boolean {
  return SUPPORTED_EXTENSIONS.has(extension.toLowerCase());
}

export function isSupportedFile(path: string): boolean {
  return isSupportedExtension(extname(path));
}

export function getAssetType(extension: string): AssetType {
  return EXTENSION_TO_TYPE[extension.toLowerCase()] ?? 'unknown';
}

export function getAssetTypeForPath(path: string): AssetType {
  return getAssetType(extname(path));
}

/**
 * Short badge text for asset cards. Upper-cased extension rather than the
 * internal type name, because that is what designers recognise.
 */
export function getFormatBadge(extension: string): string {
  return extension.toUpperCase();
}

/** Maps the UI's filter chips onto asset types (roadmap section 23). */
export function matchesTypeFilter(type: AssetType, filter: TypeFilter): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'raster':
      return type === 'raster';
    case 'vector':
      // Designers think of all three as "vector", regardless of container.
      return type === 'svg' || type === 'illustrator' || type === 'eps';
    case 'photoshop':
      return type === 'photoshop';
    case 'pdf':
      return type === 'pdf';
    case 'favorites':
      // Handled by the favourite flag, not the type; never filters by type.
      return true;
    default:
      return true;
  }
}

/** Human-readable label for a type, used in the preview panel. */
export const TYPE_LABELS: Readonly<Record<AssetType, string>> = {
  raster: 'Image',
  svg: 'SVG Vector',
  illustrator: 'Illustrator',
  pdf: 'PDF Document',
  photoshop: 'Photoshop Document',
  eps: 'EPS Vector',
  unknown: 'Unknown',
};

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** Formats a byte count compactly, e.g. "2.4 MB". */
export function formatFileSize(bytes: number | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes === 0) return '0 B';

  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), SIZE_UNITS.length - 1);
  const value = bytes / 1024 ** exponent;
  // Whole numbers for bytes, one decimal above that - enough to distinguish
  // files without turning the card into a wall of digits.
  const decimals = exponent === 0 ? 0 : value >= 100 ? 0 : 1;

  return `${value.toFixed(decimals)} ${SIZE_UNITS[exponent]}`;
}

/**
 * Relative date for the asset card and preview panel. Deliberately coarse -
 * exact timestamps belong in File Details, not in a dense grid.
 */
export function formatModifiedDate(timestamp: number | undefined, now: number = Date.now()): string {
  if (timestamp == null || !Number.isFinite(timestamp) || timestamp <= 0) return '--';

  const elapsed = now - timestamp;
  if (elapsed < 0) return 'Just now';

  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (elapsed < minute) return 'Just now';
  if (elapsed < hour) {
    const minutes = Math.floor(elapsed / minute);
    return `${minutes} min ago`;
  }
  if (elapsed < day) {
    const hours = Math.floor(elapsed / hour);
    return hours === 1 ? '1 hour ago' : `${hours} hours ago`;
  }
  if (elapsed < 2 * day) return 'Yesterday';
  if (elapsed < 7 * day) {
    return `${Math.floor(elapsed / day)} days ago`;
  }

  const date = new Date(timestamp);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  const month = date.toLocaleString('en-US', { month: 'short' });

  return sameYear
    ? `${month} ${date.getDate()}`
    : `${month} ${date.getDate()}, ${date.getFullYear()}`;
}

/** Formats pixel dimensions, or '--' when they are not known yet. */
export function formatDimensions(width?: number, height?: number): string {
  if (!width || !height) return '--';
  return `${Math.round(width)} x ${Math.round(height)}`;
}
