/**
 * Category picker shown when importing a library, or when re-filing one.
 *
 * Appears between choosing a folder and adding it, so a library is filed
 * correctly from the start rather than needing to be tidied up later.
 */
import { type ReactElement, useState } from 'react';
import { CloseIcon } from '../icons';

interface CategoryPickerProps {
  readonly title: string;
  readonly folderName: string;
  readonly categories: readonly string[];
  readonly current?: string;
  readonly onConfirm: (category: string) => void;
  readonly onCancel: () => void;
}

export function CategoryPicker({
  title,
  folderName,
  categories,
  current,
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
        <button className="button button--ghost button--icon" title="Cancel" onClick={onCancel}>
          <CloseIcon size={12} />
        </button>
      </div>

      <div className="dialog__body scroll-y">
        <p className="dialog__note">
          What kind of assets does <strong>{folderName}</strong> hold? Libraries are grouped by
          category, so this is how you will find them later.
        </p>

        <div className="category-options">
          {categories.map((category) => (
            <button
              key={category}
              className="chip chip--large"
              data-active={chosen === category ? 'true' : 'false'}
              onClick={() => {
                setSelected(category);
                setCustom('');
              }}
            >
              {category}
            </button>
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
        <button className="button fill" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="button button--primary fill"
          disabled={!chosen}
          onClick={() => onConfirm(chosen)}
        >
          {current ? 'Move' : 'Add Library'}
        </button>
      </div>
    </div>
  );
}
