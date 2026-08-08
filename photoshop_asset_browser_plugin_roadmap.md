# Photoshop Asset Browser Plugin
## End-to-End Product Roadmap, UX Specification, Architecture, and Coding Plan

**Working title:** Asset Browser  
**Platform:** Adobe Photoshop UXP  
**Primary use case:** Browse, preview, and insert locally stored creative assets without leaving Photoshop  
**Design direction:** Slick, modern, sharp, monochrome black-and-white interface  
**Document status:** Product and engineering blueprint  
**Version:** 1.0 Planning Draft

---

# 1. Executive Summary

Asset Browser is a dockable Photoshop plugin that gives designers a fast, visual way to browse local asset libraries directly inside Photoshop.

The plugin will let users select folders containing logos, vectors, photography, textures, mockups, PDFs, Photoshop documents, and other design assets. It will index those folders, generate previews, and display the contents in a polished thumbnail browser.

The user can search, filter, preview, and insert an asset into the active Photoshop document without switching to Finder, Windows Explorer, Adobe Bridge, or another digital asset manager.

The target workflow is:

> Select folder → Browse assets → Preview asset → Double-click or press Insert → Asset is placed as a Smart Object on the active artboard → Free Transform begins

The ideal interaction would allow users to drag an asset from the panel directly onto the Photoshop canvas. However, Photoshop UXP currently does not reliably support native drag-and-drop from a panel into the canvas. The first release should therefore use double-click insertion, an Insert button, and immediate Free Transform as the primary workflow.

The internal insertion system should still be modular so true drag-and-drop can be added later if Adobe expands UXP support.

---

# 2. Product Vision

The plugin should feel like a native asset browser designed specifically for high-speed Photoshop work.

It should combine:

- The convenience of Finder or Windows Explorer
- The visual organization of Eagle
- The fast insertion workflow of Figma’s Assets panel
- The polish of a modern professional design tool
- The simplicity of a focused Photoshop utility

The plugin should not become a bloated digital asset management platform in its first release.

Its core value is speed:

> Find an asset and place it into Photoshop in seconds.

---

# 3. Primary Product Goals

The plugin must allow a user to:

1. Add one or more local folders as asset libraries.
2. Browse folder contents from inside Photoshop.
3. Navigate nested folders.
4. Preview supported files as thumbnails.
5. Search assets by filename.
6. Filter assets by type.
7. Select an asset and see a larger preview.
8. Insert an asset into the active Photoshop document.
9. Place assets as embedded Smart Objects by default.
10. Center inserted assets on the active artboard.
11. Automatically scale oversized assets to fit the artboard.
12. Immediately enter Free Transform after insertion.
13. Remember selected folders across Photoshop sessions.
14. Refresh asset folders when files are added, removed, or modified.
15. Handle missing drives, moved files, corrupted assets, and unsupported formats without crashing.

---

# 4. Supported Asset Types

## 4.1 Raster Images

Initial support:

- PNG
- JPG
- JPEG
- WebP
- GIF
- TIFF
- TIF
- BMP

Default behavior:

- Display a generated thumbnail.
- Insert as an embedded Smart Object.
- Preserve transparency where supported.
- Allow optional rasterization after placement.

---

## 4.2 Photoshop Files

Supported:

- PSD
- PSB

Default behavior:

- Display a composite preview when available.
- Insert as a Smart Object.
- Offer an optional Open as Document action.

---

## 4.3 Vector Files

Supported:

- SVG
- AI
- EPS in a later phase

Default behavior:

- Display a scalable or generated preview.
- Insert as an embedded Smart Object.
- Preserve vector quality through Smart Object placement.

---

## 4.4 Document Files

Supported:

- PDF

Default behavior:

- Preview the first page.
- Allow page selection for multi-page PDFs.
- Insert the selected page as a Smart Object.

---

# 5. Platform Constraints

## 5.1 Photoshop UXP

The plugin should be built using Adobe’s UXP platform.

UXP plugins use:

- HTML
- CSS
- JavaScript or TypeScript
- Photoshop DOM APIs
- `batchPlay`
- `executeAsModal`
- UXP filesystem APIs
- Manifest version 5

UXP is similar to a browser environment, but it is not Chromium and does not support every standard browser API.

All browser-dependent libraries must be tested inside Photoshop before adoption.

---

## 5.2 Drag-and-Drop Limitation

Native dragging from the plugin panel directly onto the Photoshop canvas is not a reliable supported UXP workflow.

The production-safe first release should use:

- Double-click to place
- Insert button
- Context menu action
- Keyboard shortcut
- Optional drag-like interaction inside the panel
- Immediate Free Transform after placement

Recommended UX:

1. User double-clicks an asset.
2. Plugin inserts it at the center of the active artboard.
3. Plugin scales it down if necessary.
4. Photoshop activates Free Transform.
5. User moves and resizes the asset normally.

This provides most of the desired speed without depending on unsupported APIs.

---

# 6. Target Users

## Primary users

- Graphic designers
- Poster designers
- Social media designers
- Brand designers
- Photo compositors
- Creative agencies
- Content production teams
- Freelancers with large local asset libraries

## Secondary users

- Marketing teams
- Photographers
- Print designers
- Motion designers preparing Photoshop assets
- Teams working from shared drives or NAS storage

---

# 7. Core User Stories

## Folder Management

As a designer, I want to add my asset folders so I can access them without leaving Photoshop.

As a designer, I want the plugin to remember my folders so I do not have to reconnect them every time Photoshop opens.

As a designer, I want to browse nested folders so I can preserve my existing asset organization.

As a designer, I want to mark folders as favorites so my most-used libraries stay at the top.

---

## Asset Discovery

As a designer, I want visual thumbnails so I can recognize assets faster than reading filenames.

As a designer, I want to search by filename so I can quickly locate a specific logo, texture, icon, or photo.

As a designer, I want to filter by file type so I can focus on vectors, images, PDFs, or Photoshop files.

As a designer, I want to sort assets by name, date, file size, or recent use.

---

## Asset Preview

As a designer, I want a larger preview before insertion so I can verify the correct asset.

As a designer, I want SVG, AI, PDF, and raster previews inside the panel.

As a designer, I want file details such as dimensions, size, format, and modified date.

---

## Asset Insertion

As a designer, I want to double-click an asset to insert it immediately.

As a designer, I want inserted assets to appear on the active artboard.

As a designer, I want oversized assets to scale down automatically.

As a designer, I want Free Transform to activate after insertion.

As a designer, I want to choose between embedded Smart Object, linked Smart Object, rasterized layer, or open document.

---

# 8. Visual Design Direction

## 8.1 Design Personality

The interface should feel:

- Sharp
- Premium
- Fast
- Minimal
- Technical
- Professional
- Intentional
- Dense without feeling cluttered

Avoid:

- Rounded, bubbly SaaS styling
- Oversized cards
- Excessive shadows
- Bright accent colors
- Decorative gradients
- Cartoon-style icons
- Large amounts of unused space
- Soft pastel interfaces

The visual language should resemble a professional creative tool rather than a consumer web app.

---

## 8.2 Color System

The interface should be primarily black, white, and neutral grays.

### Core palette

```css
:root {
  --black: #000000;
  --near-black: #090909;
  --panel-black: #0d0d0d;
  --surface-dark: #141414;
  --surface-raised: #1a1a1a;

  --white: #ffffff;
  --off-white: #f2f2f2;
  --muted-white: #d8d8d8;

  --gray-100: #eeeeee;
  --gray-200: #d0d0d0;
  --gray-300: #a8a8a8;
  --gray-400: #7c7c7c;
  --gray-500: #555555;
  --gray-600: #383838;
  --gray-700: #242424;
  --gray-800: #181818;
  --gray-900: #101010;

  --danger: #ffffff;
}
```

The plugin should remain monochrome.

Status should be communicated through:

- Contrast
- Border style
- Icons
- Labels
- Opacity
- Patterns

Do not depend on color alone.

---

## 8.3 Default Theme

Primary theme:

- Black background
- White typography
- Thin gray dividers
- White active states
- High-contrast selected assets
- Minimal shadows
- Square or slightly rounded geometry

Optional later theme:

- White background
- Black typography
- Light gray surfaces
- Black active states

---

## 8.4 Typography

Recommended font strategy:

```css
font-family:
  Inter,
  "SF Pro Display",
  "SF Pro Text",
  "Segoe UI",
  Arial,
  sans-serif;
```

Suggested hierarchy:

| Element | Size | Weight |
|---|---:|---:|
| Plugin title | 15px | 650 |
| Section label | 10px | 700 |
| Asset name | 12px | 550 |
| Metadata | 10px | 450 |
| Button label | 11px | 650 |
| Search input | 12px | 450 |

Section labels should use:

- Uppercase
- Increased letter spacing
- Muted contrast

Example:

```css
.section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--gray-400);
}
```

---

## 8.5 Geometry

Recommended:

- Primary corner radius: 0–4px
- Buttons: 2–4px radius
- Cards: 0–3px radius
- Inputs: 2–4px radius
- Thin 1px borders
- Strong rectangular silhouettes

Avoid pill-shaped controls unless necessary for compact filter chips.

---

## 8.6 Iconography

Use:

- Thin-line monochrome icons
- Consistent 16px and 20px sizes
- Simple folder, search, filter, refresh, grid, list, insert, favorite, and settings symbols

Icons should be sourced from a consistent set or drawn as custom SVGs.

Recommended visual style:

- 1.5px stroke
- Square line caps
- Minimal interior detail
- No multicolor icons

---

# 9. Proposed Panel Layout

```text
┌─────────────────────────────────────────┐
│ ASSET BROWSER                      ⚙    │
├─────────────────────────────────────────┤
│ Search assets...                  ⌘ K   │
├───────────────┬─────────────────────────┤
│ LIBRARIES     │ ALL ASSETS        ▦  ☰ │
│               │                         │
│ ▸ Favorites   │ ┌─────┐ ┌─────┐        │
│ ▾ Brand       │ │     │ │     │        │
│   Logos       │ │ SVG │ │ JPG │        │
│   Marks       │ └─────┘ └─────┘        │
│ ▸ Textures    │ logo.svg texture.jpg   │
│ ▸ Mockups     │                         │
│ ▸ Client Work │ ┌─────┐ ┌─────┐        │
│               │ │     │ │     │        │
│ + ADD FOLDER  │ │ PDF │ │ AI  │        │
│               │ └─────┘ └─────┘        │
├───────────────┴─────────────────────────┤
│ PREVIEW                                 │
│ ┌─────────────────────────────────────┐ │
│ │                                     │ │
│ │            SELECTED ASSET           │ │
│ │                                     │ │
│ └─────────────────────────────────────┘ │
│ brand-mark.ai                           │
│ AI · 2.4 MB · Modified today            │
├─────────────────────────────────────────┤
│ [ INSERT ] [ OPEN ] [ ••• ]             │
└─────────────────────────────────────────┘
```

---

# 10. UI Components

## 10.1 Header

Contains:

- Plugin name
- Settings button
- Optional library status
- Optional sync or indexing indicator

Behavior:

- Remains pinned
- Uses high-contrast title
- Minimal height
- No decorative branding that consumes workspace

---

## 10.2 Search Bar

Features:

- Instant filename search
- Keyboard focus shortcut
- Clear button
- Search result count
- Optional advanced filters

Visual treatment:

- Dark fill
- Thin border
- White focus outline
- Compact height
- Search icon aligned left

---

## 10.3 Folder Sidebar

Contains:

- Favorites
- Recent assets
- Added libraries
- Nested folder tree
- Add Folder button
- Offline or permission warning states

Features:

- Collapsible groups
- Resizable width
- Context menu
- Favorite toggle
- Refresh folder
- Reveal folder
- Remove library
- Rename display label
- Include or exclude subfolders

---

## 10.4 Asset Grid

Features:

- Virtualized rendering
- Adjustable thumbnail size
- Compact and large grid modes
- List mode
- Selection
- Multi-selection in a future phase
- Hover metadata
- Format badges
- Favorite control
- Loading skeletons

Selected asset appearance:

- White 1–2px outline
- White filename
- Slightly lighter tile background
- No colored highlight

Hover appearance:

- Increased border contrast
- Asset actions fade in
- Thumbnail slightly brightens
- No dramatic animation

---

## 10.5 Asset Card

Each card should contain:

- Thumbnail
- File type badge
- Filename
- Optional dimensions
- Optional favorite icon

Example:

```text
┌──────────────────┐
│                  │
│   THUMBNAIL      │
│              AI  │
├──────────────────┤
│ primary-logo.ai  │
│ 2.4 MB           │
└──────────────────┘
```

---

## 10.6 Preview Panel

The preview panel should show:

- Large asset preview
- Filename
- File extension
- Dimensions
- File size
- Modified date
- Folder path
- PDF page count where available
- AI preview compatibility status where relevant

Optional controls:

- Previous and next asset
- Zoom preview
- Checkerboard transparency toggle
- Fit preview
- Regenerate thumbnail

---

## 10.7 Bottom Action Bar

Primary action:

- Insert

Secondary actions:

- Open
- Reveal
- More actions

Insert button styling:

```css
.insert-button {
  background: #ffffff;
  color: #000000;
  border: 1px solid #ffffff;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
```

Hover:

```css
.insert-button:hover {
  background: #d8d8d8;
  border-color: #d8d8d8;
}
```

---

# 11. Interaction Design

## 11.1 Primary Workflow

1. Open Asset Browser panel.
2. Select a library or folder.
3. Search or browse assets.
4. Click an asset to preview it.
5. Double-click the asset or press Insert.
6. Asset is placed into the active artboard.
7. Oversized asset is scaled down.
8. Free Transform is activated.
9. User positions the asset.

---

## 11.2 Keyboard Shortcuts

Suggested plugin-level shortcuts:

| Shortcut | Action |
|---|---|
| Command/Ctrl + K | Focus search |
| Enter | Insert selected asset |
| Command/Ctrl + Enter | Open selected asset |
| Arrow keys | Move selection |
| Space | Toggle larger preview |
| Command/Ctrl + R | Refresh active folder |
| Command/Ctrl + F | Focus search fallback |
| Escape | Clear search or close preview |
| F | Favorite selected asset |

Actual shortcut registration must be validated against UXP and Photoshop shortcut conflicts.

---

## 11.3 Context Menu

Asset context menu:

- Insert as Embedded Smart Object
- Insert as Linked Smart Object
- Insert and Rasterize
- Open as Document
- Replace Selected Smart Object
- Favorite
- Reveal in Finder or Explorer
- Copy File Path
- Regenerate Preview
- File Details

Folder context menu:

- Refresh
- Rename Library
- Favorite
- Reveal Folder
- Include Subfolders
- Reauthorize
- Remove Library

---

# 12. Technical Stack

## Recommended stack

- Photoshop UXP
- Manifest version 5
- TypeScript
- React
- Zustand or Redux Toolkit
- Spectrum Web Components where compatible
- Custom CSS for the monochrome design system
- Vite, esbuild, or Webpack
- Vitest or Jest
- Adobe UXP Developer Tool
- ESLint
- Prettier

---

# 13. Project Architecture

```text
┌─────────────────────────────────────────────┐
│ UI Layer                                    │
│ React Components + Monochrome Design System │
├─────────────────────────────────────────────┤
│ State Layer                                 │
│ Folders, assets, search, selection, settings│
├─────────────────────────────────────────────┤
│ Application Services                        │
│ Indexing, thumbnails, cache, insertion      │
├─────────────────────────────────────────────┤
│ Format Adapters                             │
│ Raster, SVG, AI, PDF, PSD                   │
├─────────────────────────────────────────────┤
│ Photoshop Adapters                          │
│ DOM, batchPlay, executeAsModal, artboards   │
├─────────────────────────────────────────────┤
│ UXP Filesystem                              │
│ Folder entries, tokens, plugin storage      │
├─────────────────────────────────────────────┤
│ Persistent Data                             │
│ Folder records, asset index, thumbnail cache│
└─────────────────────────────────────────────┘
```

---

# 14. Suggested Source Structure

```text
photoshop-asset-browser/
├── manifest.json
├── package.json
├── tsconfig.json
├── vite.config.ts
├── README.md
├── src/
│   ├── index.html
│   ├── index.tsx
│   ├── app/
│   │   ├── App.tsx
│   │   ├── bootstrap.ts
│   │   ├── store.ts
│   │   └── routes.ts
│   ├── components/
│   │   ├── layout/
│   │   │   ├── PanelHeader.tsx
│   │   │   ├── FolderSidebar.tsx
│   │   │   ├── MainContent.tsx
│   │   │   ├── PreviewPanel.tsx
│   │   │   └── ActionBar.tsx
│   │   ├── assets/
│   │   │   ├── AssetGrid.tsx
│   │   │   ├── AssetCard.tsx
│   │   │   ├── AssetList.tsx
│   │   │   ├── AssetThumbnail.tsx
│   │   │   ├── AssetDetails.tsx
│   │   │   └── FileTypeBadge.tsx
│   │   ├── folders/
│   │   │   ├── FolderTree.tsx
│   │   │   ├── FolderItem.tsx
│   │   │   └── AddFolderButton.tsx
│   │   ├── controls/
│   │   │   ├── SearchBar.tsx
│   │   │   ├── FilterMenu.tsx
│   │   │   ├── SortMenu.tsx
│   │   │   ├── ViewToggle.tsx
│   │   │   └── SettingsDialog.tsx
│   │   └── feedback/
│   │       ├── EmptyState.tsx
│   │       ├── ErrorState.tsx
│   │       ├── OfflineFolderState.tsx
│   │       └── LoadingSkeleton.tsx
│   ├── services/
│   │   ├── asset-index.service.ts
│   │   ├── folder-permission.service.ts
│   │   ├── thumbnail.service.ts
│   │   ├── insertion.service.ts
│   │   ├── cache.service.ts
│   │   ├── preferences.service.ts
│   │   ├── search.service.ts
│   │   └── diagnostics.service.ts
│   ├── adapters/
│   │   ├── formats/
│   │   │   ├── format-adapter.ts
│   │   │   ├── raster.adapter.ts
│   │   │   ├── svg.adapter.ts
│   │   │   ├── pdf.adapter.ts
│   │   │   ├── illustrator.adapter.ts
│   │   │   └── photoshop.adapter.ts
│   │   ├── photoshop/
│   │   │   ├── place-file.ts
│   │   │   ├── open-file.ts
│   │   │   ├── transform-layer.ts
│   │   │   ├── active-artboard.ts
│   │   │   ├── layer-bounds.ts
│   │   │   └── temporary-document.ts
│   │   └── filesystem/
│   │       ├── uxp-filesystem.ts
│   │       └── path-utils.ts
│   ├── models/
│   │   ├── asset.ts
│   │   ├── folder.ts
│   │   ├── import-options.ts
│   │   ├── settings.ts
│   │   └── errors.ts
│   ├── workers/
│   │   ├── indexing-queue.ts
│   │   └── thumbnail-queue.ts
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── global.css
│   │   ├── components.css
│   │   └── utilities.css
│   └── utils/
│       ├── file-types.ts
│       ├── hashing.ts
│       ├── debounce.ts
│       ├── cancellation.ts
│       ├── sanitize-svg.ts
│       └── logger.ts
├── tests/
│   ├── unit/
│   ├── fixtures/
│   └── manual/
└── assets/
    ├── icons/
    └── placeholders/
```

---

# 15. Core Data Models

```ts
export type AssetType =
  | "raster"
  | "svg"
  | "illustrator"
  | "pdf"
  | "photoshop"
  | "eps"
  | "unknown";

export interface AssetFolder {
  id: string;
  displayName: string;
  nativePath: string;
  persistentToken?: string;
  includeSubfolders: boolean;
  isFavorite: boolean;
  isAvailable: boolean;
  addedAt: number;
  lastIndexedAt?: number;
}

export interface AssetRecord {
  id: string;
  folderId: string;
  name: string;
  extension: string;
  nativePath: string;
  relativePath: string;
  type: AssetType;

  sizeBytes?: number;
  modifiedAt?: number;

  width?: number;
  height?: number;
  colorMode?: string;
  pageCount?: number;

  thumbnailKey?: string;
  previewStatus:
    | "not_requested"
    | "queued"
    | "generating"
    | "ready"
    | "failed";

  isFavorite: boolean;
  lastImportedAt?: number;
}

export type PlacementMode =
  | "embeddedSmartObject"
  | "linkedSmartObject"
  | "rasterized"
  | "openDocument";

export type PlacementTarget =
  | "activeArtboard"
  | "documentCenter"
  | "selectionCenter";

export interface ImportOptions {
  mode: PlacementMode;
  target: PlacementTarget;
  scaleToFit: boolean;
  maxCanvasCoverage: number;
  enterFreeTransform: boolean;
  pdfPage?: number;
}
```

---

# 16. State Management

Recommended store shape:

```ts
interface AssetBrowserState {
  folders: AssetFolder[];
  activeFolderId: string | null;

  assets: AssetRecord[];
  visibleAssetIds: string[];
  selectedAssetId: string | null;

  query: string;
  typeFilter: AssetType | "all";
  sortMode: "name" | "modified" | "size" | "recent";
  viewMode: "compactGrid" | "largeGrid" | "list";
  thumbnailSize: number;

  indexing: boolean;
  indexProgress: number;
  thumbnailQueueSize: number;

  settings: PluginSettings;

  addFolder(): Promise<void>;
  removeFolder(folderId: string): Promise<void>;
  refreshFolder(folderId: string): Promise<void>;
  selectFolder(folderId: string): void;
  selectAsset(assetId: string): void;
  search(query: string): void;
  importAsset(assetId: string, options?: Partial<ImportOptions>): Promise<void>;
}
```

Photoshop and filesystem operations should never be implemented directly inside React components.

React components should call services or state actions.

---

# 17. Filesystem Access

## 17.1 Permission Strategy

Manifest version 5 supports local filesystem permissions.

Recommended first-release option:

```json
{
  "requiredPermissions": {
    "localFileSystem": "fullAccess"
  }
}
```

Reasons:

- Folders must remain available after Photoshop restarts.
- Nested directories must be indexed.
- Preview files must be generated.
- Assets may exist on external drives or NAS shares.
- The plugin must detect missing or modified files.

A more conservative permission model can use user-requested folder access, but it may require additional reauthorization flows.

---

## 17.2 Folder Selection

Example:

```ts
const { storage } = require("uxp");

export async function selectAssetFolder() {
  const fs = storage.localFileSystem;
  const folder = await fs.getFolder();

  if (!folder) {
    return null;
  }

  return {
    name: folder.name,
    nativePath: folder.nativePath,
    entry: folder
  };
}
```

Store:

- Display name
- Native path
- Persistent token when supported
- Include-subfolders setting
- Availability state
- Last indexed timestamp

---

# 18. Folder Indexing

## 18.1 Indexing Workflow

1. Resolve folder access.
2. Read top-level entries.
3. Recursively traverse nested folders when enabled.
4. Reject unsupported file extensions.
5. Generate basic file metadata.
6. Create a stable asset ID.
7. Compare against the existing index.
8. Mark changed assets as stale.
9. Add missing thumbnails to the queue.
10. Remove deleted assets from the index.
11. Update the interface incrementally.
12. Persist index changes in batches.

---

## 18.2 Supported Extension Set

```ts
export const SUPPORTED_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "tif",
  "tiff",
  "bmp",
  "svg",
  "ai",
  "pdf",
  "eps",
  "psd",
  "psb"
]);
```

---

## 18.3 Stable Asset Keys

Suggested fingerprint:

```text
normalized path + file size + modified timestamp
```

Example:

```ts
export function createAssetKey(
  nativePath: string,
  size: number,
  modifiedAt: number
): string {
  return hash(
    `${normalizePath(nativePath)}:${size}:${modifiedAt}`
  );
}
```

---

## 18.4 Performance Rules

- Index in chunks.
- Update the UI after each chunk.
- Generate visible thumbnails first.
- Virtualize the asset grid.
- Cancel work when the active folder changes.
- Limit Photoshop-generated previews to one at a time.
- Do not load full-resolution assets into memory unless required.
- Debounce search input.
- Serialize Photoshop modal actions.
- Store an index version for safe migrations.

---

# 19. Thumbnail and Preview System

## 19.1 Cache Location

Use the plugin data folder.

```ts
const fs = require("uxp").storage.localFileSystem;
const dataFolder = await fs.getDataFolder();
```

Suggested storage:

```text
plugin-data/
├── database/
│   ├── folders.json
│   ├── assets.json
│   ├── settings.json
│   └── migrations.json
├── thumbnails/
│   ├── ab/
│   │   └── abc123.webp
│   ├── cd/
│   │   └── cde456.png
│   └── ...
└── logs/
    └── diagnostics.log
```

---

## 19.2 Thumbnail Sizes

Recommended:

- Grid thumbnail: 256 × 256
- Large preview: 768 × 768
- Optional retina preview: 1024 × 1024

Rules:

- Preserve transparency where useful.
- Use PNG or WebP for transparent artwork.
- Use JPEG or WebP for opaque photos.
- Never keep full-resolution buffers after thumbnail generation.
- Crop only in the UI; preserve the complete asset in cached previews.

---

## 19.3 Raster Preview Strategy

1. Read the file.
2. Convert to a supported binary or Blob representation.
3. Render the image.
4. Fit it within the thumbnail boundary.
5. Export the preview.
6. Write it to plugin storage.
7. Release the original file buffer.

---

## 19.4 SVG Preview Strategy

Preferred first approach:

- Read SVG as text.
- Sanitize it.
- Render it directly or convert it to a preview image.
- Preserve transparency.
- Cache the result.

Sanitization must remove:

- `<script>` elements
- Inline event handlers
- External HTTP or HTTPS references
- Remote fonts
- Remote images
- `<foreignObject>`
- Unsupported embedded HTML
- Excessive nesting
- Oversized SVG content

Fallback:

- Temporarily open or place the SVG in Photoshop.
- Generate a raster preview.
- Close without saving.

---

## 19.5 AI Preview Strategy

Illustrator files are the most technically difficult format.

Fallback chain:

1. Attempt to use an embedded PDF-compatible preview.
2. Attempt to open the AI file in Photoshop.
3. Rasterize the first visible page or artwork.
4. Export a thumbnail.
5. Close the temporary document.
6. Use a high-quality AI placeholder icon if preview generation fails.

Not every AI file is saved with PDF compatibility.

The interface must show controlled states such as:

- Preview ready
- Generating preview
- Preview unavailable
- File requires Illustrator compatibility
- Corrupted or unsupported AI file

---

## 19.6 PDF Preview Strategy

1. Open PDF temporarily in Photoshop.
2. Default to page 1.
3. Rasterize at a moderate resolution.
4. Resize to thumbnail dimensions.
5. Save the preview to cache.
6. Close without saving.

For multi-page PDFs:

- Show page count when available.
- Offer page selection during insertion.
- Cache previously selected page previews.
- Include a setting to always use page 1.

---

## 19.7 PSD and PSB Preview Strategy

Preferred methods:

1. Use an embedded composite preview when accessible.
2. Open temporarily in Photoshop.
3. Generate a flattened preview.
4. Close without saving.
5. Fall back to a Photoshop file icon if generation fails.

---

# 20. Photoshop Insertion Service

Any operation that modifies Photoshop state should run inside `executeAsModal`.

The insertion service should handle:

- File token creation
- Placement
- Layer identification
- Artboard targeting
- Scale-to-fit
- Layer naming
- Smart Object mode
- Free Transform activation
- Error recovery

---

## 20.1 Place Asset Example

```ts
const { action, core } = require("photoshop");
const { storage } = require("uxp");

export async function placeAsset(fileEntry: any): Promise<void> {
  const fs = storage.localFileSystem;
  const token = fs.createSessionToken(fileEntry);

  await core.executeAsModal(
    async () => {
      await action.batchPlay(
        [
          {
            _obj: "placeEvent",
            null: {
              _path: token,
              _kind: "local"
            },
            linked: false,
            _options: {
              dialogOptions: "dontDisplay"
            }
          }
        ],
        {
          synchronousExecution: false,
          modalBehavior: "execute"
        }
      );
    },
    {
      commandName: "Insert Asset"
    }
  );
}
```

The exact `batchPlay` descriptor must be recorded and validated in the targeted Photoshop versions.

---

## 20.2 Import Modes

### Embedded Smart Object

Default.

Advantages:

- Nondestructive
- Portable
- Preserves source quality
- Best for AI, SVG, PDF, PSD, and large raster assets

### Linked Smart Object

Optional.

Advantages:

- Smaller Photoshop file
- Source updates can propagate

Risks:

- Broken links
- External-drive dependency
- Shared documents may lose access

### Rasterized Layer

Workflow:

1. Place as Smart Object.
2. Rasterize layer.
3. Preserve or rename the layer.

### Open as Document

Open the selected file as a new Photoshop document instead of placing it.

---

# 21. Artboard Targeting

Default targeting order:

1. Selected artboard
2. Artboard containing the active layer
3. Active document canvas
4. Document center

Suggested bounds structure:

```ts
interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function getCenter(bounds: Bounds) {
  return {
    x: (bounds.left + bounds.right) / 2,
    y: (bounds.top + bounds.bottom) / 2
  };
}
```

---

## 21.1 Scale-to-Fit Logic

Default limits:

```text
Maximum width: 70% of target artboard width
Maximum height: 70% of target artboard height
Never upscale by default
```

Example:

```ts
function getScaleFactor(
  assetWidth: number,
  assetHeight: number,
  targetWidth: number,
  targetHeight: number,
  coverage = 0.7
): number {
  const maxWidth = targetWidth * coverage;
  const maxHeight = targetHeight * coverage;

  return Math.min(
    1,
    maxWidth / assetWidth,
    maxHeight / assetHeight
  );
}
```

---

# 22. Simulated Drag Workflow

Because true cross-surface dragging is not reliable in UXP, version one should simulate the intent.

Possible interaction:

1. User clicks an asset’s drag handle.
2. Plugin marks the asset as “loaded.”
3. User presses Enter or clicks Insert.
4. Plugin places the asset on the active artboard.
5. Free Transform starts immediately.

Potential future placement presets:

- Center
- Top left
- Top right
- Bottom left
- Bottom right
- Selection center
- Active layer center

A true click-anywhere-on-canvas placement tool may require a native Photoshop C++ plugin or a future Adobe UXP capability.

---

# 23. Search and Filtering

## Search fields

Version one:

- Filename
- Extension
- Relative folder path

Later:

- Tags
- Dimensions
- Color mode
- File metadata
- AI-generated visual tags
- Similar-image matching

## Filters

- All
- Raster
- Vector
- Photoshop
- PDF
- Favorites
- Recently used
- Recently added
- Missing preview
- Offline files

## Sorting

- Name ascending
- Name descending
- Date modified
- File size
- Recently imported
- Recently added

---

# 24. Persistence

Persist:

- Added folders
- Folder labels
- Folder favorites
- Include-subfolder preferences
- Last active folder
- View mode
- Thumbnail size
- Sort mode
- Filters
- Import mode
- Scale-to-fit preference
- Free Transform preference
- Asset favorites
- Recently used assets
- Thumbnail cache metadata

Use versioned data files so future releases can migrate safely.

---

# 25. Error Model

```ts
export type AssetBrowserErrorCode =
  | "FOLDER_PERMISSION_DENIED"
  | "FOLDER_REAUTHORIZATION_REQUIRED"
  | "FOLDER_MISSING"
  | "DRIVE_OFFLINE"
  | "FILE_MISSING"
  | "UNSUPPORTED_FORMAT"
  | "PREVIEW_FAILED"
  | "IMPORT_FAILED"
  | "NO_ACTIVE_DOCUMENT"
  | "NO_ACTIVE_ARTBOARD"
  | "PHOTOSHOP_MODAL_BUSY"
  | "CACHE_WRITE_FAILED"
  | "CACHE_READ_FAILED"
  | "INDEX_CORRUPTED"
  | "PDF_PASSWORD_PROTECTED"
  | "AI_PREVIEW_UNAVAILABLE";
```

Rules:

- Never let one corrupt file stop folder indexing.
- Show file-level failures inside the asset card.
- Provide retry actions.
- Log technical details separately from user-facing messages.
- Keep user-facing language direct and specific.

Example:

> Preview unavailable. The Illustrator file may not include a PDF-compatible preview.

---

# 26. Security and Privacy

The plugin should:

- Never modify original asset files.
- Never upload asset data.
- Avoid network permissions in version one.
- Store thumbnails only inside plugin storage.
- Sanitize SVG content.
- Limit maximum preview file size.
- Limit SVG complexity.
- Provide Clear Cache.
- Provide Clear Plugin Data.
- Explain filesystem permissions during onboarding.
- Avoid collecting analytics unless explicitly added and disclosed.

---

# 27. Manifest Outline

```json
{
  "manifestVersion": 5,
  "id": "com.noira.photoshop.assetbrowser",
  "name": "Asset Browser",
  "version": "0.1.0",
  "main": "index.html",
  "host": [
    {
      "app": "PS",
      "minVersion": "25.0.0"
    }
  ],
  "entrypoints": [
    {
      "type": "panel",
      "id": "assetBrowserPanel",
      "label": {
        "default": "Asset Browser"
      },
      "minimumSize": {
        "width": 280,
        "height": 360
      },
      "maximumSize": {
        "width": 1600,
        "height": 1600
      },
      "preferredDockedSize": {
        "width": 380,
        "height": 760
      },
      "preferredFloatingSize": {
        "width": 840,
        "height": 900
      }
    }
  ],
  "requiredPermissions": {
    "localFileSystem": "fullAccess",
    "launchProcess": {
      "extensions": [
        ".png",
        ".jpg",
        ".jpeg",
        ".webp",
        ".svg",
        ".ai",
        ".pdf",
        ".psd",
        ".psb"
      ]
    }
  }
}
```

---

# 28. Design Token Starter File

```css
:root {
  --color-bg: #090909;
  --color-panel: #0d0d0d;
  --color-surface: #141414;
  --color-surface-hover: #1a1a1a;
  --color-surface-selected: #202020;

  --color-text: #ffffff;
  --color-text-secondary: #c6c6c6;
  --color-text-muted: #7d7d7d;

  --color-border: #292929;
  --color-border-strong: #4b4b4b;
  --color-active: #ffffff;

  --radius-xs: 2px;
  --radius-sm: 4px;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;

  --font-ui:
    Inter,
    "SF Pro Text",
    "Segoe UI",
    Arial,
    sans-serif;

  --font-size-xs: 10px;
  --font-size-sm: 11px;
  --font-size-md: 12px;
  --font-size-lg: 14px;
  --font-size-xl: 16px;

  --transition-fast: 100ms ease;
  --transition-standard: 160ms ease;
}
```

---

# 29. Example Asset Card Styling

```css
.asset-card {
  position: relative;
  min-width: 0;
  overflow: hidden;

  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-xs);

  cursor: default;
  transition:
    border-color var(--transition-fast),
    background var(--transition-fast);
}

.asset-card:hover {
  background: var(--color-surface-hover);
  border-color: var(--color-border-strong);
}

.asset-card[data-selected="true"] {
  background: var(--color-surface-selected);
  border-color: var(--color-active);
  box-shadow: inset 0 0 0 1px var(--color-active);
}

.asset-card__thumbnail {
  aspect-ratio: 1;
  display: grid;
  place-items: center;
  overflow: hidden;
  background:
    linear-gradient(45deg, #181818 25%, transparent 25%),
    linear-gradient(-45deg, #181818 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #181818 75%),
    linear-gradient(-45deg, transparent 75%, #181818 75%);
  background-size: 12px 12px;
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
}

.asset-card__thumbnail img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

.asset-card__meta {
  padding: 8px;
  border-top: 1px solid var(--color-border);
}

.asset-card__name {
  overflow: hidden;
  color: var(--color-text);
  font-size: var(--font-size-sm);
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.asset-card__details {
  margin-top: 3px;
  color: var(--color-text-muted);
  font-size: var(--font-size-xs);
}
```

---

# 30. Development Roadmap

## Phase 0 — Technical Spike

Goal:

Prove the riskiest Photoshop and filesystem operations before building the full UI.

Build a minimal panel with buttons for:

1. Select folder
2. List folder files
3. Display PNG preview
4. Display SVG preview
5. Place PNG
6. Place SVG
7. Place AI
8. Place PDF
9. Detect active artboard
10. Start Free Transform

Validate:

- Folder access persistence
- Recursive indexing
- Session tokens
- `placeEvent`
- AI opening behavior
- PDF page behavior
- SVG rendering
- Temporary document workflows
- Artboard bounds
- Scale-to-fit
- Undo
- macOS behavior
- Windows behavior

Exit criteria:

- Every target format can either generate a preview or show a safe fallback.
- Every target format can be inserted or return a controlled error.
- No operation freezes Photoshop indefinitely.

---

## Phase 1 — Raster MVP

Deliver:

- Dockable panel
- Black-and-white UI foundation
- Add folder
- Remove folder
- Nested folder browsing
- Raster indexing
- PNG, JPG, JPEG, WebP, TIFF, and PSD support
- Thumbnail grid
- Search
- Type filters
- Double-click insertion
- Insert button
- Embedded Smart Object placement
- Active artboard centering
- Scale-to-fit
- Free Transform
- Persistent settings
- Manual refresh
- Empty states
- Error states

This phase validates the core product.

---

## Phase 2 — SVG, AI, and PDF

Deliver:

- SVG direct preview
- SVG sanitization
- SVG insertion
- AI generated previews
- AI fallback icons
- PDF first-page previews
- PDF page selector
- PDF insertion
- Preview queue
- Preview caching
- Preview regeneration
- Preview status indicators

---

## Phase 3 — Professional Asset Management

Deliver:

- Favorites
- Recent assets
- Folder aliases
- Grid-size control
- List mode
- Sort options
- File details
- Breadcrumb navigation
- Reveal in Finder or Explorer
- Linked Smart Object mode
- Place and rasterize
- Open as document
- Layer naming rules
- Duplicate detection
- Better context menus

---

## Phase 4 — Performance and Reliability

Deliver:

- Virtualized grid
- Incremental indexing
- Prioritized thumbnail queue
- Cancellation tokens
- Cache garbage collection
- Offline drive recovery
- NAS testing
- External SSD testing
- Crash-safe writes
- Database migrations
- Diagnostics export
- Large-library testing
- Corrupt-index recovery

Target:

- 25,000+ indexed assets
- Responsive browsing during indexing
- Progressive thumbnail loading
- No full-panel lockups

---

## Phase 5 — Advanced Workflows

Potential features:

- Multi-select insertion
- Drag-style loaded-asset mode
- Replace selected Smart Object
- Insert into current selection
- Apply as texture
- Insert into mask
- Contact-sheet generation
- Project-specific libraries
- Photoshop document-linked collections
- Team libraries
- NAS-aware shared indexes
- AI tagging
- Color search
- Similar-image search
- Cloud storage integrations
- Illustrator companion integration

---

# 31. Testing Plan

## 31.1 File Matrix

Test every format with:

- Tiny file
- Large file
- Very large file
- Transparent file
- Opaque file
- CMYK file
- RGB file
- Grayscale file
- Corrupt file
- Unicode filename
- Long filename
- Special characters
- Nested folders
- External drive
- Network share
- Read-only folder
- Missing folder
- Moved file

---

## 31.2 AI Tests

- PDF-compatible AI
- AI without PDF compatibility
- Multiple artboards
- Linked images
- Missing fonts
- CMYK
- Large artboard
- Corrupt AI
- Legacy Illustrator format

---

## 31.3 PDF Tests

- Single page
- Multi-page
- Password protected
- Vector-heavy
- Image-heavy
- Large-format PDF
- Transparency
- Embedded color profile
- Missing fonts
- Corrupt PDF

---

## 31.4 Photoshop Tests

- No open document
- One document
- Multiple documents
- One artboard
- Multiple artboards
- No artboard
- Locked layer
- Locked artboard
- Background layer
- Large canvas
- 8-bit document
- 16-bit document
- 32-bit document
- Photoshop modal operation already active
- Undo after insertion
- Cancel insertion
- Close document during preview generation

---

## 31.5 Platform Tests

- Current macOS
- Current Windows
- Apple Silicon
- Intel Mac where supported
- Standard DPI
- Retina
- Windows HiDPI
- Small docked panel
- Large floating panel

---

# 32. Accessibility

The black-and-white design must still remain usable.

Requirements:

- Minimum WCAG-conscious contrast
- Keyboard navigation
- Visible focus rings
- Text alternatives for icons
- Tooltips for unlabeled actions
- No state communicated by color alone
- Scalable text where possible
- Clear selected asset state
- Error icons plus written error messages

---

# 33. Performance Targets

Recommended targets:

| Metric | Target |
|---|---:|
| Panel startup | Under 1 second after plugin initialization |
| First folder results | Under 500 ms for cached libraries |
| Search response | Under 100 ms for indexed files |
| Visible thumbnail request | Immediate queueing |
| Raster thumbnail generation | Under 500 ms for typical files |
| Asset insertion | Under 2 seconds for typical assets |
| Supported indexed library | 25,000+ assets |
| UI scrolling | 60 FPS target |
| Preview cache | Configurable 1–5 GB |

These are product goals, not guaranteed timings. Actual performance depends on Photoshop, drive speed, file size, file format, and system hardware.

---

# 34. Definition of Done for Version 1.0

Version 1.0 is complete when:

- User can add at least ten folders.
- Folders persist across Photoshop restarts.
- Nested folders are supported.
- Search works across indexed assets.
- Raster, SVG, AI, PDF, PSD, and PSB files display real previews or clear fallbacks.
- Visible thumbnails load progressively.
- User can double-click an asset to insert it.
- Inserted assets are embedded Smart Objects by default.
- Inserted assets target the active artboard.
- Oversized assets scale down automatically.
- Free Transform starts after insertion.
- Import supports Undo.
- Missing folders show a reconnect state.
- Broken files do not stop indexing.
- Cache can be cleared.
- Plugin settings persist.
- Plugin is packaged as a `.ccx`.
- Installation instructions are included.
- The interface is consistently sharp, monochrome, and responsive.
- macOS and Windows builds pass the supported test matrix.

---

# 35. Recommended MVP Scope

The first useful production build should include:

1. Dockable UXP panel
2. Black-and-white design system
3. Add and remove folders
4. Nested folder navigation
5. Raster and SVG thumbnails
6. Generic AI and PDF icons if generated previews are not ready
7. Filename search
8. File-type filters
9. Grid and list view
10. Larger preview panel
11. Double-click to place
12. Insert button
13. Embedded Smart Object insertion
14. Active artboard centering
15. Scale-to-fit
16. Immediate Free Transform
17. Persistent folders and settings
18. Manual refresh
19. Error handling
20. Thumbnail caching

AI and PDF preview generation can ship immediately after the MVP if those workflows delay the core product.

---

# 36. Major Engineering Risks

| Risk | Impact | Mitigation |
|---|---:|---|
| UXP cannot drag directly into canvas | High | Double-click insertion and immediate Free Transform |
| AI preview inconsistency | High | Embedded PDF preview, Photoshop rasterization, fallback icon |
| PDF page import complexity | Medium | Explicit page selector and recorded `batchPlay` actions |
| Persistent filesystem permissions | High | Full access or clear reauthorization workflow |
| Large libraries freeze the panel | High | Incremental indexing and virtualization |
| Preview generation blocks Photoshop | High | Queue and serialize Photoshop-generated previews |
| Thumbnail cache becomes too large | Medium | Size limits and garbage collection |
| External drives disconnect | Medium | Offline state and reconnect action |
| UXP APIs differ by Photoshop version | Medium | Strict minimum version and compatibility tests |
| Malformed SVG crashes renderer | Medium | Sanitize, limit size, and catch parser failures |
| Linked assets break | Medium | Embedded placement by default |

---

# 37. Packaging and Distribution

Development:

- Load through Adobe UXP Developer Tool.
- Use development builds with logging enabled.
- Maintain a test fixture asset library.

Production:

- Build optimized JavaScript.
- Remove debug logging.
- Validate manifest permissions.
- Package as `.ccx`.
- Sign and distribute through the appropriate Adobe plugin channel or direct installation method.
- Include:
  - Installation guide
  - Permissions explanation
  - Supported Photoshop versions
  - Supported file types
  - Known limitations
  - Troubleshooting steps

---

# 38. Recommended Build Order

The coding order should be:

1. Create UXP plugin shell.
2. Confirm React renders inside Photoshop.
3. Implement monochrome design tokens.
4. Implement folder picker.
5. Persist folder records.
6. Recursively enumerate files.
7. Normalize asset records.
8. Render virtualized grid.
9. Implement raster thumbnails.
10. Add search and filtering.
11. Implement asset selection.
12. Build preview panel.
13. Implement Photoshop placement.
14. Detect active artboard.
15. Add scale-to-fit.
16. Trigger Free Transform.
17. Add cache.
18. Add SVG preview and sanitation.
19. Add PDF preview generation.
20. Add AI preview generation.
21. Add error recovery.
22. Test large libraries.
23. Package `.ccx`.
24. Write installation documentation.

---

# 39. Immediate Engineering Tasks

## Repository Setup

- Initialize TypeScript project.
- Configure React.
- Configure build output for UXP.
- Add ESLint and Prettier.
- Create manifest.
- Add Photoshop host requirement.
- Create base panel entrypoint.
- Confirm hot reload or rapid rebuild workflow.

## UI Foundation

- Create design tokens.
- Create layout shell.
- Create header.
- Create folder sidebar.
- Create search bar.
- Create asset grid.
- Create preview panel.
- Create bottom action bar.
- Add keyboard focus states.
- Add responsive docked and floating layouts.

## Filesystem

- Add folder picker.
- Save folder records.
- Restore saved folder records.
- Detect missing folders.
- Add folder reauthorization.
- Add recursive traversal.
- Add extension filtering.
- Add index persistence.

## Preview System

- Add raster adapter.
- Add SVG adapter.
- Add preview cache.
- Add placeholder icons.
- Add thumbnail queue.
- Add cancellation.
- Add generated preview state.

## Photoshop Integration

- Create session tokens.
- Record place action.
- Implement embedded placement.
- Implement linked placement.
- Read active document.
- Detect artboards.
- Center inserted layer.
- Scale inserted layer.
- Start Free Transform.
- Support Undo.

---

# 40. Final Product Recommendation

Build Asset Browser as a focused, premium Photoshop UXP plugin.

The first release should prioritize:

> Browse fast → Preview clearly → Insert instantly

Do not block the MVP on literal panel-to-canvas drag-and-drop.

The best reliable version-one workflow is:

> Browse → Double-click → Place on active artboard → Free Transform

The codebase should keep indexing, previews, storage, and Photoshop insertion separated behind clear service interfaces.

That architecture leaves room for:

- Future native drag-and-drop
- A C++ Photoshop extension
- A local companion process
- Better AI and PDF parsing
- NAS libraries
- Shared team indexes
- Cloud-backed libraries
- Visual search
- Automated tagging

The interface should remain aggressively simple: black, white, sharp edges, compact spacing, strong typography, and no unnecessary decoration.
