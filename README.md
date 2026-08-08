# Asset Browser

A Photoshop UXP plugin for browsing, previewing and inserting local creative
assets without leaving Photoshop.

> Browse fast → Preview clearly → Insert instantly

Built from `photoshop_asset_browser_plugin_roadmap.md`, which remains the
product specification. Where the implementation departs from it, the reason is
recorded in [`docs/UXP-CONSTRAINTS.md`](docs/UXP-CONSTRAINTS.md).

## Status

The core workflow is implemented end to end: add libraries, index them, browse a
virtualised thumbnail grid, search and filter, preview, and insert as a Smart
Object centred on the active artboard with Free Transform.

**Nothing that touches Photoshop has been executed yet.** This was developed on
Linux, where Photoshop cannot run and UXP has no emulator. All host integration
is written against Adobe's documented APIs and isolated behind adapters, and a
[self-test harness](docs/SELF-TEST.md) is built into the panel to verify it on
real hardware. Treat the first run as the roadmap's Phase 0 spike.

Verified on the build machine: TypeScript typecheck, ESLint, 160 unit tests
covering all pure logic, a production bundle, and a `.ccx` archive validated
with `unzip -t`.

## Quick start

```bash
npm install
npm run verify     # typecheck + lint + test + production build
npm run package    # -> asset-browser-<version>.ccx
```

Then load `dist/` through the Adobe UXP Developer Tool, open the panel from
**Plugins → Asset Browser**, and run the self-test from **Settings → Self-Test**.

Full instructions: [`docs/INSTALL.md`](docs/INSTALL.md).

## Scripts

| Script | Purpose |
|---|---|
| `npm run build` | Development build with inline sourcemaps |
| `npm run build:prod` | Minified build, debug logging stripped |
| `npm run watch` | Rebuild on change |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest |
| `npm run verify` | All of the above, then a production build |
| `npm run package` | Production build, then a `.ccx` archive |
| `node scripts/generate-icons.mjs` | Regenerate the plugin icons |

## Architecture

Layered, with a hard rule: **React components never touch Photoshop or the
filesystem.** They call store actions, which call services, which call adapters.
That boundary is what keeps the logic testable without a host.

```
src/
├── app/            App shell, Zustand store, service container
├── components/     React UI (layout, assets, controls, feedback, diagnostics)
├── services/       Indexing, search, thumbnails, cache, insertion, diagnostics
├── adapters/
│   ├── photoshop/  batchPlay, artboards, placement, Imaging API
│   ├── filesystem/ UXP storage, folder traversal
│   └── host.ts     The single typed entry point to `uxp` / `photoshop`
├── models/         Domain types, settings, error model
├── utils/          Pure helpers - paths, geometry, hashing, virtualisation
└── styles/         Monochrome design tokens and components
```

Everything in `utils/`, plus search, indexing and persistence, is pure and unit
tested. Everything under `adapters/` requires Photoshop and is covered by the
self-test harness instead.

## Two findings that shaped the build

The spec assumed a browser-like environment. UXP is not one, and two discoveries
changed the design substantially:

**There is no HTML5 Canvas.** The spec's thumbnail pipeline (§19.3: read →
convert → render → export) cannot work. Generated previews instead come from
Photoshop's Imaging API, `getPixels({ targetSize }) + encodeImageData()`, which
serves a cached pyramid level and is genuinely fast.

**`<img src="file:/…">` renders local files directly.** This is the bigger one,
and it works in the plugin's favour: raster and SVG assets need *no* generation
at all. Only PSD, PDF, AI and EPS enter the preview queue, which removes the vast
majority of a typical library from it.

CSS was similarly constrained — no grid, no `aspect-ratio`, no `box-shadow`, no
transitions. The grid is flex rows with a hand-written virtualiser, and selection
uses border plus outline. See [`docs/UXP-CONSTRAINTS.md`](docs/UXP-CONSTRAINTS.md).

## What is not built yet

Deliberately out of scope for this pass, from the roadmap's later phases:

- Multi-select insertion, replace-selected-Smart-Object, insert-into-mask (§30 Phase 5)
- PDF page-selection UI (the plumbing accepts a page; no picker is exposed)
- Dimension and colour-mode extraction during indexing (fields exist, unpopulated)
- Sidebar resize handle (width persists; it is not yet draggable)
- Light theme (§8.3 lists it as optional and later)

## Privacy

No network permission is requested. Original files are never modified. Previews
are written only inside the plugin's own data folder, and **Clear Preview Cache**
in Settings removes them.
