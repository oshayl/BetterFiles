/**
 * Layout probe - temporary instrumentation, not a product feature.
 *
 * The panel kept overflowing its own height and screenshots could only show
 * *that* it did, never *why*. UXP implements a DOM subset, so the open question
 * was which measurement APIs actually return numbers there, and whether a row's
 * rendered height matches the height its CSS asks for.
 *
 * This writes both to the plugin data folder, which is readable off the machine,
 * so the answer comes from Photoshop rather than from pixel-counting a PNG.
 *
 * DELETE THIS once the layout is settled - see PROBE_PATH references.
 */
import { getServices } from '../app/services';
import { logger } from '../utils/logger';

export const PROBE_PATH = 'diagnostics/layout-probe.json';

/** Every way of asking an element how tall it is, so we learn which work. */
interface HeightReadings {
  readonly offsetHeight: number | null;
  readonly boundingRect: number | null;
  readonly clientHeight: number | null;
  /** What the stylesheet asked for, when UXP exposes computed style at all. */
  readonly styleHeight: string | null;
}

interface ProbeReport {
  readonly panel: HeightReadings & { readonly width: number | null };
  readonly rows: Record<string, HeightReadings>;
  readonly layout: Record<string, number>;
  readonly api: {
    readonly offsetHeight: boolean;
    readonly getBoundingClientRect: boolean;
    readonly getComputedStyle: boolean;
    readonly querySelectorAll: boolean;
    readonly resizeObserver: boolean;
  };
}

function read(element: HTMLElement): HeightReadings {
  let boundingRect: number | null = null;
  try {
    boundingRect =
      typeof element.getBoundingClientRect === 'function'
        ? element.getBoundingClientRect().height
        : null;
  } catch {
    boundingRect = null;
  }

  let styleHeight: string | null = null;
  try {
    styleHeight =
      typeof getComputedStyle === 'function' ? getComputedStyle(element).height || null : null;
  } catch {
    styleHeight = null;
  }

  return {
    offsetHeight: typeof element.offsetHeight === 'number' ? element.offsetHeight : null,
    boundingRect,
    clientHeight: typeof element.clientHeight === 'number' ? element.clientHeight : null,
    styleHeight,
  };
}

/**
 * Captures one reading and writes it out. Best-effort throughout: a probe that
 * throws would be worse than no probe.
 */
export async function writeLayoutProbe(
  root: HTMLElement,
  layout: Record<string, number>,
): Promise<void> {
  try {
    const rows: Record<string, HeightReadings> = {};

    if (typeof root.querySelectorAll === 'function') {
      const nodes = root.querySelectorAll('[data-measure]');
      for (let index = 0; index < nodes.length; index += 1) {
        const node = nodes[index] as HTMLElement;
        const name = node.getAttribute('data-measure');
        if (name) rows[name] = read(node);
      }
    }

    const report: ProbeReport = {
      panel: { ...read(root), width: typeof root.clientWidth === 'number' ? root.clientWidth : null },
      rows,
      layout,
      api: {
        offsetHeight: typeof root.offsetHeight === 'number',
        getBoundingClientRect: typeof root.getBoundingClientRect === 'function',
        getComputedStyle: typeof getComputedStyle === 'function',
        querySelectorAll: typeof root.querySelectorAll === 'function',
        resizeObserver: typeof ResizeObserver !== 'undefined',
      },
    };

    await getServices().storage.writeText(PROBE_PATH, JSON.stringify(report, null, 2));
  } catch (error) {
    logger.warn('probe', 'layout probe failed', error);
  }
}
