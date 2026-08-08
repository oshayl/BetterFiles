/**
 * Diagnostics export (roadmap section 39).
 *
 * Writes the in-memory log plus environment details to the plugin data folder,
 * so a user can send one file when reporting a problem. Deliberately contains
 * no asset contents - only paths, counts and error text.
 */
import { getServices } from '../app/services';
import { formatLogEntries, logger } from '../utils/logger';
import { useStore } from '../app/store';
import { uxp } from '../adapters/host';

function safeHostInfo(): string {
  try {
    const host = uxp();
    return [
      `host: ${host.host?.name ?? 'unknown'} ${host.host?.version ?? ''}`,
      `uxp: ${host.versions?.uxp ?? 'unknown'}`,
      `plugin: ${host.versions?.plugin ?? 'unknown'}`,
    ].join('\n');
  } catch (error) {
    return `host: unavailable (${String(error)})`;
  }
}

/** Writes a diagnostics report and returns its path. */
export async function exportDiagnostics(): Promise<string | null> {
  const services = getServices();
  const state = useStore.getState();

  let cacheBytes = 0;
  let cacheFiles = 0;
  try {
    const files = await services.cache.list();
    cacheFiles = files.length;
    cacheBytes = files.reduce((sum, file) => sum + file.sizeBytes, 0);
  } catch {
    /* cache stats are best-effort */
  }

  const report = [
    '=== Asset Browser Diagnostics ===',
    '',
    safeHostInfo(),
    '',
    `libraries: ${state.folders.length}`,
    `indexed assets: ${state.assets.length}`,
    `cache: ${cacheFiles} files, ${(cacheBytes / 1024 / 1024).toFixed(1)} MB`,
    '',
    '--- libraries ---',
    ...state.folders.map(
      (folder) =>
        `${folder.isAvailable ? 'ok  ' : 'OFF '} ${folder.displayName} :: ${folder.nativePath} ` +
        `(subfolders: ${folder.includeSubfolders}, token: ${folder.persistentToken ? 'yes' : 'no'}, assets: ${folder.assetCount ?? '?'})`,
    ),
    '',
    '--- log ---',
    formatLogEntries(logger.snapshot()),
    '',
  ].join('\n');

  const path = 'logs/diagnostics.log';
  try {
    await services.storage.writeText(path, report);
    return (await services.storage.nativePathFor(path)) ?? path;
  } catch (error) {
    logger.error('diagnostics', 'Could not write diagnostics report', error);
    return null;
  }
}
