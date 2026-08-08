/**
 * In-panel self-test harness - the roadmap's Phase 0 technical spike.
 *
 * WHY THIS EXISTS
 * The spike ("prove the riskiest Photoshop and filesystem operations") cannot be
 * performed on a build machine, because Photoshop only runs on macOS and
 * Windows and UXP APIs have no emulator. Rather than assume the descriptors and
 * APIs behave as documented, this harness exercises them inside the real host
 * and reports what actually happened.
 *
 * Every check is read-only or self-cleaning. The one destructive check -
 * inserting an asset - is opt-in and clearly labelled.
 */
import { getServices } from '../app/services';
import { modalQueue } from '../adapters/photoshop/modal-queue';
import { resolveInsertionTarget } from '../adapters/photoshop/active-artboard';
import { boundsHeight, boundsWidth } from '../utils/geometry';
import { logger } from '../utils/logger';
import { photoshop, uxp } from '../adapters/host';

export type CheckStatus = 'pass' | 'fail' | 'skip' | 'warn';

export interface CheckResult {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly detail: string;
}

type Check = () => Promise<Omit<CheckResult, 'id' | 'label'>>;



/** Runs one check, converting a throw into a `fail` rather than aborting the run. */
async function runCheck(id: string, label: string, check: Check): Promise<CheckResult> {
  try {
    const outcome = await check();
    return { id, label, ...outcome };
  } catch (error) {
    return {
      id,
      label,
      status: 'fail',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

const CHECKS: ReadonlyArray<{ id: string; label: string; run: Check }> = [
  {
    id: 'host',
    label: 'UXP host and version',
    run: async () => {
      const host = uxp().host;
      const versions = uxp().versions;
      const detail = `${host?.name ?? '?'} ${host?.version ?? '?'} / UXP ${versions?.uxp ?? '?'}`;

      // The manifest requires Photoshop 25+; anything lower is unsupported.
      const major = Number.parseInt(String(host?.version ?? '0'), 10);
      if (Number.isFinite(major) && major > 0 && major < 25) {
        return { status: 'warn' as const, detail: `${detail} - below the supported minimum of 25` };
      }
      return { status: 'pass' as const, detail };
    },
  },

  {
    id: 'dataFolder',
    label: 'Plugin data folder is writable',
    run: async () => {
      const { storage } = getServices();
      const probe = 'logs/.selftest-probe';
      const payload = `probe-${'x'.repeat(16)}`;

      await storage.writeText(probe, payload);
      const readBack = await storage.readText(probe);
      const nativePath = await storage.nativePathFor(probe);
      await storage.deleteFile(probe);

      if (readBack !== payload) {
        return { status: 'fail' as const, detail: 'Wrote the probe file but read back different content.' };
      }
      return {
        status: 'pass' as const,
        detail: nativePath ? `Verified at ${nativePath}` : 'Verified (no native path reported)',
      };
    },
  },

  {
    id: 'binaryWrite',
    label: 'Binary cache writes (thumbnail storage)',
    run: async () => {
      const { storage } = getServices();
      const probe = 'logs/.selftest-binary';
      const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

      await storage.writeBinary(probe, bytes.buffer);
      const exists = await storage.exists(probe);
      const nativePath = await storage.nativePathFor(probe);
      await storage.deleteFile(probe);

      return exists
        ? { status: 'pass' as const, detail: `Binary file written and resolved${nativePath ? ' to a native path' : ''}.` }
        : { status: 'fail' as const, detail: 'Binary file did not exist after writing.' };
    },
  },

  {
    id: 'persistentToken',
    label: 'Persistent folder tokens (libraries survive restart)',
    run: async () => {
      const folders = (await getServices().foldersStore.load()) ?? [];
      if (folders.length === 0) {
        return { status: 'skip' as const, detail: 'Add a library first, then re-run.' };
      }

      const withToken = folders.filter((folder) => folder.persistentToken);
      if (withToken.length === folders.length) {
        return { status: 'pass' as const, detail: `All ${folders.length} libraries hold a persistent token.` };
      }
      return {
        status: 'warn' as const,
        detail: `${folders.length - withToken.length} of ${folders.length} libraries have no token and will need reconnecting after a restart.`,
      };
    },
  },

  {
    id: 'modal',
    label: 'executeAsModal and the modal queue',
    run: async () => {
      const value = await modalQueue.run({ commandName: 'Asset Browser self-test' }, async () => 42);
      return value === 42
        ? { status: 'pass' as const, detail: 'A modal scope was entered and exited cleanly.' }
        : { status: 'fail' as const, detail: 'The modal task returned an unexpected value.' };
    },
  },

  {
    id: 'activeDocument',
    label: 'Active document detection',
    run: async () => {
      const doc = photoshop().app.activeDocument;
      if (!doc) {
        return { status: 'skip' as const, detail: 'No document is open. Open one and re-run.' };
      }
      return {
        status: 'pass' as const,
        detail: `"${doc.title}" ${Math.round(doc.width)} x ${Math.round(doc.height)} px`,
      };
    },
  },

  {
    id: 'artboard',
    label: 'Artboard targeting',
    run: async () => {
      if (!photoshop().app.activeDocument) {
        return { status: 'skip' as const, detail: 'No document is open. Open one and re-run.' };
      }

      const target = await resolveInsertionTarget();
      const size = `${Math.round(boundsWidth(target.bounds))} x ${Math.round(boundsHeight(target.bounds))}`;

      // Falling back to the canvas is correct behaviour in a document without
      // artboards, so it is reported as a pass with the strategy named.
      const detail = `strategy: ${target.strategy}${target.artboardName ? ` ("${target.artboardName}")` : ''}, target ${size} px`;

      return target.strategy === 'documentFallback'
        ? { status: 'warn' as const, detail: `${detail} - document dimensions were unreadable.` }
        : { status: 'pass' as const, detail };
    },
  },

  {
    id: 'imaging',
    label: 'Imaging API (preview generation for PSD, PDF, AI)',
    run: async () => {
      const doc = photoshop().app.activeDocument;
      if (!doc) {
        return { status: 'skip' as const, detail: 'No document is open. Open one and re-run.' };
      }

      return modalQueue.run({ commandName: 'Asset Browser imaging test' }, async () => {
        const result = await photoshop().imaging.getPixels({
          documentID: doc.id,
          targetSize: { width: 64, height: 64 },
          colorSpace: 'RGB',
          applyAlpha: true,
          componentSize: 8,
        });

        try {
          const encoded = await photoshop().imaging.encodeImageData({
            imageData: result.imageData,
            base64: true,
          });

          if (typeof encoded !== 'string' || encoded.length === 0) {
            return { status: 'fail' as const, detail: 'encodeImageData did not return base64 data.' };
          }
          return {
            status: 'pass' as const,
            detail: `Sampled ${result.imageData.width} x ${result.imageData.height} and encoded ${encoded.length} base64 chars.`,
          };
        } finally {
          // Mandatory: Photoshop images are large enough that leaking one shows.
          result.imageData.dispose();
        }
      });
    },
  },

  {
    id: 'imgFileScheme',
    label: 'Direct file: rendering (raster and SVG thumbnails)',
    run: async () => {
      const assets = (await getServices().assetsStore.load()) ?? [];
      const direct = assets.find((asset) => asset.type === 'raster' || asset.type === 'svg');

      if (!direct) {
        return { status: 'skip' as const, detail: 'Index a library containing an image first.' };
      }

      // Confirms the entry resolves; the actual <img> load is verified visually
      // in the grid, which is the only place UXP can prove it.
      const entry = await uxp().storage.localFileSystem.getEntryWithUrl(
        `file:${direct.nativePath}`,
      );

      return entry?.isFile
        ? { status: 'pass' as const, detail: `Resolved ${direct.name} via the file: scheme.` }
        : { status: 'fail' as const, detail: 'The file: URL did not resolve to a file entry.' };
    },
  },
];

export async function runSelfTest(): Promise<CheckResult[]> {
  logger.info('selftest', 'Starting self-test');

  const results: CheckResult[] = [];
  for (const check of CHECKS) {
    results.push(await runCheck(check.id, check.label, check.run));
  }

  const failed = results.filter((result) => result.status === 'fail').length;
  logger.info('selftest', `Self-test complete: ${failed} failure(s) of ${results.length} checks`);

  return results;
}

/** Formats results for the diagnostics report and for pasting into a bug report. */
export function formatSelfTestResults(results: readonly CheckResult[]): string {
  return results
    .map((result) => `[${result.status.toUpperCase().padEnd(4)}] ${result.label}\n         ${result.detail}`)
    .join('\n');
}
