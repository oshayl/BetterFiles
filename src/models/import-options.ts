/** Insertion options (roadmap sections 15, 20.2 and 21.1). */

export type PlacementMode =
  | 'embeddedSmartObject'
  | 'linkedSmartObject'
  | 'rasterized'
  | 'openDocument';

export type PlacementTarget = 'activeArtboard' | 'documentCenter' | 'selectionCenter';

export interface ImportOptions {
  mode: PlacementMode;
  target: PlacementTarget;
  scaleToFit: boolean;
  /** Fraction of the target the asset may occupy. 0.7 per section 21.1. */
  maxCanvasCoverage: number;
  enterFreeTransform: boolean;
  /** 1-based page for multi-page PDFs. */
  pdfPage?: number;
}

/**
 * Embedded Smart Object by default: nondestructive, portable, and immune to the
 * broken-link failure mode of linked placement (roadmap section 20.2).
 */
export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  mode: 'embeddedSmartObject',
  target: 'activeArtboard',
  scaleToFit: true,
  maxCanvasCoverage: 0.7,
  enterFreeTransform: true,
};
