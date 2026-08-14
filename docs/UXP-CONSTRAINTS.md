# UXP Platform Constraints

This file records what Photoshop UXP actually supports, and where the product
roadmap assumed browser behaviour that does not exist. **TypeScript cannot
enforce any of this** — `tsconfig.json` includes the full `DOM` library because
UXP exposes a DOM *subset* that no type definition models. This document is the
real contract.

Verified against Adobe's UXP documentation for Photoshop 25+ (UXP 8/9).

## Not available

| Feature | Consequence for this plugin |
|---|---|
| **CSS Grid** | The asset grid uses `flex-wrap` with fixed tile widths. Virtualisation must compute rows manually. |
| **`aspect-ratio`** | Square thumbnails need an explicit pixel height derived from the current thumbnail size. |
| **`box-shadow`** | Selection and hover states use borders and surface value only. |
| **`transition` / `transform`** | All state changes are instant. Never rely on animation to communicate anything. |
| **`float`** | Flexbox only. |
| **`@font-face`** | Inter cannot be shipped. The font stack degrades to installed system fonts. |
| **HTML5 Canvas** | No client-side image resizing or re-encoding. Thumbnails come from the Photoshop Imaging API. |
| **`getElementsByClassName`** | Use `querySelectorAll`. |
| **CSS on `<button>`** | UXP renders a NATIVE button: it flattens children into one text label and ignores `display: flex`, `height`, `gap`, `text-align` and `data-*` styling. **Nothing in `src/` may use `<button>`** — `Pressable` (a div) is the only button primitive, and an ESLint `no-restricted-syntax` rule enforces it. Measured in Photoshop 2026: a strip styled `height: 20px` rendered at 30px as a `<button>` and at exactly 20px as a div. |
| **iframes** | Not supported, and may never be. |
| **Drag to canvas** | UXP 9.1 added drag/drop *between UXP panels and WebViews only*. Panel-to-canvas drag remains impossible, which is why insertion is double-click driven (roadmap §5.2). |

## Available and load-bearing

### `<img src="file:/...">` renders local files directly

With `localFileSystem: "fullAccess"`, an `img` element can point straight at a
file on disk:

```html
<img src="file:/Users/me/assets/logo.png" />
```

This is the single biggest simplification versus the roadmap. Raster and SVG
assets need **no thumbnail generation at all** for display — the roadmap's §19.3
read/convert/render/export pipeline is unnecessary for them. Generation is
reserved for formats Photoshop must interpret (PSD, PDF, AI) and for downscaling
very large rasters to protect memory.

Sandbox schemes `plugin:`, `plugin-data:` and `plugin-temp:` are also available;
paths with no scheme are treated as `file:`.

### Imaging API for generated previews

```js
const { imaging } = require('photoshop');

const { imageData } = await imaging.getPixels({
  documentID,
  targetSize: { width: 256, height: 256 }, // serves a cached pyramid level
  colorSpace: 'RGB',
  applyAlpha: true,                        // required before JPEG encoding
});

const base64 = await imaging.encodeImageData({ imageData, base64: true });
imageData.dispose();                       // mandatory: images can be huge
```

Two details that matter:

- `targetSize` smaller than the source lets Photoshop serve a **cached pyramid
  level** instead of the full canvas. This is what makes PSD thumbnailing viable.
- `encodeImageData` requires RGB. CMYK documents must be converted, and
  `getData()` on a CMYK document has been reported to crash Photoshop — always
  request `colorSpace: 'RGB'`.

`dispose()` is not optional. Skipping it leaks until GC runs, and Photoshop
images are large enough that this becomes visible immediately.

### Modal execution

Anything mutating Photoshop state must run inside `core.executeAsModal`. Only one
modal scope can be active at a time, so preview generation and insertion are
serialised through a single queue (roadmap §18.4). Concurrent attempts surface as
`PHOTOSHOP_MODAL_BUSY`.

### Element measurement works, and `offsetHeight` is the one to use

Measured in Photoshop 2026 by instrumenting the running panel, not inferred:
`offsetHeight`, `getBoundingClientRect()`, `getComputedStyle()`,
`querySelectorAll()` and `ResizeObserver` are all present and correct.

`clientHeight` reads exactly 1px short on every bordered row, because it
excludes borders. Using it to measure chrome silently under-counts the panel by
one pixel per row, which is how the action bar ended up clipped. Use
`offsetHeight`.

### Flex children are not bounded, so panel height is arithmetic

`flex: 1 1 auto` plus `min-height: 0` does not bound a child in UXP: the
container grows to fit its content, `scrollHeight` never exceeds `clientHeight`,
and the region cannot scroll. Every scrollable region therefore gets an explicit
pixel height from `utils/layout.ts`.

Two things follow, and both have already caused visible bugs:

**The regions must sum to no more than the panel.** `.app` sets
`overflow: hidden`, so exceeding the panel height produces no scrollbar and no
error — the surplus is simply clipped, and the action bar disappears off the
bottom of the frame. `fits()` states the invariant; the unit tests assert it
across panel heights and chrome sizes.

**Chrome heights must be measured, not mirrored.** `layout.ts` once held a table
of row heights copied by hand from `components.css`. It drifted: `.preview` and
`.action-bar` carry a `border-top` but no explicit height, so they rendered 1px
taller than their token and the column overflowed on every render. Fixed rows now
carry `data-measure="<name>"` and `useMeasuredChrome` reads back their real
`offsetHeight` — note `clientHeight` *excludes* borders and would reintroduce
exactly this bug. The constants in `CHROME` survive only as a first guess for the
frame before measurement lands.

Anything that adds a fixed row to the panel column must mark it `data-measure`
and add a matching key to `ChromeHeights`, or the panel will overflow by that
row's height.

**Dialogs are subject to the same rule.** A dialog covers the whole panel, and
`.dialog__body` was bounded only by `flex: 1 1 auto` — so it grew to fit its
content, never scrolled, and was clipped along with everything below it. The
Settings dialog's Cache and Data section and the category picker's confirm
button were both unreachable this way. Every dialog now passes the measured
panel height to `dialogBodyHeight()` in `utils/layout.ts`.

**The virtualised grid is subject to it twice over.** `AssetGrid`'s `GAP`,
`LIST_ROW_HEIGHT` and `CARD_BORDER`, and `GROUP_HEADER_HEIGHT` /
`GROUP_HEADER_MARGIN` in `utils/virtualization.ts`, are a hand-maintained mirror
of `components.css` — the same kind of mirror that drifted for the panel chrome.
They must be *rendered* heights, and whether a border counts toward that depends
on how the element is sized:

- **Declared height** (`.asset-row`, `.asset-group__header`): `global.css` sets
  `* { box-sizing: border-box }`, so the declared height already contains the
  border. Copy it verbatim. Adding the border on top counts it twice.
- **Content-sized** (`.asset-card`, which gets only a width): the border sits
  outside the content and genuinely adds to the box, which is what `CARD_BORDER`
  is for.

Both directions have shipped as bugs. A 22px constant against a 24px declared
row was 2px short per row; "fixing" it to 25 by adding the border made it 1px
long. Either way the spacers hold open the wrong amount of space and the row
under the cursor stops being the row that gets selected.

This is a *different* rule from the `offsetHeight` / `clientHeight` note above.
That one is about measuring a rendered element, where `clientHeight` excludes
the border and under-counts. This one is about mirroring a stylesheet, where
border-box means the declared number is already the whole box.

**A scrollable container's own vertical padding must be zero**, or folded into
the offset arithmetic. `.asset-grid` carries horizontal padding only: a
`padding-top` shifts every row down by its value while the offset table still
starts at 0, so hit-testing resolves the wrong row and `maxScroll` clamps short
of the real bottom.

## Manifest gotchas (found by loading it in Photoshop 2026)

Both of these were confirmed from Photoshop's own UXP log, and both fail
**silently** — the plugin simply never appears in the Plugins menu.

### `host` must be an object, not an array

```jsonc
// WRONG - this is what the roadmap's section 27 example shows
"host": [{ "app": "PS", "minVersion": "25.0.0" }]

// RIGHT
"host": { "app": "PS", "minVersion": "25.0.0" }
```

Photoshop logs:

```
[Error] Plugin <id> : Expected the host attribute to be an object for the 3P Plugin
[Error] upic::Adding plugins in uxp plugin manager failed to create/initialize plugin
```

The plugin is registered and marked enabled, then fails to initialise. Nothing
surfaces in the UI. `scripts/build.mjs` now rejects an array host at build time.

### Scaled icons are resolved as `@1x` / `@2x`, not by the literal path

With `"scale": [1, 2]`, UXP ignores the exact filename in `path` and looks for
`<basename>@1x.<ext>` and `<basename>@2x.<ext>`:

```
[Info] Plugin <id> : Scaled Icon : assets/icons/plugin-icon-24@1x.png not found
```

Non-fatal, but the icon is missing. `scripts/generate-icons.mjs` writes all
three names, and the build verifies every declared scale variant exists.

## Finding out why a plugin will not load

Photoshop writes a UXP log per session:

```
~/Library/Logs/Adobe/Adobe Photoshop <year>/UXPLogs_<timestamp>.log
```

Grep it for the plugin id. This is the only place manifest validation failures
are reported — the Plugins menu gives no indication at all.

## Bundling

The host provides `uxp`, `photoshop` and some Node-like modules through a global
`require()`. These **must** stay external — `scripts/build.mjs` verifies this by
scanning source imports and asserting each appears as a `require()` in the
bundle. The entry point must not export anything, or esbuild emits a CommonJS
wrapper the host may not provide.

## Verifying any of this

None of it can be checked on a build machine. `docs/SELF-TEST.md` describes the
in-panel harness that exercises these paths inside Photoshop and reports
pass/fail per item.
