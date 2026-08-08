/**
 * Bottom action bar (roadmap section 10.7).
 *
 * Insert is the single primary action - an inverted white block, the only
 * high-contrast element in the panel.
 */
import { type ReactElement, useState } from 'react';
import type { AssetRecord } from '../../models/asset';
import type { PlacementMode } from '../../models/import-options';
import { Pressable } from '../controls/Pressable';

interface ActionBarProps {
  readonly asset: AssetRecord | null;
  readonly inserting: boolean;
  readonly compact: boolean;
  readonly onInsert: (mode?: PlacementMode) => void;
  readonly onReveal: () => void;
}

const MORE_ACTIONS: ReadonlyArray<{ mode: PlacementMode; label: string }> = [
  { mode: 'linkedSmartObject', label: 'Insert as Linked Smart Object' },
  { mode: 'rasterized', label: 'Insert and Rasterise' },
  { mode: 'openDocument', label: 'Open as Document' },
];

export function ActionBar({
  asset,
  inserting,
  compact,
  onInsert,
  onReveal,
}: ActionBarProps): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const disabled = asset == null || inserting;

  return (
    <div className="action-bar no-shrink" data-measure="actionBar">
      {menuOpen && !disabled && (
        <div className="action-menu">
          {MORE_ACTIONS.map((action) => (
            <button
              key={action.mode}
              onClick={() => {
                setMenuOpen(false);
                onInsert(action.mode);
              }}
            >
              {action.label}
            </button>
          ))}
          <button
            onClick={() => {
              setMenuOpen(false);
              onReveal();
            }}
          >
            Reveal in File Manager
          </button>
        </div>
      )}

      {/*
        Divs, not buttons. A native UXP button ignores the 22px height these
        are given, so the row rendered taller than the layout allowed for and
        pushed itself off the bottom of the panel.
      */}
      <div className="action-bar__row row gap-2">
        <Pressable
          className="button button--primary fill"
          disabled={disabled}
          title={asset ? `Insert ${asset.name} into the active document` : 'Select an asset first'}
          onClick={() => onInsert()}
        >
          {inserting ? 'Inserting...' : compact ? 'Insert' : 'Insert Asset'}
        </Pressable>

        <Pressable
          className="button"
          disabled={disabled}
          title="More insert options"
          onClick={() => setMenuOpen((value) => !value)}
        >
          ...
        </Pressable>
      </div>
    </div>
  );
}
