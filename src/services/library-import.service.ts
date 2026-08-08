/**
 * Planning a bulk library import.
 *
 * Split from the store and the filesystem adapter deliberately: deciding what
 * to import, what to call it and what to skip is pure logic over plain data,
 * and it is the part worth testing. Reading the disk and writing the store
 * happen either side of this.
 */
import type { AssetFolder } from '../models/folder';
import { UNCATEGORISED } from '../models/folder';
import { createFolderId } from '../utils/hashing';
import {
  formatRank,
  preferredFormatIndex,
  suggestCategory,
  suggestDisplayName,
} from '../utils/library-naming';

/** The shape `discoverLibraryCandidates` returns, minus the live folder entry. */
export interface CandidateInput {
  readonly name: string;
  readonly nativePath: string;
  readonly parentName: string;
  readonly relativePath: string;
  readonly assetCount: number;
}

/** One row in the import dialog. */
export interface ImportPlanRow {
  readonly id: string;
  readonly nativePath: string;
  readonly relativePath: string;
  readonly assetCount: number;
  /** Suggested, and editable before the import runs. */
  readonly displayName: string;
  readonly category: string;
  /** Pre-ticked unless it is already a library, or a duplicate format. */
  readonly selected: boolean;
  /** Set when this folder is already imported, so the row explains itself. */
  readonly alreadyImported: boolean;
  /**
   * Set when a sibling folder holds the same artwork in a preferred format.
   * Names that format, so the row can say why it was left unticked.
   */
  readonly supersededBy?: string;
}

export interface ImportPlan {
  readonly rows: readonly ImportPlanRow[];
  readonly newCount: number;
  readonly alreadyImportedCount: number;
  readonly totalAssets: number;
}

/**
 * Builds the import plan for a set of discovered folders.
 *
 * Already-imported folders are kept in the list rather than hidden: seeing
 * "already a library" next to a folder is how the user confirms the scan found
 * what they expected, and silently dropping rows makes a short list look like
 * a failed scan.
 */
export function planLibraryImport(
  candidates: readonly CandidateInput[],
  existing: readonly AssetFolder[],
): ImportPlan {
  const existingIds = new Set(existing.map((folder) => folder.id));
  const superseded = findSupersededFormats(candidates);

  const rows = candidates.map((candidate): ImportPlanRow => {
    const id = createFolderId(candidate.nativePath);
    const alreadyImported = existingIds.has(id);
    const supersededBy = superseded.get(candidate.nativePath);

    return {
      id,
      nativePath: candidate.nativePath,
      relativePath: candidate.relativePath,
      assetCount: candidate.assetCount,
      displayName: suggestDisplayName(candidate.name, candidate.parentName),
      category: suggestCategory(candidate.name, candidate.parentName) || UNCATEGORISED,
      // Duplicates start unticked but stay importable - a user who wants the
      // PNGs as well as the SVGs only has to tick the row.
      selected: !alreadyImported && supersededBy == null,
      alreadyImported,
      ...(supersededBy ? { supersededBy } : {}),
    };
  });

  return {
    rows,
    newCount: rows.filter((row) => !row.alreadyImported).length,
    alreadyImportedCount: rows.filter((row) => row.alreadyImported).length,
    totalAssets: rows.filter((row) => row.selected).reduce((sum, row) => sum + row.assetCount, 0),
  };
}

/**
 * Finds format folders made redundant by a preferred sibling.
 *
 * A pack that ships `Logos/SVG`, `Logos/PNG` and `Logos/EPS` holds the same
 * artwork three times. Importing all three triples the index and fills the grid
 * with triplicates, so only the best format is pre-ticked - SVG, because it is
 * the only one that scales losslessly AND renders without Photoshop having to
 * generate a preview first.
 *
 * Only siblings under the SAME parent are compared. Two different packs that
 * both contain an `SVG` folder are unrelated and both are kept.
 *
 * Returns a map of native path -> the format that beat it.
 */
function findSupersededFormats(candidates: readonly CandidateInput[]): Map<string, string> {
  const byParent = new Map<string, CandidateInput[]>();

  for (const candidate of candidates) {
    // Only format-named folders are duplicate candidates. A folder named for
    // its subject is its own thing, whatever sits beside it.
    if (formatRank(candidate.name) === null) continue;

    const parent = parentPathOf(candidate.nativePath);
    const bucket = byParent.get(parent);
    if (bucket) bucket.push(candidate);
    else byParent.set(parent, [candidate]);
  }

  const superseded = new Map<string, string>();

  for (const siblings of byParent.values()) {
    if (siblings.length < 2) continue;

    const winnerIndex = preferredFormatIndex(siblings.map((entry) => entry.name));
    const winner = siblings[winnerIndex];
    if (!winner) continue;

    for (let index = 0; index < siblings.length; index += 1) {
      if (index === winnerIndex) continue;
      superseded.set(siblings[index]!.nativePath, winner.name);
    }
  }

  return superseded;
}

function parentPathOf(nativePath: string): string {
  const cut = nativePath.lastIndexOf('/');
  return cut <= 0 ? nativePath : nativePath.slice(0, cut);
}

/** Applies an edit to one row, returning a new plan. */
export function updatePlanRow(
  plan: ImportPlan,
  id: string,
  changes: Partial<Pick<ImportPlanRow, 'selected' | 'category' | 'displayName'>>,
): ImportPlan {
  const rows = plan.rows.map((row) => (row.id === id ? { ...row, ...changes } : row));

  return {
    rows,
    newCount: plan.newCount,
    alreadyImportedCount: plan.alreadyImportedCount,
    totalAssets: rows.filter((row) => row.selected).reduce((sum, row) => sum + row.assetCount, 0),
  };
}

/** Ticks or unticks every row that is not already imported. */
export function setAllSelected(plan: ImportPlan, selected: boolean): ImportPlan {
  const rows = plan.rows.map((row) => (row.alreadyImported ? row : { ...row, selected }));

  return {
    rows,
    newCount: plan.newCount,
    alreadyImportedCount: plan.alreadyImportedCount,
    totalAssets: rows.filter((row) => row.selected).reduce((sum, row) => sum + row.assetCount, 0),
  };
}

/** The rows the user actually asked to import. */
export function selectedRows(plan: ImportPlan): ImportPlanRow[] {
  return plan.rows.filter((row) => row.selected && !row.alreadyImported);
}
