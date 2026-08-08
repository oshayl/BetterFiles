/**
 * Photoshop quick tools.
 *
 * One-click actions that would otherwise mean hunting through menus. Each is a
 * single Action Manager descriptor run through the shared modal queue, so they
 * never collide with an insert or a preview generation.
 *
 * Destructive tools are flagged and require a second click to confirm. Purging
 * discards undo history irreversibly, and a mis-click in a small panel should
 * not cost someone their work.
 */
import { ModalPriority, modalQueue } from '../adapters/photoshop/modal-queue';
import { photoshop, uxp } from '../adapters/host';
import { AssetBrowserError, toAssetBrowserError } from '../models/errors';
import { getServices } from '../app/services';
import { logger } from '../utils/logger';

export type ToolGroup = 'memory' | 'document' | 'layer' | 'plugin';

export interface QuickTool {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly group: ToolGroup;
  /** Requires a confirming second click. */
  readonly destructive?: boolean;
  /** Requires an open document; the UI disables it otherwise. */
  readonly needsDocument?: boolean;
  readonly run: () => Promise<string>;
}

export const TOOL_GROUP_LABELS: Record<ToolGroup, string> = {
  memory: 'Photoshop Memory',
  document: 'Document',
  layer: 'Layer',
  plugin: 'Asset Browser',
};

/** Runs one descriptor inside the modal queue. */
async function play(
  commandName: string,
  descriptor: Record<string, unknown>,
): Promise<void> {
  await modalQueue.run({ commandName, priority: ModalPriority.Interactive }, async () => {
    await photoshop().action.batchPlay([descriptor], {
      synchronousExecution: false,
      modalBehavior: 'execute',
    });
  });
}

/** Invokes a Photoshop menu command by its menu item id. */
async function playMenu(commandName: string, menuItem: string): Promise<void> {
  await modalQueue.run({ commandName, priority: ModalPriority.Interactive }, async () => {
    await photoshop().action.batchPlay(
      [
        {
          _obj: 'select',
          _target: [{ _ref: 'menuItemClass', _enum: 'menuItemType', _value: menuItem }],
        },
      ],
      { synchronousExecution: false, modalBehavior: 'execute' },
    );
  });
}

function requireDocument() {
  const doc = photoshop().app.activeDocument;
  if (!doc) throw new AssetBrowserError('NO_ACTIVE_DOCUMENT');
  return doc;
}

/** Purge targets, as accepted by the `purge` descriptor. */
type PurgeItem = 'allItems' | 'undo' | 'clipboard' | 'histories';

async function purge(item: PurgeItem, label: string): Promise<string> {
  await play(`Purge ${label}`, {
    _obj: 'purge',
    _target: { _enum: 'purgeItem', _value: item },
  });
  return `Purged ${label.toLowerCase()}.`;
}

export const QUICK_TOOLS: readonly QuickTool[] = [
  // ------------------------------------------------------------- memory --
  {
    id: 'purge-all',
    label: 'Purge All',
    description: 'Frees undo, clipboard and history memory. Cannot be undone.',
    group: 'memory',
    destructive: true,
    run: () => purge('allItems', 'All'),
  },
  {
    id: 'purge-undo',
    label: 'Purge Undo',
    description: 'Discards the undo buffer only.',
    group: 'memory',
    destructive: true,
    run: () => purge('undo', 'Undo'),
  },
  {
    id: 'purge-histories',
    label: 'Purge Histories',
    description: 'Discards history states for all open documents.',
    group: 'memory',
    destructive: true,
    run: () => purge('histories', 'Histories'),
  },
  {
    id: 'purge-clipboard',
    label: 'Purge Clipboard',
    description: 'Releases whatever Photoshop is holding on the clipboard.',
    group: 'memory',
    destructive: true,
    run: () => purge('clipboard', 'Clipboard'),
  },

  // ----------------------------------------------------------- document --
  {
    id: 'trim-transparent',
    label: 'Trim Transparent',
    description: 'Crops fully transparent edges away from the canvas.',
    group: 'document',
    needsDocument: true,
    run: async () => {
      requireDocument();
      await play('Trim Transparent Pixels', {
        _obj: 'trim',
        trimBasedOn: { _enum: 'trimBasedOn', _value: 'transparency' },
        top: true,
        bottom: true,
        left: true,
        right: true,
      });
      return 'Trimmed transparent edges.';
    },
  },
  {
    id: 'fit-on-screen',
    label: 'Fit on Screen',
    description: 'Zooms the document to fit the window.',
    group: 'document',
    needsDocument: true,
    run: async () => {
      requireDocument();
      await playMenu('Fit on Screen', 'fitOnScreen');
      return 'Fitted to screen.';
    },
  },
  {
    id: 'merge-visible',
    label: 'Merge Visible',
    description: 'Merges all visible layers into one.',
    group: 'document',
    needsDocument: true,
    destructive: true,
    run: async () => {
      requireDocument();
      await play('Merge Visible', { _obj: 'mergeVisible' });
      return 'Merged visible layers.';
    },
  },
  {
    id: 'flatten',
    label: 'Flatten Image',
    description: 'Flattens the document to a single layer.',
    group: 'document',
    needsDocument: true,
    destructive: true,
    run: async () => {
      requireDocument();
      await play('Flatten Image', { _obj: 'flattenImage' });
      return 'Flattened the document.';
    },
  },
  {
    id: 'reveal-document',
    label: 'Reveal Document',
    description: 'Opens the current document in Finder or Explorer.',
    group: 'document',
    needsDocument: true,
    run: async () => {
      const doc = requireDocument();
      const path = doc.path;
      if (!path) throw new AssetBrowserError('FILE_MISSING', {
        message: 'This document has not been saved yet.',
      });
      await uxp().shell.openPath(path);
      return 'Revealed in the file manager.';
    },
  },

  // -------------------------------------------------------------- layer --
  {
    id: 'to-smart-object',
    label: 'To Smart Object',
    description: 'Converts the selected layers into one Smart Object.',
    group: 'layer',
    needsDocument: true,
    run: async () => {
      requireDocument();
      await play('Convert to Smart Object', { _obj: 'newPlacedLayer' });
      return 'Converted to a Smart Object.';
    },
  },
  {
    id: 'rasterize',
    label: 'Rasterize Layer',
    description: 'Rasterises the selected layer.',
    group: 'layer',
    needsDocument: true,
    destructive: true,
    run: async () => {
      requireDocument();
      await play('Rasterize Layer', {
        _obj: 'rasterizeLayer',
        _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
      });
      return 'Rasterised the layer.';
    },
  },
  {
    id: 'duplicate-layer',
    label: 'Duplicate Layer',
    description: 'Duplicates the selected layer.',
    group: 'layer',
    needsDocument: true,
    run: async () => {
      requireDocument();
      await play('Duplicate Layer', {
        _obj: 'duplicate',
        _target: [{ _ref: 'layer', _enum: 'ordinal', _value: 'targetEnum' }],
      });
      return 'Duplicated the layer.';
    },
  },
  {
    id: 'deselect',
    label: 'Deselect',
    description: 'Clears the current selection.',
    group: 'layer',
    needsDocument: true,
    run: async () => {
      requireDocument();
      await play('Deselect', {
        _obj: 'set',
        _target: [{ _ref: 'channel', _property: 'selection' }],
        to: { _enum: 'ordinal', _value: 'none' },
      });
      return 'Deselected.';
    },
  },

  // ------------------------------------------------------------- plugin --
  {
    id: 'clear-preview-cache',
    label: 'Clear Preview Cache',
    description: 'Deletes generated thumbnails. They regenerate on demand.',
    group: 'plugin',
    destructive: true,
    run: async () => {
      const removed = await getServices().cache.clear();
      getServices().thumbnails.reset();
      return `Cleared ${removed} cached previews.`;
    },
  },
];

export interface ToolResult {
  readonly toolId: string;
  readonly ok: boolean;
  readonly message: string;
}

/** Runs a tool, normalising any failure into a displayable message. */
export async function runQuickTool(tool: QuickTool): Promise<ToolResult> {
  try {
    const message = await tool.run();
    logger.info('tools', `${tool.label}: ${message}`);
    return { toolId: tool.id, ok: true, message };
  } catch (error) {
    const normalized = toAssetBrowserError(error, 'IMPORT_FAILED');
    logger.warn('tools', `${tool.label} failed`, error);
    return { toolId: tool.id, ok: false, message: normalized.message };
  }
}
