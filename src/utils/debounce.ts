/** Timing helpers for search input and resize handling (roadmap section 18.4). */

export interface Debounced<TArgs extends unknown[]> {
  (...args: TArgs): void;
  /** Runs any pending call immediately. */
  flush(): void;
  /** Discards any pending call. */
  cancel(): void;
}

/** Delays invocation until `waitMs` has passed without a further call. */
export function debounce<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  waitMs: number,
): Debounced<TArgs> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: TArgs | undefined;

  const debounced = (...args: TArgs) => {
    pendingArgs = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      const call = pendingArgs;
      pendingArgs = undefined;
      if (call) callback(...call);
    }, waitMs);
  };

  debounced.flush = () => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
    const call = pendingArgs;
    pendingArgs = undefined;
    if (call) callback(...call);
  };

  debounced.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pendingArgs = undefined;
  };

  return debounced;
}

/**
 * Rate-limits to at most one call per interval, running on the leading edge and
 * once more at the end if calls kept arriving. Used for scroll-driven work,
 * where dropping the final event would leave thumbnails unrequested.
 */
export function throttle<TArgs extends unknown[]>(
  callback: (...args: TArgs) => void,
  intervalMs: number,
): Debounced<TArgs> {
  let lastRun = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingArgs: TArgs | undefined;

  const run = (args: TArgs) => {
    lastRun = Date.now();
    callback(...args);
  };

  const throttled = (...args: TArgs) => {
    const elapsed = Date.now() - lastRun;
    pendingArgs = args;

    if (elapsed >= intervalMs) {
      pendingArgs = undefined;
      run(args);
      return;
    }

    if (timer === undefined) {
      timer = setTimeout(() => {
        timer = undefined;
        const call = pendingArgs;
        pendingArgs = undefined;
        if (call) run(call);
      }, intervalMs - elapsed);
    }
  };

  throttled.flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    const call = pendingArgs;
    pendingArgs = undefined;
    if (call) run(call);
  };

  throttled.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pendingArgs = undefined;
  };

  return throttled;
}
