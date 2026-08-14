/**
 * Panel header (roadmap section 10.1).
 *
 * Minimal height, pinned, no decorative branding that eats workspace. Doubles
 * as the indexing indicator so progress never needs its own row. In compact
 * mode the title is dropped rather than truncated - the icons are what matter
 * when space is tight.
 */
import type { ReactElement } from 'react';
import type { IndexingState } from '../../app/store';
import type { Theme } from '../../models/settings';
import { SettingsIcon, SidebarIcon, ThemeIcon, ToolsIcon } from '../icons';
import { Pressable } from '../controls/Pressable';

interface PanelHeaderProps {
  readonly indexing: IndexingState | null;
  readonly compact: boolean;
  readonly theme: Theme;
  readonly sidebarVisible: boolean;
  readonly onToggleSidebar: () => void;
  readonly onToggleTheme: () => void;
  readonly onOpenTools: () => void;
  readonly onOpenSettings: () => void;
}

export function PanelHeader({
  indexing,
  compact,
  theme,
  sidebarVisible,
  onToggleSidebar,
  onToggleTheme,
  onOpenTools,
  onOpenSettings,
}: PanelHeaderProps): ReactElement {
  return (
    <div className="panel-header no-shrink" data-measure="header">
      {/*
        Pressables, not buttons. A native UXP button flattens its children into
        one text label, and these icons are background-image spans with no text
        - as buttons they rendered as empty grey pills, and `data-active` (the
        only signal that the sidebar is showing) was dropped with them.
      */}
      <Pressable
        className="button button--ghost button--icon"
        title={sidebarVisible ? 'Hide libraries' : 'Show libraries'}
        active={sidebarVisible}
        onClick={onToggleSidebar}
      >
        <SidebarIcon size={16} />
      </Pressable>

      {!compact && <span className="panel-header__title">ASSET BROWSER</span>}

      {indexing && (
        <span className="panel-header__status truncate">
          Indexing {indexing.scanned.toLocaleString()}
        </span>
      )}

      <span className="spacer" />

      <Pressable
        className="button button--ghost button--icon"
        title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
        onClick={onToggleTheme}
      >
        <ThemeIcon size={16} dark={theme === 'light'} />
      </Pressable>

      <Pressable
        className="button button--ghost button--icon"
        title="Quick tools"
        onClick={onOpenTools}
      >
        <ToolsIcon size={16} />
      </Pressable>

      <Pressable
        className="button button--ghost button--icon"
        title="Settings"
        onClick={onOpenSettings}
      >
        <SettingsIcon size={16} />
      </Pressable>
    </div>
  );
}
