/**
 * Bulk library import (the answer to "nine folders, nine trips through the
 * picker").
 *
 * Pick one parent folder and every asset folder beneath it is offered at once,
 * with a name and category already suggested from the folder names. The
 * suggestions are editable here because a guess from a folder name is a good
 * starting point and a poor final answer.
 *
 * Controls are `Pressable`, not `<button>`: UXP renders a native button and
 * discards the CSS box. See components/controls/Pressable.tsx.
 */
import type { ReactElement } from 'react';
import type { ImportPlan } from '../../services/library-import.service';
import { Pressable } from './Pressable';
import { CloseIcon } from '../icons';

interface BulkImportDialogProps {
  readonly plan: ImportPlan;
  readonly rootName: string;
  /** Measured panel height; the list needs an explicit one to scroll in UXP. */
  readonly panelHeight: number;
  readonly busy: boolean;
  readonly onToggleRow: (rowId: string, selected: boolean) => void;
  readonly onChangeCategory: (rowId: string, category: string) => void;
  readonly onSetAll: (selected: boolean) => void;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/**
 * Dialog chrome above and below the list: header, note, select-all row and the
 * footer. An estimate, and only used to bound the scroll region.
 */
const DIALOG_CHROME = 156;

export function BulkImportDialog({
  plan,
  rootName,
  panelHeight,
  busy,
  onToggleRow,
  onChangeCategory,
  onSetAll,
  onConfirm,
  onCancel,
}: BulkImportDialogProps): ReactElement {
  const selectedCount = plan.rows.filter((row) => row.selected && !row.alreadyImported).length;
  const listHeight = Math.max(80, panelHeight - DIALOG_CHROME);

  return (
    <div className="dialog">
      <div className="dialog__header row">
        <span className="dialog__title">Import Libraries</span>
        <span className="spacer" />
        <Pressable className="button button--ghost button--icon" title="Cancel" onClick={onCancel}>
          <CloseIcon size={12} />
        </Pressable>
      </div>

      <div className="dialog__note">
        Found <strong>{plan.rows.length}</strong> asset{' '}
        {plan.rows.length === 1 ? 'folder' : 'folders'} under <strong>{rootName}</strong>
        {plan.alreadyImportedCount > 0 && ` (${plan.alreadyImportedCount} already imported)`}.
      </div>

      <div className="bulk-toolbar row gap-2">
        <Pressable className="button button--ghost" onClick={() => onSetAll(true)}>
          All
        </Pressable>
        <Pressable className="button button--ghost" onClick={() => onSetAll(false)}>
          None
        </Pressable>
        <span className="spacer" />
        <span className="bulk-toolbar__count muted">
          {selectedCount} selected &middot; {plan.totalAssets.toLocaleString()} assets
        </span>
      </div>

      {/* Explicit height: UXP does not bound a flex child, so `flex: 1 1 auto`
          would grow to fit and never scroll. See utils/layout.ts. */}
      <div className="bulk-list scroll-y" style={{ height: `${listHeight}px` }}>
        {plan.rows.map((row) => (
          <div
            className="bulk-row"
            key={row.id}
            data-disabled={row.alreadyImported ? 'true' : undefined}
          >
            <div className="bulk-row__head row gap-2">
              <Pressable
                className="checkbox"
                active={row.selected}
                disabled={row.alreadyImported}
                title={row.alreadyImported ? 'Already a library' : 'Include this folder'}
                onClick={() => onToggleRow(row.id, !row.selected)}
              >
                {row.selected ? '✓' : ''}
              </Pressable>

              <span className="bulk-row__name truncate" title={row.nativePath}>
                {row.displayName}
              </span>

              <span className="bulk-row__count muted">{row.assetCount.toLocaleString()}</span>
            </div>

            <div className="bulk-row__path truncate muted" title={row.nativePath}>
              {row.relativePath || row.nativePath}
            </div>

            {row.alreadyImported ? (
              <div className="bulk-row__note muted">Already a library</div>
            ) : row.supersededBy ? (
              <div className="bulk-row__note muted">
                Same artwork as {row.supersededBy} &mdash; tick to import as well
              </div>
            ) : (
              <input
                className="text-input bulk-row__category"
                type="text"
                value={row.category}
                placeholder="Category"
                title="Category this library is filed under"
                onChange={(event) => onChangeCategory(row.id, event.currentTarget.value)}
              />
            )}
          </div>
        ))}
      </div>

      <div className="action-bar__row row gap-2">
        <Pressable className="button fill" onClick={onCancel}>
          Cancel
        </Pressable>
        <Pressable
          className="button button--primary fill"
          disabled={busy || selectedCount === 0}
          onClick={onConfirm}
        >
          {busy ? 'Importing...' : `Import ${selectedCount}`}
        </Pressable>
      </div>
    </div>
  );
}
