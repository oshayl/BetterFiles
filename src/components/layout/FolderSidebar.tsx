/**
 * Library sidebar, organised by asset category (roadmap section 10.3).
 *
 * Categories are the primary structure: libraries are imported *as* Textures,
 * Vectors, Mockups and so on, so finding assets means picking a category rather
 * than remembering which folder something lives in.
 *
 * Nested subfolders are still reachable, but collapsed by default - a deep tree
 * is what made a large collection hard to sift through.
 *
 * The scroll region gets an explicit pixel height: UXP's flexbox does not bound
 * a flex child, so a height derived from `flex: 1 1 auto` never scrolls.
 */
import { type ReactElement, useState } from 'react';
import type { AssetRecord } from '../../models/asset';
import { type AssetFolder, groupFoldersByCategory } from '../../models/folder';
import { collectSubfolders } from '../../services/search.service';
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FolderIcon,
  OfflineIcon,
  PlusIcon,
  StarIcon,
} from '../icons';
import { Pressable } from '../controls/Pressable';

interface FolderSidebarProps {
  readonly folders: readonly AssetFolder[];
  readonly assets: readonly AssetRecord[];
  readonly activeFolderId: string | null;
  readonly activePathPrefix: string;
  readonly width: number;
  /** Explicit height for the scrollable tree. */
  readonly treeHeight: number;
  readonly onSelectFolder: (folderId: string, pathPrefix: string) => void;
  readonly onAddFolder: () => void;
  /** Picks a parent folder and offers every asset folder beneath it. */
  readonly onScanFolderTree: () => void;
  readonly onRemoveFolder: (folderId: string) => void;
  readonly onRefreshFolder: (folderId: string) => void;
  readonly onReconnectFolder: (folderId: string) => void;
  readonly onToggleFavorite: (folderId: string) => void;
  readonly onRevealFolder: (folderId: string) => void;
  readonly onToggleSubfolders: (folderId: string, include: boolean) => void;
  readonly onChangeCategory: (folderId: string) => void;
}

export function FolderSidebar(props: FolderSidebarProps): ReactElement {
  const groups = groupFoldersByCategory(props.folders);

  return (
    <div className="sidebar col no-shrink" style={{ width: `${props.width}px` }}>
      <div className="sidebar__tree scroll-y" style={{ height: `${props.treeHeight}px` }}>
        {groups.map((group) => (
          <div className="category" key={group.category}>
            <div className="category__header">
              <span className="category__name">{group.category}</span>
              <span className="category__count">{group.folders.length}</span>
            </div>

            {group.folders.map((folder) => (
              <LibraryNode key={folder.id} folder={folder} {...props} />
            ))}
          </div>
        ))}

        {groups.length === 0 && <div className="sidebar__empty muted">No libraries yet.</div>}
      </div>

      <div className="sidebar__actions row" data-measure="sidebarChrome">
        <Pressable className="sidebar__add fill" title="Add one folder" onClick={props.onAddFolder}>
          <PlusIcon size={12} />
          <span>ADD FOLDER</span>
        </Pressable>

        {/*
          The reason this exists: a pack collection is one parent folder holding
          many library folders, and adding them one at a time meant one trip
          through the picker each.
        */}
        <Pressable
          className="sidebar__add sidebar__add--scan"
          title="Scan a folder and import every asset folder inside it"
          onClick={props.onScanFolderTree}
        >
          SCAN
        </Pressable>
      </div>
    </div>
  );
}

function LibraryNode({
  folder,
  assets,
  activeFolderId,
  activePathPrefix,
  onSelectFolder,
  onRemoveFolder,
  onRefreshFolder,
  onReconnectFolder,
  onToggleFavorite,
  onRevealFolder,
  onToggleSubfolders,
  onChangeCategory,
}: FolderSidebarProps & { folder: AssetFolder }): ReactElement {
  // Collapsed by default: the point of categories is to avoid a wall of tree.
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isActiveLibrary = activeFolderId === folder.id;
  const subfolders = folder.includeSubfolders ? collectSubfolders(assets, folder.id, '') : [];

  return (
    <div className="tree-node">
      <div
        className="tree-row"
        data-active={isActiveLibrary && activePathPrefix === '' ? 'true' : 'false'}
        onClick={() => onSelectFolder(folder.id, '')}
      >
        <button
          className="tree-row__twisty"
          title={expanded ? 'Collapse' : 'Expand'}
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {subfolders.length > 0 ? (
            expanded ? (
              <ChevronDownIcon size={12} />
            ) : (
              <ChevronRightIcon size={12} />
            )
          ) : (
            <span className="tree-row__twisty-blank" />
          )}
        </button>

        {folder.isAvailable ? <FolderIcon size={12} /> : <OfflineIcon size={12} />}

        <span className="tree-row__label truncate" title={folder.nativePath}>
          {folder.displayName}
        </span>

        {folder.assetCount != null && <span className="tree-row__count">{folder.assetCount}</span>}

        {folder.isFavorite && <StarIcon size={12} filled />}

        <button
          className="tree-row__menu"
          title="Library actions"
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((value) => !value);
          }}
        >
          ...
        </button>
      </div>

      {!folder.isAvailable && (
        <button className="tree-row__reconnect" onClick={() => onReconnectFolder(folder.id)}>
          Unavailable - reconnect
        </button>
      )}

      {menuOpen && (
        <div className="tree-menu">
          <button
            onClick={() => {
              setMenuOpen(false);
              onChangeCategory(folder.id);
            }}
          >
            Change Category
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onRefreshFolder(folder.id);
            }}
          >
            Refresh
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onToggleFavorite(folder.id);
            }}
          >
            {folder.isFavorite ? 'Unfavourite' : 'Favourite'}
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onRevealFolder(folder.id);
            }}
          >
            Reveal in File Manager
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onToggleSubfolders(folder.id, !folder.includeSubfolders);
            }}
          >
            {folder.includeSubfolders ? 'Exclude Subfolders' : 'Include Subfolders'}
          </button>
          <button
            onClick={() => {
              setMenuOpen(false);
              onRemoveFolder(folder.id);
            }}
          >
            Remove Library
          </button>
        </div>
      )}

      {expanded &&
        subfolders.map((name) => (
          <SubfolderNode
            key={name}
            folderId={folder.id}
            assets={assets}
            prefix={name}
            label={name}
            depth={1}
            activeFolderId={activeFolderId}
            activePathPrefix={activePathPrefix}
            onSelectFolder={onSelectFolder}
          />
        ))}
    </div>
  );
}

interface SubfolderNodeProps {
  readonly folderId: string;
  readonly assets: readonly AssetRecord[];
  readonly prefix: string;
  readonly label: string;
  readonly depth: number;
  readonly activeFolderId: string | null;
  readonly activePathPrefix: string;
  readonly onSelectFolder: (folderId: string, pathPrefix: string) => void;
}

/** Depth cap keeps a pathological hierarchy from producing an unusable sidebar. */
const MAX_TREE_DEPTH = 6;

function SubfolderNode({
  folderId,
  assets,
  prefix,
  label,
  depth,
  activeFolderId,
  activePathPrefix,
  onSelectFolder,
}: SubfolderNodeProps): ReactElement {
  const [expanded, setExpanded] = useState(false);

  const children = collectSubfolders(assets, folderId, prefix);
  const hasChildren = depth < MAX_TREE_DEPTH && children.length > 0;
  const isActive = activeFolderId === folderId && activePathPrefix === prefix;

  return (
    <div className="tree-node">
      <div
        className="tree-row"
        data-active={isActive ? 'true' : 'false'}
        style={{ paddingLeft: `${depth * 12 + 6}px` }}
        onClick={() => onSelectFolder(folderId, prefix)}
      >
        <button
          className="tree-row__twisty"
          onClick={(event) => {
            event.stopPropagation();
            setExpanded((value) => !value);
          }}
        >
          {hasChildren ? (
            expanded ? (
              <ChevronDownIcon size={12} />
            ) : (
              <ChevronRightIcon size={12} />
            )
          ) : (
            <span className="tree-row__twisty-blank" />
          )}
        </button>

        <span className="tree-row__label truncate">{label}</span>
      </div>

      {expanded &&
        hasChildren &&
        children.map((child) => (
          <SubfolderNode
            key={child}
            folderId={folderId}
            assets={assets}
            prefix={`${prefix}/${child}`}
            label={child}
            depth={depth + 1}
            activeFolderId={activeFolderId}
            activePathPrefix={activePathPrefix}
            onSelectFolder={onSelectFolder}
          />
        ))}
    </div>
  );
}
