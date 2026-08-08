/**
 * Settings, cache management and diagnostics (roadmap sections 24 and 26).
 *
 * Also the entry point for the self-test harness, which is the only way to
 * verify the Photoshop integration - it cannot be checked on a build machine.
 */
import { type ReactElement, useState } from 'react';
import { useStore } from '../../app/store';
import { SelfTestPanel } from '../diagnostics/SelfTestPanel';
import { exportDiagnostics } from '../../services/diagnostics.service';
import { CloseIcon } from '../icons';
import { Pressable } from './Pressable';

interface SettingsDialogProps {
  readonly onClose: () => void;
}

export function SettingsDialog({ onClose }: SettingsDialogProps): ReactElement {
  const state = useStore();
  const [tab, setTab] = useState<'general' | 'selftest'>('general');
  const [diagnosticsPath, setDiagnosticsPath] = useState<string | null>(null);

  return (
    <div className="dialog">
      <div className="dialog__header row">
        <span className="dialog__title">Settings</span>
        <span className="spacer" />
        <button className="button button--ghost button--icon" title="Close" onClick={onClose}>
          <CloseIcon size={12} />
        </button>
      </div>

      <div className="dialog__tabs row">
        <button
          className="tab"
          data-active={tab === 'general' ? 'true' : 'false'}
          onClick={() => setTab('general')}
        >
          General
        </button>
        <button
          className="tab"
          data-active={tab === 'selftest' ? 'true' : 'false'}
          onClick={() => setTab('selftest')}
        >
          Self-Test
        </button>
      </div>

      <div className="dialog__body scroll-y">
        {tab === 'general' ? (
          <>
            <section className="dialog__section">
              <div className="section-label">Insertion</div>

              <label className="field row">
                <input
                  type="checkbox"
                  checked={state.settings.importOptions.scaleToFit}
                  onChange={(event) =>
                    state.setImportOptions({ scaleToFit: event.currentTarget.checked })
                  }
                />
                <span>Scale oversized assets to fit</span>
              </label>

              <label className="field row">
                <input
                  type="checkbox"
                  checked={state.settings.importOptions.enterFreeTransform}
                  onChange={(event) =>
                    state.setImportOptions({ enterFreeTransform: event.currentTarget.checked })
                  }
                />
                <span>Start Free Transform after inserting</span>
              </label>

              <label className="field col">
                <span className="field__label">
                  Maximum coverage of the artboard:{' '}
                  {Math.round(state.settings.importOptions.maxCanvasCoverage * 100)}%
                </span>
                <input
                  className="slider"
                  type="range"
                  min={10}
                  max={100}
                  step={5}
                  value={Math.round(state.settings.importOptions.maxCanvasCoverage * 100)}
                  onChange={(event) =>
                    state.setImportOptions({
                      maxCanvasCoverage: Number(event.currentTarget.value) / 100,
                    })
                  }
                />
              </label>
            </section>

            <section className="dialog__section">
              <div className="section-label">Appearance</div>

              <label className="field col">
                <span className="field__label">Theme</span>
                <select
                  className="select"
                  value={state.settings.theme}
                  onChange={(event) =>
                    state.setTheme(event.currentTarget.value as 'light' | 'dark')
                  }
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </label>

              <label className="field col">
                <span className="field__label">
                  Thumbnail backdrop - pick whichever makes your artwork readable
                </span>
                <select
                  className="select"
                  value={state.settings.thumbnailBackground}
                  onChange={(event) =>
                    state.setThumbnailBackground(
                      event.currentTarget.value as 'checker' | 'light' | 'dark',
                    )
                  }
                >
                  <option value="checker">Checkerboard</option>
                  <option value="light">Light (for dark artwork)</option>
                  <option value="dark">Dark (for light artwork)</option>
                </select>
              </label>

              <label className="field row">
                <input
                  type="checkbox"
                  checked={state.settings.groupByType}
                  onChange={() => state.setGroupByType(!state.settings.groupByType)}
                />
                <span>Group assets by type</span>
              </label>

              <label className="field row">
                <input
                  type="checkbox"
                  checked={state.settings.showPreviewPanel}
                  onChange={() => state.togglePreviewPanel()}
                />
                <span>Show the preview panel</span>
              </label>

              <label className="field row">
                <input
                  type="checkbox"
                  checked={state.settings.showSidebar}
                  onChange={() => state.setShowSidebar(!state.settings.showSidebar)}
                />
                <span>Show the libraries sidebar</span>
              </label>
            </section>

            <section className="dialog__section">
              <div className="section-label">Placing Assets</div>
              <p className="dialog__note">
                Photoshop&apos;s plugin platform cannot drag from a panel onto the canvas - no UXP
                plugin can do this. Instead: <strong>double-click</strong> an asset, press{' '}
                <strong>Enter</strong>, or use <strong>Insert Asset</strong>. It lands centred on
                the active artboard with Free Transform already running, so you can position it
                immediately.
              </p>
            </section>

            <section className="dialog__section">
              <div className="section-label">Backup Libraries</div>

              <p className="dialog__note">
                Your libraries live in the plugin&apos;s private storage, which survives plugin
                updates but not a Photoshop major upgrade, a reinstall through Creative Cloud, or a
                move to another machine. A backup is a small file holding the folder paths and
                categories - not the assets, and not the index, which is rebuilt on restore.
              </p>

              <Pressable className="button" onClick={() => void state.exportLibraries()}>
                Back Up Libraries
              </Pressable>

              <Pressable className="button" onClick={() => void state.importLibraries()}>
                Restore Libraries
              </Pressable>
            </section>

            <section className="dialog__section">
              <div className="section-label">Cache and Data</div>

              <p className="dialog__note">
                Previews are stored inside the plugin&apos;s own data folder. Original files are
                never modified, and nothing is uploaded.
              </p>

              <button className="button" onClick={() => void state.clearCache()}>
                Clear Preview Cache
              </button>

              <button
                className="button"
                onClick={() => {
                  void exportDiagnostics().then(setDiagnosticsPath);
                }}
              >
                Export Diagnostics
              </button>

              {diagnosticsPath && <p className="dialog__note mono">Written to {diagnosticsPath}</p>}
            </section>
          </>
        ) : (
          <SelfTestPanel />
        )}
      </div>
    </div>
  );
}
