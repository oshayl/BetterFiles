/**
 * Explicit layout arithmetic.
 *
 * WHY THIS EXISTS
 * A scrollable region needs a *bounded* height. On the web you get that from
 * `flex: 1 1 auto` plus `min-height: 0`, and the browser resolves it. UXP's
 * flexbox does not reliably bound a flex child this way: the container grows to
 * fit its content instead, `scrollHeight` never exceeds `clientHeight`, and the
 * region simply cannot scroll. That affected both the asset grid and the folder
 * tree.
 *
 * So heights for scrollable regions are computed here in pixels and applied
 * inline. The flex rules stay in the stylesheet as a fallback, but nothing
 * depends on them resolving correctly.
 *
 * CHROME HEIGHTS ARE MEASURED, NOT ASSUMED
 * The constants below are only a first guess, used for the frame or two before
 * the panel has been measured. The real heights come from the DOM: every fixed
 * row carries a `data-measure` attribute and `useMeasuredChrome` reads back its
 * rendered height. This used to be a hand-maintained mirror of components.css,
 * and it drifted - borders on the preview and action bar were unaccounted for,
 * so the column was permanently 2px taller than the panel. Anything that
 * changes a row's height now corrects itself on the next measurement.
 *
 * THE INVARIANT
 * The regions this returns must SUM TO NO MORE than the panel height. `.app`
 * clips its overflow, so exceeding the panel does not show a scrollbar - it
 * silently eats the action bar off the bottom of the frame. `fits()` states the
 * invariant and the unit tests enforce it.
 */

/**
 * Fallback chrome heights, in CSS pixels, used only until the real values are
 * measured. Approximate is fine here; these must not be relied on as truth.
 */
export const CHROME = {
  header: 24,
  search: 24,
  /** One combined row: filter, sort, grouping, backdrop, view, refresh. */
  toolbar: 24,
  /** Always-present collapsed preview strip. */
  previewStrip: 20,
  actionBar: 31,
  notification: 28,
  /** The Add Folder button; categories supply their own headings. */
  sidebarChrome: 26,
} as const;

/** The measurable rows, keyed by their `data-measure` attribute value. */
export type ChromeHeights = Record<keyof typeof CHROME, number>;

export interface LayoutInput {
  /** Measured height of the panel. 0 means "not measured yet". */
  readonly appHeight: number;
  /**
   * Requested height of the expanded preview stage, excluding the strip. Only
   * a request: it is reduced, or refused outright, when the grid cannot spare
   * the room.
   */
  readonly previewHeight: number;
  /** Whether the preview strip is shown at all. */
  readonly showPreview: boolean;
  /** Whether the user wants the preview expanded beyond its strip. */
  readonly previewExpanded: boolean;
  readonly showNotification: boolean;
  /** Measured chrome heights; anything absent falls back to `CHROME`. */
  readonly chrome?: Partial<ChromeHeights>;
}

export interface Layout {
  /** Height of the sidebar + content row. */
  readonly workspaceHeight: number;
  /** Height of the scrollable asset grid. */
  readonly gridHeight: number;
  /** Height of the scrollable folder tree. */
  readonly sidebarTreeHeight: number;
  /**
   * Height granted to the expanded preview stage right now. Zero when the
   * preview is collapsed OR when there was not enough room to expand at all -
   * the preview yields to the grid, never the other way round.
   */
  readonly previewBodyHeight: number;
  /**
   * Height the stage would be granted if it were expanded, independent of
   * whether it currently is. Zero means the panel is too short to expand into
   * at all, which is a different statement from "not expanded" and is what
   * lets the strip say "Panel too short" instead of offering a toggle that
   * changes nothing.
   */
  readonly previewGrantable: number;
}

/**
 * Smallest usable height for the asset grid. The grid is reserved this much
 * before the preview stage is given anything.
 */
const MIN_SCROLL_HEIGHT = 80;

/**
 * Below this a preview stage shows less than the grid tile it was opened from,
 * so it is not worth the space. The preview stays collapsed instead.
 */
const MIN_PREVIEW_BODY = 88;

/** Assumed panel height before the first measurement lands. */
const ASSUMED_HEIGHT = 700;

export function computeLayout(input: LayoutInput): Layout {
  const chrome: ChromeHeights = { ...CHROME, ...input.chrome };
  const appHeight = input.appHeight > 0 ? input.appHeight : ASSUMED_HEIGHT;

  // Rows that are always their natural height, whatever else has to give.
  const fixed =
    chrome.header +
    chrome.search +
    chrome.actionBar +
    (input.showPreview ? chrome.previewStrip : 0) +
    (input.showNotification ? chrome.notification : 0);

  // What is left to share between the workspace and the preview stage.
  const available = Math.max(0, appHeight - fixed);

  /*
   * The grid is served first. Whatever the preview asks for, it only gets what
   * remains after the toolbar and a scrollable grid have been reserved - so a
   * tall preview can never push the action bar out of the panel.
   */
  const reservedForGrid = chrome.toolbar + MIN_SCROLL_HEIGHT;
  const spare = Math.max(0, available - reservedForGrid);

  /*
   * What the stage WOULD get if the user asked for it, computed independently
   * of whether they currently have. `previewCanExpand` in App.tsx is derived
   * from this: folding `previewExpanded` in here made the grant zero whenever
   * the preference was off, so "can this panel expand at all?" and "is it
   * expanded?" collapsed into one bit and a panel genuinely too short still
   * advertised "Expand preview" until the user toggled it once.
   */
  const grantable = input.showPreview ? Math.min(Math.max(0, input.previewHeight), spare) : 0;
  const previewGrantable = grantable >= MIN_PREVIEW_BODY ? grantable : 0;

  const previewBodyHeight = input.previewExpanded ? previewGrantable : 0;

  /*
   * No clamping to a minimum here. Every height must come out of `available`,
   * because a floor that ignores the panel height is precisely what used to
   * push the bottom of the panel out of frame.
   */
  const workspaceHeight = Math.max(0, available - previewBodyHeight);

  return {
    workspaceHeight,
    gridHeight: Math.max(0, workspaceHeight - chrome.toolbar),
    sidebarTreeHeight: Math.max(0, workspaceHeight - chrome.sidebarChrome),
    previewBodyHeight,
    previewGrantable,
  };
}

/**
 * Height for a dialog's scrollable body.
 *
 * Dialogs cover the whole panel, so the rule that governs the main column
 * governs them too: `flex: 1 1 auto` does not bound a child in UXP, so an
 * unbounded body grows to fit its content, never scrolls, and is clipped by
 * `.app { overflow: hidden }` along with anything below it. That is how the
 * Settings dialog's Cache and Data section and the category picker's confirm
 * button became unreachable on a short panel.
 *
 * `chromeHeight` is the dialog's own fixed rows - header, tabs, notes, footer.
 * An estimate is fine: it only bounds the scroll region, and erring high costs
 * a few pixels of visible list rather than an unreachable control.
 */
export function dialogBodyHeight(panelHeight: number, chromeHeight: number): number {
  const height = panelHeight > 0 ? panelHeight : ASSUMED_HEIGHT;
  return Math.max(MIN_SCROLL_HEIGHT, height - chromeHeight);
}

/**
 * Shortest panel that can still show every fixed row plus a scrollable grid.
 *
 * Below this the rows cannot all fit however the space is divided, and `.app`
 * clips the remainder - there is no arrangement that avoids it. The manifest's
 * `minimumSize.height` must stay above this, which is asserted in the tests.
 */
export function minimumPanelHeight(chrome: Partial<ChromeHeights> = {}): number {
  const resolved: ChromeHeights = { ...CHROME, ...chrome };

  return (
    resolved.header +
    resolved.search +
    resolved.actionBar +
    resolved.previewStrip +
    resolved.notification +
    resolved.toolbar +
    MIN_SCROLL_HEIGHT
  );
}

/**
 * Whether a layout fits the panel it was computed for.
 *
 * This is the property that matters and the one that regressed, so it is
 * stated once and asserted in the tests rather than re-derived by eye.
 */
export function fits(input: LayoutInput, layout: Layout): boolean {
  const chrome: ChromeHeights = { ...CHROME, ...input.chrome };
  const appHeight = input.appHeight > 0 ? input.appHeight : ASSUMED_HEIGHT;

  const total =
    chrome.header +
    chrome.search +
    layout.workspaceHeight +
    (input.showPreview ? chrome.previewStrip + layout.previewBodyHeight : 0) +
    chrome.actionBar +
    (input.showNotification ? chrome.notification : 0);

  return total <= appHeight;
}
