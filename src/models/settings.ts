/** Persisted plugin settings (roadmap section 24). */
import { type ImportOptions, DEFAULT_IMPORT_OPTIONS } from './import-options';

export type ViewMode = 'compactGrid' | 'largeGrid' | 'list';
export type SortMode = 'name' | 'nameDesc' | 'modified' | 'size' | 'recent' | 'added';
export type TypeFilter = 'all' | 'raster' | 'vector' | 'photoshop' | 'pdf' | 'favorites';

export type Theme = 'light' | 'dark';

/**
 * Backdrop behind a thumbnail.
 *
 * Not cosmetic: a black SVG is invisible on a dark backdrop and a white one is
 * invisible on a light backdrop, so the artwork itself dictates which is
 * readable. Independent of the UI theme for exactly that reason.
 */
export type ThumbnailBackground = 'checker' | 'light' | 'dark';

export interface PluginSettings {
  theme: Theme;
  thumbnailBackground: ThumbnailBackground;
  /** Sections the grid by asset type (images, vectors, PDF, PSD). */
  groupByType: boolean;

  viewMode: ViewMode;
  /** Tile edge length in px for grid modes. */
  thumbnailSize: number;
  sortMode: SortMode;
  typeFilter: TypeFilter;

  /** User's explicit sidebar preference; narrow panels override it. */
  showSidebar: boolean;

  importOptions: ImportOptions;

  /** Always use page 1 rather than prompting for multi-page PDFs. */
  alwaysUseFirstPdfPage: boolean;
  /** Upper bound for the on-disk preview cache, in megabytes. */
  maxCacheSizeMb: number;
  /** Skip preview generation above this size to avoid stalling on huge files. */
  maxPreviewSourceMb: number;
  /**
   * Rasters above this size get a cached, downscaled preview instead of being
   * handed straight to an `<img>`. See `needsGeneratedPreview`.
   */
  maxDirectRenderMb: number;

  sidebarWidth: number;
  previewHeight: number;
  showPreviewPanel: boolean;
  /** Whether the preview is expanded past its collapsed strip. */
  previewExpanded: boolean;

  lastActiveFolderId?: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  // Light by default: most asset libraries are dark artwork on transparency,
  // and black SVGs are unreadable against a dark panel.
  theme: 'light',
  thumbnailBackground: 'checker',
  groupByType: false,

  viewMode: 'compactGrid',
  // 72 gives 3 columns at a 280pt docked width; 96 gave only 2.
  thumbnailSize: 72,
  sortMode: 'name',
  typeFilter: 'all',

  showSidebar: true,

  importOptions: DEFAULT_IMPORT_OPTIONS,

  alwaysUseFirstPdfPage: false,
  maxCacheSizeMb: 2048,
  maxPreviewSourceMb: 512,
  /*
   * 2 MB comfortably covers ordinary web-sized artwork, which stays on the fast
   * direct path, while catching the full-resolution exports that make a grid
   * unaffordable to decode.
   */
  maxDirectRenderMb: 2,

  sidebarWidth: 150,
  previewHeight: 180,
  showPreviewPanel: true,
  // Collapsed by default: the strip still names the selection, and the grid
  // gets the space back.
  previewExpanded: false,
};

/** Bounds for the thumbnail size control. */
export const THUMBNAIL_SIZE_RANGE = { min: 48, max: 240, step: 8 } as const;

/**
 * Merges persisted settings over the defaults, discarding unknown keys and
 * out-of-range values. A hand-edited or downgraded settings file must never be
 * able to put the UI into an unreachable state.
 */
export function normalizeSettings(stored: unknown): PluginSettings {
  if (typeof stored !== 'object' || stored === null) return { ...DEFAULT_SETTINGS };

  const input = stored as Partial<PluginSettings>;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const isViewMode = (v: unknown): v is ViewMode =>
    v === 'compactGrid' || v === 'largeGrid' || v === 'list';
  const isSortMode = (v: unknown): v is SortMode =>
    v === 'name' ||
    v === 'nameDesc' ||
    v === 'modified' ||
    v === 'size' ||
    v === 'recent' ||
    v === 'added';
  const isTypeFilter = (v: unknown): v is TypeFilter =>
    v === 'all' ||
    v === 'raster' ||
    v === 'vector' ||
    v === 'photoshop' ||
    v === 'pdf' ||
    v === 'favorites';

  const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';
  const isThumbBackground = (v: unknown): v is ThumbnailBackground =>
    v === 'checker' || v === 'light' || v === 'dark';

  return {
    theme: isTheme(input.theme) ? input.theme : DEFAULT_SETTINGS.theme,
    thumbnailBackground: isThumbBackground(input.thumbnailBackground)
      ? input.thumbnailBackground
      : DEFAULT_SETTINGS.thumbnailBackground,
    groupByType: input.groupByType === true,
    showSidebar: input.showSidebar !== false,

    viewMode: isViewMode(input.viewMode) ? input.viewMode : DEFAULT_SETTINGS.viewMode,
    thumbnailSize:
      typeof input.thumbnailSize === 'number' && Number.isFinite(input.thumbnailSize)
        ? clamp(input.thumbnailSize, THUMBNAIL_SIZE_RANGE.min, THUMBNAIL_SIZE_RANGE.max)
        : DEFAULT_SETTINGS.thumbnailSize,
    sortMode: isSortMode(input.sortMode) ? input.sortMode : DEFAULT_SETTINGS.sortMode,
    typeFilter: isTypeFilter(input.typeFilter) ? input.typeFilter : DEFAULT_SETTINGS.typeFilter,

    importOptions: { ...DEFAULT_IMPORT_OPTIONS, ...(input.importOptions ?? {}) },

    alwaysUseFirstPdfPage: input.alwaysUseFirstPdfPage === true,
    maxCacheSizeMb:
      typeof input.maxCacheSizeMb === 'number' && Number.isFinite(input.maxCacheSizeMb)
        ? clamp(input.maxCacheSizeMb, 128, 5120)
        : DEFAULT_SETTINGS.maxCacheSizeMb,
    maxPreviewSourceMb:
      typeof input.maxPreviewSourceMb === 'number' && Number.isFinite(input.maxPreviewSourceMb)
        ? clamp(input.maxPreviewSourceMb, 16, 4096)
        : DEFAULT_SETTINGS.maxPreviewSourceMb,
    maxDirectRenderMb:
      typeof input.maxDirectRenderMb === 'number' && Number.isFinite(input.maxDirectRenderMb)
        ? clamp(input.maxDirectRenderMb, 0.25, 64)
        : DEFAULT_SETTINGS.maxDirectRenderMb,

    sidebarWidth:
      typeof input.sidebarWidth === 'number' && Number.isFinite(input.sidebarWidth)
        ? clamp(input.sidebarWidth, 110, 280)
        : DEFAULT_SETTINGS.sidebarWidth,
    previewHeight:
      typeof input.previewHeight === 'number' && Number.isFinite(input.previewHeight)
        ? clamp(input.previewHeight, 120, 600)
        : DEFAULT_SETTINGS.previewHeight,
    showPreviewPanel: input.showPreviewPanel !== false,
    previewExpanded: input.previewExpanded === true,

    ...(typeof input.lastActiveFolderId === 'string'
      ? { lastActiveFolderId: input.lastActiveFolderId }
      : {}),
  };
}
