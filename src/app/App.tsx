/**
 * Application root.
 *
 * Owns layout, theming and keyboard handling only. Every action delegates to
 * the store, which delegates to services - no component touches Photoshop or
 * the filesystem directly (roadmap section 16).
 *
 * RESPONSIVE BEHAVIOUR
 * The panel is routinely docked at 280-380px, so layout adapts to measured
 * width rather than assuming a comfortable size. Below the breakpoints the
 * sidebar and preview collapse to reclaim space for the grid; the user's own
 * preferences are preserved and re-applied when the panel widens again.
 */
import { type ReactElement, useCallback, useEffect, useMemo, useState } from 'react';
import { useStore, selectSelectedAsset, selectVisible } from './store';
import { getServices } from './services';
import { PanelHeader } from '../components/layout/PanelHeader';
import { FolderSidebar } from '../components/layout/FolderSidebar';
import { PreviewPanel } from '../components/layout/PreviewPanel';
import { ActionBar } from '../components/layout/ActionBar';
import { SearchBar } from '../components/controls/SearchBar';
import { Toolbar } from '../components/controls/Toolbar';
import { SettingsDialog } from '../components/controls/SettingsDialog';
import { ToolsPanel } from '../components/tools/ToolsPanel';
import { AssetGrid } from '../components/assets/AssetGrid';
import {
  BootErrorState,
  EmptyFolderState,
  NoLibrariesState,
  NoResultsState,
  OfflineFolderState,
} from '../components/feedback/States';
import { CategoryPicker } from '../components/controls/CategoryPicker';
import { BulkImportDialog } from '../components/controls/BulkImportDialog';
import { useElementSize, useKeyboardShortcuts, useMeasuredChrome } from '../components/hooks';
import { moveSelection } from '../utils/virtualization';
import { computeLayout } from '../utils/layout';
import { writeLayoutProbe } from '../services/layout-probe.service';
import { availableCategories } from '../models/folder';
import type { PlacementMode } from '../models/import-options';

/**
 * Width below which the sidebar is forced closed, and below which the preview
 * panel is hidden. Chosen so the grid keeps at least two comfortable columns.
 */
const NARROW_WIDTH = 340;
const VERY_NARROW_WIDTH = 260;

/**
 * How long preview generation stays held after the panel is ready, when the
 * user has not touched it. Long enough for Photoshop to finish launching,
 * short enough that thumbnails are not visibly missing.
 */
const STARTUP_GRACE_MS = 4000;

export function App(): ReactElement {
  const state = useStore();
  const [appRef, appSize] = useElementSize<HTMLDivElement>();
  const chrome = useMeasuredChrome(appRef);
  const [columns, setColumns] = useState(1);
  const [focusToken, setFocusToken] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sidebarOverride, setSidebarOverride] = useState<boolean | null>(null);

  useEffect(() => {
    void state.initialize();
    // Runs once; `initialize` is a stable store action.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Preview generation is held until startup is over.
   *
   * The panel mounts while Photoshop is still launching, and generating a
   * preview means opening a temporary document - competing with the host's own
   * startup for the same modal scope. Whichever comes first releases it: the
   * user touching the panel, which is the real signal they are looking at it,
   * or a short fallback so thumbnails still appear for someone who only looks.
   *
   * Cached previews are unaffected and render immediately; only genuinely new
   * ones wait.
   */
  useEffect(() => {
    if (!state.ready) return undefined;

    const release = () => getServices().thumbnails.enableGeneration();
    const timer = setTimeout(release, STARTUP_GRACE_MS);

    const element = appRef.current;
    const events: ReadonlyArray<keyof HTMLElementEventMap> = ['pointerdown', 'keydown', 'wheel'];
    for (const event of events) element?.addEventListener(event, release);

    return () => {
      clearTimeout(timer);
      for (const event of events) element?.removeEventListener(event, release);
    };
  }, [state.ready, appRef]);

  const visible = useMemo(() => selectVisible(state), [state]);
  const selectedAsset = selectSelectedAsset(state);
  const activeFolder = state.folders.find((folder) => folder.id === state.activeFolderId) ?? null;

  // Width of 0 means "not measured yet"; assume roomy rather than collapsing
  // everything on the first paint.
  const width = appSize.width || 400;
  const height = appSize.height || 700;

  const isNarrow = width < NARROW_WIDTH;
  const isVeryNarrow = width < VERY_NARROW_WIDTH;

  // Narrow panels force the sidebar closed, but never overwrite the saved
  // preference - it returns when there is room for it again.
  const sidebarVisible = isNarrow
    ? sidebarOverride === true
    : (sidebarOverride ?? state.settings.showSidebar);

  // The strip costs 20pt and always names the selection, so it stays even on a
  // very small panel; only the expanded stage competes for room.
  const previewVisible = state.settings.showPreviewPanel;

  const previewHeight = Math.min(state.settings.previewHeight, Math.floor(height * 0.4));

  /*
   * Scroll region heights are computed, not delegated to flexbox. UXP does not
   * bound a flex child, so `flex: 1 1 auto` containers grow to fit their
   * content and never become scrollable. See utils/layout.ts.
   *
   * `chrome` is measured from the rendered rows rather than assumed, so a CSS
   * change to any row cannot push the bottom of the panel out of frame.
   */
  const layout = computeLayout({
    appHeight: appSize.height,
    previewHeight,
    showPreview: previewVisible,
    previewExpanded: state.settings.previewExpanded,
    showNotification: state.notification != null,
    chrome,
  });

  // Zero means the panel is too short to expand into: layout.ts grants the
  // stage only what is left after the grid has been served.
  const previewExpanded = layout.previewBodyHeight > 0;

  /*
   * TEMPORARY: records what the rows actually measure, so the layout can be
   * debugged from Photoshop instead of from a screenshot. Remove with
   * layout-probe.service.ts.
   */
  useEffect(() => {
    if (!state.ready || !appRef.current) return;
    void writeLayoutProbe(appRef.current, {
      appHeight: appSize.height,
      workspaceHeight: layout.workspaceHeight,
      gridHeight: layout.gridHeight,
      previewBodyHeight: layout.previewBodyHeight,
    });
  }, [
    state.ready,
    appRef,
    appSize.height,
    layout.workspaceHeight,
    layout.gridHeight,
    layout.previewBodyHeight,
  ]);

  /** Category being re-filed, if any. */
  const [recategorising, setRecategorising] = useState<string | null>(null);
  const recategorisingFolder = recategorising
    ? (state.folders.find((folder) => folder.id === recategorising) ?? null)
    : null;

  const selectedIndex = selectedAsset
    ? visible.findIndex((asset) => asset.id === selectedAsset.id)
    : -1;

  const insert = useCallback(
    (mode?: PlacementMode) => {
      if (!state.selectedAssetId) return;
      void state.insertAsset(state.selectedAssetId, mode ? { mode } : undefined);
    },
    [state],
  );

  const toggleSidebar = useCallback(() => {
    setSidebarOverride((current) => {
      const effective = current ?? (isNarrow ? false : state.settings.showSidebar);
      const next = !effective;
      // Persist only when the panel is wide enough for the choice to be a real
      // preference rather than a reaction to cramped space.
      if (!isNarrow) void state.setShowSidebar(next);
      return next;
    });
  }, [isNarrow, state]);

  // ------------------------------------------------------- keyboard (11.2) --
  useKeyboardShortcuts(
    useCallback(
      (event: KeyboardEvent) => {
        const target = event.target as HTMLElement | null;
        const inTextField = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA';

        if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'f')) {
          event.preventDefault();
          setFocusToken((token) => token + 1);
          return;
        }

        if ((event.metaKey || event.ctrlKey) && event.key === 'r') {
          event.preventDefault();
          if (state.activeFolderId) void state.refreshFolder(state.activeFolderId);
          return;
        }

        // Everything below is grid navigation, which must not hijack typing.
        if (inTextField) return;

        if (event.key === 'Enter') {
          event.preventDefault();
          insert(event.metaKey || event.ctrlKey ? 'openDocument' : undefined);
          return;
        }

        if (event.key === 'Escape') {
          if (toolsOpen) setToolsOpen(false);
          else if (settingsOpen) setSettingsOpen(false);
          else if (state.query !== '') state.setQuery('');
          else state.selectAsset(null);
          return;
        }

        if (event.key === 'f' && selectedAsset) {
          void state.toggleAssetFavorite(selectedAsset.id);
          return;
        }

        const directions: Record<string, Parameters<typeof moveSelection>[3]> = {
          ArrowLeft: 'left',
          ArrowRight: 'right',
          ArrowUp: 'up',
          ArrowDown: 'down',
          Home: 'home',
          End: 'end',
        };

        const direction = directions[event.key];
        if (direction && visible.length > 0) {
          event.preventDefault();
          const next = moveSelection(selectedIndex, visible.length, columns, direction);
          const asset = visible[next];
          if (asset) state.selectAsset(asset.id);
        }
      },
      [state, visible, selectedIndex, columns, selectedAsset, insert, toolsOpen, settingsOpen],
    ),
  );

  // ------------------------------------------------------------- rendering --

  const themeClass = `theme-${state.settings.theme}`;

  if (!state.ready) {
    return (
      <div className={`app ${themeClass}`} ref={appRef}>
        <div className="boot">
          <div className="boot__message">Starting Asset Browser...</div>
        </div>
      </div>
    );
  }

  if (state.bootError) {
    return (
      <div className={`app ${themeClass}`} ref={appRef}>
        <BootErrorState message={state.bootError} />
      </div>
    );
  }

  return (
    <div className={`app ${themeClass}`} ref={appRef}>
      <PanelHeader
        indexing={state.indexing}
        compact={isVeryNarrow}
        theme={state.settings.theme}
        sidebarVisible={sidebarVisible}
        onToggleSidebar={toggleSidebar}
        onToggleTheme={() =>
          void state.setTheme(state.settings.theme === 'light' ? 'dark' : 'light')
        }
        onOpenTools={() => {
          // Photoshop gives no passive signal for document open/close, so
          // refresh right before the tools that depend on it are shown.
          state.refreshHostState();
          setToolsOpen(true);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <SearchBar
        value={state.query}
        resultCount={visible.length}
        focusToken={focusToken}
        onChange={state.setQuery}
      />

      <div className="workspace row" style={{ height: `${layout.workspaceHeight}px` }}>
        {sidebarVisible && (
          <FolderSidebar
            folders={state.folders}
            assets={state.assets}
            activeFolderId={state.activeFolderId}
            activePathPrefix={state.activePathPrefix}
            width={Math.min(state.settings.sidebarWidth, Math.floor(width * 0.45))}
            treeHeight={layout.sidebarTreeHeight}
            onChangeCategory={(id) => setRecategorising(id)}
            onSelectFolder={(id, prefix) => {
              state.selectFolder(id, prefix);
              // On a narrow panel the sidebar is a temporary drawer: pick a
              // folder and get straight back to the grid.
              if (isNarrow) setSidebarOverride(false);
            }}
            onAddFolder={() => void state.addFolder()}
            onScanFolderTree={() => void state.scanFolderTree()}
            onRemoveFolder={(id) => void state.removeFolder(id)}
            onRefreshFolder={(id) => void state.refreshFolder(id)}
            onReconnectFolder={(id) => void state.reconnectFolder(id)}
            onToggleFavorite={(id) => void state.toggleFolderFavorite(id)}
            onRevealFolder={(id) => void state.revealFolder(id)}
            onToggleSubfolders={(id, include) => void state.setIncludeSubfolders(id, include)}
          />
        )}

        <div className="content col fill">
          <Toolbar
            typeFilter={state.settings.typeFilter}
            sortMode={state.settings.sortMode}
            viewMode={state.settings.viewMode}
            thumbnailBackground={state.settings.thumbnailBackground}
            groupByType={state.settings.groupByType}
            compact={isVeryNarrow}
            canRefresh={state.activeFolderId != null && state.indexing == null}
            onTypeFilter={state.setTypeFilter}
            onSortMode={state.setSortMode}
            onViewMode={state.setViewMode}
            onThumbnailBackground={state.setThumbnailBackground}
            onToggleGrouping={() => void state.setGroupByType(!state.settings.groupByType)}
            onRefresh={() => {
              if (state.activeFolderId) void state.refreshFolder(state.activeFolderId);
            }}
          />

          <MainContent
            gridHeight={layout.gridHeight}
            hasLibraries={state.folders.length > 0}
            folderUnavailable={activeFolder != null && !activeFolder.isAvailable}
            folderName={activeFolder?.displayName ?? ''}
            query={state.query}
            assets={visible}
            settings={state.settings}
            selectedAssetId={state.selectedAssetId}
            onColumnsChange={setColumns}
            onAddFolder={() => void state.addFolder()}
            onClearSearch={() => state.setQuery('')}
            onReconnect={() => {
              if (state.activeFolderId) void state.reconnectFolder(state.activeFolderId);
            }}
            onSelect={state.selectAsset}
            onInsert={(assetId) => void state.insertAsset(assetId)}
            onToggleFavorite={(assetId) => void state.toggleAssetFavorite(assetId)}
          />
        </div>
      </div>

      {previewVisible && (
        <PreviewPanel
          asset={selectedAsset}
          height={layout.previewBodyHeight}
          expanded={previewExpanded}
          onToggle={state.togglePreviewExpanded}
          background={state.settings.thumbnailBackground}
          onRegenerate={(assetId) => {
            const asset = state.assets.find((entry) => entry.id === assetId);
            if (asset) {
              void getServices().thumbnails.regenerate(asset, state.settings.thumbnailSize);
            }
          }}
        />
      )}

      <ActionBar
        asset={selectedAsset}
        inserting={state.inserting}
        compact={isVeryNarrow}
        onInsert={insert}
        onReveal={() => {
          if (state.selectedAssetId) void state.revealAsset(state.selectedAssetId);
        }}
      />

      {state.notification && (
        <div
          className="notification"
          data-measure="notification"
          data-kind={state.notification.kind}
        >
          <span className="notification__text">{state.notification.message}</span>
          <button className="notification__close" onClick={state.dismissNotification}>
            Dismiss
          </button>
        </div>
      )}

      {state.pendingImport && (
        <CategoryPicker
          title="Add Library"
          folderName={state.pendingImport.name}
          categories={availableCategories(state.folders)}
          onConfirm={(category) => void state.confirmImport(category)}
          onCancel={state.cancelImport}
        />
      )}

      {recategorisingFolder && (
        <CategoryPicker
          title="Change Category"
          folderName={recategorisingFolder.displayName}
          categories={availableCategories(state.folders)}
          current={recategorisingFolder.category}
          onConfirm={(category) => {
            void state.setFolderCategory(recategorisingFolder.id, category);
            setRecategorising(null);
          }}
          onCancel={() => setRecategorising(null)}
        />
      )}

      {state.importPlan && (
        <BulkImportDialog
          plan={state.importPlan}
          rootName={state.importRootName}
          panelHeight={height}
          busy={state.scanning}
          onToggleRow={(rowId, selected) => state.updateImportPlan(rowId, { selected })}
          onChangeCategory={(rowId, category) => state.updateImportPlan(rowId, { category })}
          onSetAll={state.setAllImportRows}
          onConfirm={() => void state.confirmBulkImport()}
          onCancel={state.cancelBulkImport}
        />
      )}

      {toolsOpen && (
        <ToolsPanel hasDocument={state.hasActiveDocument} onClose={() => setToolsOpen(false)} />
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}

interface MainContentProps {
  readonly gridHeight: number;
  readonly hasLibraries: boolean;
  readonly folderUnavailable: boolean;
  readonly folderName: string;
  readonly query: string;
  readonly assets: ReturnType<typeof selectVisible>;
  readonly settings: ReturnType<typeof useStore.getState>['settings'];
  readonly selectedAssetId: string | null;
  readonly onColumnsChange: (columns: number) => void;
  readonly onAddFolder: () => void;
  readonly onClearSearch: () => void;
  readonly onReconnect: () => void;
  readonly onSelect: (assetId: string) => void;
  readonly onInsert: (assetId: string) => void;
  readonly onToggleFavorite: (assetId: string) => void;
}

/** Chooses between the grid and the various empty states. */
function MainContent(props: MainContentProps): ReactElement {
  if (!props.hasLibraries) return <NoLibrariesState onAddFolder={props.onAddFolder} />;

  if (props.folderUnavailable) {
    return <OfflineFolderState folderName={props.folderName} onReconnect={props.onReconnect} />;
  }

  if (props.assets.length === 0) {
    return props.query !== '' ? (
      <NoResultsState query={props.query} onClear={props.onClearSearch} />
    ) : (
      <EmptyFolderState />
    );
  }

  return (
    <AssetGrid
      assets={props.assets}
      viewMode={props.settings.viewMode}
      thumbnailSize={props.settings.thumbnailSize}
      thumbnailBackground={props.settings.thumbnailBackground}
      groupByType={props.settings.groupByType}
      height={props.gridHeight}
      selectedAssetId={props.selectedAssetId}
      onSelect={props.onSelect}
      onInsert={props.onInsert}
      onToggleFavorite={props.onToggleFavorite}
      onColumnsChange={props.onColumnsChange}
    />
  );
}
