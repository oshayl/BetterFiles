# Self-Test Harness

## Why this exists

The roadmap's Phase 0 is a technical spike: *prove the riskiest Photoshop and
filesystem operations before building the full UI*.

That spike could not be performed during development. This plugin was built on
Linux; Photoshop runs only on macOS and Windows, and UXP has no emulator, so no
line of host-integration code has ever executed. Rather than assume the
documented APIs behave as documented, the spike was built **into the plugin** as
a harness you run on real hardware.

Open **Settings → Self-Test**, ideally with a document open, and click **Run
Self-Test**. Every check is read-only or cleans up after itself.

## The checks

| Check | Proves | If it fails |
|---|---|---|
| **UXP host and version** | The host meets the 25.0 minimum. | Upgrade Photoshop. Below 25 the manifest should not have loaded at all. |
| **Plugin data folder is writable** | `getDataFolder()` works and round-trips a file. | The database and cache cannot work. Likely a sandbox or permissions problem. |
| **Binary cache writes** | Thumbnails can be written as real binary files. | Generated previews will not persist. Check `storage.formats.binary` support. |
| **Persistent folder tokens** | Libraries survive a Photoshop restart. | Libraries need reconnecting each launch. Reported as a warning, since the plugin still works. |
| **executeAsModal and the modal queue** | A modal scope can be entered and exited. | Nothing that changes Photoshop state can work — insertion included. |
| **Active document detection** | The DOM reports the open document and its size. | Insertion cannot resolve a target. Skipped when nothing is open. |
| **Artboard targeting** | Which of the four targeting strategies actually resolves, and the bounds it found. | See below — this is the check most worth reading carefully. |
| **Imaging API** | `getPixels` + `encodeImageData` produce base64 from the active document. | PSD, PDF and AI previews cannot be generated. Raster and SVG are unaffected. |
| **Direct `file:` rendering** | A `file:` URL resolves to an indexed asset. | Raster and SVG thumbnails will not load, which would be the most damaging single failure. |

## Reading the artboard result

This is the check most likely to reveal a discrepancy, because Adobe's own forums
report `artboardRect` returning zeroed or mismatched rectangles.

The result names the strategy that won:

- **`selectedArtboard`** — the selected layer is an artboard. Ideal.
- **`ancestorArtboard`** — an artboard was found by walking up from the selected
  layer. Also correct.
- **`documentCanvas`** — no artboard was involved, so the canvas is the target.
  Correct behaviour in a document without artboards; only a problem if you
  *expected* an artboard to be found.
- **`documentFallback`** — the document's own dimensions were unreadable.
  Always a warning; placement will use a nominal 1000×1000 box.

Bounds are validated before use: all-zero, inverted and non-finite rectangles are
rejected and fall through to the next strategy, so a bad `artboardRect` degrades
to canvas-centred placement rather than dropping assets at the origin.

## What the harness does not cover

Deliberately, because these change your document:

- **Actual insertion** — `placeEvent`, the transform descriptor, layer renaming
  and rasterisation. Test by inserting an asset into a scratch document.
- **Free Transform** — started outside the modal scope, so it hands control back
  to you. Verify the handles appear after an insert.
- **Undo** — one insert should be one history step. Verify with Cmd/Ctrl+Z.
- **Temporary-document previews** — opening a PSD/PDF/AI, sampling it and closing
  without saving. Verify by browsing a folder containing those formats and
  watching for stray open documents.

## Suggested first-run sequence

1. Run the self-test with no document open. Confirm storage checks pass and
   document checks report `SKIP`.
2. Open a plain document. Re-run. Confirm the imaging and artboard checks pass.
3. Open a document with artboards, select one, re-run. Confirm the strategy is
   `selectedArtboard` and the bounds match that artboard.
4. Add a library containing a PNG, an SVG, a PSD, a PDF and an AI file. Confirm
   raster and SVG thumbnails appear immediately, and the rest fill in.
5. Insert a large raster into an artboard. Confirm it is centred, scaled to 70%
   coverage, and Free Transform starts.
6. Press Cmd/Ctrl+Z once. Confirm the insert is fully undone.
7. Restart Photoshop. Confirm libraries and settings persist.

The **copy box** at the bottom of the harness holds the results as plain text for
pasting into a bug report.
