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
import { type MutableRefObject, type ReactElement, useRef, useState } from 'react';
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
  readonly onRenameRow: (rowId: string, displayName: string) => void;
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

/**
 * A text field whose value lives in local state until it is committed.
 *
 * Routing every keystroke to the store rebuilt the entire ImportPlan - a fresh
 * rows array, fresh row objects, and a re-reduce of totalAssets across all of
 * them - so a 60-folder scan re-rendered the whole list on every character. It
 * also round-tripped the controlled value back through async state, which is
 * the setup that drops a UXP text field's caret to the end mid-word.
 *
 * The draft is re-seeded when the row's stored value changes underneath us, so
 * an external edit is not masked by a stale draft.
 *
 * An uncommitted draft also registers itself in `pending`, because a field is
 * committed on blur and clicking Import need not blur it first - without that
 * the last thing typed would be silently dropped.
 */
function DraftInput({
  className,
  value,
  placeholder,
  title,
  fieldKey,
  pending,
  onCommit,
}: {
  readonly className: string;
  readonly value: string;
  readonly placeholder: string;
  readonly title: string;
  readonly fieldKey: string;
  readonly pending: MutableRefObject<Map<string, () => void>>;
  readonly onCommit: (next: string) => void;
}): ReactElement {
  const [draft, setDraft] = useState(value);
  const [seed, setSeed] = useState(value);

  // Re-seeding during render rather than in an effect keeps the field from
  // painting one frame of the stale draft.
  if (seed !== value) {
    setSeed(value);
    setDraft(value);
  }

  return (
    <input
      className={className}
      type="text"
      value={draft}
      placeholder={placeholder}
      title={title}
      onChange={(event) => {
        const next = event.currentTarget.value;
        setDraft(next);
        pending.current.set(fieldKey, () => onCommit(next));
      }}
      onBlur={() => {
        pending.current.delete(fieldKey);
        onCommit(draft);
      }}
    />
  );
}

export function BulkImportDialog({
  plan,
  rootName,
  panelHeight,
  busy,
  onToggleRow,
  onRenameRow,
  onChangeCategory,
  onSetAll,
  onConfirm,
  onCancel,
}: BulkImportDialogProps): ReactElement {
  const selectedCount = plan.rows.filter((row) => row.selected && !row.alreadyImported).length;
  const listHeight = Math.max(80, panelHeight - DIALOG_CHROME);

  /** Field edits typed but not yet blurred. See DraftInput. */
  const pending = useRef(new Map<string, () => void>());

  const confirmWithPendingEdits = () => {
    for (const commit of pending.current.values()) commit();
    pending.current.clear();
    onConfirm();
  };

  /*
   * A library with no name renders as an empty row in the sidebar with nothing
   * to identify or re-target it. `confirmBulkImport` substitutes the folder
   * name rather than persisting a blank, but blocking here means the user
   * chooses the name instead of being handed a fallback they did not ask for.
   */
  const blankNameCount = plan.rows.filter(
    (row) => row.selected && !row.alreadyImported && row.displayName.trim() === '',
  ).length;

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
              {/* Explicit label: the only visible text is a tick glyph. */}
              <Pressable
                className="checkbox"
                active={row.selected}
                disabled={row.alreadyImported}
                title={row.alreadyImported ? 'Already a library' : 'Include this folder'}
                label={
                  row.alreadyImported
                    ? `${row.displayName} is already a library`
                    : `Include ${row.displayName || row.relativePath || row.nativePath}`
                }
                onClick={() => onToggleRow(row.id, !row.selected)}
              >
                {row.selected ? '✓' : ''}
              </Pressable>

              {/*
                Editable, as the header promises. It was a read-only span, so
                `suggestDisplayName`'s guess was final: a pack of folders named
                01, 02, 03 produced three libraries labelled exactly that, with
                no way to change them short of removing and re-adding each one.
              */}
              {row.alreadyImported ? (
                <span className="bulk-row__name truncate" title={row.nativePath}>
                  {row.displayName}
                </span>
              ) : (
                <DraftInput
                  className="text-input bulk-row__name"
                  value={row.displayName}
                  placeholder="Library name"
                  title="Name this library appears under in the sidebar"
                  fieldKey={`${row.id}:name`}
                  pending={pending}
                  onCommit={(next) => onRenameRow(row.id, next)}
                />
              )}

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
              <DraftInput
                className="text-input bulk-row__category"
                value={row.category}
                placeholder="Category"
                title="Category this library is filed under"
                fieldKey={`${row.id}:category`}
                pending={pending}
                onCommit={(next) => onChangeCategory(row.id, next)}
              />
            )}
          </div>
        ))}
      </div>

      {blankNameCount > 0 && (
        <div className="dialog__note muted">
          {blankNameCount === 1
            ? 'One selected folder has no name.'
            : `${blankNameCount} selected folders have no name.`}{' '}
          Name {blankNameCount === 1 ? 'it' : 'them'} to import.
        </div>
      )}

      <div className="action-bar__row row gap-2">
        <Pressable className="button fill" onClick={onCancel}>
          Cancel
        </Pressable>
        <Pressable
          className="button button--primary fill"
          disabled={busy || selectedCount === 0 || blankNameCount > 0}
          title={blankNameCount > 0 ? 'Every selected library needs a name' : undefined}
          onClick={confirmWithPendingEdits}
        >
          {busy ? 'Importing...' : `Import ${selectedCount}`}
        </Pressable>
      </div>
    </div>
  );
}
