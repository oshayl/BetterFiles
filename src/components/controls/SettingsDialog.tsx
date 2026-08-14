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
import { dialogBodyHeight } from '../../utils/layout';
import { THUMBNAIL_SIZE_RANGE } from '../../models/settings';

interface SettingsDialogProps {
  /** Measured panel height; the body needs an explicit one to scroll in UXP. */
  readonly panelHeight: number;
  readonly onClose: () => void;
}

/** Header plus the tab strip. See `dialogBodyHeight`. */
const DIALOG_CHROME = 52;

/**
 * A numeric setting adjusted by two Pressables rather than `input[type=range]`.
 *
 * UXP implements a subset of HTML controls and renders those it does support
 * natively, ignoring the CSS box - which is why `<button>` is banned outright
 * (see Pressable.tsx and docs/UXP-CONSTRAINTS.md). Nothing has verified that
 * `range` is in that subset, and these settings are the ONLY way to reach the
 * values behind them, so they are built from the primitive already proven to
 * work in Photoshop instead of from one that merely ought to.
 *
 * Swap this back for a slider if and when a self-test check confirms `range`
 * renders and reports input correctly.
 */
function StepperField({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly display: string;
  readonly onChange: (next: number) => void;
}): ReactElement {
  const clamp = (next: number) => Math.min(max, Math.max(min, next));

  return (
    <div className="field col">
      <span className="field__label">{label}</span>
      <div className="stepper row gap-2">
        <Pressable
          className="button button--icon"
          label={`Decrease ${label}`}
          disabled={value <= min}
          onClick={() => onChange(clamp(value - step))}
        >
          &minus;
        </Pressable>
        <span className="stepper__value">{display}</span>
        <Pressable
          className="button button--icon"
          label={`Increase ${label}`}
          disabled={value >= max}
          onClick={() => onChange(clamp(value + step))}
        >
          +
        </Pressable>
      </div>
    </div>
  );
}

export function SettingsDialog({ panelHeight, onClose }: SettingsDialogProps): ReactElement {
  const state = useStore();
  const [tab, setTab] = useState<'general' | 'selftest'>('general');
  const [diagnosticsPath, setDiagnosticsPath] = useState<string | null>(null);

  return (
    <div className="dialog">
      <div className="dialog__header row">
        <span className="dialog__title">Settings</span>
        <span className="spacer" />
        <Pressable className="button button--ghost button--icon" title="Close" onClick={onClose}>
          <CloseIcon size={12} />
        </Pressable>
      </div>

      {/*
        `.tab` marks the current tab with a border-bottom and `data-active`
        colouring, both of which a native UXP button drops - the two tabs
        looked identical and there was no way to tell which one was open.
      */}
      <div className="dialog__tabs row">
        <Pressable className="tab" active={tab === 'general'} onClick={() => setTab('general')}>
          General
        </Pressable>
        <Pressable className="tab" active={tab === 'selftest'} onClick={() => setTab('selftest')}>
          Self-Test
        </Pressable>
      </div>

      {/* Explicit height: UXP does not bound a flex child, so the body would
          grow to fit and clip its own lower sections. See utils/layout.ts. */}
      <div
        className="dialog__body scroll-y"
        style={{ height: `${dialogBodyHeight(panelHeight, DIALOG_CHROME)}px` }}
      >
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

              <StepperField
                label="Maximum coverage of the artboard"
                value={Math.round(state.settings.importOptions.maxCanvasCoverage * 100)}
                min={10}
                max={100}
                step={5}
                display={`${Math.round(state.settings.importOptions.maxCanvasCoverage * 100)}%`}
                onChange={(next) => state.setImportOptions({ maxCanvasCoverage: next / 100 })}
              />
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

              {/*
                The only way to change tile size. `setThumbnailSize` and
                THUMBNAIL_SIZE_RANGE existed and were persisted, but nothing
                anywhere called them - the grid was stuck at the 72px default
                however wide the panel got.
              */}
              <StepperField
                label="Thumbnail size"
                value={state.settings.thumbnailSize}
                min={THUMBNAIL_SIZE_RANGE.min}
                max={THUMBNAIL_SIZE_RANGE.max}
                step={THUMBNAIL_SIZE_RANGE.step}
                display={`${state.settings.thumbnailSize}px`}
                onChange={(next) => state.setThumbnailSize(next)}
              />

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

              {/*
                Pressables like the two above. As native buttons these rendered
                at the host's own height, so four buttons meant to match came
                out as two mismatched pairs.
              */}
              <Pressable className="button" onClick={() => void state.clearCache()}>
                Clear Preview Cache
              </Pressable>

              <Pressable
                className="button"
                onClick={() => {
                  void exportDiagnostics().then(setDiagnosticsPath);
                }}
              >
                Export Diagnostics
              </Pressable>

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
