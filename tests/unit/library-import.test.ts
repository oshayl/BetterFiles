import { describe, expect, it } from 'vitest';
import {
  type CandidateInput,
  planLibraryImport,
  selectedRows,
  setAllSelected,
  updatePlanRow,
} from '../../src/services/library-import.service';
import type { AssetFolder } from '../../src/models/folder';
import { createFolderId } from '../../src/utils/hashing';

/** The real shape this was built against: <Pack Name>/SVG under one root. */
const CANDIDATES: CandidateInput[] = [
  {
    name: 'SVG',
    nativePath: '/V/VECTORS/Cyber Label Pack/SVG',
    parentName: 'Cyber Label Pack',
    relativePath: 'Cyber Label Pack/SVG',
    assetCount: 153,
  },
  {
    name: 'SVG',
    nativePath: '/V/VECTORS/Glyph Pack (Vol.1)/SVG',
    parentName: 'Glyph Pack (Vol.1)',
    relativePath: 'Glyph Pack (Vol.1)/SVG',
    assetCount: 80,
  },
  {
    name: 'CORPORATE ASSET - SVG',
    nativePath: '/V/VECTORS/CORPORATE ASSET PACK (Vol.1)/CORPORATE ASSET - SVG',
    parentName: 'CORPORATE ASSET PACK (Vol.1)',
    relativePath: 'CORPORATE ASSET PACK (Vol.1)/CORPORATE ASSET - SVG',
    assetCount: 72,
  },
];

function existingFolder(nativePath: string): AssetFolder {
  return {
    id: createFolderId(nativePath),
    displayName: 'already here',
    category: 'Whatever',
    nativePath,
    includeSubfolders: true,
    isFavorite: false,
    isAvailable: true,
    addedAt: 0,
  };
}

describe('planLibraryImport', () => {
  it('names each library from its pack rather than its format folder', () => {
    const plan = planLibraryImport(CANDIDATES, []);

    expect(plan.rows.map((row) => row.category)).toEqual(['Cyber Label', 'Glyph', 'Corporate']);
    expect(plan.rows.map((row) => row.displayName)).toEqual([
      'Cyber Label Pack (SVG)',
      'Glyph Pack (Vol.1) (SVG)',
      'CORPORATE ASSET - SVG',
    ]);
  });

  it('pre-ticks everything new', () => {
    const plan = planLibraryImport(CANDIDATES, []);

    expect(plan.newCount).toBe(3);
    expect(plan.alreadyImportedCount).toBe(0);
    expect(selectedRows(plan)).toHaveLength(3);
    expect(plan.totalAssets).toBe(305);
  });

  it('marks folders already imported and leaves them unticked', () => {
    const plan = planLibraryImport(CANDIDATES, [existingFolder('/V/VECTORS/Cyber Label Pack/SVG')]);

    const [first] = plan.rows;
    expect(first!.alreadyImported).toBe(true);
    expect(first!.selected).toBe(false);
    expect(plan.newCount).toBe(2);
    expect(plan.alreadyImportedCount).toBe(1);
    // The already-imported one must not be counted in the work to be done.
    expect(plan.totalAssets).toBe(152);
  });

  it('keeps already-imported rows visible', () => {
    // Hiding them makes a correct scan look like it missed folders.
    const plan = planLibraryImport(CANDIDATES, [existingFolder('/V/VECTORS/Cyber Label Pack/SVG')]);
    expect(plan.rows).toHaveLength(3);
  });

  it('matches existing libraries regardless of path casing', () => {
    const plan = planLibraryImport(CANDIDATES, [existingFolder('/V/VECTORS/CYBER LABEL PACK/svg')]);
    expect(plan.rows[0]!.alreadyImported).toBe(true);
  });
});

/*
 * A pack that ships the same artwork as SVG, PNG and EPS would otherwise be
 * imported three times over, tripling the index and filling the grid with
 * triplicates.
 */
describe('duplicate formats within one pack', () => {
  const MULTI: CandidateInput[] = [
    {
      name: 'SVG',
      nativePath: '/V/Logo Pack/SVG',
      parentName: 'Logo Pack',
      relativePath: 'Logo Pack/SVG',
      assetCount: 40,
    },
    {
      name: 'PNG',
      nativePath: '/V/Logo Pack/PNG',
      parentName: 'Logo Pack',
      relativePath: 'Logo Pack/PNG',
      assetCount: 40,
    },
    {
      name: 'EPS',
      nativePath: '/V/Logo Pack/EPS',
      parentName: 'Logo Pack',
      relativePath: 'Logo Pack/EPS',
      assetCount: 40,
    },
  ];

  it('pre-ticks the SVG and leaves the other formats unticked', () => {
    const plan = planLibraryImport(MULTI, []);
    const [svg, png, eps] = plan.rows;

    expect(svg!.selected).toBe(true);
    expect(svg!.supersededBy).toBeUndefined();
    expect(png!.selected).toBe(false);
    expect(png!.supersededBy).toBe('SVG');
    expect(eps!.selected).toBe(false);
  });

  it('counts only the winner towards the import total', () => {
    expect(planLibraryImport(MULTI, []).totalAssets).toBe(40);
  });

  it('keeps the duplicates listed so they can still be imported', () => {
    const plan = planLibraryImport(MULTI, []);
    expect(plan.rows).toHaveLength(3);

    const withPng = updatePlanRow(plan, plan.rows[1]!.id, { selected: true });
    expect(selectedRows(withPng)).toHaveLength(2);
    expect(withPng.totalAssets).toBe(80);
  });

  it('falls back down the preference order when there is no SVG', () => {
    const noSvg = MULTI.filter((entry) => entry.name !== 'SVG');
    const plan = planLibraryImport(noSvg, []);

    // EPS is vector, PNG is not.
    expect(plan.rows.find((row) => row.relativePath.endsWith('EPS'))!.selected).toBe(true);
    expect(plan.rows.find((row) => row.relativePath.endsWith('PNG'))!.selected).toBe(false);
  });

  it('does not treat different packs as duplicates of each other', () => {
    // Every pack has an SVG folder; they are unrelated libraries.
    const plan = planLibraryImport(CANDIDATES, []);
    expect(selectedRows(plan)).toHaveLength(3);
    expect(plan.rows.every((row) => row.supersededBy === undefined)).toBe(true);
  });

  it('leaves folders named for a subject alone', () => {
    // Only format-named siblings compete; two subjects under one parent are
    // both real libraries.
    const subjects: CandidateInput[] = [
      {
        name: 'Badges',
        nativePath: '/V/Pack/Badges',
        parentName: 'Pack',
        relativePath: 'Pack/Badges',
        assetCount: 10,
      },
      {
        name: 'Frames',
        nativePath: '/V/Pack/Frames',
        parentName: 'Pack',
        relativePath: 'Pack/Frames',
        assetCount: 12,
      },
    ];

    expect(selectedRows(planLibraryImport(subjects, []))).toHaveLength(2);
  });
});

describe('editing the plan', () => {
  it('applies a category edit to one row only', () => {
    const plan = updatePlanRow(planLibraryImport(CANDIDATES, []), CANDIDATES[1]!.nativePath, {});
    // Edits are addressed by row id, not path.
    const target = plan.rows[1]!;
    const edited = updatePlanRow(plan, target.id, { category: 'Glyphs' });

    expect(edited.rows[1]!.category).toBe('Glyphs');
    expect(edited.rows[0]!.category).toBe('Cyber Label');
  });

  it('keeps the asset total in step with the ticks', () => {
    const plan = planLibraryImport(CANDIDATES, []);
    const unticked = updatePlanRow(plan, plan.rows[0]!.id, { selected: false });

    expect(unticked.totalAssets).toBe(152);
    expect(selectedRows(unticked)).toHaveLength(2);
  });

  it('select-all skips rows that are already libraries', () => {
    const plan = planLibraryImport(CANDIDATES, [existingFolder('/V/VECTORS/Cyber Label Pack/SVG')]);

    const all = setAllSelected(plan, true);
    expect(all.rows[0]!.selected).toBe(false);
    expect(selectedRows(all)).toHaveLength(2);

    const none = setAllSelected(plan, false);
    expect(selectedRows(none)).toHaveLength(0);
    expect(none.totalAssets).toBe(0);
  });
});
