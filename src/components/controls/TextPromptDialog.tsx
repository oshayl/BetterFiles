/**
 * Single-field prompt.
 *
 * UXP has no `window.prompt`, so anything that asks for one string needs a real
 * dialog. Renaming a library is the first caller: `suggestDisplayName` guesses
 * a label from the folder name, which is a good starting point and a poor final
 * answer - a pack of folders named `01`, `02`, `03` produced three libraries
 * labelled exactly that, with nothing anywhere to change them.
 *
 * Short by design, so it needs no scroll region and no height arithmetic.
 */
import { type ReactElement, useState } from 'react';
import { CloseIcon } from '../icons';
import { Pressable } from './Pressable';

interface TextPromptDialogProps {
  readonly title: string;
  readonly label: string;
  readonly initialValue: string;
  readonly confirmLabel: string;
  readonly onConfirm: (value: string) => void;
  readonly onCancel: () => void;
}

export function TextPromptDialog({
  title,
  label,
  initialValue,
  confirmLabel,
  onConfirm,
  onCancel,
}: TextPromptDialogProps): ReactElement {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();

  return (
    <div className="dialog">
      <div className="dialog__header row">
        <span className="dialog__title">{title}</span>
        <span className="spacer" />
        <Pressable className="button button--ghost button--icon" title="Cancel" onClick={onCancel}>
          <CloseIcon size={12} />
        </Pressable>
      </div>

      <div className="dialog__body">
        <label className="field col">
          <span className="field__label">{label}</span>
          <input
            className="text-input"
            type="text"
            autoFocus
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && trimmed !== '') onConfirm(trimmed);
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
          disabled={trimmed === ''}
          title={trimmed === '' ? 'Enter a name first' : undefined}
          onClick={() => onConfirm(trimmed)}
        >
          {confirmLabel}
        </Pressable>
      </div>
    </div>
  );
}
