import { describe, expect, it } from 'vitest';
import {
  CHROME,
  computeLayout,
  fits,
  minimumPanelHeight,
  type LayoutInput,
} from '../../src/utils/layout';
import manifest from '../../manifest.json';

const BASE: LayoutInput = {
  appHeight: 700,
  previewHeight: 180,
  showPreview: true,
  previewExpanded: true,
  showNotification: false,
};

describe('computeLayout', () => {
  it('subtracts all chrome from the panel height', () => {
    const layout = computeLayout(BASE);
    const expected =
      700 - CHROME.header - CHROME.search - CHROME.actionBar - CHROME.previewStrip - 180;

    expect(layout.workspaceHeight).toBe(expected);
  });

  it('reclaims the preview stage when collapsed, keeping only the strip', () => {
    const expanded = computeLayout(BASE);
    const collapsed = computeLayout({ ...BASE, previewExpanded: false });

    // This is the whole point of the collapsible preview.
    expect(collapsed.workspaceHeight - expanded.workspaceHeight).toBe(180);
  });

  it('reclaims the strip too when the preview is disabled entirely', () => {
    const collapsed = computeLayout({ ...BASE, previewExpanded: false });
    const hidden = computeLayout({ ...BASE, showPreview: false });

    expect(hidden.workspaceHeight - collapsed.workspaceHeight).toBe(CHROME.previewStrip);
  });

  it('leaves the grid the majority of a small panel when collapsed', () => {
    // The regression this whole change exists to prevent: chrome was eating
    // 53% of a 760pt panel.
    const layout = computeLayout({ ...BASE, appHeight: 760, previewExpanded: false });
    expect(layout.gridHeight / 760).toBeGreaterThan(0.8);
  });

  it('accounts for the notification bar only when shown', () => {
    const quiet = computeLayout(BASE);
    const noisy = computeLayout({ ...BASE, showNotification: true });

    expect(quiet.workspaceHeight - noisy.workspaceHeight).toBe(CHROME.notification);
  });

  it('leaves the grid shorter than the workspace by exactly the toolbar', () => {
    const layout = computeLayout(BASE);
    expect(layout.workspaceHeight - layout.gridHeight).toBe(CHROME.toolbar);
  });

  it('leaves the sidebar tree shorter by its own chrome', () => {
    const layout = computeLayout(BASE);
    expect(layout.workspaceHeight - layout.sidebarTreeHeight).toBe(CHROME.sidebarChrome);
  });

  it('assumes a workable height before the first measurement', () => {
    // A 0 height would otherwise collapse every scroll region to nothing,
    // which is indistinguishable from a broken panel.
    const layout = computeLayout({ ...BASE, appHeight: 0 });
    expect(layout.gridHeight).toBeGreaterThan(100);
  });

  it('grants the preview the height it asks for when there is room', () => {
    expect(computeLayout(BASE).previewBodyHeight).toBe(180);
  });

  it('grants the preview nothing when it is collapsed or hidden', () => {
    expect(computeLayout({ ...BASE, previewExpanded: false }).previewBodyHeight).toBe(0);
    expect(computeLayout({ ...BASE, showPreview: false }).previewBodyHeight).toBe(0);
  });
});

/*
 * The bug these exist for: heights were clamped to a minimum independently of
 * each other, so on a short panel they summed to more than the panel itself.
 * `.app` clips its overflow, so the surplus was not scrollable - the preview
 * and the action bar were simply gone off the bottom of the frame, and
 * dragging the panel taller did not bring them back.
 */
describe('computeLayout containment', () => {
  const HEIGHTS = [240, 300, 360, 420, 500, 700, 1400];

  it('is reachable within the panel size the manifest guarantees', () => {
    // Containment below `minimumPanelHeight` is not achievable - the fixed rows
    // alone are taller than the panel. Photoshop will not make the panel that
    // short, and this is what keeps that true.
    expect(minimumPanelHeight()).toBeLessThanOrEqual(manifest.entrypoints[0]!.minimumSize.height);
  });

  it('never returns regions summing past the panel, at any usable height', () => {
    for (const appHeight of HEIGHTS) {
      expect(appHeight).toBeGreaterThanOrEqual(minimumPanelHeight());
      for (const showPreview of [true, false]) {
        for (const previewExpanded of [true, false]) {
          for (const showNotification of [true, false]) {
            const input = { ...BASE, appHeight, showPreview, previewExpanded, showNotification };
            expect(fits(input, computeLayout(input)), `appHeight=${appHeight}`).toBe(true);
          }
        }
      }
    }
  });

  it('starves the preview rather than the grid on a short panel', () => {
    // 300pt leaves ~200pt after fixed chrome. The preview asking for 180 would
    // leave the grid 20pt, so it does not get 180.
    const layout = computeLayout({ ...BASE, appHeight: 300 });

    expect(layout.gridHeight).toBeGreaterThanOrEqual(80);
    expect(layout.previewBodyHeight).toBeLessThan(180);
  });

  it('refuses to expand at all when the stage would be too small to read', () => {
    const layout = computeLayout({ ...BASE, appHeight: 240 });

    expect(layout.previewBodyHeight).toBe(0);
    // And the space goes to the grid, not nowhere.
    expect(layout.gridHeight).toBeGreaterThan(0);
  });

  it('recovers the full preview as the panel is dragged taller', () => {
    // The symptom was that dragging the panel out never brought the bottom of
    // the UI back. Growth must be monotonic and must reach the full request.
    const heights = [240, 300, 360, 420, 500, 700].map(
      (appHeight) => computeLayout({ ...BASE, appHeight }).previewBodyHeight,
    );

    for (let index = 1; index < heights.length; index += 1) {
      expect(heights[index]!).toBeGreaterThanOrEqual(heights[index - 1]!);
    }
    expect(heights[heights.length - 1]).toBe(180);
  });

  it('keeps the grid usable on a very short panel', () => {
    // Docked panels can be dragged very short; the grid must still scroll
    // rather than vanish.
    const layout = computeLayout({ ...BASE, appHeight: 300, showPreview: false });
    expect(layout.gridHeight).toBeGreaterThanOrEqual(80);
  });
});

/*
 * Chrome heights come from the DOM, so layout must stay correct for values
 * that differ from the CHROME estimates - which is what happens the moment
 * anyone edits components.css.
 */
describe('computeLayout with measured chrome', () => {
  it('uses measured heights in preference to the estimates', () => {
    const input = { ...BASE, chrome: { header: 40, actionBar: 48 } };
    const layout = computeLayout(input);

    const expected = 700 - 40 - CHROME.search - 48 - CHROME.previewStrip - 180;
    expect(layout.workspaceHeight).toBe(expected);
    expect(fits(input, layout)).toBe(true);
  });

  it('still fits when every row measures taller than estimated', () => {
    const input: LayoutInput = {
      ...BASE,
      appHeight: 420,
      showNotification: true,
      chrome: {
        header: 34,
        search: 34,
        toolbar: 34,
        previewStrip: 30,
        actionBar: 44,
        notification: 38,
        sidebarChrome: 36,
      },
    };

    expect(fits(input, computeLayout(input))).toBe(true);
  });

  it('falls back to the estimate for rows that could not be measured', () => {
    const layout = computeLayout({ ...BASE, chrome: {} });
    expect(layout.workspaceHeight).toBe(computeLayout(BASE).workspaceHeight);
  });
});
