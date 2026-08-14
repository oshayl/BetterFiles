/**
 * Category picker shown when importing a library, or when re-filing one.
 *
 * Appears between choosing a folder and adding it, so a library is filed
 * correctly from the start rather than needing to be tidied up later.
 */
import { type ReactElement, useState } from 'react';
import { CloseIcon } from '../icons';
import { Pressable } from './Pressable';
import { dialogBodyHeight } from '../../utils/layout';

interface CategoryPickerProps {
  readonly title: string;
  readonly folderName: string;
  readonly categories: readonly string[];
  readonly current?: string;
  /** Measured panel height; the body needs an explicit one to scroll in UXP. */
  readonly panelHeight: number;
  readonly onConfirm: (category: string) => void;
  readonly onCancel: () => void;
}

/** Header plus the confirm/cancel footer. See `dialogBodyHeight`. */
const DIALOG_CHROME = 60;

export function CategoryPicker({
  title,
  folderName,
  categories,
  current,
  panelHeight,
  onConfirm,
  onCancel,
}: CategoryPickerProps): ReactElement {
  const [custom, setCustom] = useState('');
  const [selected, setSelected] = useState(current ?? '');

  const chosen = custom.trim() || selected;

  return (
    <div className="dialog">
      <div className="dialog__header row">
        <span className="dialog__title">{title}</span>
        <span className="spacer" />
        <Pressable className="button button--ghost button--icon" title="Cancel" onClick={onCancel}>
          <CloseIcon size={12} />
        </Pressable>
      </div>

      {/* Explicit height: an unbounded body grew with the category list and
          pushed the confirm footer off the panel. See utils/layout.ts. */}
      <div
        className="dialog__body scroll-y"
        style={{ height: `${dialogBodyHeight(panelHeight, DIALOG_CHROME)}px` }}
      >
        <p className="dialog__note">
          What kind of assets does <strong>{folderName}</strong> hold? Libraries are grouped by
          category, so this is how you will find them later.
        </p>

        <div className="category-options">
          {/*
            Pressables: the chip's only selected-state signal is
            `.chip[data-active]`, and a native UXP button discards it - so
            tapping a category produced no visible change at all.
          */}
          {categories.map((category) => (
            <Pressable
              key={category}
              className="chip chip--large"
              active={chosen === category}
              onClick={() => {
                setSelected(category);
                setCustom('');
              }}
            >
              {category}
            </Pressable>
          ))}
        </div>

        <label className="field col">
          <span className="field__label">Or create a new category</span>
          <input
            className="text-input"
            type="text"
            placeholder="e.g. Client Logos"
            value={custom}
            onChange={(event) => setCustom(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && chosen) onConfirm(chosen);
            }}
          />
        </label>
      </div>

      <div className="action-bar__row row gap-2">
        <Pressable className="button fill" onClick={onCancel}>
          Cancel
        </Pressable>
        <Pressable
          className="button button--primary fill"
          disabled={!chosen}
          title={chosen ? undefined : 'Pick or type a category first'}
          onClick={() => onConfirm(chosen)}
        >
          {current ? 'Move' : 'Add Library'}
        </Pressable>
      </div>
    </div>
  );
}
