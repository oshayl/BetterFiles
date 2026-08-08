/**
 * Generated previews for formats Photoshop must interpret (roadmap 19.5-19.7).
 *
 * PSD, PDF, AI and EPS cannot be handed to an `<img>` element, so the file is
 * opened as a temporary document, sampled through the Imaging API and closed
 * without saving.
 *
 * Two rules govern everything here:
 *   - `targetSize` is always supplied, so Photoshop serves a cached pyramid
 *     level rather than decoding the full canvas.
 *   - `imageData.dispose()` runs in a `finally`. Photoshop images are large
 *     enough that leaking one is immediately visible.
 */
import type { PhotoshopImageData } from 'photoshop';
import { decodeBase64 } from '../../utils/base64';
import { AssetBrowserError } from '../../models/errors';
import { extname } from '../../utils/path-utils';
import { logger } from '../../utils/logger';
import { photoshop } from '../host';


/** Formats opened through Photoshop's PDF import path. */
const PDF_FAMILY = new Set(['pdf', 'ai', 'eps']);

export interface GeneratePreviewOptions {
  readonly targetSize: number;
  /** 1-based page for multi-page PDFs. */
  readonly page?: number;
  /** Rasterisation resolution for vector sources. */
  readonly resolution?: number;
}

/**
 * Opens a file as a temporary document.
 *
 * Vector formats go through the PDF import descriptor so the rasterisation
 * settings and page number can be specified and the import dialog suppressed.
 */
async function openTemporaryDocument(
  token: string,
  extension: string,
  options: GeneratePreviewOptions,
): Promise<number> {
  const isPdfFamily = PDF_FAMILY.has(extension);

  const descriptor: Record<string, unknown> = isPdfFamily
    ? {
        _obj: 'open',
        null: { _path: token, _kind: 'local' },
        as: {
          _obj: 'PDFGenericFormat',
          antiAlias: true,
          // Bounding box keeps artwork tight rather than including page margins.
          cropTo: { _enum: 'cropTo', _value: 'boundingBox' },
          resolution: { _unit: 'densityUnit', _value: options.resolution ?? 72 },
          mode: { _enum: 'colorSpace', _value: 'RGBColor' },
          depth: 8,
          // Page selection is 1-based and only meaningful for multi-page PDFs.
          ...(options.page != null && options.page > 1
            ? { pageNumber: options.page, selection: { _enum: 'pdfSelection', _value: 'page' } }
            : {}),
        },
        _options: { dialogOptions: 'dontDisplay' },
      }
    : {
        _obj: 'open',
        null: { _path: token, _kind: 'local' },
        _options: { dialogOptions: 'dontDisplay' },
      };

  await photoshop().action.batchPlay([descriptor], {
    synchronousExecution: false,
    modalBehavior: 'execute',
  });

  const doc = photoshop().app.activeDocument;
  if (!doc) {
    throw new AssetBrowserError('PREVIEW_FAILED', {
      message: 'Photoshop did not open the file.',
    });
  }
  return doc.id;
}

/** Closes a document, discarding changes. */
async function closeWithoutSaving(documentId: number): Promise<void> {
  try {
    await photoshop().action.batchPlay(
      [
        {
          _obj: 'close',
          _target: [{ _ref: 'document', _id: documentId }],
          saving: { _enum: 'yesNo', _value: 'no' },
          _options: { dialogOptions: 'dontDisplay' },
        },
      ],
      { synchronousExecution: false, modalBehavior: 'execute' },
    );
  } catch (error) {
    // Leaving a stray document open is bad, but throwing here would mask the
    // original preview error. Log loudly instead.
    logger.error('preview', `Could not close temporary document ${documentId}`, error);
  }
}

/**
 * Samples the active document into a JPEG.
 *
 * `applyAlpha` flattens onto white because `encodeImageData` requires RGB
 * without alpha; `colorSpace: 'RGB'` also protects against CMYK documents,
 * where reading raw pixel data has been reported to crash Photoshop.
 */
async function encodeDocumentPreview(documentId: number, targetSize: number): Promise<ArrayBuffer> {
  let imageData: PhotoshopImageData | undefined;

  try {
    const result = await photoshop().imaging.getPixels({
      documentID: documentId,
      targetSize: { width: targetSize, height: targetSize },
      colorSpace: 'RGB',
      applyAlpha: true,
      componentSize: 8,
    });
    imageData = result.imageData;

    const encoded = await photoshop().imaging.encodeImageData({
      imageData: result.imageData,
      base64: true,
    });

    if (typeof encoded !== 'string') {
      throw new AssetBrowserError('PREVIEW_FAILED', {
        message: 'Photoshop returned preview data in an unexpected format.',
      });
    }

    return decodeBase64(encoded);
  } finally {
    imageData?.dispose();
  }
}

/**
 * Generates a preview for one file. Must be called inside a modal scope.
 *
 * Returns JPEG bytes ready to write to the cache.
 */
export async function generatePreview(
  token: string,
  nativePath: string,
  options: GeneratePreviewOptions,
): Promise<ArrayBuffer> {
  const extension = extname(nativePath);
  const documentId = await openTemporaryDocument(token, extension, options);

  try {
    return await encodeDocumentPreview(documentId, options.targetSize);
  } finally {
    await closeWithoutSaving(documentId);
  }
}

/** Page count for a multi-page PDF, or null when it cannot be determined. */
export async function readPdfPageCount(documentId: number): Promise<number | null> {
  try {
    const [info] = await photoshop().action.batchPlay(
      [
        {
          _obj: 'get',
          _target: [{ _ref: 'document', _id: documentId }],
        },
      ],
      { synchronousExecution: false },
    );
    const count = (info as Record<string, unknown>)?.['numberOfPages'];
    return typeof count === 'number' ? count : null;
  } catch {
    return null;
  }
}
