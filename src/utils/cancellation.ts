/**
 * Cooperative cancellation (roadmap sections 18.4 and 39).
 *
 * Indexing and thumbnail generation must stop promptly when the user switches
 * folders, otherwise work for an abandoned library keeps competing for the
 * single Photoshop modal scope. There is no AbortController guarantee in UXP,
 * so this is a small explicit implementation.
 */

export class CancellationError extends Error {
  constructor(reason = 'Operation cancelled') {
    super(reason);
    this.name = 'CancellationError';
  }
}

export interface CancellationToken {
  readonly isCancelled: boolean;
  /** Throws `CancellationError` if cancellation has been requested. */
  throwIfCancelled(): void;
  /** Registers a callback; fires immediately if already cancelled. */
  onCancel(callback: () => void): () => void;
}

/**
 * The token half of a source.
 *
 * A separate class rather than an object literal built in the constructor, so
 * it can read the source through a normal field instead of aliasing `this`.
 */
class SourceToken implements CancellationToken {
  constructor(private readonly source: CancellationSource) {}

  get isCancelled(): boolean {
    return this.source.isCancelled;
  }

  throwIfCancelled(): void {
    if (this.source.isCancelled) throw new CancellationError();
  }

  onCancel(callback: () => void): () => void {
    return this.source.register(callback);
  }
}

export class CancellationSource {
  #cancelled = false;
  readonly #callbacks = new Set<() => void>();
  readonly token: CancellationToken = new SourceToken(this);

  get isCancelled(): boolean {
    return this.#cancelled;
  }

  /** Internal: used by the token to subscribe. Fires immediately if cancelled. */
  register(callback: () => void): () => void {
    if (this.#cancelled) {
      callback();
      return () => {};
    }
    this.#callbacks.add(callback);
    return () => {
      this.#callbacks.delete(callback);
    };
  }

  cancel(): void {
    if (this.#cancelled) return;
    this.#cancelled = true;

    for (const callback of this.#callbacks) {
      // One misbehaving listener must not prevent the others from running.
      try {
        callback();
      } catch {
        /* ignored deliberately */
      }
    }
    this.#callbacks.clear();
  }
}

/** A token that is never cancelled, for callers with nothing to cancel. */
export const NEVER_CANCELLED: CancellationToken = {
  isCancelled: false,
  throwIfCancelled() {},
  onCancel() {
    return () => {};
  },
};

export function isCancellation(error: unknown): boolean {
  return error instanceof CancellationError;
}
