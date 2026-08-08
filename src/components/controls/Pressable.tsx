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
import type { KeyboardEvent, ReactElement, ReactNode } from 'react';

interface PressableProps {
  readonly className?: string;
  readonly title?: string;
  readonly disabled?: boolean;
  readonly children: ReactNode;
  readonly onClick: () => void;
  /** Mirrors `data-active`, used by the ghost-button styling. */
  readonly active?: boolean;
  readonly stopPropagation?: boolean;
  /** Marks the control as a measured chrome row; see hooks/useMeasuredChrome. */
  readonly measure?: string;
}

export function Pressable({
  className,
  title,
  disabled = false,
  children,
  onClick,
  active,
  stopPropagation = false,
  measure,
}: PressableProps): ReactElement {
  const activate = () => {
    if (!disabled) onClick();
  };

  // Space and Enter are what a real button responds to; without this the
  // control would be reachable by keyboard but not operable by it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (stopPropagation) event.stopPropagation();
    activate();
  };

  return (
    <div
      className={className}
      title={title}
      data-measure={measure}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled ? 'true' : undefined}
      data-disabled={disabled ? 'true' : undefined}
      data-active={active == null ? undefined : active ? 'true' : 'false'}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
        activate();
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}
