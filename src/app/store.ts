/**
 * Application state (roadmap section 16).
 *
 * React components never touch Photoshop or the filesystem directly - they call
 * these actions, which delegate to services. That boundary is what keeps the UI
 * testable and stops host errors from crashing a render.
 */
import { create } from 'zustand';
import type { storage as UxpStorage } from 'uxp';
import type { AssetRecord } from '../models/asset';
import { type AssetFolder, UNCATEGORISED } from '../models/folder';
import type { ImportOptions } from '../models/import-options';
import {
  type PluginSettings,
  type SortMode,
  type Theme,
  type ThumbnailBackground,
  type TypeFilter,
  type ViewMode,
  DEFAULT_SETTINGS,
} from '../models/settings';
import { photoshop } from '../adapters/host';
import { AssetBrowserError, toAssetBrowserError } from '../models/errors';
import { getServices } from './services';
import { indexFolder } from '../services/asset-index.service';
import { insertAssetSafely } from '../services/insertion.service';
import { selectVisibleAssets } from '../services/search.service';
import {
  discoverLibraryCandidates,
  isFolderAvailable,
  resolveSavedFolder,
  revealInFileManager,
  selectAssetFolder,
  tokenForFolder,
} from '../adapters/filesystem/uxp-filesystem';
import {
  type ImportPlan,
  planLibraryImport,
  selectedRows,
  setAllSelected,
  updatePlanRow,
} from '../services/library-import.service';
import { toLibraryConfig, type LibraryConfig } from '../models/library-config';
import { readLibraryBackup, writeLibraryBackup } from '../services/library-backup.service';
import { CancellationSource } from '../utils/cancellation';
import { createFolderId } from '../utils/hashing';
import { normalizePath } from '../utils/path-utils';
import { logger } from '../utils/logger';

export interface Notification {
  readonly kind: 'info' | 'error';
  readonly message: string;
  /** Monotonic id so repeated identical messages still re-trigger the UI. */
  readonly id: number;
}

export interface IndexingState {
  readonly folderId: string;
  readonly folderName: string;
  readonly scanned: number;
}

/** A picked folder waiting for the user to choose its category. */
export interface PendingImport {
  readonly name: string;
  readonly nativePath: string;
  readonly persistentToken?: string;
}

export interface AssetBrowserState {
  // ---------------------------------------------------------------- data --
  folders: AssetFolder[];
  assets: AssetRecord[];
  settings: PluginSettings;

  activeFolderId: string | null;
  /** Subtree within the active library, '' for its root. */
  activePathPrefix: string;
  selectedAssetId: string | null;
  query: string;

  // -------------------------------------------------------------- status --
  ready: boolean;
  bootError: string | null;
  indexing: IndexingState | null;
  notification: Notification | null;
  /** True while an insert is running, to disable the action bar. */
  inserting: boolean;
  /** Whether Photoshop currently has a document open. Refreshed on demand. */
  hasActiveDocument: boolean;
  /**
   * A folder the user picked that is awaiting a category. Held here rather than
   * added immediately so the library is filed correctly from the start.
   */
  pendingImport: PendingImport | null;
  /**
   * Folders found under a picked root, awaiting confirmation. Null when no bulk
   * import is in progress.
   */
  importPlan: ImportPlan | null;
  /** Name of the folder the plan was scanned from, for the dialog's heading. */
  importRootName: string;
  /** True while a folder tree is being scanned or a bulk import is running. */
  scanning: boolean;

  // ------------------------------------------------------------- actions --
  initialize(): Promise<void>;
  /** Opens the folder picker, then awaits a category via `confirmImport`. */
  addFolder(): Promise<void>;
  confirmImport(category: string): Promise<void>;
  cancelImport(): void;

  /** Picks a parent folder and offers every asset folder beneath it. */
  scanFolderTree(): Promise<void>;
  updateImportPlan(
    rowId: string,
    changes: { selected?: boolean; category?: string; displayName?: string },
  ): void;
  setAllImportRows(selected: boolean): void;
  confirmBulkImport(): Promise<void>;
  cancelBulkImport(): void;

  /** Writes the portable library config to a folder the user picks. */
  exportLibraries(): Promise<void>;
  /** Restores libraries from a config file, re-acquiring each folder by path. */
  importLibraries(): Promise<void>;
  setFolderCategory(folderId: string, category: string): Promise<void>;
  removeFolder(folderId: string): Promise<void>;
  refreshFolder(folderId: string): Promise<void>;
  reconnectFolder(folderId: string): Promise<void>;
  renameFolder(folderId: string, displayName: string): Promise<void>;
  toggleFolderFavorite(folderId: string): Promise<void>;
  setIncludeSubfolders(folderId: string, include: boolean): Promise<void>;
  revealFolder(folderId: string): Promise<void>;

  selectFolder(folderId: string | null, pathPrefix?: string): void;
  selectAsset(assetId: string | null): void;
  toggleAssetFavorite(assetId: string): Promise<void>;
  revealAsset(assetId: string): Promise<void>;

  setQuery(query: string): void;
  setTypeFilter(filter: TypeFilter): void;
  setSortMode(mode: SortMode): void;
  setViewMode(mode: ViewMode): void;
  setThumbnailSize(size: number): void;
  setTheme(theme: Theme): void;
  setThumbnailBackground(background: ThumbnailBackground): void;
  setGroupByType(grouped: boolean): void;
  setShowSidebar(visible: boolean): void;
  /** Re-reads host state that the plugin cannot observe passively. */
  refreshHostState(): void;
  setImportOptions(options: Partial<ImportOptions>): void;
  setSidebarWidth(width: number): void;
  setPreviewHeight(height: number): void;
  togglePreviewPanel(): void;
  togglePreviewExpanded(): void;

  insertAsset(assetId: string, overrides?: Partial<ImportOptions>): Promise<void>;

  clearCache(): Promise<void>;
  notify(kind: 'info' | 'error', message: string): void;
  dismissNotification(): void;
}

/** Cancels indexing when the user switches away (roadmap section 18.4). */
let indexingCancellation: CancellationSource | null = null;
let notificationCounter = 0;

/**
 * Live folder handles from the last tree scan, keyed by native path.
 *
 * Kept outside the store because a UXP `Folder` is a host object, not state:
 * it must not be serialised, compared or persisted. The import plan in the
 * store stays plain data; this is the bridge back to the entries needed to mint
 * persistent tokens. Cleared as soon as the import finishes or is cancelled.
 */
let scannedEntries = new Map<string, UxpStorage.Folder>();

/**
 * Drops previews for deleted assets, then evicts oldest-first until the cache
 * fits its budget.
 *
 * `maxCacheSizeMb` was a setting the user could change and nothing read:
 * `collectGarbage` existed but was never called from anywhere, so the on-disk
 * preview cache grew without limit. Pruning orphans alone does not bound it -
 * a library that keeps its files keeps every preview ever generated for them.
 *
 * Best-effort and fire-and-forget: reclaiming space must never fail an index.
 */
async function reclaimCacheSpace(
  liveAssetIds: ReadonlySet<string>,
  settings: PluginSettings,
): Promise<void> {
  const cache = getServices().cache;
  try {
    await cache.pruneOrphans(liveAssetIds);
    await cache.collectGarbage(settings.maxCacheSizeMb * 1024 * 1024);
  } catch (error) {
    logger.warn('cache', 'Could not reclaim cache space', error);
  }
}

export const useStore = create<AssetBrowserState>((set, get) => ({
  folders: [],
  assets: [],
  settings: { ...DEFAULT_SETTINGS },

  activeFolderId: null,
  activePathPrefix: '',
  selectedAssetId: null,
  query: '',

  ready: false,
  bootError: null,
  indexing: null,
  notification: null,
  inserting: false,
  hasActiveDocument: false,
  pendingImport: null,
  importPlan: null,
  importRootName: '',
  scanning: false,

  // ------------------------------------------------------------ lifecycle --

  async initialize() {
    try {
      const services = getServices();

      const [settings, folders, assets] = await Promise.all([
        services.settingsStore.load(),
        services.foldersStore.load(),
        services.assetsStore.load(),
      ]);

      set({
        settings,
        folders,
        assets,
        activeFolderId: settings.lastActiveFolderId ?? folders[0]?.id ?? null,
        ready: true,
      });

      /*
       * Only the library about to be shown is probed, and only after first
       * paint. Everything else waits until it is selected: boot must not walk
       * a dozen network shares to render a grid it already has on disk.
       */
      void checkFolderAvailability(set, get, get().activeFolderId);
    } catch (error) {
      logger.error('store', 'Initialisation failed', error);
      set({
        ready: true,
        bootError:
          error instanceof Error ? error.message : 'The plugin could not read its saved data.',
      });
    }
  },

  // -------------------------------------------------------------- folders --

  async addFolder() {
    try {
      const picked = await selectAssetFolder();
      if (!picked) return; // user cancelled

      const id = createFolderId(picked.nativePath);
      if (get().folders.some((folder) => folder.id === id)) {
        get().notify('info', 'That folder is already in your libraries.');
        return;
      }

      // Hand off to the category picker; `confirmImport` finishes the job.
      set({
        pendingImport: {
          name: picked.name,
          nativePath: normalizePath(picked.nativePath),
          ...(picked.persistentToken ? { persistentToken: picked.persistentToken } : {}),
        },
      });
    } catch (error) {
      reportError(get, error, 'FOLDER_PERMISSION_DENIED');
    }
  },

  async confirmImport(category) {
    const pending = get().pendingImport;
    if (!pending) return;

    const id = createFolderId(pending.nativePath);
    const folder: AssetFolder = {
      id,
      displayName: pending.name,
      category: category.trim() || UNCATEGORISED,
      nativePath: pending.nativePath,
      ...(pending.persistentToken ? { persistentToken: pending.persistentToken } : {}),
      includeSubfolders: true,
      isFavorite: false,
      isAvailable: true,
      addedAt: Date.now(),
    };

    const folders = [...get().folders, folder];
    set({ folders, activeFolderId: id, activePathPrefix: '', pendingImport: null });
    await persistFolders(folders);

    if (!pending.persistentToken) {
      get().notify(
        'info',
        'This library cannot be restored automatically after a restart. You will be asked to reconnect it.',
      );
    }

    await get().refreshFolder(id);
  },

  cancelImport() {
    set({ pendingImport: null });
  },

  // ---------------------------------------------------------- bulk import --

  async scanFolderTree() {
    set({ scanning: true });
    try {
      const picked = await selectAssetFolder();
      if (!picked) return; // user cancelled

      const candidates = await discoverLibraryCandidates(picked.entry);

      if (candidates.length === 0) {
        get().notify('info', 'No folders with supported assets were found under that folder.');
        return;
      }

      // Entries are held aside: the plan is plain data so it can be tested,
      // but importing needs the live folder handles to mint tokens from.
      scannedEntries = new Map(
        candidates.map((candidate) => [normalizePath(candidate.nativePath), candidate.entry]),
      );

      set({
        importPlan: planLibraryImport(candidates, get().folders),
        importRootName: picked.name,
      });
    } catch (error) {
      reportError(get, error, 'FOLDER_PERMISSION_DENIED');
    } finally {
      set({ scanning: false });
    }
  },

  updateImportPlan(rowId, changes) {
    const plan = get().importPlan;
    if (plan) set({ importPlan: updatePlanRow(plan, rowId, changes) });
  },

  setAllImportRows(selected) {
    const plan = get().importPlan;
    if (plan) set({ importPlan: setAllSelected(plan, selected) });
  },

  async confirmBulkImport() {
    const plan = get().importPlan;
    if (!plan) return;

    const rows = selectedRows(plan);
    if (rows.length === 0) {
      set({ importPlan: null });
      return;
    }

    set({ importPlan: null, importRootName: '', scanning: true });

    const added: AssetFolder[] = [];
    for (const row of rows) {
      const entry = scannedEntries.get(row.nativePath);
      // Minting per folder, not per tree: a token is scoped to one entry.
      const persistentToken = entry ? await tokenForFolder(entry) : undefined;

      added.push({
        id: row.id,
        // Defended like `category` below. The dialog blocks a blank name, but
        // a library persisted with one renders as an empty sidebar row with
        // no way to identify or re-target it, so never store the raw value.
        displayName: row.displayName.trim() || fallbackLibraryName(row.nativePath),
        category: row.category.trim() || UNCATEGORISED,
        nativePath: row.nativePath,
        ...(persistentToken ? { persistentToken } : {}),
        includeSubfolders: true,
        isFavorite: false,
        isAvailable: true,
        addedAt: Date.now(),
      });
    }

    const folders = [...get().folders, ...added];
    set({ folders, activeFolderId: added[0]?.id ?? get().activeFolderId, activePathPrefix: '' });
    await persistFolders(folders);

    scannedEntries = new Map();
    set({ scanning: false });

    // Index sequentially. Indexing cancels the previous run by design, so a
    // parallel loop would leave every library but the last one unindexed.
    for (const folder of added) {
      await get().refreshFolder(folder.id);
    }

    const withoutToken = added.filter((folder) => !folder.persistentToken).length;
    get().notify(
      'info',
      withoutToken === 0
        ? `Added ${added.length} ${added.length === 1 ? 'library' : 'libraries'}.`
        : `Added ${added.length} libraries. ${withoutToken} could not be remembered across restarts.`,
    );
  },

  cancelBulkImport() {
    scannedEntries = new Map();
    set({ importPlan: null, importRootName: '' });
  },

  // ------------------------------------------------------- backup/restore --

  async exportLibraries() {
    try {
      const folders = get().folders;
      if (folders.length === 0) {
        get().notify('info', 'There are no libraries to back up yet.');
        return;
      }

      const config: LibraryConfig = toLibraryConfig(folders, new Date().toISOString());
      const result = await writeLibraryBackup(config);
      if (!result) return; // user cancelled

      get().notify('info', `Backed up ${result.libraryCount} libraries to ${result.nativePath}`);
    } catch (error) {
      reportError(get, error, 'FOLDER_PERMISSION_DENIED');
    }
  },

  async importLibraries() {
    set({ scanning: true });
    try {
      const config = await readLibraryBackup();
      if (!config) return; // user cancelled

      const existing = new Set(get().folders.map((folder) => folder.id));
      const added: AssetFolder[] = [];
      const unreachable: string[] = [];

      for (const entry of config.libraries) {
        const id = createFolderId(entry.nativePath);
        if (existing.has(id)) continue;

        /*
         * No token to restore from - tokens do not survive the move this
         * backup exists for. The folder is re-acquired by path, which is what
         * `fullAccess` buys, and a fresh token is minted for next time.
         */
        const folder = await resolveSavedFolder(undefined, entry.nativePath);
        if (!folder) {
          unreachable.push(entry.nativePath);
          continue;
        }

        const persistentToken = await tokenForFolder(folder);
        added.push({
          id,
          displayName: entry.displayName,
          category: entry.category,
          nativePath: entry.nativePath,
          ...(persistentToken ? { persistentToken } : {}),
          includeSubfolders: entry.includeSubfolders,
          isFavorite: entry.isFavorite,
          isAvailable: true,
          addedAt: Date.now(),
        });
        existing.add(id);
      }

      if (added.length > 0) {
        const folders = [...get().folders, ...added];
        set({ folders, activeFolderId: get().activeFolderId ?? added[0]!.id });
        await persistFolders(folders);
      }

      set({ scanning: false });
      for (const folder of added) {
        await get().refreshFolder(folder.id);
      }

      const skipped = config.libraries.length - added.length - unreachable.length;
      const parts = [`Restored ${added.length} of ${config.libraries.length} libraries.`];
      if (skipped > 0) parts.push(`${skipped} already present.`);
      if (unreachable.length > 0) {
        parts.push(`${unreachable.length} could not be found - is the drive mounted?`);
        logger.warn('backup', 'Unreachable on restore', unreachable);
      }
      get().notify(unreachable.length > 0 ? 'error' : 'info', parts.join(' '));
    } catch (error) {
      reportError(get, error, 'FOLDER_PERMISSION_DENIED');
    } finally {
      set({ scanning: false });
    }
  },

  async setFolderCategory(folderId, category) {
    const folders = get().folders.map((folder) =>
      folder.id === folderId ? { ...folder, category: category.trim() || UNCATEGORISED } : folder,
    );
    set({ folders });
    await persistFolders(folders);
  },

  async removeFolder(folderId) {
    const folders = get().folders.filter((folder) => folder.id !== folderId);
    const assets = get().assets.filter((asset) => asset.folderId !== folderId);

    set({
      folders,
      assets,
      activeFolderId:
        get().activeFolderId === folderId ? (folders[0]?.id ?? null) : get().activeFolderId,
      activePathPrefix: '',
      selectedAssetId: null,
    });

    await Promise.all([persistFolders(folders), persistAssets(assets)]);
    // Reclaim cache space for assets that no longer exist.
    void reclaimCacheSpace(new Set(assets.map((asset) => asset.id)), get().settings);
  },

  async refreshFolder(folderId) {
    const folder = get().folders.find((entry) => entry.id === folderId);
    if (!folder) return;

    indexingCancellation?.cancel();
    const cancellation = new CancellationSource();
    indexingCancellation = cancellation;

    set({ indexing: { folderId, folderName: folder.displayName, scanned: 0 } });

    try {
      const entry = await resolveSavedFolder(folder.persistentToken, folder.nativePath);
      if (!entry) {
        await markFolderUnavailable(set, get, folderId);
        throw new AssetBrowserError('FOLDER_MISSING');
      }

      const result = await indexFolder({
        folder,
        entry,
        existing: get().assets,
        token: cancellation.token,
        onProgress: (progress) => {
          if (cancellation.isCancelled) return;
          set({
            indexing: {
              folderId,
              folderName: folder.displayName,
              scanned: progress.scanned,
            },
          });
        },
      });

      if (cancellation.isCancelled) return;

      const folders = get().folders.map((entryFolder) =>
        entryFolder.id === folderId
          ? {
              ...entryFolder,
              isAvailable: true,
              lastIndexedAt: Date.now(),
              assetCount: result.assets.filter((asset) => asset.folderId === folderId).length,
            }
          : entryFolder,
      );

      set({ assets: result.assets, folders });
      await Promise.all([persistAssets(result.assets), persistFolders(folders)]);

      void reclaimCacheSpace(new Set(result.assets.map((asset) => asset.id)), get().settings);
    } catch (error) {
      if (!cancellation.isCancelled) reportError(get, error, 'FOLDER_MISSING');
    } finally {
      if (indexingCancellation === cancellation) {
        indexingCancellation = null;
        set({ indexing: null });
      }
    }
  },

  async reconnectFolder(folderId) {
    const existing = get().folders.find((folder) => folder.id === folderId);
    if (!existing) return;

    try {
      const picked = await selectAssetFolder();
      if (!picked) return;

      const folders = get().folders.map((folder) =>
        folder.id === folderId
          ? {
              ...folder,
              nativePath: normalizePath(picked.nativePath),
              ...(picked.persistentToken ? { persistentToken: picked.persistentToken } : {}),
              isAvailable: true,
            }
          : folder,
      );

      set({ folders });
      await persistFolders(folders);
      await get().refreshFolder(folderId);
    } catch (error) {
      reportError(get, error, 'FOLDER_REAUTHORIZATION_REQUIRED');
    }
  },

  async renameFolder(folderId, displayName) {
    const trimmed = displayName.trim();
    if (trimmed === '') return;

    const folders = get().folders.map((folder) =>
      folder.id === folderId ? { ...folder, displayName: trimmed } : folder,
    );
    set({ folders });
    await persistFolders(folders);
  },

  async toggleFolderFavorite(folderId) {
    const folders = get().folders.map((folder) =>
      folder.id === folderId ? { ...folder, isFavorite: !folder.isFavorite } : folder,
    );
    set({ folders });
    await persistFolders(folders);
  },

  async setIncludeSubfolders(folderId, include) {
    const folders = get().folders.map((folder) =>
      folder.id === folderId ? { ...folder, includeSubfolders: include } : folder,
    );
    set({ folders });
    await persistFolders(folders);
    await get().refreshFolder(folderId);
  },

  async revealFolder(folderId) {
    const folder = get().folders.find((entry) => entry.id === folderId);
    if (!folder) return;
    try {
      await revealInFileManager(folder.nativePath);
    } catch (error) {
      reportError(get, error, 'FOLDER_MISSING');
    }
  },

  // ------------------------------------------------------------ selection --

  selectFolder(folderId, pathPrefix = '') {
    // Abandon indexing for a library the user has navigated away from.
    if (folderId !== get().activeFolderId) indexingCancellation?.cancel();

    set({ activeFolderId: folderId, activePathPrefix: pathPrefix, selectedAssetId: null });

    // Update settings through the normal path so the in-memory copy and the
    // persisted copy cannot drift apart.
    if (folderId) updateSettings(set, get, { lastActiveFolderId: folderId });

    // First time this library is opened this session, confirm it is still
    // reachable. Boot no longer does this for every library up front.
    void checkFolderAvailability(set, get, folderId);
  },

  selectAsset(assetId) {
    set({ selectedAssetId: assetId });
  },

  async toggleAssetFavorite(assetId) {
    const assets = get().assets.map((asset) =>
      asset.id === assetId ? { ...asset, isFavorite: !asset.isFavorite } : asset,
    );
    set({ assets });
    await persistAssets(assets);
  },

  async revealAsset(assetId) {
    const asset = get().assets.find((entry) => entry.id === assetId);
    if (!asset) return;
    try {
      await revealInFileManager(asset.nativePath);
    } catch (error) {
      reportError(get, error, 'FILE_MISSING');
    }
  },

  // ------------------------------------------------------------- settings --

  setQuery(query) {
    set({ query });
  },

  setTypeFilter(typeFilter) {
    updateSettings(set, get, { typeFilter });
  },

  setSortMode(sortMode) {
    updateSettings(set, get, { sortMode });
  },

  setViewMode(viewMode) {
    updateSettings(set, get, { viewMode });
  },

  setThumbnailSize(thumbnailSize) {
    updateSettings(set, get, { thumbnailSize });
  },

  setTheme(theme) {
    updateSettings(set, get, { theme });
  },

  setThumbnailBackground(thumbnailBackground) {
    updateSettings(set, get, { thumbnailBackground });
  },

  setGroupByType(groupByType) {
    updateSettings(set, get, { groupByType });
  },

  setShowSidebar(showSidebar) {
    updateSettings(set, get, { showSidebar });
  },

  refreshHostState() {
    // Photoshop offers no passive signal for "a document opened", so this is
    // called at the moments the answer actually matters.
    try {
      set({ hasActiveDocument: photoshop().app.activeDocument != null });
    } catch (error) {
      logger.debug('store', 'Could not read active document', error);
      set({ hasActiveDocument: false });
    }
  },

  setImportOptions(options) {
    updateSettings(set, get, {
      importOptions: { ...get().settings.importOptions, ...options },
    });
  },

  setSidebarWidth(sidebarWidth) {
    updateSettings(set, get, { sidebarWidth });
  },

  setPreviewHeight(previewHeight) {
    updateSettings(set, get, { previewHeight });
  },

  togglePreviewPanel() {
    updateSettings(set, get, { showPreviewPanel: !get().settings.showPreviewPanel });
  },

  togglePreviewExpanded() {
    updateSettings(set, get, { previewExpanded: !get().settings.previewExpanded });
  },

  // ------------------------------------------------------------ insertion --

  async insertAsset(assetId, overrides) {
    const asset = get().assets.find((entry) => entry.id === assetId);
    if (!asset) return;
    if (get().inserting) return; // guard against double-fire from Enter + dblclick

    set({ inserting: true });

    const options = { ...get().settings.importOptions, ...overrides };
    const outcome = await insertAssetSafely(asset, options);

    if (outcome.ok) {
      const assets = get().assets.map((entry) =>
        entry.id === assetId ? { ...entry, lastImportedAt: Date.now() } : entry,
      );
      set({ assets, inserting: false });
      void persistAssets(assets);

      if (outcome.result.strategy === 'documentCanvas') {
        // Not an error, but worth saying once: the asset went to the canvas
        // centre because no artboard was in play.
        logger.debug('store', 'Inserted onto document canvas (no artboard)');
      }
    } else {
      set({ inserting: false });
      get().notify('error', outcome.error.message);
    }
  },

  // ---------------------------------------------------------------- misc --

  async clearCache() {
    const removed = await getServices().cache.clear();
    getServices().thumbnails.reset();
    get().notify('info', `Cleared ${removed} cached previews.`);
  },

  notify(kind, message) {
    notificationCounter += 1;
    set({ notification: { kind, message, id: notificationCounter } });
  },

  dismissNotification() {
    set({ notification: null });
  },
}));

// ------------------------------------------------------------- helpers -----

type SetState = (partial: Partial<AssetBrowserState>) => void;
type GetState = () => AssetBrowserState;

/**
 * Last resort name for a library imported with the name field left blank.
 *
 * The folder's own name is the same thing `suggestDisplayName` started from,
 * so it is a name the user will recognise in the sidebar - which is the whole
 * point of not persisting the empty string.
 */
function fallbackLibraryName(nativePath: string): string {
  const name = nativePath.split('/').filter(Boolean).pop();
  return name && name.trim() !== '' ? name : 'Untitled Library';
}

function updateSettings(set: SetState, get: GetState, patch: Partial<PluginSettings>): void {
  const settings = { ...get().settings, ...patch };
  set({ settings });
  void persistSettings(settings);
}

async function persistFolders(folders: AssetFolder[]): Promise<void> {
  await getServices().foldersStore.saveDeferred(folders);
}

async function persistAssets(assets: AssetRecord[]): Promise<void> {
  await getServices().assetsStore.saveDeferred(assets);
}

async function persistSettings(settings: PluginSettings): Promise<void> {
  await getServices().settingsStore.saveDeferred(settings);
}

function reportError(
  get: GetState,
  error: unknown,
  fallback: Parameters<typeof toAssetBrowserError>[1],
): void {
  const normalized = toAssetBrowserError(error, fallback);
  logger.error('store', normalized.message, normalized.detail ?? error);
  get().notify('error', normalized.message);
}

async function markFolderUnavailable(
  set: SetState,
  get: GetState,
  folderId: string,
): Promise<void> {
  const folders = get().folders.map((folder) =>
    folder.id === folderId ? { ...folder, isAvailable: false } : folder,
  );
  set({ folders });
  await persistFolders(folders);
}

/**
 * Verifies saved libraries are still reachable.
 *
 * Runs in the background after start-up so an offline network share shows a
 * reconnect state instead of blocking the panel (roadmap section 25).
 */
/**
 * Libraries whose availability has been probed this session, so selecting one
 * repeatedly does not re-hit the network.
 */
const availabilityChecked = new Set<string>();

/**
 * Probes ONE library, on demand.
 *
 * This used to run over every library at boot. Each probe resolves a persistent
 * token and then lists the folder, so a dozen libraries on a network share meant
 * a dozen serial round-trips before the panel was usable - and it touched
 * libraries the user had not asked for and might not open all session.
 *
 * The persisted `isAvailable` flag stands in until a library is actually
 * selected: last-known state is a better thing to show than a spinner, and a
 * stale one costs nothing because opening the library corrects it.
 */
async function checkFolderAvailability(
  set: SetState,
  get: GetState,
  folderId: string | null,
): Promise<void> {
  if (!folderId || availabilityChecked.has(folderId)) return;

  const folder = get().folders.find((entry) => entry.id === folderId);
  if (!folder) return;

  availabilityChecked.add(folderId);

  try {
    const entry = await resolveSavedFolder(folder.persistentToken, folder.nativePath);
    const available = entry ? await isFolderAvailable(entry) : false;

    if (available !== folder.isAvailable) {
      const folders = get().folders.map((current) =>
        current.id === folder.id ? { ...current, isAvailable: available } : current,
      );
      set({ folders });
      await persistFolders(folders);
    }
  } catch {
    // Treated as unavailable; the sidebar shows a reconnect action.
  }
}

// --------------------------------------------------------------- selectors --

/**
 * Assets visible for the current folder, query, filter and sort.
 *
 * A plain function rather than a store field so it recomputes from whatever the
 * component reads, without a second source of truth to keep in sync.
 */
export function selectVisible(state: AssetBrowserState): AssetRecord[] {
  return selectVisibleAssets(
    state.assets,
    {
      query: state.query,
      typeFilter: state.settings.typeFilter,
      folderId: state.activeFolderId,
      relativePathPrefix: state.activePathPrefix || null,
    },
    state.settings.sortMode,
  );
}

export function selectSelectedAsset(state: AssetBrowserState): AssetRecord | null {
  if (!state.selectedAssetId) return null;
  return state.assets.find((asset) => asset.id === state.selectedAssetId) ?? null;
}
