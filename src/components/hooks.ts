/**
 * Shared React hooks.
 *
 * These carry the UXP-specific defensiveness so components can stay declarative:
 * UXP implements a DOM subset, and APIs a browser guarantees (ResizeObserver,
 * window resize events) may or may not be present.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AssetRecord } from '../models/asset';
import type { PreviewSource } from '../services/thumbnail.service';
import type { ChromeHeights } from '../utils/layout';
import { getServices } from '../app/services';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Height of an element including its borders.
 *
 * `clientHeight` excludes them, which is how the 1px rules on the preview and
 * action bar went unaccounted for and pushed the panel bottom out of frame.
 * UXP implements a DOM subset, so each source is probed rather than assumed.
 */
function borderBoxHeight(element: HTMLElement): number {
  if (typeof element.offsetHeight === 'number' && element.offsetHeight > 0) {
    return element.offsetHeight;
  }

  if (typeof element.getBoundingClientRect === 'function') {
    const height = element.getBoundingClientRect().height;
    if (height > 0) return Math.ceil(height);
  }

  return element.clientHeight || 0;
}

/**
 * Tracks an element's content box.
 *
 * Prefers ResizeObserver, falls back to window resize, and re-measures on
 * demand - the panel can be resized by docking, which may not fire either.
 */
export function useElementSize<T extends HTMLElement>(): [
  // Mutable: callers assign to `.current` when combining with another ref.
  React.MutableRefObject<T | null>,
  ElementSize,
  () => void,
] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState<ElementSize>({ width: 0, height: 0 });

  const measure = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    const width = element.clientWidth;
    const height = element.clientHeight;

    setSize((previous) =>
      previous.width === width && previous.height === height ? previous : { width, height },
    );
  }, []);

  useEffect(() => {
    measure();

    // Measure again on the next tick. On first mount the element frequently
    // reports 0x0 because layout has not settled, and a 0-height container
    // would virtualise down to nothing - the panel looks broken.
    const initial = setTimeout(measure, 0);

    if (typeof ResizeObserver !== 'undefined' && ref.current) {
      const observer = new ResizeObserver(measure);
      observer.observe(ref.current);
      return () => {
        clearTimeout(initial);
        observer.disconnect();
      };
    }

    /*
     * UXP's DOM is a subset and does not reliably provide observer APIs
     * (other plugins ship a MutationObserver polyfill for the same reason),
     * and docking or resizing the panel does not dependably fire a window
     * resize event. Falling back to a low-frequency poll is unglamorous but
     * it is the only thing that reliably keeps the grid sized correctly.
     */
    const poll = setInterval(measure, 400);
    const onResize = () => measure();
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('resize', onResize);
    }

    return () => {
      clearTimeout(initial);
      clearInterval(poll);
      if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
        window.removeEventListener('resize', onResize);
      }
    };
  }, [measure]);

  return [ref, size, measure];
}

/**
 * Reads back the rendered height of every fixed chrome row inside `ref`.
 *
 * Rows opt in by carrying `data-measure="<name>"`, where the name is a key of
 * `ChromeHeights`. Marking rows explicitly - rather than walking `.app`'s
 * children - keeps overlays like `.dialog`, which are absolutely positioned and
 * cost the column nothing, out of the total.
 *
 * This replaces a hand-maintained table of heights in layout.ts that had to
 * match components.css exactly and, inevitably, did not.
 */
export function useMeasuredChrome<T extends HTMLElement>(
  ref: React.MutableRefObject<T | null>,
): Partial<ChromeHeights> {
  const [heights, setHeights] = useState<Partial<ChromeHeights>>({});

  useEffect(() => {
    const measure = () => {
      const root = ref.current;
      if (!root || typeof root.querySelectorAll !== 'function') return;

      const next: Partial<ChromeHeights> = {};
      const rows = root.querySelectorAll('[data-measure]');

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index] as HTMLElement;
        const name = row.getAttribute('data-measure') as keyof ChromeHeights | null;
        if (!name) continue;

        // A zero height means the row has not been laid out yet. Leaving the
        // key absent falls back to the CHROME estimate, which is closer to the
        // truth than zero.
        const height = borderBoxHeight(row);
        if (height > 0) next[name] = height;
      }

      setHeights((previous) => (sameHeights(previous, next) ? previous : next));
    };

    measure();

    // Heights settle a tick after mount, exactly as element sizes do.
    const initial = setTimeout(measure, 0);
    // Fonts, theme changes and docking all alter row heights without firing an
    // event UXP delivers. See the note on useElementSize's fallback poll.
    const poll = setInterval(measure, 400);

    return () => {
      clearTimeout(initial);
      clearInterval(poll);
    };
  }, [ref]);

  return heights;
}

function sameHeights(a: Partial<ChromeHeights>, b: Partial<ChromeHeights>): boolean {
  const keys = Object.keys(a) as Array<keyof ChromeHeights>;
  const otherKeys = Object.keys(b) as Array<keyof ChromeHeights>;
  if (keys.length !== otherKeys.length) return false;
  return keys.every((key) => a[key] === b[key]);
}

/**
 * Resolves the preview for one asset.
 *
 * Small rasters and SVGs resolve synchronously to a `file:` URL, so the common
 * case never touches Photoshop or React state at all.
 *
 * `allowGeneration` must stay false for grid tiles: generating opens a real
 * Photoshop document, and scrolling must never set a row of those going. The
 * preview panel passes true, so selecting an asset generates exactly one.
 */
export function useThumbnail(
  asset: AssetRecord,
  size: number,
  visible: boolean,
  allowGeneration = false,
): PreviewSource {
  const services = getServices();
  const [source, setSource] = useState<PreviewSource>(() => services.thumbnails.peek(asset));

  useEffect(() => {
    let cancelled = false;

    setSource(services.thumbnails.peek(asset));

    // Only formats needing Photoshop enter the queue; everything else already
    // resolved above.
    if (!visible) return undefined;

    void services.thumbnails.request({ asset, size, visible, allowGeneration }).then((resolved) => {
      if (!cancelled) setSource(resolved);
    });

    const unsubscribe = services.thumbnails.subscribe((assetId, next) => {
      if (!cancelled && assetId === asset.id) setSource(next);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [asset, size, visible, allowGeneration, services.thumbnails]);

  return source;
}

/** Runs a callback on key presses, scoped to the panel. */
export function useKeyboardShortcuts(
  handler: (event: KeyboardEvent) => void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return undefined;
    if (typeof document === 'undefined') return undefined;

    const listener = (event: KeyboardEvent) => handlerRef.current(event);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, [enabled]);
}

/** Debounced mirror of a value, for search input. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
