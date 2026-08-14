/**
 * Search input (roadmap section 10.2).
 *
 * Input is uncontrolled-feeling but debounced upstream, so typing stays
 * responsive on a large library while search itself runs on a settled value.
 */
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { useDebouncedValue } from '../hooks';
import { CloseIcon, SearchIcon } from '../icons';
import { Pressable } from './Pressable';

interface SearchBarProps {
  readonly value: string;
  readonly resultCount: number;
  readonly onChange: (query: string) => void;
  /** Set by the parent to focus the field from a keyboard shortcut. */
  readonly focusToken: number;
}

export function SearchBar({
  value,
  resultCount,
  onChange,
  focusToken,
}: SearchBarProps): ReactElement {
  const [text, setText] = useState(value);
  const debounced = useDebouncedValue(text, 120);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    onChange(debounced);
    // `onChange` is stable (a store action); depending on it would re-fire on
    // every store update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  // Keep in sync when the query is cleared from elsewhere (e.g. Escape).
  useEffect(() => {
    if (value !== debounced) setText(value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (focusToken > 0) inputRef.current?.focus();
  }, [focusToken]);

  return (
    <div className="search-bar no-shrink" data-measure="search">
      <SearchIcon size={12} className="search-bar__icon" />

      <input
        ref={inputRef}
        className="search-bar__input"
        type="text"
        placeholder="Search assets..."
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setText('');
            event.currentTarget.blur();
          }
        }}
      />

      {text !== '' && (
        <>
          <span className="search-bar__count">{resultCount.toLocaleString()}</span>
          <Pressable className="search-bar__clear" title="Clear search" onClick={() => setText('')}>
            <CloseIcon size={12} />
          </Pressable>
        </>
      )}
    </div>
  );
}
