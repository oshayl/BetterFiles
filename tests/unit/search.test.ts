import { describe, expect, it } from 'vitest';
import {
  collectSubfolders,
  searchAssets,
  selectVisibleAssets,
  sortAssets,
  tokenizeQuery,
} from '../../src/services/search.service';
import { makeAsset } from '../helpers/fixtures';

const library = [
  makeAsset({ name: 'primary-logo.ai', relativePath: 'brand/primary-logo.ai' }),
  makeAsset({ name: 'logo.svg', relativePath: 'brand/logo.svg' }),
  makeAsset({ name: 'brand-mark.png', relativePath: 'brand/marks/brand-mark.png' }),
  makeAsset({ name: 'concrete.jpg', relativePath: 'textures/concrete.jpg' }),
  makeAsset({ name: 'poster.psd', relativePath: 'mockups/poster.psd' }),
  makeAsset({ name: 'contract.pdf', relativePath: 'docs/contract.pdf' }),
];

const names = (assets: { name: string }[]) => assets.map((asset) => asset.name);

describe('tokenizeQuery', () => {
  it('splits on whitespace and lower-cases', () => {
    expect(tokenizeQuery('  Brand   LOGO ')).toEqual(['brand', 'logo']);
  });

  it('returns no tokens for an empty query', () => {
    expect(tokenizeQuery('   ')).toEqual([]);
  });
});

describe('searchAssets', () => {
  it('returns everything when the query is empty', () => {
    const result = searchAssets(library, { query: '', typeFilter: 'all' });
    expect(result).toHaveLength(library.length);
  });

  it('ranks an exact filename match first', () => {
    const result = searchAssets(library, { query: 'logo.svg', typeFilter: 'all' });
    expect(result[0]?.name).toBe('logo.svg');
  });

  it('ranks a name prefix above a mere path match', () => {
    const result = searchAssets(library, { query: 'brand', typeFilter: 'all' });
    // brand-mark.png starts with the token; the others only match via path.
    expect(result[0]?.name).toBe('brand-mark.png');
  });

  it('requires every token to match', () => {
    // "logo" matches two assets, but only one also matches "primary".
    expect(names(searchAssets(library, { query: 'primary logo', typeFilter: 'all' }))).toEqual([
      'primary-logo.ai',
    ]);
  });

  it('returns nothing when a token matches nothing', () => {
    expect(searchAssets(library, { query: 'logo nonexistent', typeFilter: 'all' })).toEqual([]);
  });

  it('matches on extension', () => {
    expect(names(searchAssets(library, { query: 'psd', typeFilter: 'all' }))).toEqual([
      'poster.psd',
    ]);
  });

  it('matches on relative folder path', () => {
    expect(names(searchAssets(library, { query: 'textures', typeFilter: 'all' }))).toEqual([
      'concrete.jpg',
    ]);
  });

  it('is case-insensitive', () => {
    expect(names(searchAssets(library, { query: 'CONCRETE', typeFilter: 'all' }))).toEqual([
      'concrete.jpg',
    ]);
  });

  it('filters vectors as a group, covering svg, ai and eps', () => {
    const result = searchAssets(library, { query: '', typeFilter: 'vector' });
    expect(names(result).sort()).toEqual(['logo.svg', 'primary-logo.ai']);
  });

  it('filters rasters', () => {
    const result = searchAssets(library, { query: '', typeFilter: 'raster' });
    expect(names(result).sort()).toEqual(['brand-mark.png', 'concrete.jpg']);
  });

  it('filters favourites by flag rather than by type', () => {
    const withFavorite = [
      ...library,
      makeAsset({ name: 'starred.png', relativePath: 'starred.png', isFavorite: true }),
    ];
    expect(names(searchAssets(withFavorite, { query: '', typeFilter: 'favorites' }))).toEqual([
      'starred.png',
    ]);
  });

  it('restricts to a library when folderId is given', () => {
    const other = makeAsset({ name: 'other.png', relativePath: 'other.png', folderId: 'lib2' });
    const result = searchAssets([...library, other], {
      query: '',
      typeFilter: 'all',
      folderId: 'lib2',
    });
    expect(names(result)).toEqual(['other.png']);
  });

  it('restricts to a subtree when a path prefix is given', () => {
    const result = searchAssets(library, {
      query: '',
      typeFilter: 'all',
      relativePathPrefix: 'brand',
    });
    expect(names(result).sort()).toEqual(['brand-mark.png', 'logo.svg', 'primary-logo.ai']);
  });

  it('does not let a prefix match a sibling folder with a shared prefix', () => {
    const assets = [
      makeAsset({ name: 'a.png', relativePath: 'brand/a.png' }),
      makeAsset({ name: 'b.png', relativePath: 'branding/b.png' }),
    ];
    const result = searchAssets(assets, {
      query: '',
      typeFilter: 'all',
      relativePathPrefix: 'brand',
    });
    expect(names(result)).toEqual(['a.png']);
  });
});

describe('sortAssets', () => {
  it('sorts names in natural order so layer-2 precedes layer-10', () => {
    const assets = [
      makeAsset({ name: 'layer-10.png' }),
      makeAsset({ name: 'layer-2.png' }),
      makeAsset({ name: 'layer-1.png' }),
    ];
    expect(names(sortAssets(assets, 'name'))).toEqual([
      'layer-1.png',
      'layer-2.png',
      'layer-10.png',
    ]);
  });

  it('reverses for nameDesc', () => {
    const assets = [makeAsset({ name: 'a.png' }), makeAsset({ name: 'b.png' })];
    expect(names(sortAssets(assets, 'nameDesc'))).toEqual(['b.png', 'a.png']);
  });

  it('sorts newest first by modified date', () => {
    const assets = [
      makeAsset({ name: 'old.png', modifiedAt: 1000 }),
      makeAsset({ name: 'new.png', modifiedAt: 9000 }),
    ];
    expect(names(sortAssets(assets, 'modified'))).toEqual(['new.png', 'old.png']);
  });

  it('sorts largest first by size', () => {
    const assets = [
      makeAsset({ name: 'small.png', sizeBytes: 10 }),
      makeAsset({ name: 'big.png', sizeBytes: 9000 }),
    ];
    expect(names(sortAssets(assets, 'size'))).toEqual(['big.png', 'small.png']);
  });

  it('places assets with missing values last rather than treating them as zero', () => {
    const assets = [
      makeAsset({ name: 'never-imported.png' }),
      makeAsset({ name: 'imported.png', lastImportedAt: 500 }),
    ];
    expect(names(sortAssets(assets, 'recent'))).toEqual(['imported.png', 'never-imported.png']);
  });

  it('does not mutate the input array', () => {
    const assets = [makeAsset({ name: 'b.png' }), makeAsset({ name: 'a.png' })];
    const before = names(assets);
    sortAssets(assets, 'name');
    expect(names(assets)).toEqual(before);
  });
});

describe('selectVisibleAssets', () => {
  it('preserves relevance order for the default sort when searching', () => {
    const result = selectVisibleAssets(library, { query: 'brand', typeFilter: 'all' }, 'name');
    // Relevance wins: brand-mark.png outranks the alphabetically-earlier
    // path-only matches.
    expect(result[0]?.name).toBe('brand-mark.png');
  });

  it('honours an explicit sort even while searching', () => {
    const result = selectVisibleAssets(library, { query: 'brand', typeFilter: 'all' }, 'nameDesc');
    expect(result[0]?.name).toBe('primary-logo.ai');
  });

  it('sorts alphabetically when there is no query', () => {
    const result = selectVisibleAssets(library, { query: '', typeFilter: 'all' }, 'name');
    expect(names(result)).toEqual([...names(result)].sort((a, b) => a.localeCompare(b)));
  });
});

describe('collectSubfolders', () => {
  it('lists immediate subfolders only', () => {
    expect(collectSubfolders(library, 'lib1', '')).toEqual([
      'brand',
      'docs',
      'mockups',
      'textures',
    ]);
  });

  it('lists nested subfolders under a prefix', () => {
    expect(collectSubfolders(library, 'lib1', 'brand')).toEqual(['marks']);
  });

  it('returns nothing for a leaf folder', () => {
    expect(collectSubfolders(library, 'lib1', 'textures')).toEqual([]);
  });

  it('ignores other libraries', () => {
    expect(collectSubfolders(library, 'lib2', '')).toEqual([]);
  });
});
