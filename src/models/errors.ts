/**
 * Error model (roadmap section 25).
 *
 * Two separate channels by design: `message` is shown to the user and must be
 * direct and specific; `detail` carries the technical cause and only ever
 * reaches the diagnostics log.
 */

export type AssetBrowserErrorCode =
  | 'FOLDER_PERMISSION_DENIED'
  | 'FOLDER_REAUTHORIZATION_REQUIRED'
  | 'FOLDER_MISSING'
  | 'DRIVE_OFFLINE'
  | 'FILE_MISSING'
  | 'UNSUPPORTED_FORMAT'
  | 'PREVIEW_FAILED'
  | 'IMPORT_FAILED'
  | 'NO_ACTIVE_DOCUMENT'
  | 'NO_ACTIVE_ARTBOARD'
  | 'PHOTOSHOP_MODAL_BUSY'
  | 'CACHE_WRITE_FAILED'
  | 'CACHE_READ_FAILED'
  | 'INDEX_CORRUPTED'
  | 'PDF_PASSWORD_PROTECTED'
  | 'AI_PREVIEW_UNAVAILABLE';

export class AssetBrowserError extends Error {
  readonly code: AssetBrowserErrorCode;
  readonly detail?: unknown;
  /** Whether offering a retry action makes sense for this failure. */
  readonly retryable: boolean;

  constructor(
    code: AssetBrowserErrorCode,
    options: { message?: string; detail?: unknown; retryable?: boolean } = {},
  ) {
    super(options.message ?? USER_MESSAGES[code]);
    this.name = 'AssetBrowserError';
    this.code = code;
    this.detail = options.detail;
    this.retryable = options.retryable ?? RETRYABLE_CODES.has(code);
  }
}

/**
 * User-facing copy. Direct and specific, never blaming, and always hinting at
 * the next action where one exists.
 */
export const USER_MESSAGES: Record<AssetBrowserErrorCode, string> = {
  FOLDER_PERMISSION_DENIED: 'Photoshop does not have permission to read this folder.',
  FOLDER_REAUTHORIZATION_REQUIRED: 'This library needs to be reconnected. Choose the folder again.',
  FOLDER_MISSING: 'This folder no longer exists at its saved location.',
  DRIVE_OFFLINE: 'The drive holding this library is not connected.',
  FILE_MISSING: 'This file has been moved or deleted.',
  UNSUPPORTED_FORMAT: 'This file type cannot be previewed or inserted.',
  PREVIEW_FAILED: 'Preview unavailable. The file may be damaged.',
  IMPORT_FAILED: 'The asset could not be placed into the document.',
  NO_ACTIVE_DOCUMENT: 'Open a document before inserting an asset.',
  NO_ACTIVE_ARTBOARD: 'No artboard is selected. The asset will be centred on the canvas.',
  PHOTOSHOP_MODAL_BUSY: 'Photoshop is busy with another operation. Try again in a moment.',
  CACHE_WRITE_FAILED: 'The preview cache could not be written.',
  CACHE_READ_FAILED: 'The preview cache could not be read.',
  INDEX_CORRUPTED: 'The asset index was damaged and has been rebuilt.',
  PDF_PASSWORD_PROTECTED: 'This PDF is password protected.',
  AI_PREVIEW_UNAVAILABLE:
    'Preview unavailable. The Illustrator file may not include a PDF-compatible preview.',
};

/** Failures worth offering a retry for; the rest need user action first. */
const RETRYABLE_CODES = new Set<AssetBrowserErrorCode>([
  'PREVIEW_FAILED',
  'IMPORT_FAILED',
  'PHOTOSHOP_MODAL_BUSY',
  'CACHE_WRITE_FAILED',
  'CACHE_READ_FAILED',
  'DRIVE_OFFLINE',
]);

/**
 * Normalises anything thrown into an `AssetBrowserError`. Host APIs reject with
 * plain strings and bare Errors, so callers cannot rely on instanceof.
 */
export function toAssetBrowserError(
  error: unknown,
  fallbackCode: AssetBrowserErrorCode,
): AssetBrowserError {
  if (error instanceof AssetBrowserError) return error;

  const text = error instanceof Error ? error.message : String(error);

  // Photoshop reports a busy modal scope as a plain message; map it so the UI
  // can offer "try again" instead of a generic failure.
  if (/modal|busy/i.test(text) && /photoshop|state/i.test(text)) {
    return new AssetBrowserError('PHOTOSHOP_MODAL_BUSY', { detail: error });
  }
  if (/no such file|not found|ENOENT/i.test(text)) {
    return new AssetBrowserError('FILE_MISSING', { detail: error });
  }
  if (/permission|EACCES|denied/i.test(text)) {
    return new AssetBrowserError('FOLDER_PERMISSION_DENIED', { detail: error });
  }

  return new AssetBrowserError(fallbackCode, { detail: error });
}
