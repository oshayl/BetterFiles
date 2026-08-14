/**
 * Self-test UI.
 *
 * Runs the Phase 0 spike checklist inside Photoshop and reports what actually
 * happened, since none of it can be verified on a build machine.
 */
import { type ReactElement, useState } from 'react';
import {
  type CheckResult,
  formatSelfTestResults,
  runSelfTest,
} from '../../services/self-test.service';
import { Pressable } from '../controls/Pressable';

export function SelfTestPanel(): ReactElement {
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = async () => {
    setRunning(true);
    try {
      setResults(await runSelfTest());
    } finally {
      setRunning(false);
    }
  };

  const failures = results?.filter((result) => result.status === 'fail').length ?? 0;
  const warnings = results?.filter((result) => result.status === 'warn').length ?? 0;

  return (
    <div className="selftest col">
      <p className="dialog__note">
        Verifies the Photoshop and filesystem integration inside the real host. Open a document
        first for the fullest coverage. All checks are read-only.
      </p>

      <Pressable className="button" disabled={running} onClick={() => void run()}>
        {running ? 'Running...' : 'Run Self-Test'}
      </Pressable>

      {results && (
        <>
          <div className="selftest__summary">
            {failures === 0 && warnings === 0
              ? `All ${results.length} checks passed.`
              : `${failures} failed, ${warnings} warning(s), ${results.length} total.`}
          </div>

          <div className="selftest__list col">
            {results.map((result) => (
              <div className="selftest__item col" key={result.id} data-status={result.status}>
                <div className="selftest__row row">
                  <span className="selftest__status">{result.status.toUpperCase()}</span>
                  <span className="selftest__label truncate">{result.label}</span>
                </div>
                <div className="selftest__detail">{result.detail}</div>
              </div>
            ))}
          </div>

          {/* Selectable so the user can copy it into a bug report. */}
          <textarea
            className="selftest__export mono"
            readOnly
            rows={6}
            value={formatSelfTestResults(results)}
          />
        </>
      )}
    </div>
  );
}
