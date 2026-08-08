/**
 * Serialises Photoshop modal execution (roadmap sections 18.4 and 20).
 *
 * Photoshop allows only one `executeAsModal` scope at a time. Thumbnail
 * generation and asset insertion both need one, and the user can trigger an
 * insert while a preview is rendering, so every call funnels through this queue.
 * Without it, the second caller fails with a "modal state" error that looks like
 * a random glitch to the user.
 */
import type { ExecutionContext } from 'photoshop';
import { AssetBrowserError, toAssetBrowserError } from '../../models/errors';
import { logger } from '../../utils/logger';
import { photoshop } from '../host';


export interface ModalTaskOptions {
  readonly commandName: string;
  /** Lower numbers run first when several tasks are waiting. */
  readonly priority?: number;
}

interface QueuedTask<T> {
  readonly options: ModalTaskOptions;
  readonly run: (context: ExecutionContext) => Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (error: unknown) => void;
}

class ModalQueue {
  readonly #pending: Array<QueuedTask<unknown>> = [];
  #draining = false;

  /**
   * Queues work to run inside `executeAsModal`.
   *
   * Interactive user actions should pass a low priority number so an insert
   * jumps ahead of a backlog of background thumbnail work.
   */
  run<T>(options: ModalTaskOptions, task: (context: ExecutionContext) => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: QueuedTask<T> = { options, run: task, resolve, reject };

      // Insert by priority, keeping equal priorities in submission order.
      const priority = options.priority ?? 100;
      const index = this.#pending.findIndex((queued) => (queued.options.priority ?? 100) > priority);
      if (index === -1) this.#pending.push(entry as QueuedTask<unknown>);
      else this.#pending.splice(index, 0, entry as QueuedTask<unknown>);

      void this.#drain();
    });
  }

  async #drain(): Promise<void> {
    if (this.#draining) return;
    this.#draining = true;

    try {
      while (this.#pending.length > 0) {
        const task = this.#pending.shift();
        if (!task) break;

        try {
          const result = await photoshop().core.executeAsModal(
            async (context) => task.run(context),
            { commandName: task.options.commandName },
          );
          task.resolve(result);
        } catch (error) {
          // One failed task must not stall the queue for everything behind it.
          logger.warn('modal', `Task "${task.options.commandName}" failed`, error);
          task.reject(toAssetBrowserError(error, 'IMPORT_FAILED'));
        }
      }
    } finally {
      this.#draining = false;
    }
  }

  /** Number of tasks waiting, for the indexing/progress indicator. */
  get queueSize(): number {
    return this.#pending.length;
  }
}

export const modalQueue = new ModalQueue();

/** Priority bands. Lower runs first. */
export const ModalPriority = {
  /** Direct user action - insertion. */
  Interactive: 0,
  /** Preview for the currently selected asset. */
  VisiblePreview: 50,
  /** Background thumbnail generation. */
  Background: 100,
} as const;

/**
 * Runs `batchPlay` and throws on the first descriptor that reports an error.
 *
 * `batchPlay` resolves successfully even when Photoshop refused the action, so
 * the result has to be inspected explicitly.
 */
export async function playChecked(
  descriptors: Record<string, unknown>[],
  context: string,
): Promise<Record<string, unknown>[]> {
  const results = await photoshop().action.batchPlay(descriptors, {
    synchronousExecution: false,
    modalBehavior: 'execute',
  });

  for (const result of results) {
    // Photoshop reports failures as a descriptor with `message` and no `_obj`.
    const message = typeof result?.message === 'string' ? result.message : null;
    if (message && result?.['error'] !== undefined) {
      throw new AssetBrowserError('IMPORT_FAILED', {
        message: `${context}: ${message}`,
        detail: result,
      });
    }
  }

  return results;
}
