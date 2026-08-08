/**
 * Service container.
 *
 * Constructed lazily so that importing a module never touches the UXP host -
 * that keeps the pure logic unit testable and means a host failure surfaces as
 * an error state in the UI rather than a blank panel at load time.
 */
import { UxpPluginStorage } from '../adapters/filesystem/uxp-plugin-storage';
import type { PluginStorage } from '../adapters/filesystem/plugin-storage';
import { CacheService } from '../services/cache.service';
import { ThumbnailService } from '../services/thumbnail.service';
import { JsonDocumentStore } from '../services/database.service';
import { type AssetFolder, UNCATEGORISED } from '../models/folder';
import type { AssetRecord } from '../models/asset';
import { type PluginSettings, DEFAULT_SETTINGS, normalizeSettings } from '../models/settings';

/** Bumped when the on-disk shape of a document changes. */
const SCHEMA_VERSIONS = {
  folders: 1,
  assets: 1,
  settings: 1,
} as const;

export interface Services {
  readonly storage: PluginStorage;
  readonly cache: CacheService;
  readonly thumbnails: ThumbnailService;
  readonly foldersStore: JsonDocumentStore<AssetFolder[]>;
  readonly assetsStore: JsonDocumentStore<AssetRecord[]>;
  readonly settingsStore: JsonDocumentStore<PluginSettings>;
}

let services: Services | undefined;

export function getServices(settings: PluginSettings = DEFAULT_SETTINGS): Services {
  if (services) return services;

  const storage = new UxpPluginStorage();
  const cache = new CacheService(storage);

  services = {
    storage,
    cache,
    thumbnails: new ThumbnailService(cache, {
      maxPreviewSourceMb: settings.maxPreviewSourceMb,
      maxDirectRenderMb: settings.maxDirectRenderMb,
    }),

    foldersStore: new JsonDocumentStore<AssetFolder[]>(storage, 'database/folders.json', {
      version: SCHEMA_VERSIONS.folders,
      createDefault: () => [],
      normalize: (data) => {
        if (!Array.isArray(data)) return [];
        // Libraries added before categories existed have none; file them under
        // Uncategorised rather than dropping them.
        return (data as AssetFolder[]).map((folder) => ({
          ...folder,
          category: folder.category || UNCATEGORISED,
        }));
      },
    }),

    assetsStore: new JsonDocumentStore<AssetRecord[]>(storage, 'database/assets.json', {
      version: SCHEMA_VERSIONS.assets,
      createDefault: () => [],
      normalize: (data) => (Array.isArray(data) ? (data as AssetRecord[]) : []),
    }),

    settingsStore: new JsonDocumentStore<PluginSettings>(storage, 'database/settings.json', {
      version: SCHEMA_VERSIONS.settings,
      createDefault: () => ({ ...DEFAULT_SETTINGS }),
      normalize: normalizeSettings,
    }),
  };

  return services;
}

/** Test seam: replaces the container. */
export function __setServices(replacement: Services | undefined): void {
  services = replacement;
}
