/**
 * Quick tools overlay.
 *
 * Deliberately an overlay rather than a permanent strip: in a narrow docked
 * panel every row of chrome competes with the asset grid.
 *
 * Destructive tools arm on first click and run on the second, which is shown
 * inline as "Confirm?" - purging discards undo history irreversibly.
 */
import { type ReactElement, useState } from 'react';
import {
  type QuickTool,
  type ToolResult,
  QUICK_TOOLS,
  TOOL_GROUP_LABELS,
  runQuickTool,
} from '../../services/quick-tools.service';
import { CloseIcon } from '../icons';
import { Pressable } from '../controls/Pressable';
import { dialogBodyHeight } from '../../utils/layout';

interface ToolsPanelProps {
  readonly hasDocument: boolean;
  /** Measured panel height; the body needs an explicit one to scroll in UXP. */
  readonly panelHeight: number;
  readonly onClose: () => void;
}

/** Header, plus the result notification when one is showing. */
const DIALOG_CHROME = 28;
const NOTIFICATION_HEIGHT = 28;

export function ToolsPanel({ hasDocument, panelHeight, onClose }: ToolsPanelProps): ReactElement {
  const [armed, setArmed] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<ToolResult | null>(null);

  const activate = async (tool: QuickTool) => {
    // First click on a destructive tool only arms it.
    if (tool.destructive && armed !== tool.id) {
      setArmed(tool.id);
      setResult(null);
      return;
    }

    setArmed(null);
    setRunning(tool.id);
    try {
      setResult(await runQuickTool(tool));
    } finally {
      setRunning(null);
    }
  };

  const groups = (['memory', 'document', 'layer', 'plugin'] as const).map((group) => ({
    group,
    tools: QUICK_TOOLS.filter((tool) => tool.group === group),
  }));

  return (
    <div className="dialog">
      <div className="dialog__header row">
        <span className="dialog__title">Quick Tools</span>
        <span className="spacer" />
        <Pressable className="button button--ghost button--icon" title="Close" onClick={onClose}>
          <CloseIcon size={12} />
        </Pressable>
      </div>

      {/* Explicit height: UXP does not bound a flex child, so a full tool list
          would grow past the panel and be clipped. See utils/layout.ts. */}
      <div
        className="dialog__body scroll-y"
        style={{
          height: `${dialogBodyHeight(
            panelHeight,
            DIALOG_CHROME + (result ? NOTIFICATION_HEIGHT : 0),
          )}px`,
        }}
      >
        {!hasDocument && (
          <p className="dialog__note">
            No document is open. Tools that act on a document are disabled.
          </p>
        )}

        {groups.map(({ group, tools }) => (
          <section className="dialog__section" key={group}>
            <div className="section-label">{TOOL_GROUP_LABELS[group]}</div>

            <div className="tool-grid">
              {tools.map((tool) => {
                const disabled = (tool.needsDocument && !hasDocument) || running === tool.id;
                const isArmed = armed === tool.id;

                /*
                  A Pressable, not a button. UXP flattened the label and hint
                  into one run-together string ("Purge All CachesDiscards undo
                  history irreversibly") and ignored `.tool`'s column layout;
                  it also dropped `[data-armed]`, so the two-click confirm on a
                  destructive tool gave no sign it had armed.
                */
                return (
                  <Pressable
                    key={tool.id}
                    className="tool"
                    active={isArmed}
                    disabled={disabled}
                    title={tool.description}
                    label={tool.label}
                    onClick={() => void activate(tool)}
                  >
                    <span className="tool__label">
                      {running === tool.id ? 'Working...' : isArmed ? 'Confirm?' : tool.label}
                    </span>
                    <span className="tool__hint truncate">{tool.description}</span>
                  </Pressable>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {result && (
        <div className="notification" data-kind={result.ok ? 'info' : 'error'}>
          <span className="notification__text">{result.message}</span>
          <Pressable className="notification__close" onClick={() => setResult(null)}>
            Dismiss
          </Pressable>
        </div>
      )}
    </div>
  );
}
