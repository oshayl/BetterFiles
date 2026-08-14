/**
 * A button that UXP will actually style.
 *
 * WHY THIS EXISTS
 * Photoshop UXP renders `<button>` as a NATIVE control. It flattens the
 * element's children into a single text label and ignores most of the CSS box:
 * `display: flex`, `height`, `gap` and `text-align` all stop applying. The
 * visible consequences were a preview strip that asked for 20px and rendered
 * 30px, a strip label reading "Asset 12.svg890 B" with its caret missing, and
 * every icon-only button rendering as an empty grey pill.
 *
 * The height one is not cosmetic: rows whose height comes from a button child
 * render taller than the layout arithmetic believes, which pushes the bottom of
 * the panel out of frame. See utils/layout.ts.
 *
 * A `<div>` carrying the same classes is styled normally, so this restores the
 * button's semantics - keyboard activation, focus, disabled - on an element UXP
 * leaves alone.
 */
import { Children } from 'react';
import type { CSSProperties, KeyboardEvent, ReactElement, ReactNode } from 'react';

interface PressableProps {
  readonly className?: string;
  readonly title?: string;
  /**
   * Accessible name, for icon-only controls. They render a background-image
   * span with no text, so without this they announce as an unnamed button.
   *
   * Deliberately NOT defaulted to `title`. A control that already has text
   * children gets its name from that text, and `title` here is a tooltip that
   * explains or qualifies - "<name> is unavailable - click to locate it
   * again", "Pick or type a category first". Falling back to it replaced a
   * short visible label with a long sentence as the announced name.
   */
  readonly label?: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly onClick: () => void;
  /** Mirrors `data-active`, used by the ghost-button styling. */
  readonly active?: boolean;
  /**
   * Keeps click and double-click from reaching an enclosing row. Nested
   * controls (the favourite star over an asset tile) must set this: the tile's
   * `onDoubleClick` inserts into the open document, so a star toggled twice
   * quickly would place the asset without being asked.
   */
  readonly stopPropagation?: boolean;
  /** Marks the control as a measured chrome row; see hooks/useMeasuredChrome. */
  readonly measure?: string;
  readonly style?: CSSProperties;
}

/**
 * Whether the control carries its own visible text to take a name from.
 *
 * Icon-only controls render an icon element and nothing else; text controls
 * pass a string, directly or from an expression. That is the whole distinction
 * this codebase needs - no call site wraps its only label in an element.
 *
 * Blank strings do not count. A control that renders `selected ? '✓' : ''` has
 * no text half the time, and treating the empty branch as text would leave it
 * unnamed in exactly that state. A control whose text is a bare glyph should
 * pass `label` explicitly - '✓' is not a name.
 */
function hasTextContent(children: ReactNode): boolean {
  return Children.toArray(children).some((child) =>
    typeof child === 'string' ? child.trim() !== '' : typeof child === 'number',
  );
}

export function Pressable({
  className,
  title,
  label,
  disabled = false,
  children,
  onClick,
  active,
  stopPropagation = false,
  measure,
  style,
}: PressableProps): ReactElement {
  const activate = () => {
    if (!disabled) onClick();
  };

  /*
   * ARIA name-from-content already names a control that has text, and an
   * aria-label would override it - announcing the tooltip's explanatory
   * sentence in place of the short visible label. Only fall back to `title`
   * when there is no text to take a name from.
   */
  const accessibleName = label ?? (hasTextContent(children) ? undefined : title);

  // Space and Enter are what a real button responds to; without this the
  // control would be reachable by keyboard but not operable by it.
  //
  // Propagation stops unconditionally. `useKeyboardShortcuts` listens on
  // `document` and only exempts INPUT/TEXTAREA, so an Enter that activated a
  // Pressable used to keep travelling and run the global handler too - which
  // inserts the selected asset into the open document. Anything that has
  // already been handled here is not also a panel shortcut.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    event.stopPropagation();
    activate();
  };

  return (
    <div
      className={className}
      title={title}
      style={style}
      data-measure={measure}
      role="button"
      aria-label={accessibleName}
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      data-active={active == null ? undefined : active ? 'true' : 'false'}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
        activate();
      }}
      onDoubleClick={stopPropagation ? (event) => event.stopPropagation() : undefined}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
