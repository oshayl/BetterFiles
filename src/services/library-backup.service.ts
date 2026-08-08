/**
 * Reading and writing the portable library config.
 *
 * Uses only UXP calls already proven in this plugin: `getFolder()` to choose a
 * destination and `Folder.createFile()` to write, rather than
 * `getFileForSaving()` which is not part of the verified surface in
 * types/uxp.d.ts. See docs/UXP-CONSTRAINTS.md.
 */
import type { storage as UxpStorage } from 'uxp';
import {
  LIBRARY_CONFIG_FILENAME,
  type LibraryConfig,
  LibraryConfigError,
  parseLibraryConfig,
  serialiseLibraryConfig,
} from '../models/library-config';
import { logger } from '../utils/logger';
import { uxp } from '../adapters/host';

type File = UxpStorage.File;

export interface BackupWriteResult {
  readonly nativePath: string;
  readonly libraryCount: number;
}

/**
 * Writes the config to a folder the user picks. Returns null when they cancel.
 */
export async function writeLibraryBackup(config: LibraryConfig): Promise<BackupWriteResult | null> {
  const destination = await uxp().storage.localFileSystem.getFolder();
  if (!destination) return null;

  const file = await destination.createFile(LIBRARY_CONFIG_FILENAME, { overwrite: true });
  await file.write(serialiseLibraryConfig(config), { format: uxp().storage.formats.utf8 });

  logger.info('backup', `Wrote ${config.libraries.length} libraries to ${file.nativePath}`);

  return { nativePath: file.nativePath, libraryCount: config.libraries.length };
}

/**
 * Reads a config the user picks. Returns null when they cancel.
 *
 * Throws `LibraryConfigError` when the file is not a backup, so the caller can
 * tell "wrong file" apart from "no file chosen".
 */
export async function readLibraryBackup(): Promise<LibraryConfig | null> {
  const picked = await uxp().storage.localFileSystem.getFileForOpening({ types: ['json'] });
  if (!picked) return null;

  const file = (Array.isArray(picked) ? picked[0] : picked) as File | undefined;
  if (!file) return null;

  const contents = await file.read({ format: uxp().storage.formats.utf8 });
  if (typeof contents !== 'string') {
    throw new LibraryConfigError('The backup could not be read as text.');
  }

  const config = parseLibraryConfig(contents);
  logger.info('backup', `Read ${config.libraries.length} libraries from ${file.nativePath}`);
  return config;
}
